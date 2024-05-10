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

import "#src/noselect.css";
import "#src/ui/layer_bar.css";
import svg_plus from "ikonate/icons/plus.svg?raw";
import type { ManagedUserLayer } from "#src/layer/index.js";
import { addNewLayer, deleteLayer, makeLayer } from "#src/layer/index.js";
import { NavigationLinkType } from "#src/navigation_state.js";
import type { WatchableValueInterface } from "#src/trackable_value.js";
import type { DropLayers } from "#src/ui/layer_drag_and_drop.js";
import {
  registerLayerBarDragLeaveHandler,
  registerLayerBarDropHandlers,
  registerLayerDragHandlers,
} from "#src/ui/layer_drag_and_drop.js";
import { animationFrameDebounce } from "#src/util/animation_frame_debounce.js";
import { RefCounted } from "#src/util/disposable.js";
import { removeFromParent } from "#src/util/dom.js";
import { preventDrag } from "#src/util/drag_and_drop.js";
import { makeCloseButton } from "#src/widget/close_button.js";
import { makeDeleteButton } from "#src/widget/delete_button.js";
import { makeIcon } from "#src/widget/icon.js";
import { PositionWidget } from "#src/widget/position_widget.js";

class LayerWidget extends RefCounted {
  element = document.createElement("div");
  layerNumberElement = document.createElement("div");
  labelElement = document.createElement("div");
  visibleProgress = document.createElement("div");
  prefetchProgress = document.createElement("div");
  labelElementText = document.createTextNode("");
  valueElement = document.createElement("div");
  maxLength = 0;
  prevValueText = "";

  constructor(
    public layer: ManagedUserLayer,
    public panel: LayerBar,
  ) {
    super();
    const {
      element,
      labelElement,
      layerNumberElement,
      valueElement,
      visibleProgress,
      prefetchProgress,
      labelElementText,
    } = this;
    element.className = "neuroglancer-layer-item neuroglancer-noselect";
    element.appendChild(visibleProgress);
    element.appendChild(prefetchProgress);
    labelElement.className = "neuroglancer-layer-item-label";
    labelElement.appendChild(labelElementText);
    visibleProgress.className = "neuroglancer-layer-item-visible-progress";
    prefetchProgress.className = "neuroglancer-layer-item-prefetch-progress";
    layerNumberElement.className = "neuroglancer-layer-item-number";
    valueElement.className = "neuroglancer-layer-item-value";

    const valueContainer = document.createElement("div");
    valueContainer.className = "neuroglancer-layer-item-value-container";
    const buttonContainer = document.createElement("div");
    buttonContainer.className = "neuroglancer-layer-item-button-container";
    const closeElement = makeCloseButton();
    closeElement.title = "Remove layer from this layer group";
    closeElement.addEventListener("click", (event: MouseEvent) => {
      if (this.panel.layerManager === this.panel.manager.rootLayers) {
        // The layer bar corresponds to a TopLevelLayerListSpecification.  That means there is just
        // a single layer group, archive the layer unconditionally.
        this.layer.setArchived(true);
      } else {
        // The layer bar corresponds to a LayerSubsetSpecification.  The layer is always contained
        // in the root LayerManager, as well as the LayerManager for each LayerSubsetSpecification.
        if (this.layer.containers.size > 2) {
          // Layer is contained in at least one other layer group, just remove it from this layer
          // group.
          this.panel.layerManager.removeManagedLayer(this.layer);
        } else {
          // Layer is not contained in any other layer group.  Archive it.
          this.layer.setArchived(true);
        }
      }
      event.stopPropagation();
    });
    const deleteElement = makeDeleteButton();
    deleteElement.title = "Delete this layer";
    deleteElement.addEventListener("click", (event: MouseEvent) => {
      deleteLayer(this.layer);
      event.stopPropagation();
    });
    element.appendChild(layerNumberElement);
    valueContainer.appendChild(valueElement);
    valueContainer.appendChild(buttonContainer);
    buttonContainer.appendChild(closeElement);
    buttonContainer.appendChild(deleteElement);
    element.appendChild(labelElement);
    element.appendChild(valueContainer);
    const positionWidget = this.registerDisposer(
      new PositionWidget(
        layer.localPosition,
        layer.localCoordinateSpaceCombiner,
        {
          copyButton: false,
          velocity: layer.localVelocity,
          getToolBinder: () => layer.layer?.toolBinder,
        },
      ),
    );
    element.appendChild(positionWidget.element);
    positionWidget.element.addEventListener("click", (event: MouseEvent) => {
      event.stopPropagation();
    });
    positionWidget.element.addEventListener("dblclick", (event: MouseEvent) => {
      event.stopPropagation();
    });
    element.addEventListener("click", (event: MouseEvent) => {
      if (event.ctrlKey) {
        panel.selectedLayer.toggle(layer);
      } else if (event.altKey) {
        layer.pickEnabled = !layer.pickEnabled;
      } else {
        layer.setVisible(!layer.visible);
      }
    });

    element.addEventListener("contextmenu", (event: MouseEvent) => {
      panel.selectedLayer.layer = layer;
      panel.selectedLayer.visible = true;
      event.stopPropagation();
      event.preventDefault();
    });
    registerLayerDragHandlers(panel, element, layer, {
      getLayoutSpec: () => panel.getLayoutSpecForDrag(),
    });
    registerLayerBarDropHandlers(this.panel, element, this.layer);
  }

  update() {
    const { layer, element } = this;
    this.labelElementText.textContent = layer.name;
    element.dataset.visible = layer.visible.toString();
    element.dataset.selected = (
      layer === this.panel.selectedLayer.layer
    ).toString();
    element.dataset.pick = layer.pickEnabled.toString();
    let title = `Click to ${
      layer.visible ? "hide" : "show"
    }, control+click to show side panel`;
    if (layer.supportsPickOption) {
      title += `, alt+click to ${
        layer.pickEnabled ? "disable" : "enable"
      } spatial object selection`;
    }
    title += ", drag to move, shift+drag to copy";
    element.title = title;
  }

  disposed() {
    this.element.remove();
    super.disposed();
  }
}
