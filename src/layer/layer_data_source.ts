/**
 * @license
 * Copyright 2019 Google Inc.
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
} from "#src/state/coordinate_transform.js";
import {
  WatchableCoordinateSpaceTransform,
} from "#src/state/coordinate_transform.js";
import type {
  DataSource,
  DataSourceSpecification,
  DataSubsourceEntry,
  DataSubsourceSpecification,
} from "#src/datasource/index.js";
import type { UserLayer } from "#src/layer/index.js";
import { getWatchableRenderLayerTransform } from "#src/render/render_coordinate_transform.js";
import type { RenderLayer } from "#src/render/renderlayer.js";
import type { WatchableValueInterface } from "#src/state/trackable_value.js";
import { arraysEqual } from "#src/util/array.js";
import { CancellationTokenSource } from "#src/util/cancellation.js";
import type { Borrowed, Owned } from "#src/util/disposable.js";
import { RefCounted } from "#src/util/disposable.js";
import * as matrix from "#src/util/matrix.js";
import { MessageList, MessageSeverity } from "#src/util/message_list.js";
import { NullarySignal } from "#src/util/signal.js";

export class LoadedDataSubsource {
  subsourceToModelSubspaceTransform: Float32Array;
  modelSubspaceDimensionIndices: number[];
  enabled: boolean;
  activated: RefCounted | undefined = undefined;
  guardValues: any[] = [];
  messages = new MessageList();
  isActiveChanged = new NullarySignal();
  constructor(
    public loadedDataSource: LoadedLayerDataSource,
    public subsourceEntry: DataSubsourceEntry,
    public subsourceSpec: DataSubsourceSpecification | undefined,
    public subsourceIndex: number,
    enableDefaultSubsources: boolean,
  ) {
    let enabled: boolean;
    if (subsourceSpec === undefined || subsourceSpec.enabled === undefined) {
      enabled = subsourceEntry.default && enableDefaultSubsources;
    } else {
      enabled = subsourceSpec.enabled;
    }
    const modelRank = loadedDataSource.dataSource.modelTransform.sourceRank;
    let { modelSubspaceDimensionIndices } = subsourceEntry;
    if (modelSubspaceDimensionIndices === undefined) {
      modelSubspaceDimensionIndices = new Array<number>(modelRank);
      for (let i = 0; i < modelRank; ++i) {
        modelSubspaceDimensionIndices[i] = i;
      }
    }
    const {
      subsourceToModelSubspaceTransform = matrix.createIdentity(
        Float32Array,
        modelSubspaceDimensionIndices.length + 1,
      ),
    } = subsourceEntry;
    this.enabled = enabled;
    this.subsourceToModelSubspaceTransform = subsourceToModelSubspaceTransform;
    this.modelSubspaceDimensionIndices = modelSubspaceDimensionIndices;
    this.isActiveChanged.add(
      loadedDataSource.activatedSubsourcesChanged.dispatch,
    );
  }

  activate(callback: (refCounted: RefCounted) => void, ...guardValues: any[]) {
    this.messages.clearMessages();
    if (this.activated !== undefined) {
      if (arraysEqual(guardValues, this.guardValues)) return;
      this.activated.dispose();
    }
    this.guardValues = guardValues;
    const activated = (this.activated = new RefCounted());
    callback(activated);
    this.isActiveChanged.dispatch();
  }

  deactivate(error: string) {
    this.messages.clearMessages();
    this.messages.addMessage({
      severity: MessageSeverity.error,
      message: error,
    });
    const { activated } = this;
    if (activated === undefined) return;
    this.activated = undefined;
    activated.dispose();
    this.isActiveChanged.dispatch();
  }

  addRenderLayer(renderLayer: Owned<RenderLayer>) {
    const activated = this.activated!;
    activated.registerDisposer(
      this.loadedDataSource.layer.addRenderLayer(renderLayer),
    );
    activated.registerDisposer(this.messages.addChild(renderLayer.messages));
  }

  getRenderLayerTransform(
    channelCoordinateSpace?: WatchableValueInterface<CoordinateSpace>,
  ) {
    const activated = this.activated!;
    const { layer, transform } = this.loadedDataSource;
    return activated.registerDisposer(
      getWatchableRenderLayerTransform(
        layer.manager.coordinateSpace,
        layer.localPosition.coordinateSpace,
        transform,
        this,
        channelCoordinateSpace,
      ),
    );
  }
}

export class LoadedLayerDataSource extends RefCounted {
  error = undefined;
  enabledSubsourcesChanged = new NullarySignal();
  activatedSubsourcesChanged = new NullarySignal();
  messages = new MessageList();
  transform: WatchableCoordinateSpaceTransform;
  subsources: LoadedDataSubsource[];
  enableDefaultSubsources: boolean;
  get enabledSubsources() {
    return this.subsources.filter((x) => x.enabled);
  }
  get layer() {
    return this.layerDataSource.layer;
  }
  constructor(
    public layerDataSource: LayerDataSource,
    public dataSource: DataSource,
    spec: DataSourceSpecification,
  ) {
    super();
    this.transform = new WatchableCoordinateSpaceTransform(
      dataSource.modelTransform,
    );
    if (spec.transform !== undefined) {
      this.transform.spec = spec.transform;
    }
    const subsourceSpecs = spec.subsources;
    this.enableDefaultSubsources = spec.enableDefaultSubsources;
    this.subsources = dataSource.subsources.map(
      (subsourceEntry, subsourceIndex): LoadedDataSubsource =>
        new LoadedDataSubsource(
          this,
          subsourceEntry,
          subsourceSpecs.get(subsourceEntry.id),
          subsourceIndex,
          this.enableDefaultSubsources,
        ),
    );
  }

  disposed() {
    for (const subsource of this.subsources) {
      const { activated } = subsource;
      if (activated !== undefined) {
        subsource.activated = undefined;
        activated.dispose();
      }
    }
  }
}

export class LayerDataSource extends RefCounted {
  changed = new NullarySignal();
  messages = new MessageList();
  private spec_: DataSourceSpecification;
  private specGeneration = -1;
  private refCounted_: RefCounted | undefined = undefined;

  constructor(
    public layer: Borrowed<UserLayer>,
    spec: DataSourceSpecification | undefined = undefined,
  ) {
    super();
    this.registerDisposer(this.changed.add(layer.dataSourcesChanged.dispatch));
    this.registerDisposer(layer.messages.addChild(this.messages));
    // spec.url = "zarr2://http://localhost:9000/scroll.zarr/";
    this.spec = spec;
  }

  get spec() {
    const { loadState } = this;
    if (loadState !== undefined && loadState.error === undefined) {
      const generation = this.changed.count;
      if (generation !== this.specGeneration) {
        this.specGeneration = generation;
        this.spec_ = {
          url: this.spec.url,
          transform: loadState.transform.spec,
          enableDefaultSubsources: loadState.enableDefaultSubsources,
          subsources: new Map(
            Array.from(loadState.subsources, (loadedSubsource) => {
              const defaultEnabledValue =
                loadState.enableDefaultSubsources &&
                loadedSubsource.subsourceEntry.default;
              return [
                loadedSubsource.subsourceEntry.id,
                {
                  enabled:
                    loadedSubsource.enabled !== defaultEnabledValue
                      ? loadedSubsource.enabled
                      : undefined,
                },
              ];
            }),
          ),
          state: this.spec.state,
        };
      }
    }
    return this.spec_;
  }

  get loadState() {
    return this.loadState_;
  }

  set spec(spec: DataSourceSpecification) {
    const { layer } = this;
    this.messages.clearMessages();
    if (spec.url.length === 0) {
      if (layer.dataSources.length !== 1) {
        const index = layer.dataSources.indexOf(this);
        if (index !== -1) {
          layer.dataSources.splice(index, 1);
          layer.dataSourcesChanged.dispatch();
          this.dispose();
          return;
        }
      }
      this.spec_ = spec;
      if (this.refCounted_ !== undefined) {
        this.refCounted_.dispose();
        this.refCounted_ = undefined;
        this.loadState_ = undefined;
        this.changed.dispatch();
      }
      return;
    }
    const refCounted = new RefCounted();
    // const retainer = refCounted.registerDisposer(
    //   disposableOnce(layer.markLoading()),
    // );
    if (this.refCounted_ !== undefined) {
      this.refCounted_.dispose();
      this.loadState_ = undefined;
    }
    this.refCounted_ = refCounted;
    this.spec_ = spec;
    const chunkManager = layer.manager.chunkManager;
    const registry = layer.manager.dataSourceProviderRegistry;
    const cancellationToken = new CancellationTokenSource();
    this.messages.addMessage({
      severity: MessageSeverity.info,
      message: "Loading data source",
    });
    registry
      .get({
        chunkManager,
        url: spec.url,
        cancellationToken,
        globalCoordinateSpace: layer.manager.coordinateSpace,
        transform: spec.transform,
        state: spec.state,
      })
      .then((source: DataSource) => {
        if (refCounted.wasDisposed) return;
        this.messages.clearMessages();
        const loaded = refCounted.registerDisposer(
          new LoadedLayerDataSource(this, source, spec),
        );
        loaded.registerDisposer(
          layer.addCoordinateSpace(),
        );
        loaded.registerDisposer(
          loaded.transform.changed.add(this.changed.dispatch),
        );
        this.loadState_ = loaded;
        loaded.registerDisposer(
          loaded.enabledSubsourcesChanged.add(this.changed.dispatch),
        );
        this.changed.dispatch();
        if (source.state) {
          refCounted.registerDisposer(
            source.state.changed.add(() => {
              this.spec.state = source.state?.toJSON();
              layer.specificationChanged.dispatch();
            }),
          );
        }
        retainer();
      })
      .catch((error: Error) => {
        if (this.wasDisposed) return;
        this.loadState_ = { error };
        this.messages.clearMessages();
        this.messages.addMessage({
          severity: MessageSeverity.error,
          message: error.message,
        });
        this.changed.dispatch();
      });
    refCounted.registerDisposer(() => {
      cancellationToken.cancel();
    });
    this.changed.dispatch();
  }

  disposed() {
    const refCounted = this.refCounted_;
    if (refCounted !== undefined) {
      refCounted.dispose();
    }
  }
}
