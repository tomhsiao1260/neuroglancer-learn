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

import type { MaybeOptionalCredentialsProvider } from "#src/credentials_provider/index.js";
import { fetchWithOAuth2Credentials } from "#src/credentials_provider/oauth2.js";
import type { CancellationToken } from "#src/util/cancellation.js";
import { uncancelableToken } from "#src/util/cancellation.js";
import type { ResponseTransform } from "#src/util/http_request.js";

export type SpecialProtocolCredentials = any;
export type SpecialProtocolCredentialsProvider =
  MaybeOptionalCredentialsProvider<SpecialProtocolCredentials>;

export async function cancellableFetchSpecialOk<T>(
  credentialsProvider: SpecialProtocolCredentialsProvider,
  url: string,
  init: RequestInit,
  transformResponse: ResponseTransform<T>,
  cancellationToken: CancellationToken = uncancelableToken,
): Promise<T> {
  return fetchWithOAuth2Credentials(
    credentialsProvider,
    url,
    init,
    transformResponse,
    cancellationToken,
  );
}
