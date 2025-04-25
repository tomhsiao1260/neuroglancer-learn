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
import "#src/style.css";
import { RefCounted } from "#src/util/disposable.js";
import {
  CapacitySpecification,
  ChunkManager,
  ChunkQueueManager,
} from "#src/chunk_manager/frontend.js";
import "#src/sliceview/uncompressed_chunk_format.js";
import { TrackableCoordinateSpace } from "#src/state/coordinate_transform.js";
import { getDefaultDataSourceProvider } from "#src/datasource/default_provider.js";
import type { DataSourceProviderRegistry } from "#src/datasource/index.js";
import { DisplayContext } from "#src/layer/display_context.js";
import {
  ImageUserLayer,
  MouseSelectionState,
} from "#src/layer/index.js";
import { EventActionMap } from "#src/util/keyboard_bindings.js";
import { WatchableVisibilityPriority } from "#src/visibility_priority/frontend.js";
import type { GL } from "#src/webgl/context.js";
import { RPC, READY_ID } from "#src/worker/worker_rpc.js";
import {
  NavigationState,
  Position,
  TrackableZoom,
} from "#src/state/navigation_state.js";
import { SliceViewPanel } from "#src/sliceview/panel.js";
import { quat } from "#src/util/geom.js";
import { handleFileBtnOnClick } from "#src/util/file_system.js";
import { registerSharedObjectOwner } from "#src/worker/worker_rpc.js";

const root = document.querySelector<HTMLDivElement>('#app');

// data upload button
makeUploadButton();

function makeUploadButton() {
  const button = document.createElement("button");
  button.id = "upload";
  button.innerText = "choose .zarr folder";
  button.onclick = makeMinimalViewer;

  const loading = document.createElement("div");
  loading.id = "loading";
  loading.innerText = "Loading ...";
  loading.style.display = "none";

  root?.appendChild(button);
  root?.appendChild(loading);
}

async function makeMinimalViewer() {
  // load data via file system api
  const fileTree = await handleFileBtnOnClick();
  self.fileTree = fileTree;

  const target = document.createElement("div");
  target.id = "neuroglancer-container";
  root?.appendChild(target);
  const display = new DisplayContext(target);
  const viewer = new Viewer(display);

  // handle loading text
  loading(viewer.dataContext.worker);
}

function loading(worker: Worker) {
  const loading = document.querySelector<HTMLDivElement>("#loading");
  const button = document.querySelector<HTMLButtonElement>("#upload");
  if (loading && button) {
    loading.style.display = "inline";
    button.style.display = "none";

    worker.addEventListener("message", (e: MessageEvent) => {
      const isReady = e.data.functionName === READY_ID;
      if (isReady && loading) {
        loading.style.display = "none";
      }
    });
  }
}

export interface ViewerUIState {
  display: DisplayContext;
  mouseState: MouseSelectionState;
  visibility: boolean;
  inputEventBindings: any;
  coordinateSpace: any;
  chunkManager: ChunkManager;
  navigationState: NavigationState;
  layerManager: any;
}

class DataManagementContext extends RefCounted {
  worker: Worker;
  rpc: RPC;
  chunkQueueManager: ChunkQueueManager;
  chunkManager: ChunkManager;

  // 添加 RPC_TYPE_ID
  RPC_TYPE_ID: string;

  constructor(
    public gl: GL,
  ) {
    super();
    
    this.worker = new Worker(
      new URL("./worker/chunk_worker.bundle.js", import.meta.url),
      { type: "module" },
    );

    this.rpc = new RPC(this.worker, true);

    this.worker.addEventListener("message", (e: MessageEvent) => {
      const isReady = e.data.functionName === READY_ID;
      if (isReady) { 
        this.worker.postMessage({ fileTree: self.fileTree });
      }
    });

    this.chunkQueueManager = this.registerDisposer(
      new ChunkQueueManager(
        this.rpc,
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

    // 設置 RPC_TYPE_ID
    this.RPC_TYPE_ID = "DataManagementContext";
  }
}

// 註冊 RPC
registerSharedObjectOwner("DataManagementContext")(DataManagementContext);

class Viewer extends RefCounted {
  coordinateSpace = new TrackableCoordinateSpace();
  mouseState = new MouseSelectionState();
  visibility: WatchableVisibilityPriority;
  chunkManager: ChunkManager;
  dataContext: any;

  constructor(public display: DisplayContext) {
    super();

    this.dataContext = new DataManagementContext(display.gl);
    this.visibility = new WatchableVisibilityPriority(Infinity);
    const dataSourceProvider: DataSourceProviderRegistry = getDefaultDataSourceProvider();
    
    // control events
    const inputEventMap = new EventActionMap();

    inputEventMap.addParent(
      EventActionMap.fromObject({
        "at:mousedown0": { action: "translate-via-mouse-drag", stopPropagation: true },
        "control+wheel": { action: "zoom-via-wheel", preventDefault: true },
        "at:wheel": { action: "z+1-via-wheel", preventDefault: true },
      }),
      Number.NEGATIVE_INFINITY,
    );

    const layerManager = new ImageUserLayer({
      chunkManager: this.dataContext.chunkManager,
      coordinateSpace: this.coordinateSpace,
      dataSourceProviderRegistry: dataSourceProvider,
    });

    // panel generation
    const panel = this.registerDisposer(
      new PanelLayout({
        layerManager,
        coordinateSpace: this.coordinateSpace,
        chunkManager: this.dataContext.chunkManager,
        navigationState: this.navigationState,
        inputEventMap,
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

class PanelLayout extends RefCounted {
  element = document.createElement("div");

  constructor(public viewer: ViewerUIState) {
    super();

    const position = this.registerDisposer(new Position(this.viewer.coordinateSpace));
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
      inputEventMap: viewer.inputEventMap,
    }

    const elementXY = document.createElement("div");
    elementXY.classList.add("neuroglancer-panel");
    const navigationStateXY = new NavigationState(
      position.addRef(),
      crossSectionScale.addRef(),
      { orientation: quat.create() }, 
    )
    new SliceViewPanel(elementXY, navigationStateXY, state);

    const elementYZ = document.createElement("div");
    elementYZ.classList.add("neuroglancer-panel");
    const navigationStateYZ = new NavigationState(
      position.addRef(),
      crossSectionScale.addRef(),
      { orientation: quat.rotateY(quat.create(), quat.create(), Math.PI / 2) }, 
    )
    new SliceViewPanel(elementYZ, navigationStateYZ, state);

    const elementXZ = document.createElement("div");
    elementXZ.classList.add("neuroglancer-panel");
    const navigationStateXZ = new NavigationState(
      position.addRef(),
      crossSectionScale.addRef(),
      { orientation: quat.rotateX(quat.create(), quat.create(), Math.PI / 2) },
    )
    new SliceViewPanel(elementXZ, navigationStateXZ, state);

    this.element.appendChild(elementXY);
    this.element.appendChild(elementYZ);
    this.element.appendChild(elementXZ);
  }
}

