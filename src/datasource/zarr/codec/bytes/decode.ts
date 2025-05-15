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

import { registerCodec } from "#src/datasource/zarr/codec/simple_decode.js";
import { CodecKind } from "#src/datasource/zarr/codec/index.js";
import type { CancellationToken } from "#src/util/cancellation.js";
import type { CodecArrayInfo } from "#src/datasource/zarr/codec/index.js";
import { DATA_TYPE_BYTES, makeDataTypeArrayView } from "#src/util/data_type.js";
import { convertEndian, type Endianness } from "#src/util/endian.js";
import { Blosc } from 'numcodecs';

registerCodec({
  name: "bytes",
  kind: CodecKind.arrayToBytes,
  async decode(
    configuration: { endian: Endianness },
    decodedArrayInfo: CodecArrayInfo,
    encoded: Uint8Array,
    cancellationToken: CancellationToken,
  ): Promise<ArrayBufferView> {
    cancellationToken;
    const { dataType, chunkShape } = decodedArrayInfo;
    const numElements = chunkShape.reduce((a, b) => a * b, 1);
    const bytesPerElement = DATA_TYPE_BYTES[dataType];
    const expectedBytes = numElements * bytesPerElement;

    if (encoded.byteLength !== expectedBytes) {
      // Try to decode as blosc/zstd compressed data
      try {
        const codec = Blosc.fromConfig({
          id: 'blosc',
          clevel: 5,
          cname: 'zstd',
          shuffle: 1, // 1 for shuffle
          blocksize: 0
        });
        const decoded = await codec.decode(encoded);
        const data = makeDataTypeArrayView(
          dataType,
          decoded.buffer,
          decoded.byteOffset,
          decoded.byteLength,
        );
        convertEndian(data, configuration.endian, bytesPerElement);
        return data;
      } catch (error) {
        console.error('Failed to decode as blosc/zstd:', error);
        throw new Error(
          `Raw-format chunk is ${encoded.byteLength} bytes, ` +
            `but ${numElements} * ${bytesPerElement} = ${expectedBytes} bytes are expected, ` +
            `and blosc/zstd decompression failed.`,
        );
      }
    }

    const data = makeDataTypeArrayView(
      dataType,
      encoded.buffer,
      encoded.byteOffset,
      encoded.byteLength,
    );
    convertEndian(data, configuration.endian, bytesPerElement);
    return data;
  },
});
