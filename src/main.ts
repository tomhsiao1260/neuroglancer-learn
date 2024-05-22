import "#src/viewer.css";
import { handleFileBtnOnClick } from "#src/util/file_system.ts";
import { DisplayContext } from "#src/display_context.ts";
import { Viewer } from "#src/viewer.ts";
import {
  cancellableFetchOk,
  responseArrayBuffer,
  responseJson,
} from "#src/util/http_request.ts";

// Space key: Load data via file system api
document.addEventListener("keyup", async (e) => {
  if (e.code === "Space") {
    const fileTree = await handleFileBtnOnClick();
    self.fileTree = fileTree;

    test();

    makeMinimalViewer();
  }
});

function makeMinimalViewer() {
  const target = document.createElement("div");
  target.id = "neuroglancer-container";
  document.body.appendChild(target);
  const display = new DisplayContext(target);
  return new Viewer(display);
}

// load data via file system api
const url = {};
url.zarray = "http://localhost:9000/scroll.zarr/0/.zarray";
url.zattrs = "http://localhost:9000/scroll.zarr/.zattrs";
url.data = "http://localhost:9000/scroll.zarr/0/0/0/0";

async function test() {
  const [zarray, zattrs, data] = await Promise.all([
    cancellableFetchOk(url.zarray, (res) => responseJson(res)),
    cancellableFetchOk(url.zattrs, (res) => responseJson(res)),
    cancellableFetchOk(url.data, (res) => responseArrayBuffer(res)),
  ]);

  console.log(zarray, zattrs, data);
}
