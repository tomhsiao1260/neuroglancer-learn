/**
 * @license
 * Copyright 2016 Google Inc.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @file Main entry point for default neuroglancer viewer.
 */
import { setupDefaultViewer } from "#src/ui/default_viewer_setup.js";
import { handleFileBtnOnClick } from "#src/util/file_system.js";

window.dir = undefined;

document.addEventListener("keyup", async (e) => {
  // load data via python server
  if (e.code === "Enter") setupDefaultViewer();

  // load data via file system api
  if (e.code === "Space") {
    window.dir = await handleFileBtnOnClick();
    setupDefaultViewer();
  }
});
