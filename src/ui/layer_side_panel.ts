/**
 * @license
 * Copyright 2018 Google Inc.
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
 * @file Side panel for displaying/editing layer details.
 */

import "#src/ui/layer_side_panel.css";

import svg_cursor from "ikonate/icons/cursor.svg?raw";
import type {
  ManagedUserLayer,
  SelectedLayerState,
  UserLayer,
} from "#src/layer/index.js";
import {
  changeLayerName,
  changeLayerType,
  deleteLayer,
  layerTypes,
} from "#src/layer/index.js";
import { ElementVisibilityFromTrackableBoolean } from "#src/trackable_boolean.js";
import {
  CachedWatchableValue,
  observeWatchable,
} from "#src/trackable_value.js";
import type { UserLayerSidePanelState } from "#src/ui//layer_side_panel_state.js";
import { LAYER_SIDE_PANEL_DEFAULT_LOCATION } from "#src/ui//layer_side_panel_state.js";
import { popDragStatus, pushDragStatus } from "#src/ui/drag_and_drop.js";
import type { DragSource, SidePanelManager } from "#src/ui/side_panel.js";
import { DRAG_OVER_CLASSNAME, SidePanel } from "#src/ui/side_panel.js";
import { RefCounted } from "#src/util/disposable.js";
import {
  KeyboardEventBinder,
  registerActionListener,
} from "#src/util/keyboard_bindings.js";
import { EventActionMap } from "#src/util/mouse_bindings.js";
import { CheckboxIcon } from "#src/widget/checkbox_icon.js";
import { makeDeleteButton } from "#src/widget/delete_button.js";
import { TabView } from "#src/widget/tab_view.js";

const layerNameInputEventMap = EventActionMap.fromObject({
  escape: { action: "cancel" },
});

export class LayerNameWidget extends RefCounted {
  element = document.createElement("input");
  constructor(public layer: ManagedUserLayer) {
    super();
    const { element } = this;
    element.classList.add("neuroglancer-layer-side-panel-name");
    element.spellcheck = false;
    element.autocomplete = "off";
    const keyboardHandler = this.registerDisposer(
      new KeyboardEventBinder(element, layerNameInputEventMap),
    );
    keyboardHandler.allShortcutsAreGlobal = true;
    registerActionListener(element, "cancel", (event) => {
      this.updateView();
      element.blur();
      event.stopPropagation();
      event.preventDefault();
    });
    element.title = "Rename layer";
    this.registerDisposer(layer.layerChanged.add(() => this.updateView()));
    element.addEventListener("change", () => this.updateModel());
    element.addEventListener("blur", () => this.updateModel());
    this.updateView();
  }

  private updateView() {
    this.element.value = this.layer.name;
  }

  private updateModel() {
    changeLayerName(this.layer, this.element.value);
  }
}

export class LayerTypeWidget extends RefCounted {
  element = document.createElement("select");
  private measureElement = document.createElement("div");
  constructor(public layer: UserLayer) {
    super();
    const { element, measureElement } = this;
    element.classList.add("neuroglancer-layer-side-panel-type");
    measureElement.classList.add("neuroglancer-layer-side-panel-type-measure");
    element.title = "Change layer type";
    document.body.appendChild(measureElement);
    for (const [layerType, layerConstructor] of layerTypes) {
      if (layerConstructor.type !== layerType) continue;
      const option = document.createElement("option");
      option.textContent = layerConstructor.typeAbbreviation;
      option.value = layerType;
      element.appendChild(option);
    }
    element.addEventListener("change", () => {
      const newType = element.value;
      const layerConstructor = layerTypes.get(newType)!;
      changeLayerType(this.layer.managedLayer, layerConstructor);
    });
    this.updateView();
  }

  private updateView() {
    const selectedName = this.layer.type;
    const { element, measureElement } = this;
    measureElement.textContent = (
      this.layer.constructor as typeof UserLayer
    ).typeAbbreviation;
    element.value = selectedName;
    element.style.width = `${measureElement.offsetWidth}px`;
  }

  disposed() {
    this.measureElement.remove();
  }
}

