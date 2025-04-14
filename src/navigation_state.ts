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

import type {
  CoordinateSpace,
} from "#src/coordinate_transform.js";
import {
  clampAndRoundCoordinateToVoxelCenter,
  getBoundingBoxCenter,
} from "#src/coordinate_transform.js";
import type { WatchableValueInterface } from "#src/trackable_value.js";
import type { Borrowed, Owned } from "#src/util/disposable.js";
import { RefCounted } from "#src/util/disposable.js";
import { mat3, mat4, quat, vec3 } from "#src/util/geom.js";
import {
  parseArray,
  parseFiniteVec,
  verifyFiniteFloat,
  verifyFinitePositiveFloat,
} from "#src/util/json.js";
import { NullarySignal } from "#src/util/signal.js";
import type { Trackable } from "#src/util/trackable.js";
import * as vector from "#src/util/vector.js";

const tempVec3 = vec3.create();

export class Position extends RefCounted {
  private coordinates_: Float32Array = new Float32Array(3);
  changed = new NullarySignal();

  constructor(
    public coordinateSpace: WatchableValueInterface<CoordinateSpace>,
  ) {
    super();
    this.registerDisposer(
      coordinateSpace.changed.add(() => {
        this.handleCoordinateSpaceChanged();
      }),
    );
  }

  get valid() {
    return this.coordinateSpace.value.valid;
  }

  /**
   * Returns the position in voxels.
   */
  get value() {
    return this.coordinates_;
  }

  reset() {
    this.coordinates_ = new Float32Array(3);
    this.changed.dispatch();
  }

  set value(coordinates: Float32Array) {
    if (coordinates.length !== 3) {
      return;
    }
    this.coordinates_.set(coordinates);
    this.changed.dispatch();
  }

  private handleCoordinateSpaceChanged() {
    const coordinateSpace = this.coordinateSpace.value;
    if (!coordinateSpace.valid) return;
    const { bounds } = coordinateSpace;
    getBoundingBoxCenter(this.coordinates_, bounds);
    const { voxelCenterAtIntegerCoordinates } = bounds;
    for (let i = 0; i < 3; ++i) {
          if (voxelCenterAtIntegerCoordinates[i]) {
        this.coordinates_[i] = Math.round(this.coordinates_[i]);
          } else {
        this.coordinates_[i] = Math.floor(this.coordinates_[i]) + 0.5;
      }
    }
    this.changed.dispatch();
  }

  toJSON() {
    if (!this.valid) return undefined;
    return Array.from(this.coordinates_);
  }

  restoreState(obj: any) {
    if (obj === undefined) {
      this.reset();
      return;
    }
    this.coordinates_ = Float32Array.from(parseArray(obj, verifyFiniteFloat));
    this.changed.dispatch();
  }

  snapToVoxel() {
    const {
      bounds: { voxelCenterAtIntegerCoordinates },
    } = this.coordinateSpace.value;
    for (let i = 0; i < 3; ++i) {
      if (voxelCenterAtIntegerCoordinates[i]) {
        this.coordinates_[i] = Math.round(this.coordinates_[i]);
      } else {
        this.coordinates_[i] = Math.floor(this.coordinates_[i]) + 0.5;
      }
    }
    this.changed.dispatch();
  }

  assign(other: Borrowed<Position>) {
    this.coordinates_.set(other.coordinates_);
    this.changed.dispatch();
  }

  /**
   * Get the offset of `a` relative to `b`.
   */
  static getOffset(a: Position, b: Position): Float32Array | undefined {
    const aCoordinates = a.coordinates_;
    const bCoordinates = b.coordinates_;
      return vector.subtract(
      new Float32Array(3),
        aCoordinates,
        bCoordinates,
      );
    }

  static addOffset(
    target: Position,
    source: Position,
    offset: Float32Array | undefined,
    scale = 1,
  ): void {
    if (offset !== undefined) {
      vector.scaleAndAdd(target.coordinates_, source.coordinates_, offset, scale);
      target.changed.dispatch();
    }
  }
}

export class OrientationState extends RefCounted {
  orientation: quat;
  changed = new NullarySignal();

  constructor(orientation?: quat) {
    super();
    if (orientation == null) {
      orientation = quat.create();
    }
    this.orientation = orientation;
  }

  toJSON() {
    const { orientation } = this;
    quat.normalize(this.orientation, this.orientation);
    if (quaternionIsIdentity(orientation)) {
      return undefined;
    }
    return Array.prototype.slice.call(this.orientation);
  }

