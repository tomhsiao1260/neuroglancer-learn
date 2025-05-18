/**
 * @license
 * Copyright 2020 Google Inc.
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

import "#src/datasource/zarr/codec/register.js";
import "#src/datasource/zarr/codec/bytes/decode.js";

import { WithParameters } from "#src/chunk_manager/backend.js";
import { VolumeChunkSourceParameters } from "#src/datasource/zarr/base.js";
import { decodeArray } from "#src/datasource/zarr/codec/simple_decode.js";
import { ChunkKeyEncoding } from "#src/datasource/zarr/metadata/index.js";
import { FileReader } from "#src/util/file_system.js";
import { postProcessRawData } from "#src/sliceview/backend_chunk_decoders/postprocess.js";
import type { VolumeChunk } from "#src/sliceview/volume/backend.js";
import { VolumeChunkSource } from "#src/sliceview/volume/backend.js";
import type { CancellationToken } from "#src/util/cancellation.js";
import { registerSharedObject } from "#src/worker/worker_rpc.js";

@registerSharedObject()
export class ZarrVolumeChunkSource extends WithParameters(
  VolumeChunkSource,
  VolumeChunkSourceParameters,
) {
  private fileReader = new FileReader(this.parameters.url + "/");

  async download(chunk: VolumeChunk, cancellationToken: CancellationToken) {
    chunk.chunkDataSize = this.spec.chunkDataSize;
    const { parameters } = this;
    const { chunkGridPosition } = chunk;
    const { metadata } = parameters;
    let baseKey = "";
    const rank = this.spec.rank;
    const { physicalToLogicalDimension } = metadata.codecs.layoutInfo[0];
    let sep: string;
    if (metadata.chunkKeyEncoding === ChunkKeyEncoding.DEFAULT) {
      baseKey += "c";
      sep = metadata.dimensionSeparator;
    } else {
      sep = "";
      if (rank === 0) {
        baseKey += "0";
      }
    }
    const keyCoords = new Array<number>(rank);
    const { readChunkShape } = metadata.codecs.layoutInfo[0];
    const { chunkShape } = metadata;
    for (
      let fOrderPhysicalDim = 0;
      fOrderPhysicalDim < rank;
      ++fOrderPhysicalDim
    ) {
      const decodedDim =
        physicalToLogicalDimension[rank - 1 - fOrderPhysicalDim];
      keyCoords[decodedDim] = Math.floor(
        (chunkGridPosition[fOrderPhysicalDim] * readChunkShape[decodedDim]) /
          chunkShape[decodedDim],
      );
    }
    for (let i = 0; i < rank; ++i) {
      baseKey += `${sep}${keyCoords[i]}`;
      sep = metadata.dimensionSeparator;
    }
    try {
      let response = await this.fileReader.read(baseKey);
      // temporary fix for missing chunks (simulated)
      if (baseKey === '52/24/20' && !self.updateChunkAvailable) {
        response = undefined;
      }
      if (response !== undefined) {
        const decoded = await decodeArray(
          metadata.codecs,
          response.data,
          cancellationToken,
        );
        await postProcessRawData(chunk, cancellationToken, decoded);
      } else {
        // If the block is missing, use fillValue silently
        const fillValue = typeof metadata.fillValue === 'number' ? metadata.fillValue : 0;
        const numElements = this.spec.chunkDataSize.reduce((a, b) => a * b, 1);
        const data = new Uint8Array(numElements).fill(fillValue);
        // Send message to main thread about missing block using RPC
        if (this.rpc) {
          // Get the level from the parameters
          const level = this.parameters.level;
          // Create a new key that includes the level
          const levelKey = `${level}/${baseKey}`;
          this.rpc.invoke('onMissingChunk', { 
            key: levelKey,
            dataSize: Array.from(this.spec.chunkDataSize)
          });
        }
        await postProcessRawData(chunk, cancellationToken, data);
      }
    } catch (e) {
      // If there's an error, we'll use the fillValue
      console.error(`Error reading block ${baseKey}:`, e);
      const fillValue = typeof metadata.fillValue === 'number' ? metadata.fillValue : 0;
      const numElements = this.spec.chunkDataSize.reduce((a, b) => a * b, 1);
      const data = new Uint8Array(numElements).fill(fillValue);
      await postProcessRawData(chunk, cancellationToken, data);
    }
  }
}
