import { Viewer } from "#src/viewer.ts";
import { RefCounted } from "#src/util/disposable.ts";

/**
 * Container for a LayoutComponent.  The contained LayoutComponent may change.
 */
export class LayoutComponentContainer {
  element = document.createElement("div");

  constructor(public viewer: Viewer, spec: any) {
    const { element } = this;
    element.style.display = "flex";
    element.style.flex = "1";
    element.style.position = "relative";
    element.style.alignItems = "stretch";
  }
}

export class RootLayoutContainer extends RefCounted {
  container = new LayoutComponentContainer(
    this.viewer,
    this.defaultSpecification
  );

  get element() {
    return this.container.element;
  }

  constructor(public viewer: Viewer, public defaultSpecification: any) {
    super();
  }
}
