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

export interface AsyncComputationSpec<Signature extends (...args: any) => any> {
  id: string;
  (...args: Parameters<Signature>): Promise<ReturnType<Signature>>;
}

export function asyncComputation<Signature extends (...args: any) => any>(
  id: string,
): AsyncComputationSpec<Signature> {
  const spec = function (...args: Parameters<Signature>): Promise<ReturnType<Signature>> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL("./worker.js", import.meta.url));
      worker.onmessage = (msg) => {
        if (msg.data === null) {
          worker.postMessage({ t: id, id: 0, args });
        } else {
          const { id: msgId, value, error } = msg.data;
          if (error !== undefined) {
            reject(new Error(error));
          } else {
            resolve(value);
          }
          worker.terminate();
        }
      };
      worker.onerror = (error) => {
        reject(error);
        worker.terminate();
      };
    });
  };
  spec.id = id;
  return spec;
} 