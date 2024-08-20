import get from 'lodash/get';
import { OpenAPIV3 } from 'openapi-types';
import { beforeAll, describe, it, expect } from 'vitest';

import { getV3Doc } from '../src/swagger';
import { mergeOperationCollections } from '../src/generate';
import { Operation } from '../src/transform';
import { GlobalOptions, SpecOptions } from '../src/types';

const generateCollectionFromSpecList = async (specList: { spec: string; options?: SpecOptions }[]) => {
  const apiDocs = await Promise.all(
    specList.map(async ({ spec, options }) => {
      return { doc: await getV3Doc(spec), options };
    }),
  );
  return mergeOperationCollections(apiDocs);
};

describe('generate:mergeOperationCollections', () => {
  let schemaList: OpenAPIV3.SchemaObject[];
  let pathList: string[];
  let operationList: Operation[];
  beforeAll(async () => {
    const options: SpecOptions = { excludes: '/v2' };
    const collection = await generateCollectionFromSpecList([
      { spec: './test/fixture/test.yaml', options },
      { spec: './test/fixture/test-2.yaml', options },
    ]);

    pathList = collection.map(item => {
      return item.path;
    });

    operationList = collection;
    schemaList = get(collection, [0, 'response', '0', 'responses', 'application/json', 'allOf', 1]);
  });

  it('schema should be defined', () => {
    expect(schemaList).toBeDefined();
  });

  it('should exclude "/v2" operations'),
    () => {
      expect(pathList.includes('/v2/test-again')).toBeFalsy();
    };

  it('should only include "/test" operations'),
    () => {
      expect(pathList.every(item => item.includes('test'))).toBeTruthy();
    };

  it('should overwrite existing paths when duplicates exist', () => {
    expect(operationList.every(item => item.response.every(res => res.code !== '400'))).toBeTruthy();
    expect(new Set(pathList).size).toEqual(pathList.length);
  });
});

describe('generate:mergeOperationCollections', () => {
  let schemaList: OpenAPIV3.SchemaObject[];
  let pathList: string[];
  let operationList: Operation[];
  beforeAll(async () => {
    const collection = await generateCollectionFromSpecList([{ spec: './test/fixture/test.yaml' }]);

    pathList = collection.map(item => {
      return item.path;
    });

    operationList = collection;
    schemaList = get(collection, [0, 'response', '0', 'responses', 'application/json', 'allOf', 1]);
  });

  it('schema should be defined when a single spec is passed', () => {
    expect(schemaList).toBeDefined();
  });
});

describe('generate:prependPath', () => {
  let pathList: string[];
  beforeAll(async () => {
    const collection = await generateCollectionFromSpecList([
      { spec: './test/fixture/test.yaml', options: { prefix: '/v2' } },
    ]);

    pathList = collection.map(item => {
      return item.path;
    });
  });

  it('schema prepend all paths with specified prefix', () => {
    expect(pathList.every(item => item.startsWith('/v2'))).toBeTruthy();
  });
});
