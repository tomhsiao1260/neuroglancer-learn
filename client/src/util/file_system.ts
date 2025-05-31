import { SERVER_API_ENDPOINT } from "#src/config.js";
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
    const username = document.querySelector("#account-input")?.value;
    const password = document.querySelector("#password-input")?.value;
    const zarr_data_path = document.querySelector("#zarr-path-input")?.value;
    const scroll_url_path = document.querySelector("#scroll-url-input")?.value;

    const url = SERVER_API_ENDPOINT + "/api/settings";
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        zarr_data_path,
        username,
        password,
        scroll_url_path,
      }),
    });
    const json = await res.json();
    if (json.success) {
      const url = SERVER_API_ENDPOINT + "/api/data/zarr/download/init";
      const res = await fetch(url);
      const json = await res.json();
      //  const directoryHandle = await window.showDirectoryPicker();
      if (json.success) {
        const dir = await readDirectory();
        return dir;
      }
    }
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      console.log("Directory selection was cancelled by user");
      return;
    }
    throw error;
  }
};

async function readDirectory(
  // directoryHandle: FileSystemDirectoryHandle,
  path = ""
) {
  const url = SERVER_API_ENDPOINT + "/api/data/zarr/dir";

  try {
    const res = await fetch(url);
    const files = res.json();
    return files;
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
      SERVER_API_ENDPOINT +
      `/api/data/zarr?key=${this.baseUrl.slice(-2, -1)}/` +
      key;

    try {
      const res = await fetch(url);
      const json = await res.json();

      if (json.data == null) return undefined;

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
      // return undefined;
    }
  }
}
