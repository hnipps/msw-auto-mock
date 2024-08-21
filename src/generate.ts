import * as fs from 'node:fs';
import * as path from 'node:path';

import ApiGenerator, { isReference } from 'oazapfts/generate';
import { OpenAPIV3 } from 'openapi-types';
import camelCase from 'lodash/camelCase';
import { cosmiconfig } from 'cosmiconfig';

import { getV3Doc } from './swagger';
import { prettify, toExpressLikePath } from './utils';
import { Operation, ResponseMap } from './transform';
import { browserIntegration, mockTemplate, nodeIntegration, reactNativeIntegration } from './template';
import { GlobalOptions, ConfigOptions, SpecWithOptions, SpecOptions } from './types';
import { name as moduleName } from '../package.json';

export function mergeOperationCollections(apiDocList: SpecWithOptions[]) {
  const collectionList = apiDocList.flatMap(({ doc, options }) => generateOperationCollection(doc, options));
  return Object.values(
    collectionList.reduce<Record<string, Operation>>((acc, collection) => {
      acc[collection.path] = collection;
      return acc;
    }, {}),
  );
}

export function generateOperationCollection(apiDoc: OpenAPIV3.Document, options: SpecOptions = {}) {
  const apiGen = new ApiGenerator(apiDoc, {});
  const operationDefinitions = getOperationDefinitions(apiDoc);

  return operationDefinitions
    .filter(op => operationFilter(op, options))
    .map(op => codeFilter(op, options))
    .map(op => prependPath(op, options))
    .map(definition => toOperation(definition, apiGen));
}

export async function generate(
  specList: { spec: string; options: SpecOptions }[] = [],
  globalOptions: GlobalOptions = { output: '' },
) {
  const explorer = cosmiconfig(moduleName);

  const finalOptions: ConfigOptions = { ...globalOptions };

  try {
    const result = await explorer.search();
    if (!result?.isEmpty) {
      Object.assign(finalOptions, result?.config);
      specList = specList.concat(result?.config?.specList);
    }
  } catch (e) {
    console.log(e);
    process.exit(1);
  }

  const apiDocList = await Promise.all(
    specList.map(async item => ({ doc: await getV3Doc(item.spec), options: item.options })),
  );

  const { output: outputFolder } = finalOptions;
  const targetFolder = path.resolve(process.cwd(), outputFolder);

  const operationCollection = mergeOperationCollections(apiDocList);

  let baseURL = '';
  if (finalOptions.baseUrl === true) {
    // TODO: Figure out how to determine the baseURL from multiple API docs.
    baseURL = getServerUrl(apiDocList[0].doc);
  } else if (typeof finalOptions.baseUrl === 'string') {
    baseURL = finalOptions.baseUrl;
  }

  type DirectoryTree = {
    name: string;
    children: DirectoryTree[];
    operation: Operation[] | null;
  };

  const Directory = (name: string): DirectoryTree => ({
    name,
    children: [],
    operation: null,
  });

  const directoryStructure = operationCollection.reduce<DirectoryTree>((acc, { path, response, verb }) => {
    path
      .split('/')
      .filter(part => part.length > 0)
      .reduce((subAcc, part, i, list) => {
        const dir = Directory(part);

        if (i === list.length - 1) dir.operation = [{ path, response, verb }];

        subAcc.children.push(dir);

        return dir;
      }, acc);
    return acc;
  }, Directory(targetFolder));

  console.log('DIR', JSON.stringify(directoryStructure));

  const traverse = async (tree: DirectoryTree, targetDir: string = '') => {
    targetDir = path.join(targetDir, tree.name);

    try {
      fs.mkdirSync(targetDir);
    } catch {}

    if (tree.operation) {
      const code = mockTemplate(tree.operation, baseURL, finalOptions);
      fs.writeFileSync(path.resolve(process.cwd(), targetDir, 'responses.js'), code.responses);
      fs.writeFileSync(path.resolve(process.cwd(), targetDir, 'handlers.js'), code.handlers);
    }

    for (let i = 0; i < tree.children.length; i++) {
      traverse(tree.children[i], targetDir);
    }
  };

  await traverse(directoryStructure);

  try {
    fs.mkdirSync(targetFolder);
  } catch {}

  fs.writeFileSync(path.resolve(process.cwd(), targetFolder, 'native.js'), reactNativeIntegration);
  fs.writeFileSync(path.resolve(process.cwd(), targetFolder, 'node.js'), nodeIntegration);
  fs.writeFileSync(path.resolve(process.cwd(), targetFolder, 'browser.js'), browserIntegration);
}

function getServerUrl(apiDoc: OpenAPIV3.Document) {
  let server = apiDoc.servers?.at(0);
  let url = '';
  if (server) {
    url = server.url;
  }
  if (server?.variables) {
    Object.entries(server.variables).forEach(([key, value]) => {
      url = url.replace(`{${key}}`, value.default);
    });
  }

  return url;
}

const operationKeys = Object.values(OpenAPIV3.HttpMethods) as OpenAPIV3.HttpMethods[];

