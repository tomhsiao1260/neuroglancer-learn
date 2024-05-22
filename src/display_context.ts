import { RefCounted } from "#src/util/disposable.ts";

export class DisplayContext extends RefCounted {
  canvas = document.createElement("canvas");

  constructor(public container: HTMLElement) {
    super();
    const { canvas } = this;
    container.style.position = "relative";
    canvas.style.position = "absolute";
    canvas.style.top = "0px";
    canvas.style.left = "0px";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.zIndex = "0";

    container.appendChild(canvas);
  }
}
