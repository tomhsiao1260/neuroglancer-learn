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
import { RPC, READY_ID, registerRPC } from "#src/worker/worker_rpc.js";
import {
  NavigationState,
  Position,
  TrackableZoom,
} from "#src/state/navigation_state.js";
import { SliceViewPanel } from "#src/sliceview/panel.js";
import { quat } from "#src/util/geom.js";
import { handleFileBtnOnClick } from "#src/util/file_system.js";

/**
 * Creates and sets up the upload button for .zarr files
 */
makeUploadButton();

function makeUploadButton() {
  const button = document.querySelector<HTMLButtonElement>('#upload');
  if (button) { button.onclick = makeMinimalViewer; }
}

function setupViewParamsUI(viewer: Viewer) {
  const viewParams = document.querySelector<HTMLDivElement>('#view-params');
  const centerInput = document.querySelector<HTMLInputElement>('#center-input');
  const levelInput = document.querySelector<HTMLInputElement>('#level-input');
  const updateButton = document.querySelector<HTMLButtonElement>('#update-view');

  if (!viewParams || !centerInput || !levelInput || !updateButton) return;

  // Show the view params UI
  viewParams.classList.remove('hidden');

  // Update inputs with current values
  const updateInputs = () => {
    const pos = viewer.navigationState.position.value;
    centerInput.value = `${Math.round(pos[0])},${Math.round(pos[1])},${Math.round(pos[2])}`;
    levelInput.value = Math.round(Math.log2(viewer.navigationState.zoomFactor.value)).toString();
  };

  // Update view when button is clicked
  updateButton.onclick = () => {
    // Parse center coordinates
    const centerCoords = centerInput.value.split(',').map(Number);
    if (centerCoords.length === 3 && !centerCoords.some(isNaN)) {
      viewer.navigationState.position.value = new Float32Array(centerCoords);
    }

    // Parse level
    const level = Number(levelInput.value);
    if (!isNaN(level) && level >= 0) {
      viewer.navigationState.zoomFactor.value = Math.pow(2, level);
    }

    // Update URL
    const url = new URL(window.location.href);
    url.searchParams.set('center', centerInput.value);
    url.searchParams.set('level', levelInput.value);
    window.history.replaceState({}, '', url.toString());
  };

  // Update inputs when view changes
  viewer.navigationState.position.changed.add(updateInputs);
  viewer.navigationState.zoomFactor.changed.add(updateInputs);

  // Initial update
  updateInputs();
}

/**
 * Creates a minimal viewer for 3D volume data visualization
 */
