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

import { ImageUserLayer } from "#src/layer/image/index.js";
import type { AnnotationLayerState } from "#src/annotation/annotation_layer_state.js";
import type { AnnotationType } from "#src/annotation/index.js";
import type { ChunkManager } from "#src/chunk_manager/frontend.js";
import type {
  CoordinateSpace,
  CoordinateTransformSpecification,
} from "#src/coordinate_transform.js";
import {
  CoordinateSpaceCombiner,
  coordinateTransformSpecificationFromLegacyJson,
  emptyInvalidCoordinateSpace,
  isGlobalDimension,
  isLocalDimension,
  isLocalOrChannelDimension,
  TrackableCoordinateSpace,
} from "#src/coordinate_transform.js";
import type {
  DataSourceProviderRegistry,
  DataSourceSpecification,
  DataSubsource,
} from "#src/datasource/index.js";
import { makeEmptyDataSourceSpecification } from "#src/datasource/index.js";
import type { DisplayContext } from "#src/display_context.js";
import type { LoadedDataSubsource } from "#src/layer/layer_data_source.js";
import {
  LayerDataSource,
  layerDataSourceSpecificationFromJson,
} from "#src/layer/layer_data_source.js";
import type { DisplayDimensions } from "#src/navigation_state.js";
import {
  CoordinateSpacePlaybackVelocity,
  Position,
} from "#src/navigation_state.js";
import type { RenderLayerTransform } from "#src/render_coordinate_transform.js";
import type { RenderLayer } from "#src/renderlayer.js";
import type { VolumeType } from "#src/sliceview/volume/base.js";
import { TrackableBoolean } from "#src/trackable_boolean.js";
import type { WatchableValueInterface } from "#src/trackable_value.js";
import { UserLayerSidePanelsState } from "#src/ui/layer_side_panel_state.js";
import { LocalToolBinder, SelectedLegacyTool } from "#src/ui/tool.js";
import { gatherUpdate } from "#src/util/array.js";
import type { Borrowed, Owned } from "#src/util/disposable.js";
import { invokeDisposers, RefCounted } from "#src/util/disposable.js";
import {
  parseFixedLengthArray,
  verifyFiniteFloat,
  verifyInt,
  verifyObjectProperty,
  verifyOptionalObjectProperty,
  verifyString,
} from "#src/util/json.js";
import { MessageList } from "#src/util/message_list.js";
import type { AnyConstructor } from "#src/util/mixin.js";
import { NullarySignal } from "#src/util/signal.js";
import type { SignalBindingUpdater } from "#src/util/signal_binding_updater.js";
import { addSignalBinding } from "#src/util/signal_binding_updater.js";
import { Uint64 } from "#src/util/uint64.js";
import { kEmptyFloat32Vec } from "#src/util/vector.js";
import type { DependentViewContext } from "#src/widget/dependent_view_widget.js";
import type { Tab } from "#src/widget/tab_view.js";
import { TabSpecification } from "#src/widget/tab_view.js";

const TOOL_JSON_KEY = "tool";
const TOOL_BINDINGS_JSON_KEY = "toolBindings";
const LOCAL_POSITION_JSON_KEY = "localPosition";
const LOCAL_VELOCITY_JSON_KEY = "localVelocity";
const LOCAL_COORDINATE_SPACE_JSON_KEY = "localDimensions";
const SOURCE_JSON_KEY = "source";
const TRANSFORM_JSON_KEY = "transform";
const PICK_JSON_KEY = "pick";

export interface UserLayerSelectionState {
  generation: number;

  // If `false`, selection is not associated with a position.
  localPositionValid: boolean;
  localPosition: Float32Array;
  localCoordinateSpace: CoordinateSpace | undefined;

  annotationId: string | undefined;
  annotationType: AnnotationType | undefined;
  annotationBuffer: Uint8Array | undefined;
  annotationIndex: number | undefined;
  annotationCount: number | undefined;
  annotationSourceIndex: number | undefined;
  annotationSubsource: string | undefined;
  annotationSubsubsourceId: string | undefined;
  annotationPartIndex: number | undefined;

  value: any;
}

export interface UserLayerTab {
  id: string;
  label: string;
  order: number;
  getter: (layer: UserLayer) => Tab;
}

export const USER_LAYER_TABS: UserLayerTab[] = [];

