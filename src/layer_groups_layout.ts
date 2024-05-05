import { RefCounted } from "#src/util/disposable.ts";
import { Viewer } from "#src/viewer.ts";
import { LayerGroupViewer } from "#src/layer_group_viewer.ts";

export class SingletonLayerGroupViewer extends RefCounted {
  layerGroupViewer: LayerGroupViewer;

  constructor(public element: HTMLElement, layout: any, viewer: Viewer) {
    super();
    this.layerGroupViewer = this.registerDisposer(
      new LayerGroupViewer(element)
    );
  }
}

/**
 * Container for a LayoutComponent.  The contained LayoutComponent may change.
 */
export class LayoutComponentContainer extends RefCounted {
  element = document.createElement("div");

  // spec: "4panel"
  constructor(public viewer: Viewer, spec: any) {
    super();
    const { element } = this;
    element.style.display = "flex";
    element.style.flex = "1";
    element.style.position = "relative";
    element.style.alignItems = "stretch";

    const el = document.createElement("div");
    el.style.flex = "1";
    el.style.width = "0px";
    const component = new SingletonLayerGroupViewer(el, spec, this.viewer);

    element.appendChild(component.element);
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
