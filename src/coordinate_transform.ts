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

import type { WatchableValueInterface } from "#src/trackable_value.js";
import { WatchableValue } from "#src/trackable_value.js";
import * as matrix from "#src/util/matrix.js";
import { NullarySignal } from "#src/util/signal.js";
import * as vector from "#src/util/vector.js";

export type DimensionId = number;

export interface CoordinateArray {
  // Indicates whether this coordinate array was specified explicitly, in which case it will be
  // encoded in the JSON representation.
  explicit: boolean;
  // Specifies the coordinates.  Must be montonically increasing integers.
  coordinates: number[];
  // Specifies the label for each coordinate in `coordinates`.
  labels: string[];
}

export interface CoordinateSpace {
  /**
   * If `true`, has been fully initialized (i.e. based on at least one data source).  If `false`,
   * may be partially initialized.
   */
  readonly valid: boolean;

  readonly rank: number;

  /**
   * Specifies the name of each dimension.
   */
  readonly names: readonly string[];

  readonly ids: readonly DimensionId[];

  /**
   * Timestamp of last user action that changed the name, scale, or unit of each dimension, or
   * `undefined` if there was no user action.
   */
  readonly timestamps: readonly number[];

  /**
   * Specifies the physical units corresponding to this dimension.  May be empty to indicate
   * unitless.
   */
  readonly units: readonly string[];

  /**
   * Specifies a scale for this dimension.
   */
  readonly scales: Float64Array;

  readonly bounds: CoordinateSpaceBounds;
  readonly boundingBoxes: readonly TransformedBoundingBox[];

  readonly coordinateArrays: (CoordinateArray | undefined)[];
}

export function makeCoordinateSpace(space: {
  readonly valid?: boolean;
  readonly names: readonly string[];
  readonly units: readonly string[];
  readonly scales: Float64Array;
  readonly rank?: number;
  readonly timestamps?: readonly number[];
  readonly ids?: readonly DimensionId[];
  readonly boundingBoxes?: readonly TransformedBoundingBox[];
  readonly bounds?: CoordinateSpaceBounds;
  readonly coordinateArrays?: (CoordinateArray | undefined)[];
}): CoordinateSpace {
  const { names, units, scales } = space;
  const {
    valid = true,
    rank = names.length,
    timestamps = names.map(() => Number.NEGATIVE_INFINITY),
    ids = names.map((_, i) => -i),
    boundingBoxes = [],
  } = space;
  const { coordinateArrays = new Array<CoordinateArray | undefined>(rank) } =
    space;

  const lowerBounds = new Float64Array(rank);
  const upperBounds = new Float64Array(rank);
  const bounds = { lowerBounds, upperBounds, voxelCenterAtIntegerCoordinates: new Array(rank).fill(true) };

  return {
    valid,
    rank,
    names,
    timestamps,
    ids,
    units,
    scales,
    boundingBoxes,
    bounds,
    coordinateArrays,
  };
}

export const emptyInvalidCoordinateSpace = makeCoordinateSpace({
  valid: false,
  names: [],
  units: [],
  scales: vector.kEmptyFloat64Vec,
  boundingBoxes: [],
});

export const emptyValidCoordinateSpace = makeCoordinateSpace({
  valid: true,
  names: [],
  units: [],
  scales: vector.kEmptyFloat64Vec,
  boundingBoxes: [],
});

export class TrackableCoordinateSpace extends WatchableValue<CoordinateSpace> {
  constructor() {
    super(emptyInvalidCoordinateSpace);
  }

  reset() {
    this.value = emptyInvalidCoordinateSpace;
  }
  restoreState(obj: any) {
    this.value = {
      boundingBoxes: [],
      bounds: {
        lowerBounds: new Float64Array(0),
        upperBounds: new Float64Array(0),
        voxelCenterAtIntegerCoordinates: new Array(0)
      },
      coordinateArrays: [],
      ids: [],
      names: [],
      rank: 0,
      scales: new Float64Array(0),
      timestamps: [],
      units: [],
      valid: false,
    }
  }
}

