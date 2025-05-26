import { cancellableFetchOk, HttpError } from "#src/util/http_request.js";

interface FileSystemDirectoryHandle {
  kind: "directory";
  name: string;
  values(): AsyncIterableIterator<FileSystemHandle>;
  getDirectoryHandle(name: string): Promise<FileSystemDirectoryHandle>;
}

interface FileSystemHandle {
  kind: "file" | "directory";
  name: string;
  getFile(): Promise<File>;
}

declare global {
  interface Window {
    showDirectoryPicker(): Promise<FileSystemDirectoryHandle>;
  }
}

export const handleFileBtnOnClick = async () => {
  try {
    const directoryHandle = await window.showDirectoryPicker();
    const dir = await readDirectory(directoryHandle);
    console.log(dir);
    return dir;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      console.log("Directory selection was cancelled by user");
      return;
    }
    throw error;
  }
};

async function readDirectory(
  directoryHandle: FileSystemDirectoryHandle,
  path = ""
) {
  const url = "http://localhost:3005/api/data/zarr/dir";

  try {
    const res = await fetch(url);
    const json = await res.json();

    return json;
  } catch (e) {
    console.log(e);
  }
  return {};
}

export interface FileReadResponse {
  data: Uint8Array;
  totalSize: number;
}

export class FileReader {
  constructor(public baseUrl: string) {}

  async read(key: string): Promise<FileReadResponse | undefined> {
    const url =
      `http://localhost:3005/api/data/zarr?key=${this.baseUrl.slice(-2, -1)}/` +
      key;

    try {
      const res = await fetch(url);
      const json = await res.json();

      const buffer = new Uint8Array(json.data);

      return {
        data: buffer,
        totalSize: buffer.byteLength,
      };
    } catch (e) {
      // Only log non-404 errors
      if (e instanceof HttpError && e.status === 404) {
        return undefined;
      }
      console.error(`Failed to read file: ${url}`, e);
      return undefined;
    }
  }
}
