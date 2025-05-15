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

import { CodecKind } from "./index";

export interface Codec {
  name: string;
  kind: CodecKind;
}

export interface BytesToBytesCodec<Configuration = unknown> extends Codec {
  kind: CodecKind.bytesToBytes;
  decode(
    configuration: Configuration,
    encoded: Uint8Array,
  ): Promise<Uint8Array>;
}

const codecRegistry = {
  [CodecKind.bytesToBytes]: new Map<string, BytesToBytesCodec>(),
};

export function registerCodec<Configuration>(
  codec: BytesToBytesCodec<Configuration>,
) {
  codecRegistry[codec.kind].set(codec.name, codec as any);
}

export async function decodeArray(
  codecs: any,
  encoded: Uint8Array,
): Promise<Uint8Array> {
  const bytesToBytes = codecs[CodecKind.bytesToBytes];
  for (let i = bytesToBytes.length; i--; ) {
    const codec = bytesToBytes[i];
    const impl = codecRegistry[CodecKind.bytesToBytes].get(codec.name);
    if (impl === undefined) {
      throw new Error(`Unsupported codec: ${JSON.stringify(codec.name)}`);
    }
    encoded = await impl.decode(codec.configuration, encoded);
  }
  return encoded;
} 