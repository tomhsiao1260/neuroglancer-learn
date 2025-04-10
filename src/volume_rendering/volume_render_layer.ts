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

import { ChunkState } from "#src/chunk_manager/base.js";
import { ChunkRenderLayerFrontend } from "#src/chunk_manager/frontend.js";
import type { CoordinateSpace } from "#src/coordinate_transform.js";
import type { VisibleLayerInfo } from "#src/layer/index.js";
import { UserLayer } from "#src/layer/index.js";
import type { RenderLayerTransformOrError } from "#src/render_coordinate_transform.js";
import type { RenderScaleHistogram } from "#src/render_scale_statistics.js";
import {
  numRenderScaleHistogramBins,
  renderScaleHistogramBinSize,
} from "#src/render_scale_statistics.js";
import { SharedWatchableValue } from "#src/shared_watchable_value.js";
import { getNormalizedChunkLayout } from "#src/sliceview/base.js";
import type { FrontendTransformedSource } from "#src/sliceview/frontend.js";
import {
  getVolumetricTransformedSources,
  serializeAllTransformedSources,
} from "#src/sliceview/frontend.js";
import type { SliceViewRenderLayer } from "#src/sliceview/renderlayer.js";
import type {
  ChunkFormat,
  MultiscaleVolumeChunkSource,
  VolumeChunk,
  VolumeChunkSource,
} from "#src/sliceview/volume/frontend.js";
import { defineChunkDataShaderAccess } from "#src/sliceview/volume/frontend.js";
import type {
  NestedStateManager,
  WatchableValueInterface,
} from "#src/trackable_value.js";
import {
  makeCachedDerivedWatchableValue,
  registerNested,
} from "#src/trackable_value.js";
import { getFrustrumPlanes, mat4, vec3 } from "#src/util/geom.js";
import { clampToInterval } from "#src/util/lerp.js";
import { getObjectId } from "#src/util/object_id.js";
import type { HistogramInformation } from "#src/volume_rendering/base.js";
import {
  forEachVisibleVolumeRenderingChunk,
  getVolumeRenderingNearFarBounds,
  VOLUME_RENDERING_RENDER_LAYER_RPC_ID,
  VOLUME_RENDERING_RENDER_LAYER_UPDATE_SOURCES_RPC_ID,
} from "#src/volume_rendering/base.js";
import type { TrackableVolumeRenderingModeValue } from "#src/volume_rendering/trackable_volume_rendering_mode.js";
import {
  VolumeRenderingModes,
  isProjectionMode,
} from "#src/volume_rendering/trackable_volume_rendering_mode.js";
import {
  drawBoxes,
  glsl_getBoxFaceVertexPosition,
} from "#src/webgl/bounding_box.js";
import { glsl_COLORMAPS } from "#src/webgl/colormaps.js";
import type {
  ParameterizedContextDependentShaderGetter,
  ParameterizedShaderGetterResult,
  WatchableShaderError,
} from "#src/webgl/dynamic_shader.js";
import {
  parameterizedContextDependentShaderGetter,
  shaderCodeWithLineDirective,
} from "#src/webgl/dynamic_shader.js";
import type { ShaderModule, ShaderProgram } from "#src/webgl/shader.js";
import type {
  ShaderControlsBuilderState,
  ShaderControlState,
} from "#src/webgl/shader_ui_controls.js";
import {
  addControlsToBuilder,
  setControlsInShader,
} from "#src/webgl/shader_ui_controls.js";
import { defineVertexId, VertexIdHelper } from "#src/webgl/vertex_id.js";

export const VOLUME_RENDERING_DEPTH_SAMPLES_DEFAULT_VALUE = 64;
const VOLUME_RENDERING_DEPTH_SAMPLES_LOG_SCALE_ORIGIN = 1;
const VOLUME_RENDERING_RESOLUTION_INDICATOR_BAR_HEIGHT = 10;

const depthSamplerTextureUnit = Symbol("depthSamplerTextureUnit");