export class UserLayer extends RefCounted {
  get localPosition() {
    return this.managedLayer.localPosition;
  }

  get localVelocity() {
    return this.managedLayer.localVelocity;
  }

  get localCoordinateSpaceCombiner() {
    return this.managedLayer.localCoordinateSpaceCombiner;
  }

  get localCoordinateSpace() {
    return this.managedLayer.localCoordinateSpace;
  }

  static type: string;
  static typeAbbreviation: string;

  get type() {
    return (this.constructor as typeof UserLayer).type;
  }

  static supportsPickOption = false;

  pick = new TrackableBoolean(true, true);

  selectionState: UserLayerSelectionState;

  messages = new MessageList();

  initializeSelectionState(state: this["selectionState"]) {
    state.generation = -1;
    state.localPositionValid = false;
    state.localPosition = kEmptyFloat32Vec;
    state.localCoordinateSpace = undefined;
    state.annotationId = undefined;
    state.annotationType = undefined;
    state.annotationBuffer = undefined;
    state.annotationIndex = undefined;
    state.annotationCount = undefined;
    state.annotationSourceIndex = undefined;
    state.annotationSubsource = undefined;
    state.annotationPartIndex = undefined;
    state.value = undefined;
  }

  resetSelectionState(state: this["selectionState"]) {
    state.localPositionValid = false;
    state.annotationId = undefined;
    state.value = undefined;
  }

  selectionStateFromJson(state: this["selectionState"], json: any) {
    const localCoordinateSpace = (state.localCoordinateSpace =
      this.localCoordinateSpace.value);
    const { rank } = localCoordinateSpace;
    if (rank !== 0) {
      const localPosition = verifyOptionalObjectProperty(
        json,
        LOCAL_POSITION_JSON_KEY,
        (positionObj) =>
          parseFixedLengthArray(
            new Float32Array(rank),
            positionObj,
            verifyFiniteFloat,
          ),
      );
      if (localPosition === undefined) {
        state.localPositionValid = false;
      } else {
        state.localPositionValid = true;
        state.localPosition = localPosition;
      }
    }
    const annotationId = (state.annotationId = verifyOptionalObjectProperty(
      json,
      "annotationId",
      verifyString,
    ));
    if (annotationId !== undefined) {
      state.annotationSourceIndex = verifyOptionalObjectProperty(
        json,
        "annotationSource",
        verifyInt,
        0,
      );
      state.annotationPartIndex = verifyOptionalObjectProperty(
        json,
        "annotationPart",
        verifyInt,
      );
      state.annotationSubsource = verifyOptionalObjectProperty(
        json,
        "annotationSubsource",
        verifyString,
      );
    }

    state.value = json.value;
  }

  // Derived classes should override.
  displaySelectionState(
    state: this["selectionState"],
    parent: HTMLElement,
    context: DependentViewContext,
  ) {
    state;
    parent;
    context;
    return false;
  }

  selectionStateToJson(state: this["selectionState"], forPython: boolean): any {
    forPython;
    const json: any = {};
    if (state.localPositionValid) {
      const { localPosition } = state;
      if (localPosition.length > 0) {
        json.localPosition = Array.from(localPosition);
      }
    }
    if (state.annotationId !== undefined) {
      json.annotationId = state.annotationId;
      json.annotationPart = state.annotationPartIndex;
      json.annotationSource = state.annotationSourceIndex;
      json.annotationSubsource = state.annotationSubsource;
    }
    if (state.value != null) {
      json.value = state.value;
    }
    return json;
  }

  captureSelectionState(
    state: this["selectionState"],
    mouseState: MouseSelectionState,
  ) {
    state.localCoordinateSpace = this.localCoordinateSpace.value;
    const curLocalPosition = this.localPosition.value;
    const { localPosition } = state;
    if (localPosition.length !== curLocalPosition.length) {
      state.localPosition = curLocalPosition.slice();
    } else {
      localPosition.set(curLocalPosition);
    }
    state.localPositionValid = true;
    state.value = this.getValueAt(mouseState.position, mouseState);
  }