  restoreState(obj: any) {
    try {
      parseFiniteVec(this.orientation, obj);
      quat.normalize(this.orientation, this.orientation);
    } catch (ignoredError) {
      quat.identity(this.orientation);
    }
    this.changed.dispatch();
  }

  reset() {
    quat.identity(this.orientation);
    this.changed.dispatch();
  }

  assign(other: Borrowed<OrientationState>) {
    quat.copy(this.orientation, other.orientation);
    this.changed.dispatch();
  }

  /**
   * Returns a new OrientationState with orientation fixed to peerToSelf * peer.orientation.  Any
   * changes to the returned OrientationState will cause a corresponding change in peer, and vice
   * versa.
   */
  static makeRelative(peer: OrientationState, peerToSelf: quat) {
    const self = new OrientationState(
      quat.multiply(quat.create(), peer.orientation, peerToSelf),
    );
    let updatingPeer = false;
    self.registerDisposer(
      peer.changed.add(() => {
        if (!updatingPeer) {
          updatingSelf = true;
          quat.multiply(self.orientation, peer.orientation, peerToSelf);
          self.changed.dispatch();
          updatingSelf = false;
        }
      }),
    );
    let updatingSelf = false;
    const selfToPeer = quat.invert(quat.create(), peerToSelf);
    self.registerDisposer(
      self.changed.add(() => {
        if (!updatingSelf) {
          updatingPeer = true;
          quat.multiply(peer.orientation, self.orientation, selfToPeer);
          peer.changed.dispatch();
          updatingPeer = false;
        }
      }),
    );
    return self;
  }
}

export interface DisplayDimensionRenderInfo {
  /**
   * Number of global dimensions.
   */
  globalRank: number;

  /**
   * Array of length `globalRank` specifying global dimension names.
   */
  globalDimensionNames: readonly string[];

  /**
   * Number of displayed dimensions.  Must be <= 3.
   */
  displayRank: number;

  /**
   * Array of length 3.  The first `displayRank` elements specify the indices of the the global
   * dimensions that are displayed.  The remaining elements are `-1`.
   */
  displayDimensionIndices: Int32Array;
}

function getDisplayDimensionRenderInfo(
): DisplayDimensionRenderInfo {
  const globalRank = 3;
  const displayRank = 3;
  const globalDimensionNames = ['z', 'y', 'x']
  const displayDimensionIndices = new Int32Array([0, 1, 2])

  return {
    globalRank,
    globalDimensionNames,
    displayRank,
    displayDimensionIndices,
  };
}

export class WatchableDisplayDimensionRenderInfo extends RefCounted {
  private value_: DisplayDimensionRenderInfo = getDisplayDimensionRenderInfo();
  get value() {
    return this.value_;
  }
  constructor() {
    super();
  }
}

export interface DisplayDimensions {
  coordinateSpace: CoordinateSpace;
  displayRank: number;
  displayDimensionIndices: Int32Array;
}

export class DisplayPose extends RefCounted {
  changed = new NullarySignal();

  constructor(
    public position: Owned<Position>,
    public displayDimensionRenderInfo: WatchableDisplayDimensionRenderInfo,
    public orientation: Owned<OrientationState>,
  ) {
    super();
    this.registerDisposer(position);
    this.registerDisposer(orientation);
    this.registerDisposer(displayDimensionRenderInfo);
    this.registerDisposer(position.changed.add(this.changed.dispatch));
    this.registerDisposer(orientation.changed.add(this.changed.dispatch));
  }

  get valid() {
    return this.position.valid;
  }

  updateDisplayPosition(
    fun: (pos: vec3) => boolean | void,
    temp: vec3 = tempVec3,
  ): boolean {
    const {
      coordinateSpace: { value: coordinateSpace },
      value: voxelCoordinates,
    } = this.position;
    const displayRank = 3;
    const displayDimensionIndices = new Int32Array([0, 1, 2]);
    if (coordinateSpace === undefined) return false;
    temp.fill(0);
    for (let i = 0; i < displayRank; ++i) {
      const dim = displayDimensionIndices[i];
      temp[i] = voxelCoordinates[dim];
    }
    if (fun(temp) !== false) {
      for (let i = 0; i < displayRank; ++i) {
        const dim = displayDimensionIndices[i];
        voxelCoordinates[dim] = temp[i];
      }
      this.position.changed.dispatch();
      return true;
    }
    return false;
  }