export interface BoundingBox {
  lowerBounds: Float64Array;
  upperBounds: Float64Array;
}

export interface CoordinateSpaceBounds extends BoundingBox {
  voxelCenterAtIntegerCoordinates: boolean[];
}

export function roundCoordinateToVoxelCenter(
  bounds: CoordinateSpaceBounds,
  dimIndex: number,
  coordinate: number,
) {
  if (bounds.voxelCenterAtIntegerCoordinates[dimIndex]) {
    coordinate = Math.round(coordinate);
  } else {
    coordinate = Math.floor(coordinate) + 0.5;
  }
  return coordinate;
}

// Clamps `coordinate` to `[lower, upper - 1]`.  This is intended to be used with
// `roundCoordinateToVoxelCenter`.  If not rounding, it may be desirable to instead
// clamp to `[lower upper]`.
export function clampCoordinateToBounds(
  bounds: CoordinateSpaceBounds,
  dimIndex: number,
  coordinate: number,
) {
  const upperBound = bounds.upperBounds[dimIndex];
  if (Number.isFinite(upperBound)) {
    coordinate = Math.min(coordinate, upperBound - 1);
  }

  const lowerBound = bounds.lowerBounds[dimIndex];
  if (Number.isFinite(lowerBound)) {
    coordinate = Math.max(coordinate, lowerBound);
  }
  return coordinate;
}

export function clampAndRoundCoordinateToVoxelCenter(
  bounds: CoordinateSpaceBounds,
  dimIndex: number,
  coordinate: number,
): number {
  coordinate = clampCoordinateToBounds(bounds, dimIndex, coordinate);
  return roundCoordinateToVoxelCenter(bounds, dimIndex, coordinate);
}

export function getCenterBound(lower: number, upper: number) {
  let x = (lower + upper) / 2;
  if (!Number.isFinite(x)) x = Math.min(Math.max(0, lower), upper);
  return x;
}

export function getBoundingBoxCenter(
  out: Float32Array,
  bounds: BoundingBox,
): Float32Array {
  const { lowerBounds, upperBounds } = bounds;
  const rank = out.length;
  for (let i = 0; i < rank; ++i) {
    out[i] = getCenterBound(lowerBounds[i], upperBounds[i]);
  }
  return out;
}

export interface TransformedBoundingBox {
  box: BoundingBox;

  /**
   * Transform from "box" coordinate space to target coordinate space.
   */
  transform: Float64Array;
}

export function makeIdentityTransformedBoundingBox(box: BoundingBox) {
  const rank = box.lowerBounds.length;
  return {
    box,
    transform: matrix.createIdentity(Float64Array, rank, rank + 1),
  };
}

export interface CoordinateSpaceTransform {
  /**
   * Equal to `outputSpace.rank`.
   */
  readonly rank: number;

  /**
   * The source rank, which is <= rank.  Input dimensions >= sourceRank are synthetic and serve only
   * to embed the source data in a larger view space.
   */
  readonly sourceRank: number;

  /**
   * May have rank less than `outputSpace.rank`, in which case additional unnamed dimensions with
   * range `[0, 1)` are implicitly added.
   */
  readonly inputSpace: CoordinateSpace;

  readonly outputSpace: CoordinateSpace;

  /**
   * `(rank + 1) * (rank + 1)` homogeneous column-major transformation matrix, where columns
   * correspond to input dimensions and rows correspond to output dimensions.
   */
  readonly transform: Float64Array;
}

export function makeIdentityTransform(
  inputSpace: CoordinateSpace,
): CoordinateSpaceTransform {
  return {
    rank: inputSpace.rank,
    sourceRank: inputSpace.rank,
    inputSpace,
    outputSpace: inputSpace,
    transform: matrix.createIdentity(Float64Array, inputSpace.rank + 1),
  };
}


export function isLocalDimension(name: string) {
  return name.endsWith("'");
}

export function isLocalOrChannelDimension(name: string) {
  return name.endsWith("'") || name.endsWith("^");
}