  copySelectionState(
    dest: this["selectionState"],
    source: this["selectionState"],
  ) {
    dest.generation = source.generation;
    dest.localPositionValid = source.localPositionValid;
    dest.localCoordinateSpace = source.localCoordinateSpace;
    const curLocalPosition = source.localPosition;
    const { localPosition } = dest;
    if (localPosition.length !== curLocalPosition.length) {
      dest.localPosition = curLocalPosition.slice();
    } else {
      dest.localPosition.set(curLocalPosition);
    }
    dest.annotationId = source.annotationId;
    dest.annotationType = source.annotationType;
    dest.annotationBuffer = source.annotationBuffer;
    dest.annotationIndex = source.annotationIndex;
    dest.annotationCount = source.annotationCount;
    dest.annotationSourceIndex = source.annotationSourceIndex;
    dest.annotationSubsource = source.annotationSubsource;
    dest.annotationPartIndex = source.annotationPartIndex;
    dest.value = source.value;
  }

  layersChanged = new NullarySignal();
  readyStateChanged = new NullarySignal();
  specificationChanged = new NullarySignal();
  renderLayers = new Array<RenderLayer>();
  private loadingCounter = 1;
  get isReady() {
    return this.loadingCounter === 0;
  }

  tabs = this.registerDisposer(new TabSpecification());
  panels = new UserLayerSidePanelsState(this);
  tool = this.registerDisposer(new SelectedLegacyTool(this));
  toolBinder = this.registerDisposer(
    new LocalToolBinder(this, this.manager.root.toolBinder),
  );

  dataSourcesChanged = new NullarySignal();
  dataSources: LayerDataSource[] = [];

  get manager() {
    return this.managedLayer.manager;
  }

  constructor(public managedLayer: Borrowed<ManagedUserLayer>) {
    super();
    this.localCoordinateSpaceCombiner.includeDimensionPredicate =
      isLocalOrChannelDimension;
    this.tabs.changed.add(this.specificationChanged.dispatch);
    this.panels.specificationChanged.add(this.specificationChanged.dispatch);
    this.tool.changed.add(this.specificationChanged.dispatch);
    this.toolBinder.changed.add(this.specificationChanged.dispatch);
    this.localPosition.changed.add(this.specificationChanged.dispatch);
    this.pick.changed.add(this.specificationChanged.dispatch);
    this.pick.changed.add(this.layersChanged.dispatch);
    this.dataSourcesChanged.add(this.specificationChanged.dispatch);
    this.dataSourcesChanged.add(() => this.updateDataSubsourceActivations());
    this.messages.changed.add(this.layersChanged.dispatch);
    for (const tab of USER_LAYER_TABS) {
      this.tabs.add(tab.id, {
        label: tab.label,
        order: tab.order,
        getter: () => tab.getter(this),
      });
    }
  }

  canAddDataSource() {
    return true;
  }

  addDataSource(spec: DataSourceSpecification | undefined) {
    const layerDataSource = new LayerDataSource(this, spec);
    this.dataSources.push(layerDataSource);
    this.dataSourcesChanged.dispatch();
    return layerDataSource;
  }

  // Should be overridden by derived classes.
  activateDataSubsources(subsources: Iterable<LoadedDataSubsource>): void {
    subsources;
  }

  updateDataSubsourceActivations() {
    function* getDataSubsources(
      this: UserLayer,
    ): Iterable<LoadedDataSubsource> {
      for (const dataSource of this.dataSources) {
        const { loadState } = dataSource;
        if (loadState === undefined || loadState.error !== undefined) continue;
        for (const subsource of loadState.subsources) {
          if (subsource.enabled) {
            yield subsource;
          } else {
            const { activated } = subsource;
            subsource.messages.clearMessages();
            if (activated !== undefined) {
              activated.dispose();
              subsource.activated = undefined;
              loadState.activatedSubsourcesChanged.dispatch();
            }
          }
        }
      }
    }
    this.activateDataSubsources(getDataSubsources.call(this));
  }

  private decrementLoadingCounter() {
    if (--this.loadingCounter === 0) {
      this.readyStateChanged.dispatch();
    }
  }

  markLoading() {
    const localRetainer = this.localCoordinateSpaceCombiner.retain();
    const globalRetainer = this.manager.root.coordinateSpaceCombiner.retain();
    if (++this.loadingCounter === 1) {
      this.readyStateChanged.dispatch();
    }
    const disposer = () => {
      localRetainer();
      globalRetainer();
      this.decrementLoadingCounter();
    };
    return disposer;
  }

