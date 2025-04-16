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

import type {
  CoordinateSpace,
} from "#src/coordinate_transform.js";
import {
  CoordinateSpaceCombiner,
  emptyInvalidCoordinateSpace,
  isLocalOrChannelDimension,
  TrackableCoordinateSpace,
} from "#src/coordinate_transform.js";
import type {
  DataSourceSpecification,
} from "#src/datasource/index.js";
import type { LoadedDataSubsource } from "#src/layer/layer_data_source.js";
import {
  LayerDataSource,
} from "#src/layer/layer_data_source.js";
import {
  Position,
} from '#src/navigation_state.js';
import type { RenderLayer } from "#src/renderlayer.js";
import type { WatchableValueInterface } from "#src/trackable_value.js";
import type { Borrowed, Owned } from "#src/util/disposable.js";
import { RefCounted } from "#src/util/disposable.js";
import { MessageList } from "#src/util/message_list.js";
import { NullarySignal } from "#src/util/signal.js";
import type { SignalBindingUpdater } from "#src/util/signal_binding_updater.js";
import { addSignalBinding } from "#src/util/signal_binding_updater.js";
import { kEmptyFloat32Vec } from "#src/util/vector.js";
import type { Disposable } from '#src/util/disposable.js';

export class UserLayer extends RefCounted {
  get localPosition() {
    return this.managedLayer.localPosition;
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

  messages = new MessageList();

  layersChanged = new NullarySignal();
  readyStateChanged = new NullarySignal();
  specificationChanged = new NullarySignal();
  renderLayers = new Array<RenderLayer>();

  dataSourcesChanged = new NullarySignal();
  dataSources: LayerDataSource[] = [];

  get manager() {
    return this.managedLayer.manager;
  }

  constructor(public managedLayer: Borrowed<ManagedUserLayer>) {
    super();
    this.localCoordinateSpaceCombiner.includeDimensionPredicate =
      isLocalOrChannelDimension;
    this.localPosition.changed.add(this.specificationChanged.dispatch);
    this.dataSourcesChanged.add(this.specificationChanged.dispatch);
    this.dataSourcesChanged.add(() => this.updateDataSubsourceActivations());
    this.messages.changed.add(this.layersChanged.dispatch);
    this.manager.coordinateSpaceCombiner = new CoordinateSpaceCombiner(
      this.manager.coordinateSpace,
      () => true,
    );
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

  addCoordinateSpace(
    coordinateSpace: WatchableValueInterface<CoordinateSpace>,
  ) {
    const globalBinding =
      this.manager.coordinateSpaceCombiner.bind(coordinateSpace);
    const localBinding =
      this.localCoordinateSpaceCombiner.bind(coordinateSpace);
    return () => {
      globalBinding();
      localBinding();
    };
  }

  getDataSourceSpecifications(layerSpec: any): DataSourceSpecification[] {
    const specs = []
    specs.push({
      enableDefaultSubsources: true,
      subsources: new Map(),
      transform: undefined,
      url:  "zarr2://http://localhost:9000/scroll.zarr/"
    })
    return specs;
  }

  restoreState(specification: any) {
    this.localCoordinateSpace.restoreState(
      specification[LOCAL_COORDINATE_SPACE_JSON_KEY],
    );
    this.localPosition.restoreState(specification[LOCAL_POSITION_JSON_KEY]);
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
  }
}

export class ManagedUserLayer extends RefCounted {
  localCoordinateSpace = new TrackableCoordinateSpace();
  localCoordinateSpaceCombiner = new CoordinateSpaceCombiner(
    this.localCoordinateSpace,
    () => true,
  );
  localPosition = this.registerDisposer(
    new Position(this.localCoordinateSpace),
  );
  readyStateChanged = new NullarySignal();
  layerChanged = new NullarySignal();
  containers = new Set<Borrowed<LayerManager>>();

  private layer_: UserLayer | null = null;
  get layer() {
    return this.layer_;
  }

  /**
   * If layer is not null, tranfers ownership of a reference.
   */
  set layer(layer: UserLayer | null) {
    this.layer_ = layer;
    if (layer != null) {
      layer.layersChanged.add(this.layerChanged.dispatch),
      layer.readyStateChanged.add(this.readyStateChanged.dispatch),
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
}

export class LayerManager extends RefCounted {
  managedLayers = new Array<Owned<ManagedUserLayer>>();
  layerSet = new Set<Borrowed<ManagedUserLayer>>();
  layersChanged = new NullarySignal();
  readyStateChanged = new NullarySignal();

  constructor() {
    super();
  }

  private updateSignalBindings(
    layer: ManagedUserLayer,
    callback: SignalBindingUpdater<() => void>,
  ) {
    callback(layer.layerChanged, this.layersChanged.dispatch);
    callback(layer.readyStateChanged, this.readyStateChanged.dispatch);
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
  pageX: number;
  pageY: number;

  private forcerFunction: (() => void) | undefined = undefined;

  setForcer(forcer: (() => void) | undefined) {
    this.forcerFunction = forcer;
    if (forcer === undefined) {
      this.setActive(false);
    }
  }

  setActive(value: boolean) {
    if (this.active !== value || value === true) {
      this.active = value;
      this.changed.dispatch();
    }
  }
}

export interface LayerListSpecification extends Disposable {
  coordinateSpace: WatchableValueInterface<CoordinateSpace>;
  coordinateSpaceCombiner: CoordinateSpaceCombiner;
  root: {
    globalPosition: Position;
  };
  dispose(): void;
}

const LOCAL_POSITION_JSON_KEY = "localPosition";
const LOCAL_COORDINATE_SPACE_JSON_KEY = "localDimensions";
