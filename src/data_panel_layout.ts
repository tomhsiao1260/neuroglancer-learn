import { RefCounted } from "#src/util/disposable.ts";

export class DataPanelLayoutContainer extends RefCounted {
  element = document.createElement("div");

  constructor() {
    super();
    this.element.style.flex = "1";

    this.updateLayout();
  }

  updateLayout() {}
}