  addCoordinateSpace(
    coordinateSpace: WatchableValueInterface<CoordinateSpace>,
  ) {
    const globalBinding =
      this.manager.root.coordinateSpaceCombiner.bind(coordinateSpace);
    const localBinding =
      this.localCoordinateSpaceCombiner.bind(coordinateSpace);
    return () => {
      globalBinding();
      localBinding();
    };
  }

  initializationDone() {
    const selectionState = (this.selectionState = {} as any);
    this.initializeSelectionState(selectionState);
    this.decrementLoadingCounter();
  }

  getLegacyDataSourceSpecifications(
    sourceSpec: string | undefined,
    layerSpec: any,
    legacyTransform: CoordinateTransformSpecification | undefined,
    explicitSpecs: DataSourceSpecification[],
  ): DataSourceSpecification[] {
    layerSpec;
    explicitSpecs;
    if (sourceSpec === undefined) return [];
    return [layerDataSourceSpecificationFromJson(sourceSpec, legacyTransform)];
  }

  getDataSourceSpecifications(layerSpec: any): DataSourceSpecification[] {
    let legacySpec: any = undefined;
    let specs = verifyObjectProperty(
      layerSpec,
      SOURCE_JSON_KEY,
      (sourcesObj) => {
        if (Array.isArray(sourcesObj)) {
          return sourcesObj.map((source) =>
            layerDataSourceSpecificationFromJson(source),
          );
        }
        if (typeof sourcesObj === "object") {
          return [layerDataSourceSpecificationFromJson(sourcesObj)];
        }
        legacySpec = sourcesObj;
        return [];
      },
    );
    const legacyTransform = verifyObjectProperty(
      layerSpec,
      TRANSFORM_JSON_KEY,
      coordinateTransformSpecificationFromLegacyJson,
    );
    specs.push(
      ...this.getLegacyDataSourceSpecifications(
        legacySpec,
        layerSpec,
        legacyTransform,
        specs,
      ),
    );
    specs = specs.filter((spec) => spec.url);
    if (specs.length === 0) {
      specs.push(makeEmptyDataSourceSpecification());
    }
    return specs;
  }

  restoreState(specification: any) {
    this.tool.restoreState(specification[TOOL_JSON_KEY]);
    this.panels.restoreState(specification);
    this.localCoordinateSpace.restoreState(
      specification[LOCAL_COORDINATE_SPACE_JSON_KEY],
    );
    this.localPosition.restoreState(specification[LOCAL_POSITION_JSON_KEY]);
    this.localVelocity.restoreState(specification[LOCAL_VELOCITY_JSON_KEY]);
    this.toolBinder.restoreState(specification[TOOL_BINDINGS_JSON_KEY]);
    if ((this.constructor as typeof UserLayer).supportsPickOption) {
      this.pick.restoreState(specification[PICK_JSON_KEY]);
    }
    for (const spec of this.getDataSourceSpecifications(specification)) {
      this.addDataSource(spec);
    }
  }

  addRenderLayer(layer: Owned<RenderLayer>) {
    this.renderLayers.push(layer);
    const { layersChanged } = this;
    layer.layerChanged.add(layersChanged.dispatch);
    layer.userLayer = this;
    layersChanged.dispatch();
    return () => this.removeRenderLayer(layer);
  }

  removeRenderLayer(layer: RenderLayer) {
    const { renderLayers, layersChanged } = this;
    const index = renderLayers.indexOf(layer);
    if (index === -1) {
      throw new Error("Attempted to remove invalid RenderLayer");
    }
    renderLayers.splice(index, 1);
    layer.layerChanged.remove(layersChanged.dispatch);
    layer.userLayer = undefined;
    layer.dispose();
    layersChanged.dispatch();
  }

  disposed() {
    const { layersChanged } = this;
    invokeDisposers(this.dataSources);
    for (const layer of this.renderLayers) {
      layer.layerChanged.remove(layersChanged.dispatch);
      layer.dispose();
    }
    this.renderLayers.length = 0;
    super.disposed();
  }

  getValueAt(position: Float32Array, pickState: PickState) {
    let result: any;
    const { renderLayers } = this;
    const { pickedRenderLayer } = pickState;
    if (
      pickedRenderLayer !== null &&
      renderLayers.indexOf(pickedRenderLayer) !== -1
    ) {
      result = pickedRenderLayer.transformPickedValue(pickState);
      result = this.transformPickedValue(result);
      if (result != null) return result;
    }
    for (const layer of renderLayers) {
      result = layer.getValueAt(position);
      if (result != null) {
        break;
      }
    }
    return this.transformPickedValue(result);
  }

