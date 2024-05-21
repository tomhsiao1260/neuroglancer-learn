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

import type { FrameNumberCounter } from "#src/chunk_manager/frontend.js";
import { animationFrameDebounce } from "#src/util/animation_frame_debounce.js";
import type { Borrowed } from "#src/util/disposable.js";
import { RefCounted } from "#src/util/disposable.js";
import { NullarySignal } from "#src/util/signal.js";
import type { GL } from "#src/webgl/context.js";
import { initializeWebGL } from "#src/webgl/context.js";

export class RenderViewport {
  // Width of visible portion of panel in canvas pixels.
  width = 0;

  // Height of visible portion of panel in canvas pixels.
  height = 0;

  // Width in canvas pixels, including portions outside of the canvas (i.e. outside the "viewport"
  // window).
  logicalWidth = 0;

  // Height in canvas pixels, including portions outside of the canvas (i.e. outside the "viewport"
  // window).
  logicalHeight = 0;

  // Left edge of visible region within full (logical) panel, as fraction in [0, 1].
  visibleLeftFraction = 0;

  // Top edge of visible region within full (logical) panel, as fraction in [0, 1].
  visibleTopFraction = 0;

  // Fraction of logical width that is visible, equal to `widthInCanvasPixels / logicalWidth`.
  visibleWidthFraction = 0;

  // Fraction of logical height that is visible, equal to `heightInCanvasPixels / logicalHeight`.
  visibleHeightFraction = 0;
}

export function renderViewportsEqual(a: RenderViewport, b: RenderViewport) {
  return (
    a.width === b.width &&
    a.height === b.height &&
    a.logicalWidth === b.logicalWidth &&
    a.logicalHeight === b.logicalHeight &&
    a.visibleLeftFraction === b.visibleLeftFraction &&
    a.visibleTopFraction === b.visibleTopFraction
  );
}

export abstract class RenderedPanel extends RefCounted {
  gl: GL;

  // Generation used to check whether the following bounds-related fields are up to date.
  boundsGeneration = -1;

  // Offset of visible portion of panel in canvas pixels from left side of canvas.
  canvasRelativeClippedLeft = 0;

  // Offset of visible portion of panel in canvas pixels from top of canvas.
  canvasRelativeClippedTop = 0;

  canvasRelativeLogicalLeft = 0;
  canvasRelativeLogicalTop = 0;

  renderViewport = new RenderViewport();

  constructor(
    public context: Borrowed<DisplayContext>,
    public element: HTMLElement,
    public visibility: any,
  ) {
    super();
    this.gl = context.gl;
    context.addPanel(this);
  }

  scheduleRedraw() {
    if (this.visible) {
      this.context.scheduleRedraw();
    }
  }

  abstract isReady(): boolean;

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

  abstract draw(): void;

  get visible() {
    return true;
  }

  get shouldDraw() {
    if (!this.visible) return false;
    const { element } = this;
    if (
      element.clientWidth === 0 ||
      element.clientHeight === 0 ||
      element.offsetWidth === 0 ||
      element.offsetHeight === 0
    ) {
      // Skip drawing if the panel has zero client area.
      return false;
    }
    return true;
  }

  // Returns a number that determine the order in which panels are drawn. This is used by CdfPanel
  // to ensure it is drawn after other panels that update the histogram.
  //
  // A higher number -> later draw.
  get drawOrder() {
    return 0;
  }
}

export class DisplayContext extends RefCounted implements FrameNumberCounter {
  canvas = document.createElement("canvas");
  gl: GL;
  updateStarted = new NullarySignal();
  updateFinished = new NullarySignal();
  changed = this.updateFinished;
  panels = new Set<RenderedPanel>();
  canvasRect: DOMRect | undefined;
  rootRect: DOMRect | undefined;
  resizeGeneration = 0;
  boundsGeneration = -1;

  // Panels ordered by `drawOrder`.  If length is 0, needs to be recomputed.
  private orderedPanels: RenderedPanel[] = [];

  /**
   * Unique number of the next frame.  Incremented once each time a frame is drawn.
   */
  frameNumber = 0;

  constructor(public container: HTMLElement) {
    super();
    const { canvas } = this;
    container.style.position = "relative";
    canvas.style.position = "absolute";
    canvas.style.top = "0px";
    canvas.style.left = "0px";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.zIndex = "0";
    container.appendChild(canvas);
    this.gl = initializeWebGL(canvas);
  }

  isReady() {
    for (const panel of this.panels) {
      if (!panel.visible) {
        continue;
      }
      if (!panel.isReady()) {
        return false;
      }
    }
    return true;
  }

  disposed() {
    this.orderedPanels.length = 0;
  }

  addPanel(panel: Borrowed<RenderedPanel>) {
    this.panels.add(panel);
    this.orderedPanels.length = 0;
    ++this.resizeGeneration;
    this.scheduleRedraw();
  }

  removePanel(panel: Borrowed<RenderedPanel>) {
    this.panels.delete(panel);
    this.orderedPanels.length = 0;
    ++this.resizeGeneration;
    this.scheduleRedraw();
  }

  readonly scheduleRedraw = this.registerCancellable(
    animationFrameDebounce(() => this.draw()),
  );

  ensureBoundsUpdated() {
    const { resizeGeneration } = this;
    if (this.boundsGeneration === resizeGeneration) return;
    const { canvas } = this;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    this.canvasRect = canvas.getBoundingClientRect();
    this.rootRect = this.container.getBoundingClientRect();
    this.boundsGeneration = resizeGeneration;
  }

  draw() {
    ++this.frameNumber;
    this.updateStarted.dispatch();
    const gl = this.gl;
    this.ensureBoundsUpdated();
    this.gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const { orderedPanels, panels } = this;
    if (orderedPanels.length !== panels.size) {
      orderedPanels.push(...panels);
      orderedPanels.sort((a, b) => a.drawOrder - b.drawOrder);
    }
    for (const panel of orderedPanels) {
      if (!panel.shouldDraw) continue;
      panel.ensureBoundsUpdated();
      const { renderViewport } = panel;
      if (renderViewport.width === 0 || renderViewport.height === 0) continue;
      panel.draw();
    }

    // Ensure the alpha buffer is set to 1.
    gl.disable(gl.SCISSOR_TEST);
    this.gl.clearColor(1.0, 1.0, 1.0, 1.0);
    this.gl.colorMask(false, false, false, true);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.gl.colorMask(true, true, true, true);
    this.updateFinished.dispatch();
  }
}
