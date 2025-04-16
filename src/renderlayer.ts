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

import { debounce } from "lodash-es";
import { LayerChunkProgressInfo } from "#src/chunk_manager/base.js";
import { RenderViewport, renderViewportsEqual } from "#src/display_context.js";
import type {
  MouseSelectionState,
  UserLayer,
} from "#src/layer/index.js";
import type {
  DisplayDimensionRenderInfo,
  NavigationState,
} from "#src/navigation_state.js";
import {
  ProjectionParameters,
  projectionParametersEqual,
} from "#src/projection_parameters.js";
import {
  PROJECTION_PARAMETERS_CHANGED_RPC_METHOD_ID,
  PROJECTION_PARAMETERS_RPC_ID,
} from "#src/render_layer_common.js";
import type { WatchableValueChangeInterface } from "#src/trackable_value.js";
import type { Borrowed } from "#src/util/disposable.js";
import { RefCounted } from "#src/util/disposable.js";
import { MessageList } from "#src/util/message_list.js";
import { NullarySignal, Signal } from "#src/util/signal.js";
import type { Uint64 } from "#src/util/uint64.js";
import type { RPC } from "#src/worker_rpc.js";
import { registerSharedObjectOwner, SharedObject } from "#src/worker_rpc.js";

export class RenderLayer extends RefCounted {
  userLayer: UserLayer | undefined;
  messages = new MessageList();
  layerChanged = new NullarySignal();
  redrawNeeded = new NullarySignal();
  layerChunkProgressInfo = new LayerChunkProgressInfo();

  handleAction(_action: string) {
    // Do nothing by default.
  }

  getValueAt(_x: Float32Array): any {
    return undefined;
  }

  /**
   * Optionally updates the mouse state based on the retrived pick information.  This might snap the
   * 3-d position to the center of the picked point.
   */
  updateMouseState(
    _mouseState: MouseSelectionState,
    _data: any,
  ) {}
}

export class DerivedProjectionParameters<
    Parameters extends ProjectionParameters = ProjectionParameters,
  >
  extends RefCounted
  implements WatchableValueChangeInterface<Parameters>
{
  private oldValue_: Parameters;
  private value_: Parameters;
  private renderViewport = new RenderViewport();

  changed = new Signal<(oldValue: Parameters, newValue: Parameters) => void>();
  constructor(options: {
    navigationState: Borrowed<NavigationState>;
    update: (out: Parameters, navigationState: NavigationState) => void;
    isEqual?: (a: Parameters, b: Parameters) => boolean;
    parametersConstructor?: { new (): Parameters };
  }) {
    super();
    const {
      parametersConstructor = ProjectionParameters as { new (): Parameters },
      navigationState,
      update,
      isEqual = projectionParametersEqual,
    } = options;
    this.oldValue_ = new parametersConstructor();
    this.value_ = new parametersConstructor();
    const performUpdate = () => {
      const { oldValue_, value_ } = this;
      oldValue_.displayDimensionRenderInfo =
        navigationState.displayDimensionRenderInfo.value;
      Object.assign(oldValue_, this.renderViewport);
      let { globalPosition } = oldValue_;
      const newGlobalPosition = navigationState.position.value;
      const rank = newGlobalPosition.length;
      if (globalPosition.length !== rank) {
        oldValue_.globalPosition = globalPosition = new Float32Array(rank);
      }
      globalPosition.set(newGlobalPosition);
      update(oldValue_, navigationState);
      if (isEqual(oldValue_, value_)) return;
      this.value_ = oldValue_;
      this.oldValue_ = value_;
      this.changed.dispatch(value_, oldValue_);
    };
    const debouncedUpdate = (this.update = this.registerCancellable(
      debounce(performUpdate, 0),
    ));
    this.registerDisposer(navigationState.changed.add(debouncedUpdate));
    performUpdate();
  }

  setViewport(viewport: RenderViewport) {
    if (renderViewportsEqual(viewport, this.renderViewport)) return;
    Object.assign(this.renderViewport, viewport);
    this.update();
  }

  get value() {
    this.update.flush();
    return this.value_;
  }

  readonly update: (() => void) & { flush(): void };
}

@registerSharedObjectOwner(PROJECTION_PARAMETERS_RPC_ID)
export class SharedProjectionParameters<
  T extends ProjectionParameters = ProjectionParameters,
> extends SharedObject {
  private prevDisplayDimensionRenderInfo:
    | undefined
    | DisplayDimensionRenderInfo = undefined;
  constructor(
    rpc: RPC,
    public base: WatchableValueChangeInterface<T>,
    public updateInterval = 10,
  ) {
    super();
    this.initializeCounterpart(rpc, { value: base.value });
    this.registerDisposer(base.changed.add(this.update));
  }

  flush() {
    this.update.flush();
  }

  private update = this.registerCancellable(
    debounce((_oldValue: T, newValue: T) => {
      // Note: Because we are using debouce, we cannot rely on `_oldValue`, since
      // `DerivedProjectionParameters` reuses the objects.
      let valueUpdate: any;
      if (
        newValue.displayDimensionRenderInfo !==
        this.prevDisplayDimensionRenderInfo
      ) {
        valueUpdate = newValue;
        this.prevDisplayDimensionRenderInfo =
          newValue.displayDimensionRenderInfo;
      } else {
        const { displayDimensionRenderInfo, ...remainder } = newValue;
        valueUpdate = remainder;
      }
      this.rpc!.invoke(PROJECTION_PARAMETERS_CHANGED_RPC_METHOD_ID, {
        id: this.rpcId,
        value: valueUpdate,
      });
    }, this.updateInterval),
  );
}