  transformPickedValue(value: any) {
    return value;
  }

  toJSON(): any {
    return {
      type: this.type,
      [SOURCE_JSON_KEY]: dataSourcesToJson(this.dataSources),
      [TOOL_JSON_KEY]: this.tool.toJSON(),
      [TOOL_BINDINGS_JSON_KEY]: this.toolBinder.toJSON(),
      [LOCAL_COORDINATE_SPACE_JSON_KEY]: this.localCoordinateSpace.toJSON(),
      [LOCAL_POSITION_JSON_KEY]: this.localPosition.toJSON(),
      [LOCAL_VELOCITY_JSON_KEY]: this.localVelocity.toJSON(),
      [PICK_JSON_KEY]: this.pick.toJSON(),
      ...this.panels.toJSON(),
    };
  }

  // Derived classes should override.
  handleAction(_action: string, _context: LayerActionContext): void {}

  selectedValueToJson(value: any) {
    return value;
  }

  selectedValueFromJson(json: any) {
    return json;
  }

  setLayerPosition(
    modelTransform: RenderLayerTransform,
    layerPosition: Float32Array,
  ) {
    const { globalPosition } = this.manager.root;
    const { localPosition } = this;
    gatherUpdate(
      globalPosition.value,
      layerPosition,
      modelTransform.globalToRenderLayerDimensions,
    );
    gatherUpdate(
      localPosition.value,
      layerPosition,
      modelTransform.localToRenderLayerDimensions,
    );
    localPosition.changed.dispatch();
    globalPosition.changed.dispatch();
  }
}

export class ManagedUserLayer extends RefCounted {
  localCoordinateSpace = new TrackableCoordinateSpace();
  localCoordinateSpaceCombiner = new CoordinateSpaceCombiner(
    this.localCoordinateSpace,
    isLocalDimension,
  );
  localPosition = this.registerDisposer(
    new Position(this.localCoordinateSpace),
  );
  localVelocity = this.registerDisposer(
    new CoordinateSpacePlaybackVelocity(this.localCoordinateSpace),
  );

  readyStateChanged = new NullarySignal();
  layerChanged = new NullarySignal();
  specificationChanged = new NullarySignal();
  containers = new Set<Borrowed<LayerManager>>();
  private layer_: UserLayer | null = null;
  get layer() {
    return this.layer_;
  }
  private unregisterUserLayer: (() => void) | undefined;

  /**
   * If layer is not null, tranfers ownership of a reference.
   */
  set layer(layer: UserLayer | null) {
    const oldLayer = this.layer_;
    if (oldLayer != null) {
      this.unregisterUserLayer!();
      oldLayer.dispose();
    }
    this.layer_ = layer;
    if (layer != null) {
      const removers = [
        layer.layersChanged.add(this.layerChanged.dispatch),
        layer.readyStateChanged.add(this.readyStateChanged.dispatch),
        layer.specificationChanged.add(this.specificationChanged.dispatch),
      ];
      this.unregisterUserLayer = () => {
        removers.forEach((x) => x());
      };
      this.readyStateChanged.dispatch();
      this.layerChanged.dispatch();
    }
  }

  isReady() {
    const { layer } = this;
    return layer?.isReady;
  }

  private name_: string;

  get name() {
    return this.name_;
  }

  set name(value: string) {
    if (value !== this.name_) {
      this.name_ = value;
      this.layerChanged.dispatch();
    }
  }

  visible = true;
  archived = false;

  /**
   * If layer is not null, tranfers ownership of a reference.
   */
  constructor(
    name: string,
    public manager: Borrowed<LayerListSpecification>,
  ) {
    super();
    this.name_ = name;
  }

  setVisible(value: boolean) {
    return;
  }

  disposed() {
    this.layer = null;
    super.disposed();
  }
}

export class LayerManager extends RefCounted {
  managedLayers = new Array<Owned<ManagedUserLayer>>();
  layerSet = new Set<Borrowed<ManagedUserLayer>>();
  layersChanged = new NullarySignal();
  readyStateChanged = new NullarySignal();
  specificationChanged = new NullarySignal();

  constructor() {
    super();
  }

