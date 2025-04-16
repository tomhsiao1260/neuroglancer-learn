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
import type { CoordinateSpace } from "#src/coordinate_transform.js";
import {
  CoordinateSpaceCombiner,
  isChannelDimension,
  isLocalDimension,
  TrackableCoordinateSpace,
} from "#src/coordinate_transform.js";
import type {
  ManagedUserLayer,
} from "#src/layer/index.js";
import {
  UserLayer,
} from "#src/layer/index.js";
import type { LoadedDataSubsource } from "#src/layer/layer_data_source.js";
import { DataType } from "#src/sliceview/volume/base.js";
import { MultiscaleVolumeChunkSource } from "#src/sliceview/volume/frontend.js";
import {
  getTrackableFragmentMain,
  ImageRenderLayer,
} from "#src/sliceview/volume/image_renderlayer.js";
import type { WatchableValueInterface } from "#src/trackable_value.js";
import {
  makeCachedDerivedWatchableValue,
  WatchableValue,
} from "#src/trackable_value.js";
import type { Borrowed } from "#src/util/disposable.js";
import { makeWatchableShaderError } from "#src/webgl/dynamic_shader.js";
import { ShaderControlState } from "#src/webgl/shader_ui_controls.js";

const CHANNEL_DIMENSIONS_JSON_KEY = "channelDimensions";

export class ImageUserLayer extends UserLayer {
  fragmentMain = getTrackableFragmentMain();
  shaderError = makeWatchableShaderError();
  dataType = new WatchableValue<DataType | undefined>(undefined);
  sliceViewRenderScaleTarget = new WatchableValue(1);
  channelCoordinateSpace = new TrackableCoordinateSpace();
  channelCoordinateSpaceCombiner = new CoordinateSpaceCombiner(
    this.channelCoordinateSpace,
    isChannelDimension,
  );
  shaderControlState = this.registerDisposer(
    new ShaderControlState(
      this.fragmentMain,
      this.registerDisposer(
        makeCachedDerivedWatchableValue(
          (
            dataType: DataType | undefined,
            channelCoordinateSpace: CoordinateSpace,
          ) => {
            if (dataType === undefined) return null;
            return {
              imageData: { dataType, channelRank: channelCoordinateSpace.rank },
            };
          },
          [this.dataType, this.channelCoordinateSpace],
          (a, b) => JSON.stringify(a) === JSON.stringify(b),
        ),
      ),
      this.channelCoordinateSpaceCombiner,
    ),
  );

  markLoading() {
    const baseDisposer = super.markLoading?.();
    const channelDisposer = this.channelCoordinateSpaceCombiner.retain();
    return () => {
      baseDisposer?.();
      channelDisposer();
    };
  }

  addCoordinateSpace(
    coordinateSpace: WatchableValueInterface<CoordinateSpace>,
  ) {
    const baseBinding = super.addCoordinateSpace(coordinateSpace);
    const channelBinding =
      this.channelCoordinateSpaceCombiner.bind(coordinateSpace);
    return () => {
      baseBinding();
      channelBinding();
    };
  }

  constructor(managedLayer: Borrowed<ManagedUserLayer>) {
    super(managedLayer);
    this.localCoordinateSpaceCombiner.includeDimensionPredicate =
      isLocalDimension;
    this.fragmentMain.changed.add(this.specificationChanged.dispatch);
    this.sliceViewRenderScaleTarget.changed.add(
      this.specificationChanged.dispatch,
    );
  }

  activateDataSubsources(subsources: Iterable<LoadedDataSubsource>) {
    let dataType: DataType | undefined;
    for (const loadedSubsource of subsources) {
      const { subsourceEntry } = loadedSubsource;
      const { subsource } = subsourceEntry;
      const { volume } = subsource;
      if (!(volume instanceof MultiscaleVolumeChunkSource)) {
        loadedSubsource.deactivate("Not compatible with image layer");
        continue;
      }
      if (dataType && volume.dataType !== dataType) {
        loadedSubsource.deactivate(
          `Data type must be ${DataType[volume.dataType].toLowerCase()}`,
        );
        continue;
      }
      dataType = volume.dataType;
      loadedSubsource.activate((context) => {
        loadedSubsource.addRenderLayer(
          new ImageRenderLayer(volume, {
            shaderControlState: this.shaderControlState,
            shaderError: this.shaderError,
            transform: loadedSubsource.getRenderLayerTransform(
              this.channelCoordinateSpace,
            ),
            renderScaleTarget: this.sliceViewRenderScaleTarget,
            localPosition: this.localPosition,
            channelCoordinateSpace: this.channelCoordinateSpace,
          }),
        );
        this.shaderError.changed.dispatch();
      });
    }
    this.dataType.value = dataType;
  }

  restoreState(specification: any) {
    super.restoreState(specification);
    if (specification.shader !== undefined) {
      this.fragmentMain.restoreState(specification.shader);
    }
    if (specification.sliceViewRenderScaleTarget !== undefined) {
      this.sliceViewRenderScaleTarget.value = specification.sliceViewRenderScaleTarget;
    }
    this.sliceViewRenderScaleTarget.changed.dispatch();
    this.channelCoordinateSpace.restoreState(
      specification[CHANNEL_DIMENSIONS_JSON_KEY],
    );
  }

  static type = "image";
  static typeAbbreviation = "img";
}

