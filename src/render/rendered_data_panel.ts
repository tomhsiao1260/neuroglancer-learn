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
import type { DisplayContext } from "#src/layer/display_context.js";
import type { NavigationState } from "#src/state/navigation_state.js";
import type { Borrowed } from "#src/util/disposable.js";
import type {
  ActionEvent,
  EventActionMap,
} from "#src/util/event_action_map.js";
import type { GL } from "#src/webgl/context.js";
import { registerActionListener } from "#src/util/event_action_map.js";
import { vec3 } from "#src/util/geom.js";
import { MouseEventBinder } from "#src/util/mouse_bindings.js";
import { startRelativeMouseDrag } from "#src/util/mouse_drag.js";
import { getWheelZoomAmount } from "#src/util/wheel_zoom.js";
import type { ViewerState } from "#src/viewer_state.js";
import { RefCounted } from "#src/util/disposable.js";

const tempVec3 = vec3.create();

export class RenderedDataPanel extends RefCounted {
  gl: GL;
  private static positionDisplay: HTMLDivElement | null = null;
  private animationFrameId: number | null = null;
  private lastUpdateTime = 0;
  private readonly UPDATE_INTERVAL = 16; // about 60fps
  private isMouseInViewport = false;
  private lastMouseX = -1;
  private lastMouseY = -1;
  private isDragging = false;

  /**
   * Current mouse position within the viewport, or -1 if the mouse is not in the viewport.
   */
  mouseX = -1;
  mouseY = -1;

  inputEventMap: EventActionMap;
  navigationState: NavigationState;
  visibility: any;

  get visible() {
    return true;
  }

  private updatePositionDisplay(mouseVoxel?: Float32Array) {
    const position = this.navigationState.position.value;
    let text = '';
    if (mouseVoxel && this.isMouseInViewport && !this.isDragging) {
      text += `<span style="color:rgb(241, 227, 98)">z ${Math.floor(mouseVoxel[0])}, y ${Math.floor(mouseVoxel[1])}, x ${Math.floor(mouseVoxel[2])}</span> `;
    }
    text += `<span style="color: #ffffff">z ${Math.floor(position[0])}, y ${Math.floor(position[1])}, x ${Math.floor(position[2])}</span>`;
    if (RenderedDataPanel.positionDisplay) {
      RenderedDataPanel.positionDisplay.innerHTML = text;
    }
  }

  private animate = () => {
    const now = performance.now();
    if (now - this.lastUpdateTime >= this.UPDATE_INTERVAL) {
      this.lastUpdateTime = now;
      if (this.isMouseInViewport && this.mouseX !== -1 && this.mouseY !== -1) {
        // Only update if mouse position has changed and not dragging
        if ((this.mouseX !== this.lastMouseX || this.mouseY !== this.lastMouseY) && !this.isDragging) {
          this.lastMouseX = this.mouseX;
          this.lastMouseY = this.mouseY;
          this.updateMousePosition(this.mouseX, this.mouseY);
        }
      }
    }
    this.animationFrameId = requestAnimationFrame(this.animate);
  }

  /**
   * Called each time the mouse position relative to the top level of the rendered viewport changes.
   */
  private updateMousePosition(mouseX: number, mouseY: number): void {
    // Try to get volume/voxel coordinates
    let mouseVoxel: Float32Array | undefined = undefined;
    // Try sliceView/projectionParameters conversion
    const panel = (this as any);
    if (panel.sliceView && panel.sliceView.projectionParameters) {
      const params = panel.sliceView.projectionParameters.value;
      if (params && params.invViewMatrix) {
        const { width, height, invViewMatrix } = params;
        // Convert to center-based coordinates
        let mx = mouseX - width / 2;
        let my = mouseY - height / 2;
        // Transform to volume space
        mouseVoxel = new Float32Array(3);
        for (let i = 0; i < 3; ++i) {
          mouseVoxel[i] =
            invViewMatrix[i] * mx +
            invViewMatrix[4 + i] * my +
            invViewMatrix[12 + i];
        }
      }
    }
    this.updatePositionDisplay(mouseVoxel);
  }