export const glsl_emitRGBAVolumeRendering = `
void emitRGBA(vec4 rgba) {
  float correctedAlpha = clamp(rgba.a * uBrightnessFactor * uGain, 0.0, 1.0);
  float weightedAlpha = correctedAlpha * computeOITWeight(correctedAlpha, depthAtRayPosition);
  outputColor += vec4(rgba.rgb * weightedAlpha, weightedAlpha);
  revealage *= 1.0 - correctedAlpha;
}
`;

type TransformedVolumeSource = FrontendTransformedSource<
  SliceViewRenderLayer,
  VolumeChunkSource
>;

interface VolumeRenderingAttachmentState {
  sources: NestedStateManager<TransformedVolumeSource[][]>;
}

export interface VolumeRenderingRenderLayerOptions {
  gain: WatchableValueInterface<number>;
  multiscaleSource: MultiscaleVolumeChunkSource;
  transform: WatchableValueInterface<RenderLayerTransformOrError>;
  shaderError: WatchableShaderError;
  shaderControlState: ShaderControlState;
  channelCoordinateSpace: WatchableValueInterface<CoordinateSpace>;
  localPosition: WatchableValueInterface<Float32Array>;
  depthSamplesTarget: WatchableValueInterface<number>;
  mode: TrackableVolumeRenderingModeValue;
}

interface VolumeRenderingShaderParameters {
  numChannelDimensions: number;
  mode: VolumeRenderingModes;
}

const tempMat4 = mat4.create();
const tempVisibleVolumetricClippingPlanes = new Float32Array(24);

export function getVolumeRenderingDepthSamplesBoundsLogScale(): [
  number,
  number,
] {
  const logScaleMax = Math.round(
    VOLUME_RENDERING_DEPTH_SAMPLES_LOG_SCALE_ORIGIN +
      numRenderScaleHistogramBins * renderScaleHistogramBinSize,
  );
  return [VOLUME_RENDERING_DEPTH_SAMPLES_LOG_SCALE_ORIGIN, logScaleMax];
}

function clampAndRoundResolutionTargetValue(value: number) {
  const logScaleDepthSamplesBounds =
    getVolumeRenderingDepthSamplesBoundsLogScale();
  const depthSamplesBounds: [number, number] = [
    2 ** logScaleDepthSamplesBounds[0],
    2 ** logScaleDepthSamplesBounds[1] - 1,
  ];
  return clampToInterval(depthSamplesBounds, Math.round(value)) as number;
}

export class VolumeRenderingRenderLayer extends UserLayer {
  gain: WatchableValueInterface<number>;
  multiscaleSource: MultiscaleVolumeChunkSource;
  transform: WatchableValueInterface<RenderLayerTransformOrError>;
  channelCoordinateSpace: WatchableValueInterface<CoordinateSpace>;
  localPosition: WatchableValueInterface<Float32Array>;
  shaderControlState: ShaderControlState;
  depthSamplesTarget: WatchableValueInterface<number>;
  mode: TrackableVolumeRenderingModeValue;
  backend: ChunkRenderLayerFrontend;
  private vertexIdHelper: VertexIdHelper;

  private shaderGetter: ParameterizedContextDependentShaderGetter<
    { emitter: ShaderModule; chunkFormat: ChunkFormat; wireFrame: boolean },
    ShaderControlsBuilderState,
    VolumeRenderingShaderParameters
  >;

  get gl() {
    return this.multiscaleSource.chunkManager.gl;
  }

  get isTransparent() {
    return true;
  }

  get isVolumeRendering() {
    return true;
  }

