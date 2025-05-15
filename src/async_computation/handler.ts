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

type AsyncComputationHandler = (...args: any[]) => Promise<any>;

const handlers = new Map<string, AsyncComputationHandler>();

export function registerAsyncComputation(id: string, handler: AsyncComputationHandler) {
  handlers.set(id, handler);
}

export function setupChannel(self: Worker) {
  self.onmessage = async (msg) => {
    const { t: type, id, args } = msg.data;
    const handler = handlers.get(type);
    if (handler === undefined) {
      self.postMessage({ id, error: `Unknown computation type: ${type}` });
      return;
    }
    try {
      const value = await handler(...args);
      self.postMessage({ id, value });
    } catch (error: any) {
      self.postMessage({ id, error: error.message || String(error) });
    }
  };
} 