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
 * @file Tabbed view widget.
 */

import "#src/widget/tab_view.css";

import type {
  WatchableValueChangeInterface,
  WatchableValueInterface,
} from "#src/trackable_value.js";
import { animationFrameDebounce } from "#src/util/animation_frame_debounce.js";
import type { Owned } from "#src/util/disposable.js";
import { RefCounted } from "#src/util/disposable.js";
import { removeChildren, removeFromParent } from "#src/util/dom.js";
import { NullarySignal, Signal } from "#src/util/signal.js";
import type { Trackable } from "#src/util/trackable.js";
import { WatchableVisibilityPriority } from "#src/visibility_priority/frontend.js";

export class Tab extends RefCounted {
  element = document.createElement("div");

  get visible() {
    return this.visibility.visible;
  }

  constructor(
    public visibility = new WatchableVisibilityPriority(
      WatchableVisibilityPriority.VISIBLE,
    ),
  ) {
    super();
    const { element } = this;
    element.classList.add("neuroglancer-tab-content");
  }

  disposed() {
    removeFromParent(this.element);
    super.disposed();
  }
}

export class OptionSpecification<T> extends RefCounted implements Trackable {
  changed = new NullarySignal();
  options = new Map<string, T>();
  optionsChanged = new NullarySignal();

  private selectedValue: string | undefined = undefined;
  private defaultValue: string | undefined = undefined;

  get value() {
    const { selectedValue } = this;
    if (selectedValue !== undefined) {
      return selectedValue;
    }
    return this.defaultValue;
  }

  set default(value: string | undefined) {
    if (this.defaultValue !== value) {
      this.defaultValue = value;
      this.changed.dispatch();
    }
  }

  get default() {
    return this.defaultValue;
  }

  set value(value: string | undefined) {
    if (value !== undefined && this.ready_ && !this.options.has(value)) {
      value = undefined;
    }
    const { selectedValue } = this;
    if (selectedValue !== value) {
      this.selectedValue = value;
      this.changed.dispatch();
    }
  }

  get validValue() {
    const value = this.selectedValue;
    if (value === undefined || !this.options.has(value)) {
      return this.defaultValue;
    }
    return value;
  }

  add(id: string, value: T) {
    const { options } = this;
    if (options.has(id)) {
      throw new Error(`Option already defined: ${JSON.stringify(id)}.`);
    }
    options.set(id, value);
    this.optionsChanged.dispatch();
    if (this.defaultValue === undefined) {
      this.default = id;
    }
  }

  remove(id: string) {
    const { options } = this;
    if (!options.has(id)) {
      throw new Error(`Option is not defined: ${JSON.stringify(id)}.`);
    }
    options.delete(id);
    this.optionsChanged.dispatch();
  }

  toJSON() {
    const { value, defaultValue } = this;
    if (value === defaultValue) {
      return undefined;
    }
    return value;
  }

  reset() {
    this.value = undefined;
  }

  ready_ = true;

  /**
   * When `ready` is `false`, the selected `value` may be set to an unknown option.
   */
  get ready() {
    return this.ready_;
  }

  set ready(value: boolean) {
    if (value !== this.ready_) {
      this.ready_ = value;
      if (value) {
        // eslint-disable-next-line no-self-assign
        this.value = this.value;
      }
      this.changed.dispatch();
    }
  }

  restoreState(obj: any) {
    if (typeof obj !== "string") {
      obj = undefined;
    }
    this.value = obj;
  }
}

export class StackView<TabId, TabType extends Tab = Tab> extends RefCounted {
  element = document.createElement("div");
  tabs = new Map<TabId, Owned<TabType>>();
  tabVisibilityChanged = new Signal<(id: TabId, visible: boolean) => void>();

  private displayedTab: TabId | undefined;

  get visible() {
    return this.visibility.visible;
  }

  private debouncedUpdateSelectedTab = this.registerCancellable(
    animationFrameDebounce(() => this.updateSelectedTab()),
  );

  flush() {
    this.debouncedUpdateSelectedTab.flush();
  }

  constructor(
    public getter: (id: TabId) => Owned<TabType>,
    public selected: WatchableValueInterface<TabId | undefined>,
    public visibility = new WatchableVisibilityPriority(
      WatchableVisibilityPriority.VISIBLE,
    ),
    public invalidateByDefault = false,
  ) {
    super();

    const { element } = this;
    element.className = "neuroglancer-stack-view";
    this.registerDisposer(
      visibility.changed.add(this.debouncedUpdateSelectedTab),
    );
    this.registerDisposer(
      selected.changed.add(this.debouncedUpdateSelectedTab),
    );
    this.updateSelectedTab();
  }

  invalidate(id: TabId) {
    const { tabs } = this;
    const tab = tabs.get(id);
    if (tab === undefined) {
      return;
    }
    tab.dispose();
    tabs.delete(id);
    if (id === this.displayedTab) {
      this.displayedTab = undefined;
      this.debouncedUpdateSelectedTab();
    }
  }

  private hideTab(id: TabId) {
    const tab = this.tabs.get(id);
    if (tab !== undefined) {
      tab.visibility.value = WatchableVisibilityPriority.IGNORED;
      tab.element.style.display = "none";
    }
    this.tabVisibilityChanged.dispatch(id, false);
  }

  private showTab(id: TabId) {
    const { tabs } = this;
    let tab = tabs.get(id);
    if (tab === undefined) {
      tab = this.getter(id);
      this.element.appendChild(tab.element);
      tabs.set(id, tab);
    }
    tab.element.style.display = "";
    tab.visibility.value = WatchableVisibilityPriority.VISIBLE;
    this.tabVisibilityChanged.dispatch(id, true);
  }

  private updateSelectedTab() {
    const { displayedTab } = this;
    const newTab = this.visible ? this.selected.value : undefined;
    if (
      newTab === displayedTab &&
      (newTab === undefined || this.tabs.has(newTab))
    ) {
      return;
    }
    if (displayedTab !== undefined) {
      this.hideTab(displayedTab);
    }
    if (this.invalidateByDefault) {
      this.invalidateAll();
    }
    this.displayedTab = newTab;
    if (newTab === undefined) {
      return;
    }
    this.showTab(newTab);
  }

  invalidateAll(predicate: ((id: TabId) => boolean) | undefined = undefined) {
    const { tabs } = this;
    for (const [id, tab] of tabs) {
      if (predicate?.(id)) continue;
      tabs.delete(id);
      tab.dispose();
    }
    this.debouncedUpdateSelectedTab();
  }

  disposed() {
    this.invalidateAll();
    removeFromParent(this.element);
    super.disposed();
  }
}

export class TabSpecification extends OptionSpecification<{
  label: string;
  order?: number;
  getter: () => Owned<Tab>;
  hidden?: WatchableValueInterface<boolean>;
}> {}

export interface TabViewOptions {
  makeTab: (id: string) => Tab;
  selectedTab: WatchableValueInterface<string | undefined>;
  tabs: WatchableValueChangeInterface<
    { id: string; label: string; hidden: boolean }[]
  >;
  handleTabElement?: (id: string, element: HTMLElement) => void;
}
