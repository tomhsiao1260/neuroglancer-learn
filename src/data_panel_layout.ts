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

import type { ChunkManager } from "#src/chunk_manager/frontend.js";
import type { DisplayContext } from "#src/display_context.js";
import type {
  LayerManager,
  MouseSelectionState,
  TrackableDataSelectionState,
} from "#src/layer/index.js";
import {
  DisplayPose,
  NavigationState,
  OrientationState,
} from "#src/navigation_state.js";
import { SliceView } from "#src/sliceview/frontend.js";
import { SliceViewPanel } from "#src/sliceview/panel.js";
import { RefCounted } from "#src/util/disposable.js";
import { EventActionMap } from "#src/util/event_action_map.js";
import { quat } from "#src/util/geom.js";

export interface SliceViewViewerState {
  chunkManager: ChunkManager;
  navigationState: NavigationState;
  layerManager: LayerManager;
}

export class InputEventBindings {
  sliceView = new EventActionMap();
}

export interface ViewerUIState extends SliceViewViewerState {
  display: DisplayContext;
  mouseState: MouseSelectionState;
  selectionDetailsState: TrackableDataSelectionState;
  visibility: boolean;
  inputEventBindings: InputEventBindings;
}

const AXES_RELATIVE_ORIENTATION = new Map([
  ["xy", undefined],
  ["xz", quat.rotateX(quat.create(), quat.create(), Math.PI / 2)],
  ["yz", quat.rotateY(quat.create(), quat.create(), Math.PI / 2)],
]);

export function makeSliceView(
  viewerState: SliceViewViewerState,
  baseToSelf?: quat,
) {
  let navigationState: NavigationState;
  if (baseToSelf === undefined) {
    navigationState = viewerState.navigationState.addRef();
  } else {
    navigationState = new NavigationState(
      new DisplayPose(
        viewerState.navigationState.pose.position.addRef(),
        viewerState.navigationState.pose.displayDimensionRenderInfo.addRef(),
        OrientationState.makeRelative(
          viewerState.navigationState.pose.orientation,
          baseToSelf,
        ),
      ),
      viewerState.navigationState.zoomFactor.addRef(),
      viewerState.navigationState.depthRange.addRef(),
    );
  }
  return new SliceView(
    viewerState.chunkManager,
    viewerState.layerManager,
    navigationState,
  );
}

export function getCommonViewerState(viewer: ViewerUIState) {
  return {
    selectionDetailsState: viewer.selectionDetailsState,
    mouseState: viewer.mouseState,
    layerManager: viewer.layerManager,
    visibility: viewer.visibility,
    navigationState: viewer.navigationState,
    inputEventMap: viewer.inputEventBindings.sliceView,
  };
}

export class FourPanelLayout extends RefCounted {
  element = document.createElement("div");

  constructor(public viewer: ViewerUIState) {
    super();

    const { display } = viewer;
    this.element.style.flex = "1";
    this.element.style.display = "flex";
    this.element.style.flexDirection = "row";
    const state = getCommonViewerState(viewer);

    const elementXY = document.createElement("div");
    const orthXY = makeSliceView(viewer, AXES_RELATIVE_ORIENTATION.get("xy"));
    elementXY.style.flex = "1";
    new SliceViewPanel(display, elementXY, orthXY, state);

    const elementYZ = document.createElement("div");
    const orthYZ = makeSliceView(viewer, AXES_RELATIVE_ORIENTATION.get("yz"));
    elementYZ.style.flex = "1";
    new SliceViewPanel(display, elementYZ, orthYZ, state);

    const elementXZ = document.createElement("div");
    const orthXZ = makeSliceView(viewer, AXES_RELATIVE_ORIENTATION.get("xz"));
    elementXZ.style.flex = "1";
    new SliceViewPanel(display, elementXZ, orthXZ, state);

    this.element.appendChild(elementXY);
    this.element.appendChild(elementYZ);
    this.element.appendChild(elementXZ);
  }
}