class LayerSidePanel extends SidePanel {
  tabView: TabView;
  layer: UserLayer;
  constructor(
    sidePanelManager: SidePanelManager,
    public panelState: UserLayerSidePanelState,
  ) {
    super(sidePanelManager, panelState.location);
    const layer = (this.layer = panelState.layer);
    const { element } = this;

    this.tabView = new TabView(
      {
        makeTab: (id) => layer.tabs.options.get(id)!.getter(),
        selectedTab: panelState.selectedTab,
        tabs: this.registerDisposer(
          new CachedWatchableValue({
            get value() {
              return panelState.tabs.map((id) => {
                const { label, hidden } = layer.tabs.options.get(id)!;
                return {
                  id,
                  label,
                  hidden: hidden?.value || false,
                };
              });
            },
            changed: panelState.tabsChanged,
          }),
        ),
      },
      this.visibility,
    );
  }

  makeDragSource(): DragSource {
    return {
      ...super.makeDragSource(),
      canDropAsTabs: (target) => {
        if (
          target instanceof LayerSidePanel &&
          target.layer === this.layer &&
          target !== this
        ) {
          return this.panelState.tabs.length;
        }
        return 0;
      },
      dropAsTab: (target) => {
        this.panelState.mergeInto((target as LayerSidePanel).panelState);
      },
    };
  }
}

export class LayerSidePanelManager extends RefCounted {
  placeholderSelectedLayerPanel: (() => void) | undefined;
  layerSidePanels = new Map<
    UserLayerSidePanelState,
    { generation: number; unregister: () => void }
  >();
  private generation = 0;
  private layersNeedUpdate = true;
  constructor(
    public sidePanelManager: SidePanelManager,
    public selectedLayerState: SelectedLayerState,
  ) {
    // constructor(public selectedLayerState: SelectedLayerState) {
    super();
    // const handleUpdate = () => {
    //   this.layersNeedUpdate = true;
    //   this.sidePanelManager.display.scheduleRedraw();
    // };
    // this.registerDisposer(selectedLayerState.changed.add(handleUpdate));
    // this.registerDisposer(
    //   selectedLayerState.layerManager.layersChanged.add(handleUpdate),
    // );
    // this.registerDisposer(
    //   sidePanelManager.beforeRender.add(() => this.update()),
    // );
    this.layersNeedUpdate = true;
    this.update();
  }

  private getSelectedUserLayer() {
    return this.selectedLayerState.layer?.layer ?? undefined;
  }

  private async update() {
    if (!this.layersNeedUpdate) return;
    await new Promise((resolve) => {
      setTimeout(resolve, 1000);
    });
    const { layerManager } = this.selectedLayerState;
    const generation = ++this.generation;
    this.layersNeedUpdate = false;
    const { layerSidePanels } = this;

    const ensurePanel = (panelState: UserLayerSidePanelState) => {
      let existing = layerSidePanels.get(panelState);
      if (existing === undefined) {
        existing = {
          generation,
          unregister: this.sidePanelManager.registerPanel({
            location: panelState.location,
            makePanel: () =>
              new LayerSidePanel(this.sidePanelManager, panelState),
          }),
        };
        layerSidePanels.set(panelState, existing);
      } else {
        existing.generation = generation;
      }
    };
    // Add selected layer panel
    {
      const layer = this.getSelectedUserLayer();
      const { location } = this.selectedLayerState;
      if (layer === undefined || !location.visible) {
        // if (this.placeholderSelectedLayerPanel === undefined) {
        //   this.placeholderSelectedLayerPanel =
        //     this.sidePanelManager.registerPanel({
        //       location,
        //       makePanel: () => new SidePanel(this.sidePanelManager, location),
        //     });
        // }
      } else {
        // this.placeholderSelectedLayerPanel?.();
        // this.placeholderSelectedLayerPanel = undefined;
        const panelState = layer.panels.panels[0];
        panelState.location.value = location.value;
        ensurePanel(panelState);
      }
    }

    // // Add extra layer panels
    // for (const layer of layerManager.managedLayers) {
    //   const userLayer = layer.layer;
    //   if (userLayer === null) continue;
    //   const { panels } = userLayer.panels;
    //   for (let i = 1, length = panels.length; i < length; ++i) {
    //     ensurePanel(panels[i]);
    //   }
    // }
    // for (const [panelState, existing] of layerSidePanels) {
    //   if (existing.generation === generation) continue;
    //   existing.unregister();
    //   layerSidePanels.delete(panelState);
    // }
  }

  disposed() {
    this.placeholderSelectedLayerPanel?.();
    for (const { unregister } of this.layerSidePanels.values()) {
      unregister();
    }
  }
}
