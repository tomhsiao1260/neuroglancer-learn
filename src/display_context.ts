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

  // Sets the viewport to the logical viewport, using the scissor test to constrain drawing to the
  // clipped viewport.  Drawing does not need to take `visible{Left,Top,Width,Height}Fraction` into
  // account.
  setGLLogicalViewport() {
    const {
      gl,
      renderViewport: { width, height, logicalWidth, logicalHeight },
    } = this;
    const canvasHeight = this.context.canvas.height;
    gl.enable(WebGL2RenderingContext.SCISSOR_TEST);
    gl.viewport(
      this.canvasRelativeLogicalLeft,
      canvasHeight - (this.canvasRelativeLogicalTop + logicalHeight),
      logicalWidth,
      logicalHeight,
    );
    gl.scissor(
      this.canvasRelativeClippedLeft,
      canvasHeight - (this.canvasRelativeClippedTop + height),
      width,
      height,
    );
  }

  abstract draw(): void;

  get visible() {
    return true;
  }

  getDepthArray(): Float32Array | undefined {
    return undefined;
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

export abstract class IndirectRenderedPanel extends RenderedPanel {
  canvas = document.createElement("canvas");
  canvasRenderingContext = this.canvas.getContext("2d");
  constructor(context: Borrowed<DisplayContext>, element: HTMLElement) {
    super(context, element, this.visibility);
    const { canvas } = this;
    element.appendChild(canvas);
    element.style.position = "relative";
    canvas.style.position = "absolute";
    canvas.style.left = "0";
    canvas.style.right = "0";
    canvas.style.top = "0";
    canvas.style.bottom = "0";
  }

  abstract drawIndirect(): void;

  draw() {
    this.drawIndirect();
    const { renderViewport, canvas } = this;
    const { logicalWidth, logicalHeight } = renderViewport;
    canvas.width = logicalWidth;
    canvas.height = logicalHeight;
    const { canvasRenderingContext } = this;
    canvasRenderingContext?.drawImage(
      this.context.canvas,
      this.canvasRelativeLogicalLeft,
      this.canvasRelativeLogicalTop,
      logicalWidth,
      logicalHeight,
      0,
      0,
      logicalWidth,
      logicalHeight,
    );
  }
}

// Size/position monitoring state for a single panel.
interface PanelMonitorState {
  // Intersection observer used to detect movement of a panel.  The root element is always the root
  // container element.
  intersectionObserver?: IntersectionObserver;

  // Margin within the root element chosen to exactly match the bounds
  // of the panel element when the IntersectionObserver was created.
  // When the bounds of either the root element or the panel element
  // have possibly changed, the new margin is computed and compared to
  // this value.  This is stored separately, rather than just relying
  // on `intersectionObserver?.rootMargin`, to avoid spuriously change
  // detections due to normalization that the browser may do.
  intersectionObserverMargin?: string;

  // Indicates that the panel element was added to the resize observer.
  addedToResizeObserver?: boolean;
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

  resizeCallback = () => {
    ++this.resizeGeneration;
    this.scheduleRedraw();
  };

  ensureMonitorPanel(
    element: HTMLElement,
    state: PanelMonitorState,
    elementClientRect: DOMRect,
  ) {
    if (!state.addedToResizeObserver) {
      this.resizeObserver.observe(element);
      state.addedToResizeObserver = true;
    }
    const rootRect = this.rootRect!;
    const marginTop = rootRect.top - elementClientRect.top;
    const marginLeft = rootRect.left - elementClientRect.left;
    const marginRight = elementClientRect.right - rootRect.right;
    const marginBottom = elementClientRect.bottom - rootRect.bottom;
    const margin = `${marginTop}px ${marginRight}px ${marginBottom}px ${marginLeft}px`;
    if (state.intersectionObserverMargin !== margin) {
      state.intersectionObserverMargin = margin;
      state.intersectionObserver?.disconnect();
      const intersectionObserver = (state.intersectionObserver =
        new IntersectionObserver(this.resizeCallback, {
          root: this.container,
          rootMargin: margin,
          threshold: [0.93, 0.94, 0.95, 0.96, 0.97, 0.98, 0.99, 1],
        }));
      intersectionObserver.observe(element);
    }
  }

  unmonitorPanel(element: HTMLElement, state: PanelMonitorState) {
    if (state.addedToResizeObserver) {
      this.resizeObserver.unobserve(element);
    }
    state.intersectionObserver?.disconnect();
  }

  private resizeObserver = new ResizeObserver(this.resizeCallback);

  constructor(public container: HTMLElement) {
    super();
    const { canvas, resizeObserver } = this;
    container.style.position = "relative";
    canvas.style.position = "absolute";
    canvas.style.top = "0px";
    canvas.style.left = "0px";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.zIndex = "0";
    resizeObserver.observe(canvas);
    container.appendChild(canvas);
    this.registerEventListener(
      canvas,
      "webglcontextlost",
      (event: WebGLContextEvent) => {
        console.log(`Lost WebGL context: ${event.statusMessage}`);
        // Wait for context to be regained.
        event.preventDefault();
      },
    );
    this.registerEventListener(canvas, "webglcontextrestored", () => {
      console.log("WebGL context restored");
      // Simply reload Neuroglancer.
      window.location.reload();
    });
    this.gl = initializeWebGL(canvas);
  }

  applyWindowedViewportToElement(element: HTMLElement, value: Float64Array) {
    // These values specify the position of the canvas relative to the viewer.  However, we will
    // actually leave the canvas in place (such that it still fills the browser window) and move
    // the viewer.
    const [left, top, width, height] = value;
    const totalWidth = 1 / width;
    const totalHeight = 1 / height;
    element.style.position = "absolute";
    element.style.top = `${-totalHeight * top * 100}%`;
    element.style.left = `${-totalWidth * left * 100}%`;
    element.style.width = `${totalWidth * 100}%`;
    element.style.height = `${totalHeight * 100}%`;
    ++this.resizeGeneration;
    this.scheduleRedraw();
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
    this.resizeObserver.disconnect();
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

  getDepthArray(): Float32Array {
    const { width, height } = this.canvas;
    const depthArray = new Float32Array(width * height);
    for (const panel of this.panels) {
      if (!panel.shouldDraw) continue;
      const panelDepthArray = panel.getDepthArray();
      if (panelDepthArray === undefined) continue;
      const {
        canvasRelativeClippedTop,
        canvasRelativeClippedLeft,
        renderViewport: { width, height },
      } = panel;
      for (let y = 0; y < height; ++y) {
        const panelDepthArrayOffset = (height - 1 - y) * width;
        depthArray.set(
          panelDepthArray.subarray(
            panelDepthArrayOffset,
            panelDepthArrayOffset + width,
          ),
          (canvasRelativeClippedTop + y) * width + canvasRelativeClippedLeft,
        );
      }
    }
    return depthArray;
  }
}
