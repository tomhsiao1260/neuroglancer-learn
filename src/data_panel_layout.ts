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

import "#src/data_panel_layout.css";

import type { ChunkManager } from "#src/chunk_manager/frontend.js";
import type { DisplayContext } from "#src/display_context.js";
import type {
  LayerManager,
  MouseSelectionState,
  TrackableDataSelectionState,
} from "#src/layer/index.js";
import * as L from "#src/layout.js";
import {
  DisplayPose,
  NavigationState,
  OrientationState,
} from "#src/navigation_state.js";
import type { RenderLayerRole } from "#src/renderlayer.js";
import { SliceView } from "#src/sliceview/frontend.js";
import { SliceViewPanel } from "#src/sliceview/panel.js";
import { TrackableBoolean } from "#src/trackable_boolean.js";
import type {
  WatchableSet,
  WatchableValueInterface,
} from "#src/trackable_value.js";
import type { TrackableRGB } from "#src/util/color.js";
import { RefCounted } from "#src/util/disposable.js";
import { EventActionMap } from "#src/util/event_action_map.js";
import { quat } from "#src/util/geom.js";

export interface SliceViewViewerState {
  chunkManager: ChunkManager;
  navigationState: NavigationState;
  layerManager: LayerManager;
  wireFrame: WatchableValueInterface<boolean>;
}

export class InputEventBindings {
  sliceView = new EventActionMap();
}

export interface ViewerUIState extends SliceViewViewerState {
  display: DisplayContext;
  mouseState: MouseSelectionState;
  selectionDetailsState: TrackableDataSelectionState;
  wireFrame: TrackableBoolean;
  visibleLayerRoles: WatchableSet<RenderLayerRole>;
  visibility: boolean;
  inputEventBindings: InputEventBindings;
  crossSectionBackgroundColor: TrackableRGB;
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
    viewerState.wireFrame,
  );
}

export function makeOrthogonalSliceViews(viewerState: SliceViewViewerState) {
  return new Map([
    ["xy", makeSliceView(viewerState, AXES_RELATIVE_ORIENTATION.get("xy")!)],
    ["xz", makeSliceView(viewerState, AXES_RELATIVE_ORIENTATION.get("xz")!)],
    ["yz", makeSliceView(viewerState, AXES_RELATIVE_ORIENTATION.get("yz")!)],
  ]);
}

export function getCommonViewerState(viewer: ViewerUIState) {
  return {
    crossSectionBackgroundColor: viewer.crossSectionBackgroundColor,
    selectionDetailsState: viewer.selectionDetailsState,
    mouseState: viewer.mouseState,
    layerManager: viewer.layerManager,
    wireFrame: viewer.wireFrame,
    visibleLayerRoles: viewer.visibleLayerRoles,
    visibility: viewer.visibility,
    navigationState: viewer.navigationState,
    inputEventMap: viewer.inputEventBindings.sliceView,
  };
}

export class FourPanelLayout extends RefCounted {
  element = document.createElement("div");

  constructor(public viewer: ViewerUIState) {
    super();

    const sliceViews = makeOrthogonalSliceViews(viewer);
    const { display } = viewer;
    const rootElement = this.element;
    rootElement.style.flex = "1";

    const makeSliceViewPanel = (
      axes: any,
      element: HTMLElement,
      state: any,
    ) => {
      const panel = this.registerDisposer(
        new SliceViewPanel(display, element, sliceViews.get(axes)!, state),
      );
      return panel;
    };

    const sliceViewerState = getCommonViewerState(viewer);
    const mainDisplayContents = [
      L.withFlex(
        1,
        L.box("column", [
          L.withFlex(
            1,
            L.box("row", [
              L.withFlex(1, (element) => {
                makeSliceViewPanel("xy", element, sliceViewerState);
              }),
              L.withFlex(1, (element) => {
                makeSliceViewPanel("yz", element, sliceViewerState);
              }),
            ]),
          ),
        ]),
      ),
    ];
    L.box("row", mainDisplayContents)(rootElement);
  }
}