  private updateSignalBindings(
    layer: ManagedUserLayer,
    callback: SignalBindingUpdater<() => void>,
  ) {
    callback(layer.layerChanged, this.layersChanged.dispatch);
    callback(layer.readyStateChanged, this.readyStateChanged.dispatch);
    callback(layer.specificationChanged, this.specificationChanged.dispatch);
  }

  /**
   * Assumes ownership of an existing reference to managedLayer.
   */
  addManagedLayer(managedLayer: ManagedUserLayer, index?: number | undefined) {
    this.updateSignalBindings(managedLayer, addSignalBinding);
    this.layerSet.add(managedLayer);
    managedLayer.containers.add(this);
    if (index === undefined) {
      index = this.managedLayers.length;
    }
    this.managedLayers.splice(index, 0, managedLayer);
    this.layersChanged.dispatch();
    this.readyStateChanged.dispatch();
    return managedLayer;
  }

  *readyRenderLayers() {
    for (const managedUserLayer of this.managedLayers) {
      if (!managedUserLayer.visible || !managedUserLayer.layer) {
        continue;
      }
      yield* managedUserLayer.layer.renderLayers;
    }
  }

  disposed() {
    super.disposed();
  }

  getLayerByName(name: string) {
    return this.managedLayers.find((x) => x.name === name);
  }

  getUniqueLayerName(name: string) {
    let suggestedName = name;
    let suffix = 0;
    while (this.getLayerByName(suggestedName) !== undefined) {
      suggestedName = name + ++suffix;
    }
    return suggestedName;
  }

  has(layer: Borrowed<ManagedUserLayer>) {
    return this.layerSet.has(layer);
  }
}

export class MouseSelectionState {
  changed = new NullarySignal();
  coordinateSpace: CoordinateSpace = emptyInvalidCoordinateSpace;
  position: Float32Array = kEmptyFloat32Vec;
  unsnappedPosition: Float32Array = kEmptyFloat32Vec;
  active = false;
  displayDimensions: DisplayDimensions | undefined = undefined;
  pickedRenderLayer: RenderLayer | null = null;
  pickedValue = new Uint64(0, 0);
  pickedOffset = 0;
  pickedAnnotationLayer: AnnotationLayerState | undefined = undefined;
  pickedAnnotationId: string | undefined = undefined;
  pickedAnnotationBuffer: ArrayBuffer | undefined = undefined;
  // Base offset into `pickedAnnotationBuffer` of the `pickedAnnotationCount` serialized annotations
  // of `pickedAnnotationType`.
  pickedAnnotationBufferBaseOffset: number | undefined = undefined;
  // Index (out of a total of `pickedAnnotationCount`) of the picked annotation.
  pickedAnnotationIndex: number | undefined = undefined;
  pickedAnnotationCount: number | undefined = undefined;
  pickedAnnotationType: AnnotationType | undefined = undefined;
  pageX: number;
  pageY: number;

  private forcerFunction: (() => void) | undefined = undefined;

  removeForcer(forcer: () => void) {
    if (forcer === this.forcerFunction) {
      this.forcerFunction = undefined;
      this.setActive(false);
    }
  }

  setForcer(forcer: (() => void) | undefined) {
    this.forcerFunction = forcer;
    if (forcer === undefined) {
      this.setActive(false);
    }
  }

  updateUnconditionally(): boolean {
    const { forcerFunction } = this;
    if (forcerFunction === undefined) {
      return false;
    }
    forcerFunction();
    return this.active;
  }

  setActive(value: boolean) {
    if (this.active !== value || value === true) {
      this.active = value;
      this.changed.dispatch();
    }
  }
}

export class LayerSelectedValues extends RefCounted {
  changed = new NullarySignal();
  needsUpdate = true;
  constructor(
    public layerManager: LayerManager,
    public mouseState: MouseSelectionState,
  ) {
    super();
    this.registerDisposer(
      mouseState.changed.add(() => {
        this.handleChange();
      }),
    );
    this.registerDisposer(
      layerManager.layersChanged.add(() => {
        this.handleLayerChange();
      }),
    );
  }

  /**
   * This should be called when the layer data may have changed, due to the set of managed layers
   * changing or new data having been received.
   */
  handleLayerChange() {
    if (this.mouseState.active) {
      this.handleChange();
    }
  }

  handleChange() {
    this.needsUpdate = true;
    this.changed.dispatch();
  }

