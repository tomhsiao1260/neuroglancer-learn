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

import { RefCounted } from "#src/util/disposable.js";
import type { NullaryReadonlySignal } from "#src/util/signal.js";
import { neverSignal, NullarySignal, Signal } from "#src/util/signal.js";

export interface WatchableValueInterface<T> {
  value: T;
  changed: NullaryReadonlySignal;
}

export interface WatchableValueChangeInterface<T> {
  readonly value: T;
  readonly changed: Signal<(oldValue: T, newValue: T) => void>;
}

export class WatchableValue<T> implements WatchableValueInterface<T> {
  get value() {
    return this.value_;
  }
  set value(newValue: T) {
    if (newValue !== this.value_) {
      this.value_ = newValue;
      this.changed.dispatch();
    }
  }
  changed = new NullarySignal();
  constructor(protected value_: T) {}
}

export class TrackableValue<T> extends WatchableValue<T>{
  constructor(
    value: T,
    public validator: (value: any) => T,
    public defaultValue = value,
  ) {
    super(value);
  }
  reset() {
    this.value = this.defaultValue;
  }
}

class DerivedWatchableValue<U>
  extends RefCounted
  implements WatchableValueInterface<U>
{
  changed = new NullarySignal();
  get value() {
    return this.f(...this.ws.map((w) => w.value));
  }
  private f: (...v: any[]) => U;
  private ws: WatchableValueInterface<any>[];

  constructor(f: (...v: any[]) => U, ws: WatchableValueInterface<any>[]) {
    super();
    this.f = f;
    this.ws = ws;
    for (const w of ws) {
      this.registerDisposer(w.changed.add(this.changed.dispatch));
    }
  }
}

export class CachedWatchableValue<T>
  extends RefCounted
  implements WatchableValueInterface<T>
{
  changed = new Signal();
  value: T;
  constructor(
    base: WatchableValueInterface<T>,
    isEqual: (a: T, b: T) => boolean = (a, b) => a === b,
  ) {
    super();
    this.value = base.value;
    this.registerDisposer(
      base.changed.add(() => {
        const newValue = base.value;
        if (!isEqual(this.value, newValue)) {
          this.value = newValue;
          this.changed.dispatch();
        }
      }),
    );
  }
}

export function makeCachedDerivedWatchableValue<U, T extends any[]>(
  f: (...v: T) => U,
  ws: { [K in keyof T]: WatchableValueInterface<T[K]> },
  isEqual?: (a: U, b: U) => boolean,
) {
  const derived = new DerivedWatchableValue(f, ws);
  const cached = new CachedWatchableValue(derived, isEqual);
  cached.registerDisposer(derived);
  return cached;
}

export interface TrackableValueInterface<T>
  extends WatchableValueInterface<T> {
    toJSON(): any;
    reset(): void;
    restoreState(x: any): void;
  }


export function constantWatchableValue<T>(
  value: T,
): WatchableValueInterface<T> {
  return { changed: neverSignal, value };
}


