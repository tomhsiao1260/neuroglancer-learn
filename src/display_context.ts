export class DisplayContext {
  canvas = document.createElement("canvas");

  constructor(public container: HTMLElement) {
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

  /**
   * Returns a child element that overlays the canvas.
   */
  makeCanvasOverlayElement() {
    const element = document.createElement("div");
    element.style.position = "absolute";
    element.style.top = "0px";
    element.style.left = "0px";
    element.style.width = "100%";
    element.style.height = "100%";
    element.style.zIndex = "2";
    this.container.appendChild(element);
    return element;
  }
}
