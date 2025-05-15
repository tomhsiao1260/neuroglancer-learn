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

import { CodecKind } from "#src/datasource/zarr/codec/index.js";
import { registerCodec } from "#src/datasource/zarr/codec/simple_decode.js";
import type { Configuration } from "#src/datasource/zarr/codec/bytes/resolve.js";
import { DATA_TYPE_BYTES, makeDataTypeArrayView, DataType } from "#src/util/data_type.js";
import { convertEndian } from "#src/util/endian.js";

registerCodec({
  name: "bytes",
  kind: CodecKind.bytesToBytes,
  async decode(
    configuration: Configuration,
    encoded: Uint8Array,
  ): Promise<Uint8Array> {
    const data = makeDataTypeArrayView(
      DataType.UINT8,
      encoded.buffer,
      encoded.byteOffset,
      encoded.byteLength,
    );
    convertEndian(data, configuration.endian, 1);
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  },
});
