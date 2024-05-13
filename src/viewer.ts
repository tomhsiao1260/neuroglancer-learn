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

import "#src/viewer.css";
import "#src/noselect.css";
import type { FrameNumberCounter } from "#src/chunk_manager/frontend.js";
import {
  CapacitySpecification,
  ChunkManager,
  ChunkQueueManager,
} from "#src/chunk_manager/frontend.js";
import { TrackableCoordinateSpace } from "#src/coordinate_transform.js";
import { defaultCredentialsManager } from "#src/credentials_provider/default_manager.js";
import { InputEventBindings as DataPanelInputEventBindings } from "#src/data_panel_layout.js";
import { getDefaultDataSourceProvider } from "#src/datasource/default_provider.js";
import type { DataSourceProviderRegistry } from "#src/datasource/index.js";
import type { DisplayContext } from "#src/display_context.js";
import {
  addNewLayer,
  LayerManager,
  LayerSelectedValues,
  MouseSelectionState,
  TopLevelLayerListSpecification,
} from "#src/layer/index.js";
import { RootLayoutContainer } from "#src/layer_groups_layout.js";
import {
  CoordinateSpacePlaybackVelocity,
  DisplayPose,
  NavigationState,
  OrientationState,
  Position,
  TrackableCrossSectionZoom,
  TrackableDepthRange,
  TrackableDisplayDimensions,
  TrackableProjectionZoom,
  TrackableRelativeDisplayScales,
  WatchableDisplayDimensionRenderInfo,
} from "#src/navigation_state.js";
import { allRenderLayerRoles } from "#src/renderlayer.js";
import { TrackableBoolean } from "#src/trackable_boolean.js";
import type { WatchableValueInterface } from "#src/trackable_value.js";
import { makeDerivedWatchableValue } from "#src/trackable_value.js";
import { SidePanelManager } from "#src/ui/side_panel.js";
import { TrackableRGB } from "#src/util/color.js";
import type { Borrowed, Owned } from "#src/util/disposable.js";
import { RefCounted } from "#src/util/disposable.js";
import { vec3 } from "#src/util/geom.js";
import { EventActionMap } from "#src/util/keyboard_bindings.js";
import { NullarySignal } from "#src/util/signal.js";
import { WatchableVisibilityPriority } from "#src/visibility_priority/frontend.js";
import type { GL } from "#src/webgl/context.js";
import { RPC } from "#src/worker_rpc.js";

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

export class InputEventBindings extends DataPanelInputEventBindings {
  global = new EventActionMap();
}

export class Viewer extends RefCounted {
  coordinateSpace = new TrackableCoordinateSpace();
  position = this.registerDisposer(new Position(this.coordinateSpace));
  velocity = this.registerDisposer(
    new CoordinateSpacePlaybackVelocity(this.coordinateSpace),
  );
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
  projectionOrientation = this.registerDisposer(new OrientationState());
  crossSectionDepthRange = this.registerDisposer(
    new TrackableDepthRange(-10, this.displayDimensionRenderInfo),
  );
  projectionDepthRange = this.registerDisposer(
    new TrackableDepthRange(-50, this.displayDimensionRenderInfo),
  );
  projectionScale = this.registerDisposer(
    new TrackableProjectionZoom(this.displayDimensionRenderInfo.addRef()),
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
  perspectiveNavigationState = this.registerDisposer(
    new NavigationState(
      new DisplayPose(
        this.position.addRef(),
        this.displayDimensionRenderInfo.addRef(),
        this.projectionOrientation.addRef(),
      ),
      this.projectionScale.addRef(),
      this.projectionDepthRange.addRef(),
    ),
  );
  mouseState = new MouseSelectionState();
  layerManager = this.registerDisposer(new LayerManager());
  wireFrame = new TrackableBoolean(false, false);
  visibleLayerRoles = allRenderLayerRoles();
  crossSectionBackgroundColor = new TrackableRGB(
    vec3.fromValues(0.5, 0.5, 0.5),
  );
  layerSelectedValues = this.registerDisposer(
    new LayerSelectedValues(this.layerManager, this.mouseState),
  );

  resetInitiated = new NullarySignal();

  get chunkManager() {
    return this.dataContext.chunkManager;
  }

  layerSpecification: TopLevelLayerListSpecification;
  layout: RootLayoutContainer;
  sidePanelManager: SidePanelManager;

  dataContext: Owned<DataManagementContext>;
  visibility: WatchableVisibilityPriority;
  inputEventBindings: InputEventBindings;
  element: HTMLElement;
  dataSourceProvider: Borrowed<DataSourceProviderRegistry>;

  constructor(public display: DisplayContext) {
    super();

    const dataContext = new DataManagementContext(display.gl, display);
    const visibility = new WatchableVisibilityPriority(
      WatchableVisibilityPriority.VISIBLE,
    );
    const inputEventBindings = {
      global: new EventActionMap(),
      sliceView: new EventActionMap(),
      perspectiveView: new EventActionMap(),
    };
    const element = display.makeCanvasOverlayElement();
    const dataSourceProvider = getDefaultDataSourceProvider({
      credentialsManager: defaultCredentialsManager,
    });

    this.visibility = visibility;
    this.inputEventBindings = inputEventBindings;
    this.element = element;
    this.dataSourceProvider = dataSourceProvider;
    this.dataContext = this.registerDisposer(dataContext);

    this.layerSpecification = new TopLevelLayerListSpecification(
      this.display,
      this.dataSourceProvider,
      this.layerManager,
      this.chunkManager,
      this.layerSelectedValues,
      this.navigationState.coordinateSpace,
    );

    addNewLayer(this.layerSpecification);

    this.makeUI();
  }

  private makeUI() {
    const gridContainer = this.element;
    gridContainer.classList.add("neuroglancer-viewer");
    gridContainer.classList.add("neuroglancer-noselect");
    gridContainer.style.display = "flex";
    gridContainer.style.flexDirection = "column";

    this.layout = this.registerDisposer(new RootLayoutContainer(this));
    gridContainer.appendChild(this.layout.element);
  }
}
