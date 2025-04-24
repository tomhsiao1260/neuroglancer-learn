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

import type { RenderedDataViewerState } from "#src/render/rendered_data_panel.js";
import { RenderedDataPanel } from "#src/render/rendered_data_panel.js";
import { SliceViewRenderHelper } from "#src/sliceview/frontend.js";
import { identityMat4, vec3, vec4 } from "#src/util/geom.js";
import { RenderViewport } from "#src/layer/display_context.js";
import { SliceView } from "#src/sliceview/frontend.js";
import {
  FramebufferConfiguration,
  OffscreenCopyHelper,
  TextureBuffer,
} from "#src/webgl/offscreen.js";
import type { ShaderBuilder } from "#src/webgl/shader.js";

export interface SliceViewerState extends RenderedDataViewerState {}

export enum OffscreenTextures {
  COLOR = 0,
  PICK = 1,
  NUM_TEXTURES = 2,
}

function sliceViewPanelEmitColor(builder: ShaderBuilder) {
  builder.addOutputBuffer("vec4", "out_fragColor", null);
  builder.addFragmentCode(`
void emit(vec4 color, highp uint pickId) {
  out_fragColor = color;
}
`);
}

const tempVec4 = vec4.create();

export class SliceViewPanel extends RenderedDataPanel {
  // Generation used to check whether the following bounds-related fields are up to date.
  boundsGeneration = -1;

  // Offset of visible portion of panel in canvas pixels from left side of canvas.
  canvasRelativeClippedLeft = 0;

  // Offset of visible portion of panel in canvas pixels from top of canvas.
  canvasRelativeClippedTop = 0;

  renderViewport = new RenderViewport();

  viewer: SliceViewerState;

  private sliceViewRenderHelper = this.registerDisposer(
    SliceViewRenderHelper.get(this.gl, sliceViewPanelEmitColor),
  );
  private colorFactor = vec4.fromValues(1, 1, 1, 1);

  private offscreenFramebuffer = this.registerDisposer(
    new FramebufferConfiguration(this.gl, {
      colorBuffers: [
        new TextureBuffer(
          this.gl,
          WebGL2RenderingContext.RGBA8,
          WebGL2RenderingContext.RGBA,
          WebGL2RenderingContext.UNSIGNED_BYTE,
        ),
        new TextureBuffer(
          this.gl,
          WebGL2RenderingContext.R32F,
          WebGL2RenderingContext.RED,
          WebGL2RenderingContext.FLOAT,
        ),
      ],
    }),
  );

  private offscreenCopyHelper = this.registerDisposer(
    OffscreenCopyHelper.get(this.gl),
  );

  sliceView: any;

  constructor(
    element: HTMLElement,
    public navigationState: any,
    viewer: SliceViewerState,
  ) {
    const { display: context, chunkManager, layerManager } = viewer;
  
    super(context, element, viewer);

    this.sliceView = new SliceView(
      chunkManager,
      layerManager,
      navigationState,
    );

    this.registerDisposer(this.sliceView.visibility.add(this.visibility));

    this.registerDisposer(
      this.sliceView.viewChanged.add(() => {
        if (this.visible) context.scheduleRedraw();
      }),
    );
  }

  translateByViewportPixels(deltaX: number, deltaY: number): void {
    this.navigationState.updateDisplayPosition((pos) => {
      vec3.set(pos, -deltaX, -deltaY, 0);
      vec3.transformMat4(
        pos,
        pos,
        this.sliceView.projectionParameters.value.invViewMatrix,
      );
    });
  }

