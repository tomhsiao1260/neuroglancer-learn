/**
 * This defines an abstraction used by VolumeChunkSource backends for decoding chunk data received
 * in various formats.
 */

import type { VolumeChunk } from "#src/sliceview/volume/backend.js";
import type { CancellationToken } from "#src/util/cancellation.js";
export type ChunkDecoder = (
  chunk: VolumeChunk,
  cancellationToken: CancellationToken,
  response: ArrayBuffer,
) => Promise<void>;
