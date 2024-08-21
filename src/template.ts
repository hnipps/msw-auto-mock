import { ConfigOptions } from './types';
import {
  OperationCollection,
  transformToHandlerCode,
  transformToGenerateResultFunctions,
  transformToResultFunctionNames,
} from './transform';
import { match } from 'ts-pattern';
import path from 'node:path';
import { camelCase } from 'lodash';

export const mockTemplate = (operationCollection: OperationCollection, baseURL: string, options: ConfigOptions) => ({
  handlers: `/**
* This file is AUTO GENERATED by [msw-auto-mock](https://github.com/zoubingwu/msw-auto-mock)
* Feel free to commit/edit it as you need.
*/
/* eslint-disable */
/* tslint:disable */
import { HttpResponse, http } from 'msw';
${transformToResultFunctionNames(operationCollection)}
${createAiGenerateText(options)}
${withCacheOne(options)}
${withCreatePrompt(options)}

const baseURL = '${baseURL}';

export const handlers = [
  ${transformToHandlerCode(operationCollection)}
];
`,
  responses: `/**
* This file is AUTO GENERATED by [msw-auto-mock](https://github.com/zoubingwu/msw-auto-mock)
* Feel free to commit/edit it as you need.
*/
/* eslint-disable */
/* tslint:disable */
import { faker } from '@faker-js/faker';
${createAiGenerateText(options)}
${withCacheOne(options)}
${withCreatePrompt(options)}

faker.seed(1);

const MAX_ARRAY_LENGTH = ${options?.maxArrayLength ?? 20};

${transformToGenerateResultFunctions(operationCollection, baseURL, options)}`,
});

export const browserIntegration = [
  `import { setupWorker } from 'msw/browser'`,
  `import { handlers } from './handlers'`,
  `export const worker = setupWorker(...handlers)`,
].join('\n');

export const nodeIntegration = [
  `import { setupServer } from 'msw/node'`,
  `import { handlers } from './handlers'`,
  `export const server = setupServer(...handlers)`,
].join(`\n`);

export const reactNativeIntegration = [
  `import { setupServer } from 'msw/native'`,
  `import { handlers } from './handlers'`,
  `export const server = setupServer(...handlers)`,
].join(`\n`);

const askOpenai = (options: ConfigOptions) => `
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

async function ask(operation) {
  const { text } = await generateText({
    model: createOpenAI({
      apiKey: ${options.ai?.openai?.apiKey},
      baseURL: ${options.ai?.openai?.apiKey},
    })(${options.ai?.openai?.model}),
    prompt: createPrompt(operation),
  });

  return JSON.parse(text);
}
`;

const askAzure = (options: ConfigOptions) => `
import { createAzure } from '@ai-sdk/azure';
import { generateText } from 'ai';

async function ask(operation) {
  const { text } = await generateText({
    model: createAzure({
      resourceName: ${options.ai?.azure?.resource},
      apiKey: ${options.ai?.azure?.apiKey}
    })(${options.ai?.azure?.deployment}),
    prompt: createPrompt(operation),
  });
  return JSON.parse(text);
}
`;

const askAnthropic = (options: ConfigOptions) => `
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';

async function ask(operation) {
  const { text } = await generateText({
    model: createAnthropic({
      apiKey: ${options.ai?.anthropic?.apiKey}
    })(${options.ai?.anthropic?.model}),
    prompt: createPrompt(operation),
  });
  return JSON.parse(text);
}
`;

const withCreatePrompt = (options: ConfigOptions) =>
  options.ai?.enable
    ? `
function createPrompt(operation) {
  return "Given the following Swagger (OpenAPI) definition, generate a mock data object that conforms to the specified response structure, ensuring each property adheres to its defined constraints, especially type, format, example, description, enum values, ignore the xml field. The generated JSON string should include all the properties defined in the Swagger schema as much as possible and the values should be valid based on the property definitions (e.g., integer, string, length etc.) and rules (e.g, int64 should be string in json etc.). Please only return the JSON string as the output, don't wrap it with markdown. The definition is like below: \\n" + "\`\`\`json" + JSON.stringify(operation, null, 4) + "\\n\`\`\`";
}
`
    : '';

export function createAiGenerateText(options: ConfigOptions): string {
  if (!options.ai?.enable) return '';
  let code = match(options.ai?.provider)
    .with('openai', () => askOpenai(options))
    .with('azure', () => askAzure(options))
    .with('anthropic', () => askAnthropic(options))
    .otherwise(() => '');
  return code;
}

export function withCacheOne(options: ConfigOptions) {
  if (options.static && options.ai?.enable) {
    return `
const cache = new Map();
const withCacheOne = (ask) => async (operation) => {
  const key = operation.verb + ' ' + operation.path;
  if (cache.has(key)) return cache.get(key);
  const value = await ask(operation);
  cache.set(key, value);
  return value;
}`;
  }

  return '';
}

export function getImport(importPath: string, filePath: string) {
  const relativeHandlersPath = path.relative(filePath, path.resolve(importPath, 'handlers'));
  const handlerSymbol = camelCase(relativeHandlersPath);
  return [
    `import { handlers as ${handlerSymbol} } from './${relativeHandlersPath}';`,
    `export * from './${path.relative(filePath, path.resolve(importPath, 'responses'))}';`,
    `handlers = handlers.concat(${handlerSymbol});`,
    `\n`,
  ].join('\n');
}
