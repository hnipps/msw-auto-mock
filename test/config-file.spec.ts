import { describe, it, expect } from 'vitest';
import { generate } from '../src/generate';
import { readFileSync } from 'fs';
import path from 'path';

describe('generate:config-file', () => {
  it('should generate handlers based on config file', async () => {
    await generate([], { output: '.tmp' });
    const file = readFileSync(path.resolve(process.cwd(), '.tmp/handlers.js'), { encoding: 'utf-8' });
    expect(file).toBeDefined();
    expect(file.includes('/v3/test')).toBeTruthy();
    expect(file.includes('/v3/test-again')).toBeTruthy();
    expect(file.includes('/not-again')).toBeTruthy();
    expect(file.includes('/v2/test-again')).toBeFalsy();
  });
});
