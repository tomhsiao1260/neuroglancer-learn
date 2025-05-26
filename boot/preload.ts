// preload.ts
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  selectFolder: () => ipcRenderer.invoke("select-folder"),
});
