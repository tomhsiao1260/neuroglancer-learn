import { RefCounted } from "#src/util/disposable.ts";
import { DataPanelLayoutContainer } from "#src/data_panel_layout.ts";

export class LayerGroupViewer extends RefCounted {
  layout: DataPanelLayoutContainer;

  constructor(public element: HTMLElement) {
    super();

    this.layout = this.registerDisposer(new DataPanelLayoutContainer());

    element.style.flex = "1";
    element.style.display = "flex";
    element.style.flexDirection = "column";
    element.appendChild(this.layout.element);
  }
}
