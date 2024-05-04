import type { DisplayContext } from "#src/display_context.ts";

export class Viewer {
  constructor(public display: DisplayContext) {
    const element = display.makeCanvasOverlayElement();
  }
}
