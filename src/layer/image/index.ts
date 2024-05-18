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
  UserLayerSelectionState,
} from "#src/layer/index.js";
import {
  registerLayerType,
  registerLayerTypeDetector,
  registerVolumeLayerType,
  UserLayer,
} from "#src/layer/index.js";
import type { LoadedDataSubsource } from "#src/layer/layer_data_source.js";
import { getChannelSpace } from "#src/render_coordinate_transform.js";
import {
  RenderScaleHistogram,
  trackableRenderScaleTarget,
} from "#src/render_scale_statistics.js";
import { DataType, VolumeType } from "#src/sliceview/volume/base.js";
import { MultiscaleVolumeChunkSource } from "#src/sliceview/volume/frontend.js";
import {
  getTrackableFragmentMain,
  ImageRenderLayer,
} from "#src/sliceview/volume/image_renderlayer.js";
import { trackableAlphaValue } from "#src/trackable_alpha.js";
import { trackableBlendModeValue } from "#src/trackable_blend.js";
import type { WatchableValueInterface } from "#src/trackable_value.js";
import {
  makeCachedDerivedWatchableValue,
  makeCachedLazyDerivedWatchableValue,
  registerNested,
  WatchableValue,
} from "#src/trackable_value.js";
import type { Borrowed } from "#src/util/disposable.js";
import { makeValueOrError } from "#src/util/error.js";
import { verifyOptionalObjectProperty } from "#src/util/json.js";
import {
  trackableShaderModeValue,
  VolumeRenderingModes,
} from "#src/volume_rendering/trackable_volume_rendering_mode.js";
import {
  getVolumeRenderingDepthSamplesBoundsLogScale,
  VOLUME_RENDERING_DEPTH_SAMPLES_DEFAULT_VALUE,
  VolumeRenderingRenderLayer,
} from "#src/volume_rendering/volume_render_layer.js";
import { makeWatchableShaderError } from "#src/webgl/dynamic_shader.js";
import { ShaderControlState } from "#src/webgl/shader_ui_controls.js";

const OPACITY_JSON_KEY = "opacity";
const BLEND_JSON_KEY = "blend";
const SHADER_JSON_KEY = "shader";
const SHADER_CONTROLS_JSON_KEY = "shaderControls";
const CROSS_SECTION_RENDER_SCALE_JSON_KEY = "crossSectionRenderScale";
const CHANNEL_DIMENSIONS_JSON_KEY = "channelDimensions";
const VOLUME_RENDERING_JSON_KEY = "volumeRendering";
const VOLUME_RENDERING_GAIN_JSON_KEY = "volumeRenderingGain";
const VOLUME_RENDERING_DEPTH_SAMPLES_JSON_KEY = "volumeRenderingDepthSamples";

export interface ImageLayerSelectionState extends UserLayerSelectionState {
  value: any;
}

const [
  volumeRenderingDepthSamplesOriginLogScale,
  volumeRenderingDepthSamplesMaxLogScale,
] = getVolumeRenderingDepthSamplesBoundsLogScale();
export class ImageUserLayer extends UserLayer {
  opacity = trackableAlphaValue(0.5);
  blendMode = trackableBlendModeValue();
  fragmentMain = getTrackableFragmentMain();
  shaderError = makeWatchableShaderError();
  dataType = new WatchableValue<DataType | undefined>(undefined);
  sliceViewRenderScaleHistogram = new RenderScaleHistogram();
  sliceViewRenderScaleTarget = trackableRenderScaleTarget(1);
  volumeRenderingChunkResolutionHistogram = new RenderScaleHistogram(
    volumeRenderingDepthSamplesOriginLogScale,
  );
  volumeRenderingDepthSamplesTarget = trackableRenderScaleTarget(
    VOLUME_RENDERING_DEPTH_SAMPLES_DEFAULT_VALUE,
    2 ** volumeRenderingDepthSamplesOriginLogScale,
    2 ** volumeRenderingDepthSamplesMaxLogScale - 1,
  );

