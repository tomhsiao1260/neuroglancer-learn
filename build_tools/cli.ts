/**
 * @license
 * Copyright 2020 Google LLC
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import process from "node:process";
import yargs from "yargs";

async function getWebpackConfig(argv, ...extraConfigs){
  console.log(argv, extraConfigs)
}

function parseArgs() {
  return yargs(process.argv.slice(2))
    .command({
      command: "serve",
      describe: "Run the development server.",
      builder: (parser) =>
        parser.options({
          mode: {
            default: "development",
          },
          port: {
            group: "Development server options",
            type: "number",
            nargs: 1,
            default: 8080,
            description: "Port number for the development server",
          },
          host: {
            group: "Development server options",
            type: "string",
            nargs: 1,
            description: "Specifies bind address for development server.",
            default: "localhost",
          },
        }),
      handler: async (argv) => {
        console.log(argv)
      }
    })
    .strict()
    .version(false)
    .help()
    .parse();
}

async function parseArgsAndRunMain() {
  parseArgs();
}

if (process.argv[1] === import.meta.filename) {
  parseArgsAndRunMain();
}