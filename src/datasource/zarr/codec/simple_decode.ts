/**
 * @license
 * Copyright 2023 Google Inc.
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

import type { CodecArrayInfo, CodecChainSpec } from "#src/datasource/zarr/codec/index.js";
import { CodecKind } from "#src/datasource/zarr/codec/index.js";
import type { CancellationToken } from "#src/util/cancellation.js";

export interface Codec {
  name: string;
  kind: CodecKind;
}

export interface ArrayToArrayCodec<Configuration = unknown> extends Codec {
  kind: CodecKind.arrayToArray;
  decode(
    configuration: Configuration,
    decodedArrayInfo: CodecArrayInfo,
    encoded: ArrayBufferView,
    cancellationToken: CancellationToken,
  ): Promise<ArrayBufferView>;
}

export interface ArrayToBytesCodec<Configuration = unknown> extends Codec {
  kind: CodecKind.arrayToBytes;
  decode(
    configuration: Configuration,
    decodedArrayInfo: CodecArrayInfo,
    encoded: Uint8Array,
    cancellationToken: CancellationToken,
  ): Promise<ArrayBufferView>;
}

export interface BytesToBytesCodec<Configuration = unknown> extends Codec {
  kind: CodecKind.bytesToBytes;
  decode(
    configuration: Configuration,
    encoded: Uint8Array,
    cancellationToken: CancellationToken,
  ): Promise<Uint8Array>;
}

const codecRegistry = {
  [CodecKind.arrayToArray]: new Map<string, ArrayToArrayCodec>(),
  [CodecKind.arrayToBytes]: new Map<string, ArrayToBytesCodec>(),
  [CodecKind.bytesToBytes]: new Map<string, BytesToBytesCodec>(),
};

export function registerCodec<Configuration>(
  codec:
    | ArrayToArrayCodec<Configuration>
    | ArrayToBytesCodec<Configuration>
    | BytesToBytesCodec<Configuration>,
) {
  codecRegistry[codec.kind].set(codec.name, codec as any);
}

export async function decodeArray(
  codecs: CodecChainSpec,
  encoded: Uint8Array,
  cancellationToken: CancellationToken,
): Promise<ArrayBufferView> {
  // First apply bytes-to-bytes codecs
  const bytesToBytes = codecs[CodecKind.bytesToBytes];
  for (let i = bytesToBytes.length; i--; ) {
    const codec = bytesToBytes[i];
    const impl = codecRegistry[CodecKind.bytesToBytes].get(codec.name);
    if (impl === undefined) {
      throw new Error(`Unsupported codec: ${JSON.stringify(codec.name)}`);
    }
    encoded = await impl.decode(
      codec.configuration,
      encoded,
      cancellationToken,
    );
  }

  // Then apply array-to-bytes codec
  let decoded: ArrayBufferView;
  {
    const codec = codecs[CodecKind.arrayToBytes];
    const impl = codecRegistry[CodecKind.arrayToBytes].get(codec.name);
    if (impl === undefined) {
      throw new Error(`Unsupported codec: ${JSON.stringify(codec.name)}`);
    }
    decoded = await impl.decode(
      codec.configuration,
      codecs.arrayInfo[codecs.arrayInfo.length - 1],
      encoded,
      cancellationToken,
    );
  }

  // Finally apply array-to-array codecs
  const arrayToArray = codecs[CodecKind.arrayToArray];
  for (let i = arrayToArray.length; i--; ) {
    const codec = arrayToArray[i];
    const impl = codecRegistry[CodecKind.arrayToArray].get(codec.name);
    if (impl === undefined) {
      throw new Error(`Unsupported codec: ${JSON.stringify(codec.name)}`);
    }
    decoded = await impl.decode(
      codec.configuration,
      codecs.arrayInfo[i],
      decoded,
      cancellationToken,
    );
  }

  return decoded;
} 