  constructor(options: VolumeRenderingRenderLayerOptions) {
    super();
    this.gain = options.gain;
    this.multiscaleSource = options.multiscaleSource;
    this.transform = options.transform;
    this.channelCoordinateSpace = options.channelCoordinateSpace;
    this.shaderControlState = options.shaderControlState;
    this.localPosition = options.localPosition;
    this.depthSamplesTarget = options.depthSamplesTarget;
    this.mode = options.mode;
    const extraParameters = this.registerDisposer(
      makeCachedDerivedWatchableValue(
        (space: CoordinateSpace, mode: VolumeRenderingModes) => ({
          numChannelDimensions: space.rank,
          mode,
        }),
        [this.channelCoordinateSpace, this.mode],
      ),
    );
    this.shaderGetter = parameterizedContextDependentShaderGetter(
      this,
      this.gl,
      {
        memoizeKey: "VolumeRenderingRenderLayer",
        parameters: options.shaderControlState.builderState,
        getContextKey: ({ emitter, chunkFormat, wireFrame }) =>
          `${getObjectId(emitter)}:${chunkFormat.shaderKey}:${wireFrame}`,
        shaderError: options.shaderError,
        extraParameters: extraParameters,
        defineShader: (
          builder,
          { emitter, chunkFormat, wireFrame },
          shaderBuilderState,
          shaderParametersState,
        ) => {
          if (shaderBuilderState.parseResult.errors.length !== 0) {
            throw new Error("Invalid UI control specification");
          }
          defineVertexId(builder);
          builder.addFragmentCode(`
#define VOLUME_RENDERING true
`);
          let glsl_rgbaEmit = glsl_emitRGBAVolumeRendering;
          let glsl_finalEmit = `
  emitAccumAndRevealage(outputColor, 1.0 - revealage, 0u);
`;
          let glsl_emitIntensity = `
void emitIntensity(float value) {
}
`;
          let glsl_handleMaxProjectionUpdate = ``;
          if (isProjectionMode(shaderParametersState.mode)) {
            const glsl_intensityConversion =
              shaderParametersState.mode === VolumeRenderingModes.MIN
                ? `1.0 - value`
                : `value`;
            builder.addFragmentCode(`
float savedDepth = 0.0;
float savedIntensity = 0.0;
`);
            glsl_rgbaEmit = `
void emitRGBA(vec4 rgba) {
  float intensity = (rgba.r + rgba.g + rgba.b) / 3.0;
  float depth = depthAtRayPosition;
  if (savedDepth == 0.0 || ${glsl_intensityConversion} > savedIntensity) {
    savedDepth = depth;
    savedIntensity = intensity;
  }
}
`;
            glsl_finalEmit = `
  emitAccumAndRevealage(vec4(vec3(savedIntensity), 1.0), 1.0 - revealage, 0u);
`;
            glsl_emitIntensity = `
void emitIntensity(float value) {
  float depth = depthAtRayPosition;
  if (savedDepth == 0.0 || ${glsl_intensityConversion} > savedIntensity) {
    savedDepth = depth;
    savedIntensity = value;
  }
}
`;
            glsl_handleMaxProjectionUpdate = `
  if (savedDepth > 0.0) {
    depthAtRayPosition = savedDepth;
  }
`;
          }
          builder.addFragmentCode(`
${glsl_rgbaEmit}
${glsl_emitIntensity}
${glsl_finalEmit}
${glsl_handleMaxProjectionUpdate}
`);
          builder.addFragmentCode(`
void main() {
  vec4 outputColor = vec4(0.0);
  float revealage = 1.0;
  float depthAtRayPosition = 0.0;
  ${shaderCodeWithLineDirective(emitter.code)}
}
`);
          return builder.build();
        },
      },
    );
    this.vertexIdHelper = this.registerDisposer(VertexIdHelper.get(this.gl));

    this.registerDisposer(
      this.depthSamplesTarget.changed.add(this.redrawNeeded.dispatch),
    );
    this.registerDisposer(this.gain.changed.add(this.redrawNeeded.dispatch));
    this.registerDisposer(
      this.shaderControlState.changed.add(this.redrawNeeded.dispatch),
    );
    this.registerDisposer(
      this.localPosition.changed.add(this.redrawNeeded.dispatch),
    );
    this.registerDisposer(
      this.transform.changed.add(this.redrawNeeded.dispatch),
    );
    this.registerDisposer(this.mode.changed.add(this.redrawNeeded.dispatch));
    this.registerDisposer(
      this.shaderControlState.fragmentMain.changed.add(
        this.redrawNeeded.dispatch,
      ),
    );
    const { chunkManager } = this.multiscaleSource;
    const sharedObject = this.registerDisposer(
      new ChunkRenderLayerFrontend(this.layerChunkProgressInfo),
    );
    const rpc = chunkManager.rpc!;
    sharedObject.RPC_TYPE_ID = VOLUME_RENDERING_RENDER_LAYER_RPC_ID;
    sharedObject.initializeCounterpart(rpc, {
      chunkManager: chunkManager.rpcId,
      localPosition: this.registerDisposer(
        SharedWatchableValue.makeFromExisting(rpc, this.localPosition),
      ).rpcId,
      renderScaleTarget: this.registerDisposer(
        SharedWatchableValue.makeFromExisting(rpc, this.depthSamplesTarget),
      ).rpcId,
    });
    this.backend = sharedObject;
  }

