import { RefCounted } from "#src/util/disposable.ts";

export class FourPanelLayout extends RefCounted {
  element = document.createElement("div");

  constructor(public viewer) {
    super();

    this.element.style.flex = "1";
    this.element.style.display = "flex";
    this.element.style.flexDirection = "row";

    const elementXY = document.createElement("div");
    elementXY.style.flex = "1";
    elementXY.style.backgroundColor = "blue";

    const elementYZ = document.createElement("div");
    elementYZ.style.flex = "1";
    elementYZ.style.backgroundColor = "yellow";

    this.element.appendChild(elementXY);
    this.element.appendChild(elementYZ);
  }
}
