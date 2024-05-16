/**
 * @license
 * Copyright 2017 Google Inc.
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

/**
 * @file Viewer for a group of layers.
 */

import "#src/layer_group_viewer.css";
import type { InputEventBindings as DataPanelInputEventBindings } from "#src/data_panel_layout.js";
import { DataPanelLayoutContainer } from "#src/data_panel_layout.js";
import type { DisplayContext } from "#src/display_context.js";
import type {
  LayerListSpecification,
  MouseSelectionState,
} from "#src/layer/index.js";
import { NavigationState } from "#src/navigation_state.js";
import type { RenderLayerRole } from "#src/renderlayer.js";
import { TrackableBoolean } from "#src/trackable_boolean.js";
import type { WatchableSet } from "#src/trackable_value.js";
import type { TrackableRGB } from "#src/util/color.js";
import type { Borrowed, Owned } from "#src/util/disposable.js";
import { RefCounted } from "#src/util/disposable.js";

export interface LayerGroupViewerState {
  display: Borrowed<DisplayContext>;
  navigationState: Owned<NavigationState>;
  mouseState: MouseSelectionState;
  wireFrame: TrackableBoolean;
  layerSpecification: Owned<LayerListSpecification>;
  inputEventBindings: DataPanelInputEventBindings;
  visibleLayerRoles: WatchableSet<RenderLayerRole>;
  crossSectionBackgroundColor: TrackableRGB;
}

export class LayerGroupViewer extends RefCounted {
  layout: DataPanelLayoutContainer;
  element: HTMLElement = document.createElement("div");

  // FIXME: don't make viewerState a property, just make these things properties directly
  get display() {
    return this.viewerState.display;
  }
  get layerManager() {
    return this.layerSpecification.layerManager;
  }
  get navigationState() {
    return this.viewerState.navigationState;
  }
  get chunkManager() {
    return this.layerSpecification.chunkManager;
  }
  get mouseState() {
    return this.viewerState.mouseState;
  }
  get wireFrame() {
    return this.viewerState.wireFrame;
  }
  get inputEventBindings() {
    return this.viewerState.inputEventBindings;
  }
  get visibility() {
    return this.viewerState.visibility;
  }
  get visibleLayerRoles() {
    return this.viewerState.visibleLayerRoles;
  }
  get crossSectionBackgroundColor() {
    return this.viewerState.crossSectionBackgroundColor;
  }
  get layerSpecification() {
    return this.viewerState.layerSpecification;
  }

  constructor(public viewerState: LayerGroupViewerState) {
    super();

    this.layout = this.registerDisposer(new DataPanelLayoutContainer(this));

    const { element } = this;
    element.style.flex = "1";
    element.style.width = "0px";
    element.style.display = "flex";
    element.style.flexDirection = "column";
    element.appendChild(this.layout.element);
  }
}
