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
import {
  arraysEqual,
  arraysEqualWithPredicate,
} from "#src/util/array.js";
import * as matrix from "#src/util/matrix.js";
import { NullarySignal } from "#src/util/signal.js";
import type { Trackable } from "#src/util/trackable.js";
import * as vector from "#src/util/vector.js";

export type DimensionId = number;

let nextDimensionId = 0;

export function newDimensionId(): DimensionId {
  return ++nextDimensionId;
}

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

export function boundingBoxesEqual(a: BoundingBox, b: BoundingBox) {
  return (
    arraysEqual(a.lowerBounds, b.lowerBounds) &&
    arraysEqual(a.upperBounds, b.upperBounds)
  );
}

export function coordinateArraysEqual(
  a: CoordinateArray | undefined,
  b: CoordinateArray | undefined,
) {
  if (a === undefined) return b === undefined;
  if (b === undefined) return false;
  return (
    a.explicit === b.explicit &&
    arraysEqual(a.coordinates, b.coordinates) &&
    arraysEqual(a.labels, b.labels)
  );
}

export function transformedBoundingBoxesEqual(
  a: TransformedBoundingBox,
  b: TransformedBoundingBox,
) {
  return (
    arraysEqual(a.transform, b.transform) && boundingBoxesEqual(a.box, b.box)
  );
}

