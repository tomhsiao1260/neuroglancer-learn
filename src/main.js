import { EventActionMap } from "#src/util/event_action_map.js";
import { handleFileBtnOnClick } from "#src/util/file_system.js";
import { DisplayContext } from "#src/display_context.js";
import { Viewer } from "#src/viewer.js";
import { READY_ID } from "#src/worker_rpc.js";
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

  const loading = document.createElement("div");
  loading.id = "loading";
  loading.innerText = "Loading ...";
  loading.style.display = "none";

  document.body.appendChild(button);
  document.body.appendChild(loading);
}

async function makeMinimalViewer() {
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
  // handle loading text
  loading(viewer.dataContext.worker);
}

function setDefaultInputEventBindings(inputEventBindings) {
  inputEventBindings.sliceView.addParent(
    EventActionMap.fromObject({
      "at:mousedown0": {
        action: "translate-via-mouse-drag",
        stopPropagation: true,
      },
      "control+wheel": { action: "zoom-via-wheel", preventDefault: true },
      "at:wheel": { action: "z+1-via-wheel", preventDefault: true },
    }),
    Number.NEGATIVE_INFINITY,
  );
}

function loading(worker) {
  const loading = document.querySelector("#loading");
  const button = document.querySelector("#upload");
  loading.style.display = "inline";
  button.style.display = "none";

  worker.addEventListener("message", (e) => {
    const isReady = e.data.functionName === READY_ID;
    if (isReady) loading.style.display = "none";
  });
}
