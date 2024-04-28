// DO NOT EDIT.  Generated from templates/neuroglancer/util/typedarray_builder.template.ts.
/**
 * @license
 * Copyright 2016 Google Inc.
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

export class Uint32ArrayBuilder {
  length = 0;
  data: Uint32Array;

  constructor(initialCapacity = 16) {
    this.data = new Uint32Array(initialCapacity);
  }

  resize(newLength: number) {
    const { data } = this;
    if (newLength > data.length) {
      const newData = new Uint32Array(Math.max(newLength, data.length * 2));
      newData.set(data.subarray(0, this.length));
      this.data = newData;
    }
    this.length = newLength;
  }

  get view() {
    const { data } = this;
    return new Uint32Array(data.buffer, data.byteOffset, this.length);
  }

  shrinkToFit() {
    this.data = new Uint32Array(this.view);
  }

  clear() {
    this.length = 0;
  }

  appendArray(other: ArrayLike<number>) {
    const { length } = this;
    this.resize(length + other.length);
    this.data.set(other, length);
  }

  eraseRange(start: number, end: number) {
    this.data.copyWithin(start, end, this.length);
    this.length -= end - start;
  }
}
