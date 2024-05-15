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

import type {
  ByteRange,
  ByteRangeRequest,
  ReadableKvStore,
  ReadOptions,
  ReadResponse,
} from "#src/kvstore/index.js";
import { cancellableFetchOk } from "#src/util/http_request.js";

function getRangeHeader(
  request: ByteRangeRequest | undefined,
): string | undefined {
  if (request === undefined) return undefined;
  if ("suffixLength" in request) {
    return `bytes=-${request.suffixLength}`;
  }
  return `bytes=${request.offset}-${request.offset + request.length - 1}`;
}

/**
 * On Chromium, multiple concurrent byte range requests to the same URL are serialized unless the
 * cache is disabled.  Disabling the cache works around the problem.
 *
 * https://bugs.chromium.org/p/chromium/issues/detail?id=969828
 */
const byteRangeCacheMode =
  navigator.userAgent.indexOf("Chrome") !== -1 ? "no-store" : "default";

class SpecialProtocolKvStore implements ReadableKvStore {
  constructor(public baseUrl: string) {}
  async read(
    key: string,
    options: ReadOptions,
  ): Promise<ReadResponse | undefined> {
    let { byteRange: byteRangeRequest } = options;
    const url = this.baseUrl + key;
    for (let attempt = 0; ; ++attempt) {
      const requestInit: RequestInit = {};
      const rangeHeader = getRangeHeader(byteRangeRequest);
      if (rangeHeader !== undefined) {
        requestInit.headers = { range: rangeHeader };
        requestInit.cache = byteRangeCacheMode;
      }
      const { data } = await cancellableFetchOk(url, async (response) => ({
        response,
        data: await response.arrayBuffer(),
      }));
      let byteRange: ByteRange | undefined;
      let totalSize: number | undefined;
      if (byteRange === undefined) {
        byteRange = { offset: 0, length: data.byteLength };
        totalSize = data.byteLength;
      }
      return { data: new Uint8Array(data), dataRange: byteRange, totalSize };
    }
  }
}
export function getSpecialProtocolKvStore(baseUrl: string): ReadableKvStore {
  return new SpecialProtocolKvStore(baseUrl);
}
