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
  SelectedLayerState,
} from "#src/layer/index.js";
import type {
  CoordinateSpacePlaybackVelocity,
  TrackableCrossSectionZoom,
  TrackableProjectionZoom,
} from "#src/navigation_state.js";
import {
  DisplayPose,
  LinkedCoordinateSpacePlaybackVelocity,
  LinkedDepthRange,
  LinkedDisplayDimensions,
  LinkedOrientationState,
  LinkedPosition,
  LinkedRelativeDisplayScales,
  LinkedZoomState,
  NavigationState,
  WatchableDisplayDimensionRenderInfo,
} from "#src/navigation_state.js";
import type { RenderLayerRole } from "#src/renderlayer.js";
import { TrackableBoolean } from "#src/trackable_boolean.js";
import type { WatchableSet } from "#src/trackable_value.js";
import type { TrackableRGB } from "#src/util/color.js";
import type { Borrowed, Owned } from "#src/util/disposable.js";
import { RefCounted } from "#src/util/disposable.js";
import type { WatchableVisibilityPriority } from "#src/visibility_priority/frontend.js";
import type { TrackableScaleBarOptions } from "#src/widget/scale_bar.js";

export interface LayerGroupViewerState {
  display: Borrowed<DisplayContext>;
  navigationState: Owned<NavigationState>;
  perspectiveNavigationState: Owned<NavigationState>;
  velocity: Owned<CoordinateSpacePlaybackVelocity>;
  mouseState: MouseSelectionState;
  showAxisLines: TrackableBoolean;
  wireFrame: TrackableBoolean;
  showScaleBar: TrackableBoolean;
  scaleBarOptions: TrackableScaleBarOptions;
  showPerspectiveSliceViews: TrackableBoolean;
  layerSpecification: Owned<LayerListSpecification>;
  inputEventBindings: DataPanelInputEventBindings;
  visibility: WatchableVisibilityPriority;
  selectedLayer: SelectedLayerState;
  visibleLayerRoles: WatchableSet<RenderLayerRole>;
  crossSectionBackgroundColor: TrackableRGB;
  perspectiveViewBackgroundColor: TrackableRGB;
}

export class LinkedViewerNavigationState extends RefCounted {
  position: LinkedPosition;
  velocity: LinkedCoordinateSpacePlaybackVelocity;
  relativeDisplayScales: LinkedRelativeDisplayScales;
  displayDimensions: LinkedDisplayDimensions;
  displayDimensionRenderInfo: WatchableDisplayDimensionRenderInfo;
  crossSectionOrientation: LinkedOrientationState;
  crossSectionScale: LinkedZoomState<TrackableCrossSectionZoom>;
  projectionOrientation: LinkedOrientationState;
  projectionScale: LinkedZoomState<TrackableProjectionZoom>;
  crossSectionDepthRange: LinkedDepthRange;
  projectionDepthRange: LinkedDepthRange;

  navigationState: NavigationState;
  projectionNavigationState: NavigationState;

  constructor(parent: {
    navigationState: Borrowed<NavigationState>;
    velocity: Borrowed<CoordinateSpacePlaybackVelocity>;
    perspectiveNavigationState: Borrowed<NavigationState>;
  }) {
    super();
    this.relativeDisplayScales = new LinkedRelativeDisplayScales(
      parent.navigationState.pose.relativeDisplayScales.addRef(),
    );
    this.displayDimensions = new LinkedDisplayDimensions(
      parent.navigationState.pose.displayDimensions.addRef(),
    );
    this.position = new LinkedPosition(
      parent.navigationState.position.addRef(),
    );
    this.crossSectionOrientation = new LinkedOrientationState(
      parent.navigationState.pose.orientation.addRef(),
    );
    this.displayDimensionRenderInfo = this.registerDisposer(
      new WatchableDisplayDimensionRenderInfo(
        this.relativeDisplayScales.value,
        this.displayDimensions.value,
      ),
    );
    this.crossSectionScale = new LinkedZoomState(
      parent.navigationState.zoomFactor.addRef() as TrackableCrossSectionZoom,
      this.displayDimensionRenderInfo.addRef(),
    );
    this.crossSectionDepthRange = new LinkedDepthRange(
      parent.navigationState.depthRange.addRef(),
      this.displayDimensionRenderInfo,
    );
    this.navigationState = this.registerDisposer(
      new NavigationState(
        new DisplayPose(
          this.position.value,
          this.displayDimensionRenderInfo.addRef(),
          this.crossSectionOrientation.value,
        ),
        this.crossSectionScale.value,
        this.crossSectionDepthRange.value,
      ),
    );
  }
}

export class LayerGroupViewer extends RefCounted {
  layerSpecification: LayerListSpecification;
  viewerNavigationState: LinkedViewerNavigationState;
  layout: DataPanelLayoutContainer;

  // FIXME: don't make viewerState a property, just make these things properties directly
  get display() {
    return this.viewerState.display;
  }
  get layerManager() {
    return this.layerSpecification.layerManager;
  }
  get navigationState() {
    return this.viewerNavigationState.navigationState;
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

  constructor(
    public element: HTMLElement,
    public viewerState: LayerGroupViewerState,
  ) {
    super();

    this.layerSpecification = this.registerDisposer(
      viewerState.layerSpecification,
    );

    this.viewerNavigationState = this.registerDisposer(
      new LinkedViewerNavigationState(viewerState),
    );

    this.layout = this.registerDisposer(
      new DataPanelLayoutContainer(this, "xy"),
    );

    this.makeUI();
  }

  private makeUI() {
    this.element.style.flex = "1";
    this.element.style.display = "flex";
    this.element.style.flexDirection = "column";
    this.element.appendChild(this.layout.element);
  }
}