  draw(): boolean {
    const { sliceView } = this;
    if (!sliceView.valid) {
      return false;
    }

    sliceView.updateRendering();
    const { width, height } = sliceView.projectionParameters.value;
    const { gl } = this;

    this.offscreenFramebuffer.bind(width, height);
    gl.disable(WebGL2RenderingContext.SCISSOR_TEST);
    this.gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(WebGL2RenderingContext.COLOR_BUFFER_BIT);

    const backgroundColor = tempVec4;
    backgroundColor[0] = 0.5;
    backgroundColor[1] = 0.5;
    backgroundColor[2] = 0.5;
    backgroundColor[3] = 1;

    this.offscreenFramebuffer.bindSingle(OffscreenTextures.COLOR);
    this.sliceViewRenderHelper.draw(
      sliceView.offscreenFramebuffer.colorBuffers[0].texture,
      identityMat4,
      this.colorFactor,
      backgroundColor,
      0,
      0,
      1,
      1,
    );

    gl.disable(WebGL2RenderingContext.BLEND);
    this.offscreenFramebuffer.unbind();

    // Draw the texture over the whole viewport.
    this.setGLClippedViewport();
    this.offscreenCopyHelper.draw(
      this.offscreenFramebuffer.colorBuffers[OffscreenTextures.COLOR].texture,
    );
    return true;
  }

  // Sets the viewport to the clipped viewport.  Any drawing must take
  // `visible{Left,Top,Width,Height}Fraction` into account.  setGLClippedViewport() {
  setGLClippedViewport() {
    const {
      gl,
      canvasRelativeClippedTop,
      canvasRelativeClippedLeft,
      renderViewport: { width, height },
    } = this;
    const bottom = canvasRelativeClippedTop + height;
    gl.enable(WebGL2RenderingContext.SCISSOR_TEST);
    const glBottom = this.context.canvas.height - bottom;
    gl.viewport(canvasRelativeClippedLeft, glBottom, width, height);
    gl.scissor(canvasRelativeClippedLeft, glBottom, width, height);
  }

  ensureBoundsUpdated() {
    this.context.ensureBoundsUpdated();
    if (this.context.boundsGeneration === this.boundsGeneration) return;
    this.boundsGeneration = this.context.boundsGeneration;

    const clientRect = this.element.getBoundingClientRect();
    const { x, y, width, height } = clientRect;

    this.canvasRelativeClippedTop = y;
    this.canvasRelativeClippedLeft = x;
    this.canvasRelativeLogicalTop = y;
    this.canvasRelativeLogicalLeft = x;

    const viewport = this.renderViewport;
    viewport.width = width - 1;
    viewport.height = height;
    viewport.logicalWidth = width - 1;
    viewport.logicalHeight = height;
    viewport.visibleLeftFraction = 0;
    viewport.visibleTopFraction = 0;
    viewport.visibleWidthFraction = 1;
    viewport.visibleHeightFraction = 1;

    this.sliceView.projectionParameters.setViewport(this.renderViewport);
  }

  /**
   * Zooms by the specified factor, maintaining the data position that projects to the current mouse
   * position.
   */
  zoomByMouse(factor: number) {
    const { navigationState } = this;
    if (!navigationState.valid) {
      return;
    }
    const { sliceView } = this;
    const {
      width,
      height,
      invViewMatrix,
      displayDimensionRenderInfo: { displayDimensionIndices, displayRank },
    } = sliceView.projectionParameters.value;
    let { mouseX, mouseY } = this;
    mouseX -= width / 2;
    mouseY -= height / 2;
    // Desired invariance:
    //
    // invViewMatrixLinear * [mouseX, mouseY, 0]^T + [oldX, oldY, oldZ]^T =
    // invViewMatrixLinear * factor * [mouseX, mouseY, 0]^T + [newX, newY, newZ]^T

    const position = this.navigationState.position.value;
    for (let i = 0; i < displayRank; ++i) {
      const dim = displayDimensionIndices[i];
      const f = invViewMatrix[i] * mouseX + invViewMatrix[4 + i] * mouseY;
      position[dim] += f * (1 - factor);
    }
    this.navigationState.position.changed.dispatch();
    navigationState.zoomBy(factor);
  }
}