  constructor(
    public context: Borrowed<DisplayContext>,
    public element: HTMLElement,
    public viewer: ViewerState,
  ) {
    super();

    this.gl = context.gl;
    context.addPanel(this);

    // Create position display element only once
    if (!RenderedDataPanel.positionDisplay) {
      RenderedDataPanel.positionDisplay = document.createElement('div');
      RenderedDataPanel.positionDisplay.style.position = 'fixed';
      RenderedDataPanel.positionDisplay.style.bottom = '10px';
      RenderedDataPanel.positionDisplay.style.right = '10px';
      RenderedDataPanel.positionDisplay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
      RenderedDataPanel.positionDisplay.style.padding = '5px 10px';
      RenderedDataPanel.positionDisplay.style.borderRadius = '4px';
      RenderedDataPanel.positionDisplay.style.fontFamily = 'monospace';
      RenderedDataPanel.positionDisplay.style.opacity = '0.8';
      document.body.appendChild(RenderedDataPanel.positionDisplay);
    }

    this.visibility = viewer.visibility;
    this.inputEventMap = viewer.inputEventMap;
    this.navigationState = viewer.navigationState;

    // Start animation loop
    this.animate();

    // Wait for next frame to ensure navigationState is initialized
    requestAnimationFrame(() => {
      if (this.navigationState && this.navigationState.changed) {
        this.registerDisposer(
          this.navigationState.changed.add(() => {
            this.updatePositionDisplay();
          })
        );
        // Initial update
        this.updatePositionDisplay();
      }
    });

    // Add mousemove event listener for hover updates
    element.addEventListener('mousemove', (event) => {
      this.handleMouseMove(event.clientX, event.clientY);
    });

    this.registerDisposer(
      new MouseEventBinder(element, this.inputEventMap, (event) => {
        this.onMousemove(event);
      }),
    );

    // Stop animation when mouse leaves the element
    element.addEventListener('mouseleave', () => {
      this.isMouseInViewport = false;
      this.mouseX = -1;
      this.mouseY = -1;
      this.lastMouseX = -1;
      this.lastMouseY = -1;
      this.updatePositionDisplay();
    });

    // Restart animation when mouse enters the element
    element.addEventListener('mouseenter', () => {
      this.isMouseInViewport = true;
      if (this.animationFrameId === null) {
        this.animate();
      }
    });

    registerActionListener(
      element,
      "zoom-via-wheel",
      (event: ActionEvent<WheelEvent>) => {
        const e = event.detail;
        this.onMousemove(e, false);
        this.zoomByMouse(getWheelZoomAmount(e));
      },
    );

    registerActionListener(
      element,
      "translate-via-mouse-drag",
      (e: ActionEvent<MouseEvent>) => {
        this.isDragging = true;
        startRelativeMouseDrag(e.detail, (_event, deltaX, deltaY) => {
          this.translateByViewportPixels(deltaX, deltaY);
        }, () => {
          this.isDragging = false;
        });
      },
    );

    for (const amount of [1, 10]) {
      registerActionListener(
        element,
        `z+${amount}-via-wheel`,
        (event: ActionEvent<WheelEvent>) => {
          const e = event.detail;
          const { navigationState } = this;
          const offset = tempVec3;
          const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
          offset[0] = 0;
          offset[1] = 0;
          offset[2] = (delta > 0 ? -1 : 1) * amount;
          navigationState.translateVoxelsRelative(offset);
        },
      );
    }
  }

  handleMouseMove(clientX: number, clientY: number) {
    const { element } = this;
    const bounds = element.getBoundingClientRect();
    const mouseX = clientX - (bounds.left + element.clientLeft);
    const mouseY = clientY - (bounds.top + element.clientTop);
    const { mouseState } = this.viewer;
    mouseState.pageX = clientX + window.scrollX;
    mouseState.pageY = clientY + window.scrollY;
    
    // Update mouse position immediately if it has changed
    if (mouseX !== this.mouseX || mouseY !== this.mouseY) {
      this.mouseX = mouseX;
      this.mouseY = mouseY;
      if (this.isMouseInViewport) {
        this.updateMousePosition(mouseX, mouseY);
      }
    }
  }

  onMousemove(event: MouseEvent, atOnly = true) {
    const { element } = this;
    if (atOnly && event.target !== element) {
      return;
    }
    this.handleMouseMove(event.clientX, event.clientY);
  }

  dispose() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    super.dispose();
  }
}
