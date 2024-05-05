import { RefCounted } from "#src/util/disposable.ts";
import * as L from "#src/layout.ts";

export class FourPanelLayout extends RefCounted {
  constructor(public rootElement: HTMLElement) {
    super();

    const mainDisplayContents = [];
    L.box("row", mainDisplayContents)(rootElement);
  }
}

export class DataPanelLayoutContainer extends RefCounted {
  element = document.createElement("div");

  constructor() {
    super();
    this.element.style.flex = "1";

    new FourPanelLayout(this.element);
  }
}