  update() {
    if (!this.needsUpdate) {
      return;
    }
    this.needsUpdate = false;
    const mouseState = this.mouseState;
    const generation = this.changed.count;
    if (mouseState.active) {
      for (const layer of this.layerManager.managedLayers) {
        const userLayer = layer.layer;
        if (layer.visible && userLayer !== null) {
          const { selectionState } = userLayer;
          userLayer.resetSelectionState(selectionState);
          selectionState.generation = generation;
          userLayer.captureSelectionState(selectionState, mouseState);
        }
      }
    }
  }

  get<T extends UserLayer>(userLayer: T): T["selectionState"] | undefined {
    this.update();
    const { selectionState } = userLayer;
    if (selectionState.generation !== this.changed.count) return undefined;
    return selectionState;
  }

  toJSON() {
    this.update();
    const result: { [key: string]: any } = {};
    for (const layer of this.layerManager.managedLayers) {
      const userLayer = layer.layer;
      if (userLayer) {
        const state = this.get(userLayer);
        if (state !== undefined) {
          result[layer.name] = userLayer.selectionStateToJson(state, true);
        }
      }
    }
    return result;
  }
}

export abstract class LayerListSpecification extends RefCounted {
  changed = new NullarySignal();

  abstract dataSourceProviderRegistry: Borrowed<DataSourceProviderRegistry>;
  abstract layerManager: Borrowed<LayerManager>;
  abstract chunkManager: Borrowed<ChunkManager>;
  abstract layerSelectedValues: Borrowed<LayerSelectedValues>;

  abstract readonly root: TopLevelLayerListSpecification;

  abstract add(
    layer: Owned<ManagedUserLayer>,
    index?: number | undefined,
  ): void;
}

export class TopLevelLayerListSpecification extends LayerListSpecification {
  get root() {
    return this;
  }

  coordinateSpaceCombiner = new CoordinateSpaceCombiner(
    this.coordinateSpace,
    isGlobalDimension,
  );

  constructor(
    public display: DisplayContext,
    public dataSourceProviderRegistry: DataSourceProviderRegistry,
    public layerManager: LayerManager,
    public chunkManager: ChunkManager,
    public layerSelectedValues: any,
    public coordinateSpace: WatchableValueInterface<CoordinateSpace>,
  ) {
    super();
  }

  add(layer: ManagedUserLayer, index?: number | undefined) {
    if (this.layerManager.managedLayers.indexOf(layer) === -1) {
      layer.name = this.layerManager.getUniqueLayerName(layer.name);
    }
    this.layerManager.addManagedLayer(layer, index);
  }
}

export type UserLayerConstructor<LayerType extends UserLayer = UserLayer> =
  typeof UserLayer & AnyConstructor<LayerType>;

export const layerTypes = new Map<string, UserLayerConstructor>();
const volumeLayerTypes = new Map<VolumeType, UserLayerConstructor>();
export interface LayerTypeGuess {
  // Layer constructor
  layerConstructor: UserLayerConstructor;
  // Priority of the guess.  Higher values take precedence.
  priority: number;
}
export type LayerTypeDetector = (
  subsource: DataSubsource,
) => LayerTypeGuess | undefined;
const layerTypeDetectors: LayerTypeDetector[] = [
  (subsource) => {
    const { volume } = subsource;
    if (volume === undefined) return undefined;
    const layerConstructor = volumeLayerTypes.get(volume.volumeType);
    if (layerConstructor === undefined) return undefined;
    return { layerConstructor, priority: 0 };
  },
];

export function registerLayerType(
  layerConstructor: UserLayerConstructor,
  name: string = layerConstructor.type,
) {
  layerTypes.set(name, layerConstructor);
}

export function registerLayerTypeDetector(detector: LayerTypeDetector) {
  layerTypeDetectors.push(detector);
}

export function registerVolumeLayerType(
  volumeType: VolumeType,
  layerConstructor: UserLayerConstructor,
) {
  volumeLayerTypes.set(volumeType, layerConstructor);
}

export function addNewLayer(manager: Borrowed<LayerListSpecification>) {
  const managedLayer = new ManagedUserLayer("new layer", manager);
  managedLayer.layer = new ImageUserLayer(managedLayer);
  managedLayer.archived = false;
  managedLayer.visible = true;

  const source = "zarr2://http://localhost:9000/scroll.zarr/";
  managedLayer.layer.restoreState({ type: "new", source });

  manager.add(managedLayer);
}