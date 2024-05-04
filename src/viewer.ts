import { RootLayoutContainer } from "#src/layer_groups_layout.ts";

import type { DisplayContext } from "#src/display_context.ts";

export class Viewer {
  layout: RootLayoutContainer;
  element: HTMLElement;

  constructor(public display: DisplayContext) {
    const element = display.makeCanvasOverlayElement();

    this.element = element;

    this.makeUI();
  }

  private makeUI() {
    const gridContainer = this.element;
    gridContainer.classList.add("neuroglancer-viewer");
    gridContainer.classList.add("neuroglancer-noselect");
    gridContainer.style.display = "flex";
    gridContainer.style.flexDirection = "column";

    this.layout = new RootLayoutContainer(this, "4panel");
    gridContainer.appendChild(this.layout.element);
  }
}