type OperationDefinition = {
  path: string;
  verb: string;
  responses: OpenAPIV3.ResponsesObject;
  id: string;
};

function getOperationDefinitions(v3Doc: OpenAPIV3.Document): OperationDefinition[] {
  return Object.entries(v3Doc.paths).flatMap(([path, pathItem]) =>
    !pathItem
      ? []
      : Object.entries(pathItem)
          .filter((arg): arg is [string, OpenAPIV3.OperationObject] => operationKeys.includes(arg[0] as any))
          .map(([verb, operation]) => {
            const id = camelCase(operation.operationId ?? verb + '/' + path);
            return {
              path,
              verb,
              id,
              responses: operation.responses,
            };
          }),
  );
}

function operationFilter(operation: OperationDefinition, options: SpecOptions): boolean {
  const includes = options?.includes?.split(',') ?? null;
  const excludes = options?.excludes?.split(',') ?? null;

  if (includes && !includes.some(pattern => new RegExp(pattern).exec(operation.path))) {
    return false;
  }
  if (excludes && excludes.some(pattern => new RegExp(pattern).exec(operation.path))) {
    return false;
  }
  return true;
}

function codeFilter(operation: OperationDefinition, options: SpecOptions): OperationDefinition {
  const codes = options?.codes?.split(',') ?? null;

  const responses = Object.entries(operation.responses)
    .filter(([code]) => {
      if (codes && !codes.includes(code)) {
        return false;
      }
      return true;
    })
    .map(([code, response]) => ({
      [code]: response,
    }))
    .reduce((acc, curr) => Object.assign(acc, curr), {} as OpenAPIV3.ResponsesObject);

  return {
    ...operation,
    responses,
  };
}

function toOperation(definition: OperationDefinition, apiGen: ApiGenerator): Operation {
  const { verb, path, responses, id } = definition;

  const responseMap = Object.entries(responses).map(([code, response]) => {
    const content = apiGen.resolve(response).content;
    if (!content) {
      return { code, id: '', responses: {} };
    }

    const resolvedResponse = Object.keys(content).reduce(
      (resolved, type) => {
        const schema = content[type].schema;
        if (typeof schema !== 'undefined') {
          resolved[type] = recursiveResolveSchema(schema, apiGen);
        }

        return resolved;
      },
      {} as Record<string, OpenAPIV3.SchemaObject>,
    );

    return {
      code,
      id,
      responses: resolvedResponse,
    };
  });

  return {
    verb,
    path: toExpressLikePath(path),
    response: responseMap,
  };
}

function prependPath(operation: OperationDefinition, options: SpecOptions): OperationDefinition {
  const prefix = options?.prefix?.split(',') ?? null;

  operation.path = prefix ? prefix + operation.path : operation.path;

  return operation;
}

const resolvingRefs: string[] = [];

function autoPopRefs<T>(cb: () => T) {
  const n = resolvingRefs.length;
  const res = cb();
  resolvingRefs.length = n;
  return res;
}

function resolve(schema: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject, apiGen: ApiGenerator) {
  if (isReference(schema)) {
    if (resolvingRefs.includes(schema.$ref)) {
      console.warn(`circular reference for path ${[...resolvingRefs, schema.$ref].join(' -> ')} found`);
      return {};
    }
    resolvingRefs.push(schema.$ref);
  }
  return { ...apiGen.resolve(schema) };
}

function recursiveResolveSchema(schema: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject, apiGen: ApiGenerator) {
  return autoPopRefs(() => {
    const resolvedSchema = resolve(schema, apiGen) as OpenAPIV3.SchemaObject;

    if (resolvedSchema.type === 'array') {
      resolvedSchema.items = resolve(resolvedSchema.items, apiGen);
      resolvedSchema.items = recursiveResolveSchema(resolvedSchema.items, apiGen);
    } else if (resolvedSchema.type === 'object') {
      if (!resolvedSchema.properties && typeof resolvedSchema.additionalProperties === 'object') {
        if (isReference(resolvedSchema.additionalProperties)) {
          resolvedSchema.additionalProperties = recursiveResolveSchema(
            resolve(resolvedSchema.additionalProperties, apiGen),
            apiGen,
          );
        }
      }

      if (resolvedSchema.properties) {
        resolvedSchema.properties = Object.entries(resolvedSchema.properties).reduce(
          (resolved, [key, value]) => {
            resolved[key] = recursiveResolveSchema(value, apiGen);
            return resolved;
          },
          {} as Record<string, OpenAPIV3.SchemaObject>,
        );
      }
    } else if (resolvedSchema.allOf) {
      resolvedSchema.allOf = resolvedSchema.allOf.map(item => recursiveResolveSchema(item, apiGen));
    } else if (resolvedSchema.oneOf) {
      resolvedSchema.oneOf = resolvedSchema.oneOf.map(item => recursiveResolveSchema(item, apiGen));
    } else if (resolvedSchema.anyOf) {
      resolvedSchema.anyOf = resolvedSchema.anyOf.map(item => recursiveResolveSchema(item, apiGen));
    }

    return resolvedSchema;
  });
}