  get dataType() {
    return this.multiscaleSource.dataType;
  }

  attach(attachment: VisibleLayerInfo<any, VolumeRenderingAttachmentState>) {
    super.attach(attachment);
    attachment.state = {
      sources: attachment.registerDisposer(
        registerNested(
          (context, transform, displayDimensionRenderInfo) => {
            const transformedSources = getVolumetricTransformedSources(
              displayDimensionRenderInfo,
              transform,
              (options) => this.multiscaleSource.getSources(options),
              attachment.messages,
              this,
            ) as TransformedVolumeSource[][];
            for (const scales of transformedSources) {
              for (const tsource of scales) {
                context.registerDisposer(tsource.source);
              }
            }
            attachment.view.flushBackendProjectionParameters();
            this.backend.rpc!.invoke(
              VOLUME_RENDERING_RENDER_LAYER_UPDATE_SOURCES_RPC_ID,
              {
                layer: this.backend.rpcId,
                view: attachment.view.rpcId,
                sources: serializeAllTransformedSources(transformedSources),
              },
            );
            this.redrawNeeded.dispatch();
            return transformedSources;
          },
          this.transform,
          attachment.view.displayDimensionRenderInfo,
        ),
      ),
    };
  }

  get chunkManager() {
    return this.multiscaleSource.chunkManager;
  }

