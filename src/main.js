import { handleFileBtnOnClick } from "#src/util/file_system.js";
import { setDefaultInputEventBindings } from "#src/default_input_event_bindings.js";
import { DisplayContext } from "#src/display_context.js";
import { Viewer } from "#src/viewer.js";
import "#src/viewer.css";

// Space key: Load data via file system api
document.addEventListener("keyup", async (e) => {
  if (e.code === "Space") {
    const fileTree = await handleFileBtnOnClick();
    self.fileTree = fileTree;

    const viewer = makeMinimalViewer();
    setDefaultInputEventBindings(viewer.inputEventBindings);
  }
});

function makeMinimalViewer() {
  const target = document.createElement("div");
  target.id = "neuroglancer-container";
  document.body.appendChild(target);
  const display = new DisplayContext(target);
  return new Viewer(display);
}
