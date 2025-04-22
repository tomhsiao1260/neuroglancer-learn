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
import { kEmptyFloat32Vec } from "#src/util/vector.js";
import type { Disposable } from '#src/util/disposable.js';

export class UserLayer extends RefCounted {
  localCoordinateSpace = new TrackableCoordinateSpace();
  localCoordinateSpaceCombiner = new CoordinateSpaceCombiner(
    this.localCoordinateSpace,
    () => true,
  );
  localPosition = this.registerDisposer(
    new Position(this.localCoordinateSpace),
  );

  // get localPosition() {
  //   return this.managedLayer.localPosition;
  // }

  // get localCoordinateSpaceCombiner() {
  //   return this.managedLayer.localCoordinateSpaceCombiner;
  // }

  // get localCoordinateSpace() {
  //   return this.managedLayer.localCoordinateSpace;
  // }

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
  // localCoordinateSpace = new TrackableCoordinateSpace();
  // localCoordinateSpaceCombiner = new CoordinateSpaceCombiner(
  //   this.localCoordinateSpace,
  //   () => true,
  // );
  // localPosition = this.registerDisposer(
  //   new Position(this.localCoordinateSpace),
  // );
  layerChanged = new NullarySignal();

  private layer_: UserLayer | null = null;
  get layer() {
    return this.layer_;
  }

  set layer(layer: UserLayer | null) {
    this.layer_ = layer;
    if (layer != null) {
      layer.layersChanged.add(this.layerChanged.dispatch),
      this.layerChanged.dispatch();
    }
  }

  constructor(
    public manager: Borrowed<LayerListSpecification>,
  ) {
    super();
  }
}

export class LayerManager extends RefCounted {
  managedLayer: any;
  layersChanged = new NullarySignal();

  constructor() {
    super();
  }

  addManagedLayer(managedLayer: ManagedUserLayer) {
    managedLayer.layerChanged.add(this.layersChanged.dispatch)

    this.managedLayer = managedLayer;
    this.layersChanged.dispatch();
  }

  *readyRenderLayers() {
    yield* this.managedLayer.layer.renderLayers;
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

  setForcer(forcer: (() => void) | undefined) {
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