async function makeMinimalViewer() {
  // Get the file tree (via file system api)
  const fileTree = await handleFileBtnOnClick();
  (window as any).fileTree = fileTree;

  // Parse URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const x = urlParams.get('x');
  const y = urlParams.get('y');
  const z = urlParams.get('z');
  const zoom = urlParams.get('zoom');

  // Parse coordinates and zoom
  let initialCenter: Float32Array | undefined;
  if (x !== null && y !== null && z !== null) {
    const coords = [Number(x), Number(y), Number(z)];
    if (!coords.some(isNaN)) {
      initialCenter = new Float32Array(coords);
    } else {
      console.warn('Invalid coordinate parameters. Expected numbers for x, y, z');
    }
  }

  let initialLevel: number | undefined;
  if (zoom !== null) {
    initialLevel = Number(zoom);
    if (isNaN(initialLevel) || initialLevel < 1 || initialLevel > 5) {
      console.warn('Invalid zoom parameter. Expected a number between 1 and 5.');
      initialLevel = undefined;
    }
  }

  // main container layout
  const main = document.querySelector<HTMLElement>("main");
  if (!main) return;
  main.classList.remove("hidden");

  const target = document.querySelector<HTMLDivElement>("#neuroglancer-container");
  if (!target) return;

  // Reset any existing styles and set new ones
  target.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    overflow: hidden;
  `;

  // create display context and viewer
  const display = new DisplayContext(target);
  const viewer = new Viewer(display);

  // Function to update URL parameters with throttling
  let lastUpdateTime = 0;
  const updateUrlParams = () => {
    const now = Date.now();
    // Only update every 200ms to make it more responsive
    if (now - lastUpdateTime < 200) return;
    lastUpdateTime = now;

    const pos = viewer.navigationState.position.value;
    const zoomValue = viewer.navigationState.zoomFactor.value;
    // Convert zoom value to level (1 = widest, 5 = most zoomed) with 2 decimal places
    const zoomLevel = (5 - Math.log2(zoomValue)).toFixed(2);
    const zoomNumber = Number(zoomLevel);

    // Ensure zoom level is within valid range
    if (zoomNumber >= 1 && zoomNumber <= 5) {
      const url = new URL(window.location.href);
      url.searchParams.set('x', Math.round(pos[2]).toString());
      url.searchParams.set('y', Math.round(pos[1]).toString());
      url.searchParams.set('z', Math.round(pos[0]).toString());
      url.searchParams.set('zoom', zoomLevel);
      window.history.replaceState({}, '', url.toString());
    }
  };

  // Wait for coordinate space to be initialized
  const waitForCoordinateSpace = () => {
    if (viewer.coordinateSpace.value.valid) {
      // Set initial view position and level if provided
      if (initialCenter) {
        // Convert coordinates to match the display dimension order (z,y,x)
        const displayCoords = new Float32Array([
          initialCenter[2], // z
          initialCenter[1], // y
          initialCenter[0]  // x
        ]);
        viewer.navigationState.position.value = displayCoords;
      }
      if (initialLevel !== undefined) {
        // Convert level to zoom value (1 = widest, 5 = most zoomed)
        const zoomValue = Math.pow(2, 5 - initialLevel);
        viewer.navigationState.zoomFactor.value = zoomValue;
      }

      // Add listeners for view changes
      viewer.navigationState.position.changed.add(updateUrlParams);
      viewer.navigationState.zoomFactor.changed.add(updateUrlParams);

      // Initial URL update
      updateUrlParams();
    } else {
      // Try again in the next frame
      requestAnimationFrame(waitForCoordinateSpace);
    }
  };

  // Start waiting for coordinate space
  waitForCoordinateSpace();

  // handle loading state
  loading(viewer.dataContext.worker);
}

/**
 * Manages the loading state UI
 * @param worker - The worker handling data processing
 */
function loading(worker: Worker) {
  const loading = document.querySelector<HTMLDivElement>("#loading");
  const uploadContainer = document.querySelector<HTMLDivElement>("#upload-container");

  if (loading && uploadContainer) {
    loading.classList.remove("hidden");
    uploadContainer.classList.add("hidden");
  }
  worker.addEventListener("message", (e: MessageEvent<{ functionName: string }>) => {
    const isReady = e.data.functionName === READY_ID;
    if (isReady && loading) {
      loading.classList.add("hidden");
    }
  });
}

/**
 * Interface defining the UI state of the viewer
 */
export interface ViewerUIState {
  display: DisplayContext;
  mouseState: MouseSelectionState;
  visibility: WatchableVisibilityPriority;
  inputEventMap: EventActionMap;
  coordinateSpace: TrackableCoordinateSpace;
  chunkManager: ChunkManager;
  navigationState: NavigationState;
  layerManager: ImageUserLayer;
}

// Register RPC handler for missing blocks
registerRPC('onMissingBlock', function(this: RPC, x: { 
  key: string,
  dataSize: number[]
}) {
  console.log('Missing block:', {
    key: x.key,
    dataSize: x.dataSize
  });
});

/**
 * Manages data processing and worker communication
 */
class DataManagementContext extends RefCounted {
  worker: Worker;
  rpc: RPC;
  chunkQueueManager: ChunkQueueManager;
  chunkManager: ChunkManager;

  constructor(
    public gl: GL,
  ) {
    super();
    
    // Initialize Web Worker for parallel processing
    this.worker = new Worker(
      new URL("./worker/chunk_worker.bundle.js", import.meta.url),
      { type: "module" },
    );

    // Setup RPC communication with the worker
    this.rpc = new RPC(this.worker, true);

    // Handle worker ready state and file tree initialization
    this.worker.addEventListener("message", (e: MessageEvent<{ functionName: string }>) => {
      const isReady = e.data.functionName === READY_ID;
      if (isReady) { 
        this.worker.postMessage({ fileTree: (window as any).fileTree });
      }
    });

    // Initialize chunk queue manager with resource limits
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

    // Ensure worker is terminated when disposed
    this.chunkQueueManager.registerDisposer(() => this.worker.terminate());

    // Initialize chunk manager for data organization
    this.chunkManager = this.registerDisposer(
      new ChunkManager(this.chunkQueueManager),
    );
  }
}

/**
 * Main viewer class that handles the 3D visualization
 */
class Viewer extends RefCounted {
  coordinateSpace = new TrackableCoordinateSpace();
  mouseState = new MouseSelectionState();
  visibility: WatchableVisibilityPriority;
  chunkManager: ChunkManager;
  dataContext: DataManagementContext;
  navigationState = new NavigationState(
    new Position(this.coordinateSpace),
    new TrackableZoom(),
    { orientation: quat.create() }
  );

  constructor(public display: DisplayContext) {
    super();

    this.dataContext = new DataManagementContext(display.gl);
    this.visibility = new WatchableVisibilityPriority(Infinity);
    const dataSourceProvider: DataSourceProviderRegistry = getDefaultDataSourceProvider();

    // Setup control events
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

    // Create panel layout
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

    // Setup viewer DOM
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

/**
 * Handles the layout of the viewer panels
 */
class PanelLayout extends RefCounted {
  /** Root element for the panel layout */
  element = document.createElement("div");

  constructor(public viewer: ViewerUIState) {
    super();

    // Setup panel container layout
    this.element.style.flex = "1";
    this.element.style.display = "flex";
    this.element.style.flexDirection = "row";

    // Common state for all panels
    const state =  {
      display: viewer.display,
      chunkManager: viewer.chunkManager,
      mouseState: viewer.mouseState,
      layerManager: viewer.layerManager,
      visibility: viewer.visibility,
      inputEventMap: viewer.inputEventMap,
    }

    // Create YZ plane panel (side view)
    const elementYZ = document.createElement("div");
    elementYZ.classList.add("neuroglancer-panel");
    elementYZ.setAttribute("data-view", "YZ View");
    const navigationStateYZ = new NavigationState(
      viewer.navigationState.position.addRef(),
      viewer.navigationState.zoomFactor.addRef(),
      { orientation: quat.create() }, 
    )
    new SliceViewPanel(elementYZ, navigationStateYZ, state);

    // Create XY plane panel (front view)
    const elementXY = document.createElement("div");
    elementXY.classList.add("neuroglancer-panel");
    elementXY.setAttribute("data-view", "XY View");
    const navigationStateXY = new NavigationState(
      viewer.navigationState.position.addRef(),
      viewer.navigationState.zoomFactor.addRef(),
      { orientation: quat.rotateY(quat.create(), quat.create(), Math.PI / 2) }, 
    )
    new SliceViewPanel(elementXY, navigationStateXY, state);

    // Create XZ plane panel (top view)
    const elementXZ = document.createElement("div");
    elementXZ.classList.add("neuroglancer-panel");
    elementXZ.setAttribute("data-view", "XZ View");
    const navigationStateXZ = new NavigationState(
      viewer.navigationState.position.addRef(),
      viewer.navigationState.zoomFactor.addRef(),
      { orientation: quat.rotateX(quat.create(), quat.create(), Math.PI / 2) },
    )
    new SliceViewPanel(elementXZ, navigationStateXZ, state);

    // Add all panels to the layout
    this.element.appendChild(elementYZ);
    this.element.appendChild(elementXY);
    this.element.appendChild(elementXZ);
  }
}