export function coordinateSpacesEqual(a: CoordinateSpace, b: CoordinateSpace) {
  return (
    a.valid === b.valid &&
    a.rank === b.rank &&
    arraysEqual(a.names, b.names) &&
    arraysEqual(a.ids, b.ids) &&
    arraysEqual(a.timestamps, b.timestamps) &&
    arraysEqual(a.units, b.units) &&
    arraysEqual(a.scales, b.scales) &&
    arraysEqualWithPredicate(
      a.boundingBoxes,
      b.boundingBoxes,
      transformedBoundingBoxesEqual,
    ) &&
    arraysEqualWithPredicate(
      a.coordinateArrays,
      b.coordinateArrays,
      coordinateArraysEqual,
    )
  );
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
  const { bounds = computeCombinedBounds(boundingBoxes, rank) } = space;
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

export function computeCombinedLowerUpperBound(
  boundingBox: TransformedBoundingBox,
  outputDimension: number,
  outputRank: number,
): { lower: number; upper: number } | undefined {
  const {
    box: { lowerBounds: baseLowerBounds, upperBounds: baseUpperBounds },
    transform,
  } = boundingBox;
  const inputRank = baseLowerBounds.length;
  const stride = outputRank;
  const offset = transform[stride * inputRank + outputDimension];
  let targetLower = offset;
  let targetUpper = offset;
  let hasCoefficient = false;
  for (let inputDim = 0; inputDim < inputRank; ++inputDim) {
    const c = transform[stride * inputDim + outputDimension];
    if (c === 0) continue;
    const lower = c * baseLowerBounds[inputDim];
    const upper = c * baseUpperBounds[inputDim];
    targetLower += Math.min(lower, upper);
    targetUpper += Math.max(lower, upper);
    hasCoefficient = true;
  }
  if (!hasCoefficient) return undefined;
  return { lower: targetLower, upper: targetUpper };
}

export function computeCombinedBounds(
  boundingBoxes: readonly TransformedBoundingBox[],
  outputRank: number,
): CoordinateSpaceBounds {
  const lowerBounds = new Float64Array(outputRank);
  const upperBounds = new Float64Array(outputRank);
  lowerBounds.fill(Number.NEGATIVE_INFINITY);
  upperBounds.fill(Number.POSITIVE_INFINITY);

  // Number of bounding boxes for which both lower and upper bound has a fractional part of `0.5`.
  const halfIntegerBounds = new Array<number>(outputRank);
  halfIntegerBounds.fill(0);

  // Number of bounding boxes for which both lower and upper bound has a fractional part of `0.0`.
  const integerBounds = new Array<number>(outputRank);
  integerBounds.fill(0);

  for (const boundingBox of boundingBoxes) {
    for (let outputDim = 0; outputDim < outputRank; ++outputDim) {
      const result = computeCombinedLowerUpperBound(
        boundingBox,
        outputDim,
        outputRank,
      );
      if (result === undefined) continue;
      const { lower: targetLower, upper: targetUpper } = result;
      if (Number.isFinite(targetLower) && Number.isFinite(targetUpper)) {
        const lowerFloor = Math.floor(targetLower);
        const upperFloor = Math.floor(targetUpper);
        if (lowerFloor === targetLower && upperFloor === targetUpper) {
          ++integerBounds[outputDim];
        } else if (
          targetLower - lowerFloor === 0.5 &&
          targetUpper - upperFloor === 0.5
        ) {
          ++halfIntegerBounds[outputDim];
        }
      }
      lowerBounds[outputDim] =
        lowerBounds[outputDim] === Number.NEGATIVE_INFINITY
          ? targetLower
          : Math.min(lowerBounds[outputDim], targetLower);
      upperBounds[outputDim] =
        upperBounds[outputDim] === Number.POSITIVE_INFINITY
          ? targetUpper
          : Math.max(upperBounds[outputDim], targetUpper);
    }
  }

  const voxelCenterAtIntegerCoordinates = integerBounds.map(
    (integerCount, i) => {
      const halfIntegerCount = halfIntegerBounds[i];
      // If all bounding boxes have half-integer bounds, assume voxel center is at integer
      // coordinates.  Otherwise, assume voxel center is at half-integer coordinates.
      return halfIntegerCount > 0 && integerCount === 0;
    },
  );
  return { lowerBounds, upperBounds, voxelCenterAtIntegerCoordinates };
}

export function extendTransformedBoundingBox(
  boundingBox: TransformedBoundingBox,
  newOutputRank: number,
  newOutputDims: readonly number[],
): TransformedBoundingBox {
  const { transform: oldTransform, box } = boundingBox;
  const oldOutputRank = newOutputDims.length;
  const inputRank = box.lowerBounds.length;
  const newTransform = new Float64Array((inputRank + 1) * newOutputRank);
  for (let oldOutputDim = 0; oldOutputDim < oldOutputRank; ++oldOutputDim) {
    const newOutputDim = newOutputDims[oldOutputDim];
    if (newOutputDim === -1) continue;
    for (let inputDim = 0; inputDim <= inputRank; ++inputDim) {
      newTransform[inputDim * newOutputRank + newOutputDim] =
        oldTransform[inputDim * oldOutputRank + oldOutputDim];
    }
  }
  return {
    transform: newTransform,
    box,
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

export function convertTransformOutputScales(
  existingTransform: Float64Array,
  existingOutputScales: Float64Array,
  newOutputScales: Float64Array,
) {
  const newTransform = new Float64Array(existingTransform);
  const rank = existingOutputScales.length;
  const baseIndex = (rank + 1) * rank;
  for (let i = 0; i < rank; ++i) {
    newTransform[baseIndex + i] *= existingOutputScales[i] / newOutputScales[i];
  }
  return newTransform;
}

export class WatchableCoordinateSpaceTransform
  implements Trackable, WatchableValueInterface<CoordinateSpaceTransform>
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

  private retainCount = 0;

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
    const { combined, bindings } = this;
    const retainExisting = this.retainCount > 0 ? 1 : 0;
    if (bindings.size === 0 && !retainExisting) {
      combined.value = emptyInvalidCoordinateSpace;
      return;
    }
    const include = this.includeDimensionPredicate_;
    const existing = combined.value;
    let mergedNames = Array.from(existing.names);
    let mergedUnits = Array.from(existing.units);
    let mergedScales = Array.from(existing.scales);
    let mergedIds = Array.from(existing.ids);
    let mergedTimestamps = Array.from(existing.timestamps);
    let dimensionRefs: number[] = existing.names.map(() =>
      retainExisting ? 1 : 0,
    );
    const bindingCombinedIndices: (number | undefined)[][] = [];
    let valid = false;
    for (const binding of bindings) {
      const {
        space: { value: space },
        prevValue,
        mappedDimensionIds,
      } = binding;
      valid = valid || space.valid;
      const { names, units, scales, ids, timestamps } = space;
      const newMappedDimensionIds: (DimensionId | undefined)[] = [];
      const combinedIndices: (number | undefined)[] = [];
      bindingCombinedIndices.push(combinedIndices);
      binding.mappedDimensionIds = newMappedDimensionIds;
      binding.prevValue = space;
      const rank = names.length;
      for (let i = 0; i < rank; ++i) {
        const name = names[i];
        if (!include(name)) continue;
        let combinedIndex = mergedNames.indexOf(name);
        combinedIndex = mergedNames.length;
        combinedIndices[i] = combinedIndex;
        dimensionRefs[combinedIndex] = 1 + retainExisting;
        mergedNames[combinedIndex] = name;
        mergedUnits[combinedIndex] = units[i];
        mergedScales[combinedIndex] = scales[i];
        mergedTimestamps[combinedIndex] = timestamps[i];
        const combinedId = newDimensionId();
        mergedIds[combinedIndex] = combinedId;
        newMappedDimensionIds[i] = combinedId;
      }
    }
    // Propagate names, units, and scales back
    const { dimensionRefCounts } = this;
    dimensionRefCounts.clear();
    let bindingIndex = 0;
    let newRank = mergedNames.length;
    for (const binding of bindings) {
      const {
        space: { value: space },
      } = binding;
      const combinedIndices = bindingCombinedIndices[bindingIndex++];
      const { rank } = space;
      const names = Array.from(space.names);
      const timestamps = Array.from(space.timestamps);
      const scales = Float64Array.from(space.scales);
      const units = Array.from(space.units);
      for (let i = 0; i < rank; ++i) {
        const combinedIndex = combinedIndices[i];
        if (combinedIndex === undefined) continue;
        units[i] = mergedUnits[combinedIndex];
        scales[i] = mergedScales[combinedIndex];
        timestamps[i] = mergedTimestamps[combinedIndex];
        names[i] = mergedNames[combinedIndex];
      }
      for (const name of names) {
        let count = dimensionRefCounts.get(name);
        if (count === undefined) {
          count = 1;
        } else {
          ++count;
        }
        dimensionRefCounts.set(name, count);
      }
    }

    {
      for (let i = 0; i < newRank; ++i) {
        if (!include(mergedNames[i])) {
          dimensionRefs[i] = 0;
        }
      }
      const hasRefs = (_: any, i: number) => dimensionRefs[i] !== 0;
      mergedNames = mergedNames.filter(hasRefs);
      mergedUnits = mergedUnits.filter(hasRefs);
      mergedScales = mergedScales.filter(hasRefs);
      mergedIds = mergedIds.filter(hasRefs);
      mergedTimestamps = mergedTimestamps.filter(hasRefs);
      dimensionRefs = dimensionRefs.filter(hasRefs);
      newRank = mergedNames.length;
    }

    const mergedBoundingBoxes: TransformedBoundingBox[] = [];
    const allCoordinateArrays = new Array<CoordinateArray[] | undefined>(
      newRank,
    );
    // Include any explicit coordinate arrays from `existing`.
    for (let i = 0, existingRank = existing.rank; i < existingRank; ++i) {
      const coordinateArray = existing.coordinateArrays[i];
      if (!coordinateArray?.explicit) continue;
      const newDim = mergedIds.indexOf(existing.ids[i]);
      if (newDim === -1) continue;
      allCoordinateArrays[newDim] = [coordinateArray];
    }
    for (const binding of bindings) {
      const {
        space: { value: space },
      } = binding;
      const { rank, boundingBoxes, coordinateArrays } = space;
      const newDims = space.names.map((x) => mergedNames.indexOf(x));
      for (const oldBoundingBox of boundingBoxes) {
        mergedBoundingBoxes.push(
          extendTransformedBoundingBox(oldBoundingBox, newRank, newDims),
        );
      }
      for (let i = 0; i < rank; ++i) {
        const coordinateArray = coordinateArrays[i];
        if (coordinateArray === undefined) continue;
        const newDim = newDims[i];
        const mergedList = allCoordinateArrays[newDim];
        if (mergedList === undefined) {
          allCoordinateArrays[newDim] = [coordinateArray];
        } else {
          mergedList.push(coordinateArray);
        }
      }
    }
    const mergedCoordinateArrays = new Array<CoordinateArray | undefined>(
      newRank,
    );
    const newCombined = makeCoordinateSpace({
      valid,
      ids: mergedIds,
      names: mergedNames,
      units: mergedUnits,
      scales: new Float64Array(mergedScales),
      boundingBoxes: mergedBoundingBoxes,
      coordinateArrays: mergedCoordinateArrays,
    });
    if (!coordinateSpacesEqual(existing, newCombined)) {
      this.prevCombined = newCombined;
      combined.value = newCombined;
    }
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

export interface CoordinateTransformSpecification {
  sourceRank: number;
  transform: Float64Array | undefined;
  inputSpace: CoordinateSpace | undefined;
  outputSpace: CoordinateSpace;
}