  // Transform from view coordinates to global spatial coordinates.
  toMat4(mat: mat4, zoom: number) {
    mat4.fromQuat(mat, this.orientation.orientation);
    const { value: voxelCoordinates } = this.position;
    const { displayDimensionIndices } =
      this.displayDimensionRenderInfo.value;
    for (let i = 0; i < 3; ++i) {
      const dim = displayDimensionIndices[i];
      const scale = zoom;
      mat[i] *= scale;
      mat[4 + i] *= scale;
      mat[8 + i] *= scale;
      mat[12 + i] = voxelCoordinates[dim] || 0;
    }
  }

  toMat3(mat: mat3, zoom: number) {
    mat3.fromQuat(mat, this.orientation.orientation);
    const { displayRank } =
      this.displayDimensionRenderInfo.value;
    for (let i = 0; i < displayRank; ++i) {
      const scale = zoom;
      mat[i] *= scale;
      mat[3 + i] *= scale;
      mat[6 + i] *= scale;
    }
  }

  translateVoxelsRelative(translation: vec3) {
    if (!this.valid) {
      return;
    }
    const temp = vec3.transformQuat(
      tempVec3,
      translation,
      this.orientation.orientation,
    );
    const { position } = this;
    const { value: voxelCoordinates } = position;
    const displayRank = 3;
    const displayDimensionIndices = new Int32Array([0, 1, 2]);
    const { bounds } = position.coordinateSpace.value;
    for (let i = 0; i < displayRank; ++i) {
      const dim = displayDimensionIndices[i];
      const adjustment = temp[i];
      if (adjustment === 0) continue;
      voxelCoordinates[dim] = clampAndRoundCoordinateToVoxelCenter(
        bounds,
        dim,
        voxelCoordinates[dim] + adjustment,
      );
    }
    this.position.changed.dispatch();
  }

  rotateRelative(axis: vec3, angle: number) {
    const temp = quat.create();
    quat.setAxisAngle(temp, axis, angle);
    const orientation = this.orientation.orientation;
    quat.multiply(orientation, orientation, temp);
    this.orientation.changed.dispatch();
  }
}

export type TrackableZoomInterface =
  | TrackableProjectionZoom
  | TrackableCrossSectionZoom;

abstract class TrackableZoom
  extends RefCounted
  implements Trackable, WatchableValueInterface<number>
{
  readonly changed = new NullarySignal();
  private value_: number = Number.NaN;

  /**
   * Zoom factor.  For cross section views, in canonical voxels per viewport pixel.  For projection
   * views, in canonical voxels per viewport height (for orthographic projection).
   */
  get value() {
    return this.value_;
  }

  set value(value: number) {
    if (Object.is(value, this.value_)) {
      return;
    }
    this.value_ = value;
    this.changed.dispatch();
  }

  constructor() {
    super();
    this.value_ = this.getDefaultValue();
  }

  protected abstract getDefaultValue(): number;

  toJSON() {
    const { value } = this;
    return Number.isNaN(value) ? undefined : value;
  }

  restoreState(obj: any) {
    if (obj === undefined) {
      this.value_ = this.getDefaultValue();
    } else {
      this.value_ = verifyFinitePositiveFloat(obj);
    }
    this.changed.dispatch();
  }

  reset() {
    this.value_ = this.getDefaultValue();
    this.changed.dispatch();
  }
}

export class TrackableCrossSectionZoom extends TrackableZoom {
  protected getDefaultValue() {
      // Default is 1 voxel per viewport pixel.
      return 1;
  }
}

export class NavigationState extends RefCounted {
  changed = new NullarySignal();

  constructor(
    public pose: Owned<DisplayPose>,
    public zoomFactor: any,
  ) {
    super();
    this.registerDisposer(pose);
    this.registerDisposer(zoomFactor);
    this.registerDisposer(this.pose.changed.add(this.changed.dispatch));
    this.registerDisposer(this.zoomFactor.changed.add(this.changed.dispatch));
  }

  get coordinateSpace() {
    return this.pose.position.coordinateSpace;
  }

  get position() {
    return this.pose.position;
  }
  get displayDimensions() {
    return this.pose.displayDimensions;
  }
  get displayDimensionRenderInfo() {
    return this.pose.displayDimensionRenderInfo;
  }
  toMat4(mat: mat4) {
    this.pose.toMat4(mat, this.zoomFactor.value);
  }
  toMat3(mat: mat3) {
    this.pose.toMat3(mat, this.zoomFactor.value);
  }

  get valid() {
    return this.pose.valid && !Number.isNaN(this.zoomFactor.value);
  }

  zoomBy(factor: number) {
    this.zoomFactor.value *= factor;
  }
}