  channelCoordinateSpace = new TrackableCoordinateSpace();
  channelCoordinateSpaceCombiner = new CoordinateSpaceCombiner(
    this.channelCoordinateSpace,
    isChannelDimension,
  );
  channelSpace = this.registerDisposer(
    makeCachedLazyDerivedWatchableValue(
      (channelCoordinateSpace) =>
        makeValueOrError(() => getChannelSpace(channelCoordinateSpace)),
      this.channelCoordinateSpace,
    ),
  );
  volumeRenderingMode = trackableShaderModeValue();

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
    const baseDisposer = super.markLoading();
    const channelDisposer = this.channelCoordinateSpaceCombiner.retain();
    return () => {
      baseDisposer();
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

  selectionState: ImageLayerSelectionState;

  constructor(managedLayer: Borrowed<ManagedUserLayer>) {
    super(managedLayer);
    this.localCoordinateSpaceCombiner.includeDimensionPredicate =
      isLocalDimension;
    this.blendMode.changed.add(this.specificationChanged.dispatch);
    this.opacity.changed.add(this.specificationChanged.dispatch);
    this.fragmentMain.changed.add(this.specificationChanged.dispatch);
    this.shaderControlState.changed.add(this.specificationChanged.dispatch);
    this.sliceViewRenderScaleTarget.changed.add(
      this.specificationChanged.dispatch,
    );
    this.volumeRenderingMode.changed.add(this.specificationChanged.dispatch);
    this.volumeRenderingDepthSamplesTarget.changed.add(
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
            opacity: this.opacity,
            blendMode: this.blendMode,
            shaderControlState: this.shaderControlState,
            shaderError: this.shaderError,
            transform: loadedSubsource.getRenderLayerTransform(
              this.channelCoordinateSpace,
            ),
            renderScaleTarget: this.sliceViewRenderScaleTarget,
            renderScaleHistogram: this.sliceViewRenderScaleHistogram,
            localPosition: this.localPosition,
            channelCoordinateSpace: this.channelCoordinateSpace,
          }),
        );
        const volumeRenderLayer = context.registerDisposer(
          new VolumeRenderingRenderLayer({
            gain: this.volumeRenderingGain,
            multiscaleSource: volume,
            shaderControlState: this.shaderControlState,
            shaderError: this.shaderError,
            transform: loadedSubsource.getRenderLayerTransform(
              this.channelCoordinateSpace,
            ),
            depthSamplesTarget: this.volumeRenderingDepthSamplesTarget,
            chunkResolutionHistogram:
              this.volumeRenderingChunkResolutionHistogram,
            localPosition: this.localPosition,
            channelCoordinateSpace: this.channelCoordinateSpace,
            mode: this.volumeRenderingMode,
          }),
        );
        context.registerDisposer(
          loadedSubsource.messages.addChild(volumeRenderLayer.messages),
        );
        context.registerDisposer(
          registerNested((context, volumeRenderingMode) => {
            if (volumeRenderingMode === VolumeRenderingModes.OFF) return;
            context.registerDisposer(
              this.addRenderLayer(volumeRenderLayer.addRef()),
            );
          }, this.volumeRenderingMode),
        );
        this.shaderError.changed.dispatch();
      });
    }
    this.dataType.value = dataType;
  }

  restoreState(specification: any) {
    super.restoreState(specification);
    this.opacity.restoreState(specification[OPACITY_JSON_KEY]);
    verifyOptionalObjectProperty(specification, BLEND_JSON_KEY, (blendValue) =>
      this.blendMode.restoreState(blendValue),
    );
    this.fragmentMain.restoreState(specification[SHADER_JSON_KEY]);
    this.shaderControlState.restoreState(
      specification[SHADER_CONTROLS_JSON_KEY],
    );
    this.sliceViewRenderScaleTarget.restoreState(
      specification[CROSS_SECTION_RENDER_SCALE_JSON_KEY],
    );
    this.channelCoordinateSpace.restoreState(
      specification[CHANNEL_DIMENSIONS_JSON_KEY],
    );
    verifyOptionalObjectProperty(
      specification,
      VOLUME_RENDERING_JSON_KEY,
      (volumeRenderingMode) => {
        if (typeof volumeRenderingMode === "boolean") {
          this.volumeRenderingMode.value = volumeRenderingMode
            ? VolumeRenderingModes.ON
            : VolumeRenderingModes.OFF;
        } else {
          this.volumeRenderingMode.restoreState(volumeRenderingMode);
        }
      },
    );
    verifyOptionalObjectProperty(
      specification,
      VOLUME_RENDERING_GAIN_JSON_KEY,
      (volumeRenderingGain) =>
        this.volumeRenderingGain.restoreState(volumeRenderingGain),
    );
    verifyOptionalObjectProperty(
      specification,
      VOLUME_RENDERING_DEPTH_SAMPLES_JSON_KEY,
      (volumeRenderingDepthSamplesTarget) =>
        this.volumeRenderingDepthSamplesTarget.restoreState(
          volumeRenderingDepthSamplesTarget,
        ),
    );
  }
  toJSON() {
    const x = super.toJSON();
    x[OPACITY_JSON_KEY] = this.opacity.toJSON();
    x[BLEND_JSON_KEY] = this.blendMode.toJSON();
    x[SHADER_JSON_KEY] = this.fragmentMain.toJSON();
    x[SHADER_CONTROLS_JSON_KEY] = this.shaderControlState.toJSON();
    x[CROSS_SECTION_RENDER_SCALE_JSON_KEY] =
      this.sliceViewRenderScaleTarget.toJSON();
    x[CHANNEL_DIMENSIONS_JSON_KEY] = this.channelCoordinateSpace.toJSON();
    x[VOLUME_RENDERING_JSON_KEY] = this.volumeRenderingMode.toJSON();
    x[VOLUME_RENDERING_GAIN_JSON_KEY] = this.volumeRenderingGain.toJSON();
    x[VOLUME_RENDERING_DEPTH_SAMPLES_JSON_KEY] =
      this.volumeRenderingDepthSamplesTarget.toJSON();
    return x;
  }

  static type = "image";
  static typeAbbreviation = "img";
}

registerLayerType(ImageUserLayer);
registerVolumeLayerType(VolumeType.IMAGE, ImageUserLayer);
// Use ImageUserLayer as a fallback layer type if there is a `volume` subsource.
registerLayerTypeDetector((subsource) => {
  const { volume } = subsource;
  if (volume === undefined) return undefined;
  if (volume.volumeType !== VolumeType.UNKNOWN) return undefined;
  return { layerConstructor: ImageUserLayer, priority: -100 };
});
