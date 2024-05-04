import { Viewer } from "#src/viewer.ts";

export class RootLayoutContainer {
  container = document.createElement("div");

  get element() {
    return this.container;
  }

  constructor(public viewer: Viewer, public defaultSpecification: any) {}
}
