/**
 * @license
 * Copyright 2019 Google Inc.
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

import { CodecKind } from "../index";
import { registerCodec } from "../resolve";
import { verifyObject } from "../../../../util/json";

export type Configuration = {
  cname: string;
  clevel: number;
  shuffle: number;
  blocksize: number;
};

registerCodec({
  name: "blosc",
  kind: CodecKind.bytesToBytes,
  resolve(configuration: unknown, decodedSize: number | undefined): { configuration: Configuration; encodedSize?: number } {
    verifyObject(configuration);
    return {
      configuration: {
        cname: "zstd",
        clevel: 3,
        shuffle: 0,
        blocksize: 0,
      },
      encodedSize: decodedSize,
    };
  },
}); 