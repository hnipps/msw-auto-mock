import cac from 'cac';

import { generate } from './generate';
import { version } from '../package.json';

const cli = cac();

cli
  .command('', 'Generating msw mock definitions with random fake data.')
  .option('-s, --spec <spec>', `Path to API spec.`)
  .option('-o, --output <directory>', `Output to a folder.`)
  .option('-m, --max-array-length <number>', `Max array length, default to 20.`)
  .option('-t, --includes <keywords>', `Include the request path with given string, can be seperated with comma.`)
  .option('-e, --excludes <keywords>', `Exclude the request path with given string, can be seperated with comma.`)
  .option('--base-url [baseUrl]', `Use the one you specified or server url in OpenAPI description as base url.`)
  .option('--static', 'By default it will generate dynamic mocks, use this flag if you want generate static mocks.')
  .option('-c, --codes <keywords>', 'Comma separated list of status codes to generate responses for')
  .example('msw-auto-mock ./githubapi.yaml -o mock.js')
  .example('msw-auto-mock ./githubapi.yaml -o mock.js -t /admin,/repo -m 30')
  .action(async options => {
    options?.spec
      ? await generate(
          [
            {
              spec: options.spec,
              options: {
                includes: options?.includes?.[0],
                excludes: options?.excludes?.[0],
                codes: options?.codes?.[0],
              },
            },
          ],
          {
            output: options?.output?.[0],
            maxArrayLength: options?.maxArrayLength?.[0],
            baseUrl: options?.baseUrl?.[0],
            static: options?.static?.[0],
          },
        ).catch(console.error)
      : await generate();
  });

cli.help();
cli.version(version);

cli.parse();
