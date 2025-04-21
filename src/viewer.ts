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

// import { FourPanelLayout } from "#src/data_panel_layout.js";
import {
  CapacitySpecification,
  ChunkManager,
  ChunkQueueManager,
} from "#src/chunk_manager/frontend.js";
import "#src/sliceview/uncompressed_chunk_format.js";
import { TrackableCoordinateSpace } from "#src/coordinate_transform.js";
import { getDefaultDataSourceProvider } from "#src/datasource/default_provider.js";
import type { DataSourceProviderRegistry } from "#src/datasource/index.js";
import type { DisplayContext } from "#src/display_context.js";
import {
  ManagedUserLayer,
  LayerManager,
  MouseSelectionState,
} from "#src/layer/index.js";
import { ImageUserLayer } from "#src/layer/image/index.js";
import type { Borrowed } from "#src/util/disposable.js";
import { RefCounted } from "#src/util/disposable.js";
import { EventActionMap } from "#src/util/keyboard_bindings.js";
import { WatchableVisibilityPriority } from "#src/visibility_priority/frontend.js";
import type { GL } from "#src/webgl/context.js";
import { RPC, READY_ID } from "#src/worker_rpc.js";
import {
  DisplayPose,
  NavigationState,
  Position,
  TrackableZoom,
  WatchableDisplayDimensionRenderInfo,
} from "#src/navigation_state.js";
import { SliceViewPanel } from "#src/sliceview/panel.js";
import { quat } from "#src/util/geom.js";

export interface SliceViewViewerState {
  chunkManager: ChunkManager;
  navigationState: NavigationState;
  layerManager: LayerManager;
}

export class InputEventBindings {
  sliceView = new EventActionMap();
}

export interface ViewerUIState extends SliceViewViewerState {
  display: DisplayContext;
  mouseState: MouseSelectionState;
  visibility: boolean;
  inputEventBindings: InputEventBindings;
  coordinateSpace: any;
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
  ) {
    super();
    this.worker = new Worker(
      new URL("./chunk_worker.bundle.js", import.meta.url),
      { type: "module" },
    );

    this.worker.addEventListener("message", (e: any) => {
      const isReady = e.data.functionName === READY_ID;
      if (isReady) this.worker.postMessage({ fileTree: self.fileTree });
    });

    this.chunkQueueManager = this.registerDisposer(
      new ChunkQueueManager(
        new RPC(this.worker, /*waitUntilReady=*/ true),
        this.gl,
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

export class Viewer extends RefCounted {
  coordinateSpace = new TrackableCoordinateSpace();

  mouseState = new MouseSelectionState();
  layerManager = this.registerDisposer(new LayerManager());

  visibility: WatchableVisibilityPriority;
  inputEventBindings: any;
  dataSourceProvider: Borrowed<DataSourceProviderRegistry>;
  chunkManager: ChunkManager;
  dataContext: any;

  constructor(public display: DisplayContext) {
    super();

    this.dataContext = new DataManagementContext(display.gl);
    this.chunkManager = this.dataContext.chunkManager;

    this.inputEventBindings = { sliceView: new EventActionMap() };
    this.dataSourceProvider = getDefaultDataSourceProvider();
    this.visibility = new WatchableVisibilityPriority(Infinity);

    // create an image layer
    const managedLayer = new ManagedUserLayer("new layer", {
      chunkManager: this.chunkManager,
      layerManager: this.layerManager,
      dataSourceProviderRegistry: this.dataSourceProvider,
      coordinateSpace: this.coordinateSpace,
    });
  
    managedLayer.visible = true;
    managedLayer.layer = new ImageUserLayer(managedLayer);
    managedLayer.layer.restoreState({ type: "new", source: "zarr2://http://localhost:9000/scroll.zarr/" });
    this.layerManager.addManagedLayer(managedLayer);

    // panel generation
    const panel = this.registerDisposer(
      new FourPanelLayout({
        coordinateSpace: this.coordinateSpace,
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
    container.appendChild(panel.element);

    this.display.container.appendChild(container);
  }
}

export class FourPanelLayout extends RefCounted {
  element = document.createElement("div");

  constructor(public viewer: ViewerUIState) {
    super();

    const position = this.registerDisposer(new Position(this.viewer.coordinateSpace));
    const displayDimensionRenderInfo = this.registerDisposer(
      new WatchableDisplayDimensionRenderInfo(),
    );
    const crossSectionScale = this.registerDisposer(new TrackableZoom());

    this.element.style.flex = "1";
    this.element.style.display = "flex";
    this.element.style.flexDirection = "row";

    const state =  {
      display: viewer.display,
      chunkManager: viewer.chunkManager,
      mouseState: viewer.mouseState,
      layerManager: viewer.layerManager,
      visibility: viewer.visibility,
      inputEventMap: viewer.inputEventBindings.sliceView,
    }

    const elementXY = document.createElement("div");
    elementXY.classList.add("neuroglancer-panel");
    const navigationStateXY = new NavigationState(
      new DisplayPose(
        position.addRef(),
        displayDimensionRenderInfo.addRef(),
        { orientation: quat.create() }, 
      ),
      crossSectionScale.addRef(),
    )
    new SliceViewPanel(elementXY, navigationStateXY, state);

    const elementYZ = document.createElement("div");
    elementYZ.classList.add("neuroglancer-panel");
    const navigationStateYZ = new NavigationState(
      new DisplayPose(
        position.addRef(),
        displayDimensionRenderInfo.addRef(),
        { orientation: quat.rotateY(quat.create(), quat.create(), Math.PI / 2) }, 
      ),
      crossSectionScale.addRef(),
    )
    new SliceViewPanel(elementYZ, navigationStateYZ, state);

    const elementXZ = document.createElement("div");
    elementXZ.classList.add("neuroglancer-panel");
    const navigationStateXZ = new NavigationState(
      new DisplayPose(
        position.addRef(),
        displayDimensionRenderInfo.addRef(),
        { orientation: quat.rotateX(quat.create(), quat.create(), Math.PI / 2) },
      ),
      crossSectionScale.addRef(),
    )
    new SliceViewPanel(elementXZ, navigationStateXZ, state);

    this.element.appendChild(elementXY);
    this.element.appendChild(elementYZ);
    this.element.appendChild(elementXZ);
  }
}