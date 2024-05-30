import { RefCounted } from "#src/util/disposable.ts";
import type { DisplayContext } from "#src/display_context.ts";
import { FourPanelLayout } from "#src/data_panel_layout.ts";
import { LayerManager } from "#src/layer/index.ts";

export class DataManagementContext extends RefCounted {
  worker: Worker;

  constructor() {
    super();

    this.worker = new Worker(
      new URL("./chunk_worker.bundle.js", import.meta.url),
      { type: "module" }
    );

    this.worker.onmessage = (e) => {
      console.log("data from worker: ", e.data);
    };

    this.worker.postMessage({ message: "hello" });
  }
}

export class Viewer extends RefCounted {
  element: HTMLElement;

  layerManager = this.registerDisposer(new LayerManager());

  constructor(public display: DisplayContext) {
    super();

    const dataContext = new DataManagementContext();

    this.makeUI();
  }

  private makeUI() {
    // panel generation
    const panel = this.registerDisposer(
      new FourPanelLayout({ display: this.display })
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
    container.appendChild(panel.element);

    this.display.container.appendChild(container);
  }
}