  draw(
    renderContext: any,
    attachment: VisibleLayerInfo<any, VolumeRenderingAttachmentState>,
  ) {
    if (!renderContext.emitColor) return;
    const allSources = attachment.state!.sources.value;
    if (allSources.length === 0) return;
    let curPhysicalSpacing = 0;
    let curOptimalSamples = 0;
    let curHistogramInformation: HistogramInformation = {
      spatialScales: new Map(),
      activeIndex: 0,
    };
    let shader: ShaderProgram | null = null;
    let prevChunkFormat: ChunkFormat | undefined | null;
    let shaderResult: ParameterizedShaderGetterResult<
      ShaderControlsBuilderState,
      VolumeRenderingShaderParameters
    >;
    // Size of chunk (in voxels) in the "display" subspace of the chunk coordinate space.
    const chunkDataDisplaySize = vec3.create();

    const { gl } = this;
    this.vertexIdHelper.enable();

    const { chunkResolutionHistogram: renderScaleHistogram } = this;
    renderScaleHistogram.begin(
      this.chunkManager.chunkQueueManager.frameNumberCounter.frameNumber,
    );

    const endShader = () => {
      if (shader === null) return;
      if (prevChunkFormat !== null) {
        prevChunkFormat!.endDrawing(gl, shader);
      }
      const depthTextureUnit = shader.textureUnit(depthSamplerTextureUnit);
      gl.activeTexture(WebGL2RenderingContext.TEXTURE0 + depthTextureUnit);
      gl.bindTexture(WebGL2RenderingContext.TEXTURE_2D, null);
      if (presentCount !== 0 || notPresentCount !== 0) {
        let index = curHistogramInformation.spatialScales.size - 1;
        const alreadyStoredSamples = new Set<number>([
          clampAndRoundResolutionTargetValue(curOptimalSamples),
        ]);
        curHistogramInformation.spatialScales.forEach(
          (optimalSamples, physicalSpacing) => {
            const roundedSamples =
              clampAndRoundResolutionTargetValue(optimalSamples);
            if (
              index !== curHistogramInformation.activeIndex &&
              !alreadyStoredSamples.has(roundedSamples)
            ) {
              renderScaleHistogram.add(
                physicalSpacing,
                optimalSamples,
                0,
                VOLUME_RENDERING_RESOLUTION_INDICATOR_BAR_HEIGHT,
                true,
              );
              alreadyStoredSamples.add(roundedSamples);
            }
            index--;
          },
        );
        renderScaleHistogram.add(
          curPhysicalSpacing,
          curOptimalSamples,
          presentCount,
          notPresentCount,
        );
      }
    };
    let newSource = true;

    const { projectionParameters } = renderContext;

    let chunks: Map<string, VolumeChunk>;
    let presentCount = 0;
    let notPresentCount = 0;
    let chunkDataSize: Uint32Array | undefined;
    let chunkNumber = 1;

    const chunkRank = this.multiscaleSource.rank;
    const chunkPosition = vec3.create();

    gl.enable(WebGL2RenderingContext.CULL_FACE);
    gl.cullFace(WebGL2RenderingContext.FRONT);

    forEachVisibleVolumeRenderingChunk(
      renderContext.projectionParameters,
      this.localPosition.value,
      this.depthSamplesTarget.value,
      allSources[0],
      (
        transformedSource,
        ignored1,
        physicalSpacing,
        optimalSamples,
        ignored2,
        histogramInformation,
      ) => {
        ignored1;
        ignored2;
        curPhysicalSpacing = physicalSpacing;
        curOptimalSamples = optimalSamples;
        curHistogramInformation = histogramInformation;
        const chunkLayout = getNormalizedChunkLayout(
          projectionParameters,
          transformedSource.chunkLayout,
        );
        const source = transformedSource.source as VolumeChunkSource;
        const { fixedPositionWithinChunk, chunkDisplayDimensionIndices } =
          transformedSource;
        for (const chunkDim of chunkDisplayDimensionIndices) {
          fixedPositionWithinChunk[chunkDim] = 0;
        }
        const chunkFormat = source.chunkFormat;
        if (chunkFormat !== prevChunkFormat) {
          prevChunkFormat = chunkFormat;
          endShader();
          shaderResult = this.shaderGetter({
            emitter: renderContext.emitter,
            chunkFormat: chunkFormat!,
            wireFrame: renderContext.wireFrame,
          });
          shader = shaderResult.shader;
          if (shader !== null) {
            shader.bind();
            if (chunkFormat !== null) {
              setControlsInShader(
                gl,
                shader,
                this.shaderControlState,
                shaderResult.parameters.parseResult.controls,
              );
              if (
                renderContext.depthBufferTexture !== undefined &&
                renderContext.depthBufferTexture !== null
              ) {
                const depthTextureUnit = shader.textureUnit(
                  depthSamplerTextureUnit,
                );
                gl.activeTexture(
                  WebGL2RenderingContext.TEXTURE0 + depthTextureUnit,
                );
                gl.bindTexture(
                  WebGL2RenderingContext.TEXTURE_2D,
                  renderContext.depthBufferTexture,
                );
              } else {
                throw new Error(
                  "Depth buffer texture ID for volume rendering is undefined or null",
                );
              }
              chunkFormat.beginDrawing(gl, shader);
              chunkFormat.beginSource(gl, shader);
            }
          }
        }
        chunkDataSize = undefined;
        if (shader === null) return;
        chunks = source.chunks;
        chunkDataDisplaySize.fill(1);

        // Compute projection matrix that transforms chunk layout coordinates to device
        // coordinates.
        const modelViewProjection = mat4.multiply(
          tempMat4,
          projectionParameters.viewProjectionMat,
          chunkLayout.transform,
        );
        gl.uniformMatrix4fv(
          shader.uniform("uModelViewProjectionMatrix"),
          false,
          modelViewProjection,
        );
        const clippingPlanes = tempVisibleVolumetricClippingPlanes;
        getFrustrumPlanes(clippingPlanes, modelViewProjection);
        mat4.invert(modelViewProjection, modelViewProjection);
        gl.uniformMatrix4fv(
          shader.uniform("uInvModelViewProjectionMatrix"),
          false,
          modelViewProjection,
        );
        const { near, far, adjustedNear, adjustedFar } =
          getVolumeRenderingNearFarBounds(
            clippingPlanes,
            transformedSource.lowerClipDisplayBound,
            transformedSource.upperClipDisplayBound,
          );
        const optimalSampleRate = optimalSamples;
        const actualSampleRate = this.depthSamplesTarget.value;
        const brightnessFactor = optimalSampleRate / actualSampleRate;
        gl.uniform1f(shader.uniform("uBrightnessFactor"), brightnessFactor);
        const nearLimitFraction = (adjustedNear - near) / (far - near);
        const farLimitFraction = (adjustedFar - near) / (far - near);
        gl.uniform1f(shader.uniform("uNearLimitFraction"), nearLimitFraction);
        gl.uniform1f(shader.uniform("uFarLimitFraction"), farLimitFraction);
        gl.uniform1f(shader.uniform("uGain"), Math.exp(this.gain.value));
        gl.uniform1i(
          shader.uniform("uMaxSteps"),
          this.depthSamplesTarget.value,
        );
        gl.uniform3fv(
          shader.uniform("uLowerClipBound"),
          transformedSource.lowerClipDisplayBound,
        );
        gl.uniform3fv(
          shader.uniform("uUpperClipBound"),
          transformedSource.upperClipDisplayBound,
        );
      },
      (transformedSource) => {
        if (shader === null) return;
        const key = transformedSource.curPositionInChunks.join();
        const chunk = chunks.get(key);
        if (chunk !== undefined && chunk.state === ChunkState.GPU_MEMORY) {
          const originalChunkSize = transformedSource.chunkLayout.size;
          const newChunkDataSize = chunk.chunkDataSize;
          const {
            chunkDisplayDimensionIndices,
            fixedPositionWithinChunk,
            chunkTransform: { channelToChunkDimensionIndices },
          } = transformedSource;
          if (renderContext.wireFrame) {
            const normChunkNumber = chunkNumber / chunks.size;
            gl.uniform1f(shader.uniform("uChunkNumber"), normChunkNumber);
            ++chunkNumber;
          }
          if (newChunkDataSize !== chunkDataSize) {
            chunkDataSize = newChunkDataSize;

            for (let i = 0; i < 3; ++i) {
              const chunkDim = chunkDisplayDimensionIndices[i];
              chunkDataDisplaySize[i] =
                chunkDim === -1 || chunkDim >= chunkRank
                  ? 1
                  : chunkDataSize[chunkDim];
            }
            gl.uniform3fv(
              shader.uniform("uChunkDataSize"),
              chunkDataDisplaySize,
            );
          }
          const { chunkGridPosition } = chunk;
          for (let i = 0; i < 3; ++i) {
            const chunkDim = chunkDisplayDimensionIndices[i];
            chunkPosition[i] =
              chunkDim === -1 || chunkDim >= chunkRank
                ? 0
                : originalChunkSize[i] * chunkGridPosition[chunkDim];
          }
          if (prevChunkFormat != null) {
            prevChunkFormat.bindChunk(
              gl,
              shader!,
              chunk,
              fixedPositionWithinChunk,
              chunkDisplayDimensionIndices,
              channelToChunkDimensionIndices,
              newSource,
            );
          }
          newSource = false;
          gl.uniform3fv(shader.uniform("uTranslation"), chunkPosition);
          drawBoxes(gl, 1, 1);
          ++presentCount;
        } else {
          ++notPresentCount;
        }
      },
    );
    gl.disable(WebGL2RenderingContext.CULL_FACE);
    endShader();
    this.vertexIdHelper.disable();
  }

  isReady(
    renderContext: any,
    attachment: VisibleLayerInfo<any, VolumeRenderingAttachmentState>,
  ) {
    const allSources = attachment.state!.sources.value;
    if (allSources.length === 0) return true;
    let missing = false;
    forEachVisibleVolumeRenderingChunk(
      renderContext.projectionParameters,
      this.localPosition.value,
      this.depthSamplesTarget.value,
      allSources[0],
      () => {},
      (tsource) => {
        const chunk = tsource.source.chunks.get(
          tsource.curPositionInChunks.join(),
        );
        if (chunk === undefined || chunk.state !== ChunkState.GPU_MEMORY) {
          missing = true;
        }
      },
    );
    return missing;
  }
}
