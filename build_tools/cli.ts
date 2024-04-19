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
import { setConfig } from "./webpack/webpack_config_from_cli.cjs";

function parseArgs() {
  return yargs(process.argv.slice(2))
    .command({
      command: "serve",
      describe: "Run the development server.",
      builder: (parser) =>
        parser.options({
          output: {
            group: "Build options",
            type: "string",
            nargs: 1,
            description: "Output directory.",
          },
          watch: {
            type: "boolean",
            default: false,
            description: "Watch for changes.",
          },
          mode: {
            default: "production",
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