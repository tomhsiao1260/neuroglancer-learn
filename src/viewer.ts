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

import { FourPanelLayout } from "#src/data_panel_layout.js";
import type { FrameNumberCounter } from "#src/chunk_manager/frontend.js";
import {
  CapacitySpecification,
  ChunkManager,
  ChunkQueueManager,
} from "#src/chunk_manager/frontend.js";
import "#src/sliceview/uncompressed_chunk_format.js";
import { TrackableCoordinateSpace } from "#src/coordinate_transform.js";
import { InputEventBindings as DataPanelInputEventBindings } from "#src/data_panel_layout.js";
import { getDefaultDataSourceProvider } from "#src/datasource/default_provider.js";
import type { DataSourceProviderRegistry } from "#src/datasource/index.js";
import type { DisplayContext } from "#src/display_context.js";
import {
  ManagedUserLayer,
  LayerManager,
  LayerSelectedValues,
  MouseSelectionState,
} from "#src/layer/index.js";
import { ImageUserLayer } from "#src/layer/image/index.js";
import {
  DisplayPose,
  NavigationState,
  OrientationState,
  Position,
  TrackableCrossSectionZoom,
  TrackableDepthRange,
  TrackableDisplayDimensions,
  TrackableRelativeDisplayScales,
  WatchableDisplayDimensionRenderInfo,
} from "#src/navigation_state.js";
import type { Borrowed } from "#src/util/disposable.js";
import { RefCounted } from "#src/util/disposable.js";
import { EventActionMap } from "#src/util/keyboard_bindings.js";
import { WatchableVisibilityPriority } from "#src/visibility_priority/frontend.js";
import type { GL } from "#src/webgl/context.js";
import { RPC } from "#src/worker_rpc.js";

async function postMessage(worker: any) {
  await new Promise((res) => setTimeout(res, 100));
  worker.postMessage({ fileTree: self.fileTree });
}

function addNewLayer(manager: any) {
  const managedLayer = new ManagedUserLayer("new layer", manager);
  managedLayer.layer = new ImageUserLayer(managedLayer);
  managedLayer.archived = false;
  managedLayer.visible = true;

  const source = "zarr2://http://localhost:9000/scroll.zarr/";
  managedLayer.layer.restoreState({ type: "new", source });
  manager.layerManager.addManagedLayer(managedLayer);
}

export class DataManagementContext extends RefCounted {
  worker: Worker;
  chunkQueueManager: ChunkQueueManager;
  chunkManager: ChunkManager;

  get rpc(): RPC {
    return this.chunkQueueManager.rpc!;
  }

  constructor(
    public gl: GL,
    public frameNumberCounter: FrameNumberCounter,
  ) {
    super();
    // Note: For compatibility with multiple bundlers, a browser-compatible URL
    // must be used with `new URL`, which means a Node.js subpath import like
    // "#src/chunk_worker.bundle.js" cannot be used.
    this.worker = new Worker(
      /* webpackChunkName: "neuroglancer_chunk_worker" */
      new URL("./chunk_worker.bundle.js", import.meta.url),
      { type: "module" },
    );
    postMessage(this.worker);

    this.chunkQueueManager = this.registerDisposer(
      new ChunkQueueManager(
        new RPC(this.worker, /*waitUntilReady=*/ true),
        this.gl,
        this.frameNumberCounter,
        {
          gpuMemory: new CapacitySpecification({
            defaultItemLimit: 1e6,
            defaultSizeLimit: 1e9,
          }),
          systemMemory: new CapacitySpecification({
            defaultItemLimit: 1e7,
            defaultSizeLimit: 2e9,
          }),
          download: new CapacitySpecification({
            defaultItemLimit: 100,
            defaultSizeLimit: Number.POSITIVE_INFINITY,
          }),
          compute: new CapacitySpecification({
            defaultItemLimit: 128,
            defaultSizeLimit: 5e8,
          }),
        },
      ),
    );
    this.chunkQueueManager.registerDisposer(() => this.worker.terminate());
    this.chunkManager = this.registerDisposer(
      new ChunkManager(this.chunkQueueManager),
    );
  }
}

export class InputEventBindings extends DataPanelInputEventBindings {}

export class Viewer extends RefCounted {
  coordinateSpace = new TrackableCoordinateSpace();
  position = this.registerDisposer(new Position(this.coordinateSpace));
  relativeDisplayScales = this.registerDisposer(
    new TrackableRelativeDisplayScales(this.coordinateSpace),
  );
  displayDimensions = this.registerDisposer(
    new TrackableDisplayDimensions(this.coordinateSpace),
  );
  displayDimensionRenderInfo = this.registerDisposer(
    new WatchableDisplayDimensionRenderInfo(
      this.relativeDisplayScales.addRef(),
      this.displayDimensions.addRef(),
    ),
  );
  crossSectionOrientation = this.registerDisposer(new OrientationState());
  crossSectionScale = this.registerDisposer(
    new TrackableCrossSectionZoom(this.displayDimensionRenderInfo.addRef()),
  );
  crossSectionDepthRange = this.registerDisposer(
    new TrackableDepthRange(-10, this.displayDimensionRenderInfo),
  );

  navigationState = this.registerDisposer(
    new NavigationState(
      new DisplayPose(
        this.position.addRef(),
        this.displayDimensionRenderInfo.addRef(),
        this.crossSectionOrientation.addRef(),
      ),
      this.crossSectionScale.addRef(),
      this.crossSectionDepthRange.addRef(),
    ),
  );

  mouseState = new MouseSelectionState();
  layerManager = this.registerDisposer(new LayerManager());
  layerSelectedValues = this.registerDisposer(
    new LayerSelectedValues(this.layerManager, this.mouseState),
  );

  visibility: WatchableVisibilityPriority;
  inputEventBindings: InputEventBindings;
  dataSourceProvider: Borrowed<DataSourceProviderRegistry>;
  chunkManager: ChunkManager;

  constructor(public display: DisplayContext) {
    super();

    const dataContext = new DataManagementContext(display.gl, display);
    this.chunkManager = dataContext.chunkManager;

    this.inputEventBindings = { sliceView: new EventActionMap() };
    this.dataSourceProvider = getDefaultDataSourceProvider();
    this.visibility = new WatchableVisibilityPriority(Infinity);

    this.makeUI();
  }

  private async makeUI() {
    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });

    // create an image layer
    addNewLayer({
      chunkManager: this.chunkManager,
      layerManager: this.layerManager,
      layerSelectedValues: this.layerSelectedValues,
      dataSourceProviderRegistry: this.dataSourceProvider,
      coordinateSpace: this.navigationState.coordinateSpace,
    });

    // panel generation
    const panel = this.registerDisposer(
      new FourPanelLayout({
        chunkManager: this.chunkManager,
        layerManager: this.layerManager,
        navigationState: this.navigationState,
        inputEventBindings: this.inputEventBindings,
        mouseState: this.mouseState,
        visibility: this.visibility,
        display: this.display,
      }),
    );

    // append viewer dom
    const container = document.createElement("div");
    container.style.top = "0px";
    container.style.left = "0px";
    container.style.width = "100%";
    container.style.height = "100%";
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.position = "absolute";
    container.classList.add("neuroglancer-viewer");
    container.classList.add("neuroglancer-noselect");
    container.appendChild(panel.element);

    this.display.container.appendChild(container);
  }
}
