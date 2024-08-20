import { OpenAPIV3 } from 'openapi-types';

export interface SpecOptions {
  includes?: string;
  excludes?: string;
  codes?: string;
  prefix?: string;
}

export interface GlobalOptions {
  output: string;
  maxArrayLength?: number;
  baseUrl?: string | true;
  static?: boolean;
}

export type ConfigOptions = GlobalOptions & {
  ai?: {
    enable?: boolean;
    provider: 'openai' | 'azure' | 'anthropic';
    openai?: {
      baseURL?: string;
      /**
       * defaults to `OPENAI_API_KEY`
       */
      apiKey?: string;
      model?: string;
    };
    azure?: {
      /**
       * defaults to `AZURE_API_KEY`
       */
      apiKey?: string;
      resource?: string;
      deployment?: string;
    };
    anthropic?: {
      /**
       * defaults to `ANTHROPIC_API_KEY`
       */
      apiKey?: string;
      model?: string;
    };
  };
};

export type SpecWithOptions = { doc: OpenAPIV3.Document; options?: SpecOptions };
