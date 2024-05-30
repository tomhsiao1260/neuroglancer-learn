import { handleFileBtnOnClick } from "#src/util/file_system.js";
import { setDefaultInputEventBindings } from "#src/default_input_event_bindings.js";
import { DisplayContext } from "#src/display_context.js";
import { Viewer } from "#src/viewer.js";
import "#src/viewer.css";

// Zarr upload button
makeUploadButton();

// Space Key: used for debugging
document.addEventListener("keyup", async (e) => {
  if (e.code === "Space") makeMinimalViewer();
});

function makeUploadButton() {
  const button = document.createElement("button");
  button.id = "upload";
  button.innerText = "choose .zarr folder";
  button.onclick = makeMinimalViewer;

  const container = document.createElement("div");
  container.id = "upload-container";
  container.appendChild(button);
  document.body.appendChild(container);
}

async function makeMinimalViewer() {
  const container = document.querySelector("#upload-container");
  container.style.display = "none";

  // Load data via file system api
  const fileTree = await handleFileBtnOnClick();
  self.fileTree = fileTree;

  const target = document.createElement("div");
  target.id = "neuroglancer-container";
  document.body.appendChild(target);
  const display = new DisplayContext(target);
  const viewer = new Viewer(display);

  // mouse control events
  setDefaultInputEventBindings(viewer.inputEventBindings);
}
