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
import type { DisplayContext } from "#src/display_context.js";
import type { NavigationState } from "#src/navigation_state.js";
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

  /**
   * Called each time the mouse position relative to the top level of the rendered viewport changes.
   */
  private updateMousePosition(mouseX: number, mouseY: number): void {
    if (mouseX === this.mouseX && mouseY === this.mouseY) {
      return;
    }
    this.mouseX = mouseX;
    this.mouseY = mouseY;
  }

  constructor(
    public context: Borrowed<DisplayContext>,
    public element: HTMLElement,
    public viewer: ViewerState,
  ) {
    super();

    this.gl = context.gl;
    context.addPanel(this);

    this.visibility = viewer.visibility;
    this.inputEventMap = viewer.inputEventMap;

    this.registerDisposer(
      new MouseEventBinder(element, this.inputEventMap, (event) => {
        this.onMousemove(event);
      }),
    );

    // console.log("control event here");

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
        startRelativeMouseDrag(e.detail, (_event, deltaX, deltaY) => {
          this.translateByViewportPixels(deltaX, deltaY);
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
    this.updateMousePosition(mouseX, mouseY);
  }

  onMousemove(event: MouseEvent, atOnly = true) {
    const { element } = this;
    if (atOnly && event.target !== element) {
      return;
    }
    this.handleMouseMove(event.clientX, event.clientY);
  }
}
