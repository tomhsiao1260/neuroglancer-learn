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
 * @file Facilities for laying out multiple LayerGroupViewer instances.
 */

import "#src/layer_groups_layout.css";
import { LayerGroupViewer } from "#src/layer_group_viewer.js";
import { RefCounted } from "#src/util/disposable.js";
import type { Viewer } from "#src/viewer.js";

/**
 * Container for a LayoutComponent.  The contained LayoutComponent may change.
 */
export class LayoutComponentContainer extends RefCounted {
  element = document.createElement("div");

  constructor(public viewer: Viewer) {
    super();
    const { element } = this;
    element.style.display = "flex";
    element.style.flex = "1";
    element.style.position = "relative";
    element.style.alignItems = "stretch";

    const component = makeComponent(this);
    element.appendChild(component.element);
  }
}

function getCommonViewerState(viewer: Viewer) {
  return {
    mouseState: viewer.mouseState,
    showAxisLines: viewer.showAxisLines,
    wireFrame: viewer.wireFrame,
    showScaleBar: viewer.showScaleBar,
    scaleBarOptions: viewer.scaleBarOptions,
    showPerspectiveSliceViews: viewer.showPerspectiveSliceViews,
    inputEventBindings: viewer.inputEventBindings,
    visibility: viewer.visibility,
    selectedLayer: viewer.selectedLayer,
    visibleLayerRoles: viewer.visibleLayerRoles,
    navigationState: viewer.navigationState.addRef(),
    perspectiveNavigationState: viewer.perspectiveNavigationState.addRef(),
    velocity: viewer.velocity.addRef(),
    crossSectionBackgroundColor: viewer.crossSectionBackgroundColor,
    perspectiveViewBackgroundColor: viewer.perspectiveViewBackgroundColor,
  };
}

export class SingletonLayerGroupViewer extends RefCounted {
  layerGroupViewer: LayerGroupViewer;

  constructor(
    public element: HTMLElement,
    viewer: Viewer,
  ) {
    super();
    this.layerGroupViewer = this.registerDisposer(
      new LayerGroupViewer(element, {
        display: viewer.display,
        layerSpecification: viewer.layerSpecification.addRef(),
        ...getCommonViewerState(viewer),
      }),
    );
  }
}

function makeComponent(container: LayoutComponentContainer) {
  const element = document.createElement("div");
  element.style.flex = "1";
  element.style.width = "0px";
  return new SingletonLayerGroupViewer(element, container.viewer);
}

export class RootLayoutContainer extends RefCounted {
  container = this.registerDisposer(new LayoutComponentContainer(this.viewer));

  get element() {
    return this.container.element;
  }

  constructor(public viewer: Viewer) {
    super();
  }
}