export function isChannelDimension(name: string) {
  return name.endsWith("^");
}

export class WatchableCoordinateSpaceTransform
  implements WatchableValueInterface<CoordinateSpaceTransform>
{
  private value_: CoordinateSpaceTransform | undefined = undefined;
  readonly outputSpace: WatchableValueInterface<CoordinateSpace>;
  readonly inputSpace: WatchableValueInterface<CoordinateSpace>;
  changed = new NullarySignal();
  private inputSpaceChanged = new NullarySignal();
  readonly defaultTransform: CoordinateSpaceTransform;

  constructor(
    defaultTransform: CoordinateSpaceTransform,
    public readonly mutableSourceRank: boolean = false,
  ) {
    this.defaultTransform = defaultTransform;
    const self = this;
    this.outputSpace = {
      changed: self.changed,
      get value() {
        return self.value.outputSpace;
      },
    };
    this.inputSpace = {
      changed: self.inputSpaceChanged,
      get value() {
        return self.value.inputSpace;
      },
    };
  }

  get value(): CoordinateSpaceTransform {
    let { value_: value } = this;
    if (value === undefined) {
      value = this.value_ = this.defaultTransform;
    }
    return value;
  }

  reset() {
    if (this.value_ === this.defaultTransform) return;
    this.value_ = this.defaultTransform;
    this.inputSpaceChanged.dispatch();
    this.changed.dispatch();
  }

  get defaultInputSpace() {
    return this.defaultTransform.inputSpace;
  }
}

interface BoundCoordinateSpace {
  space: WatchableValueInterface<CoordinateSpace>;
  prevValue: CoordinateSpace | undefined;
  mappedDimensionIds: (DimensionId | undefined)[];
}

export class CoordinateSpaceCombiner {
  private bindings = new Set<BoundCoordinateSpace>();

  private prevCombined: CoordinateSpace | undefined = this.combined.value;

  dimensionRefCounts = new Map<string, number>();

  private includeDimensionPredicate_: (name: string) => boolean;

  get includeDimensionPredicate() {
    return this.includeDimensionPredicate_;
  }
  set includeDimensionPredicate(value: (name: string) => boolean) {
    this.includeDimensionPredicate_ = value;
    this.update();
  }

  constructor(
    public combined: WatchableValueInterface<CoordinateSpace>,
    includeDimensionPredicate: (name: string) => boolean,
  ) {
    this.includeDimensionPredicate_ = includeDimensionPredicate;
  }

  private update() {
    const bounds = {
      lowerBounds: new Float64Array([-0.5, -0.5, -0.5]),
      upperBounds: new Float64Array([767.5, 767.5, 767.5]),
      voxelCenterAtIntegerCoordinates: [true, true, true],
    }

    const newCombined = {
      boundingBoxes: [
        {
          box: bounds,
          transform: new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
        }
      ],
      bounds,
      coordinateArrays: new Array(3),
      ids: [1, 2, 3],
      names: ['z', 'y', 'x'],
      rank: 3,
      scales: new Float64Array([1, 1, 1]),
      timestamps: [-Infinity, -Infinity, -Infinity],
      units: ['', '', ''],
      valid: true,
    }

    this.prevCombined = newCombined;
    this.combined.value = newCombined;
  }

  private handleCombinedChanged = () => {
    if (this.combined.value === this.prevCombined) return;
    this.update();
  };

  bind(space: WatchableValueInterface<CoordinateSpace>) {
    const binding = { space, mappedDimensionIds: [], prevValue: undefined };
    const { bindings } = this;
    if (bindings.size === 0) {
      this.combined.changed.add(this.handleCombinedChanged);
    }
    bindings.add(binding);

    const changedDisposer = space.changed.add(() => {
      if (space.value === binding.prevValue) return;
      this.update();
    });
    const disposer = () => {
      changedDisposer();
      const { bindings } = this;
      bindings.delete(binding);
      if (bindings.size === 0) {
        this.combined.changed.remove(this.handleCombinedChanged);
      }
      this.update();
    };
    this.update();
    return disposer;
  }
}


