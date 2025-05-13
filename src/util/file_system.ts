import { cancellableFetchOk, HttpError } from "#src/util/http_request.js";

interface FileSystemDirectoryHandle {
  kind: 'directory';
  name: string;
  values(): AsyncIterableIterator<FileSystemHandle>;
  getDirectoryHandle(name: string): Promise<FileSystemDirectoryHandle>;
}

interface FileSystemHandle {
  kind: 'file' | 'directory';
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
    return dir;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.log('Directory selection was cancelled by user');
      return;
    }
    throw error;
  }
};

async function readDirectory(
  directoryHandle: FileSystemDirectoryHandle,
  path = "",
) {
  const files: any = {};

  for await (const item of directoryHandle.values()) {
    if (item.kind === "directory") {
      const subDirectoryHandle = await directoryHandle.getDirectoryHandle(
        item.name,
      );
      files[item.name] = await readDirectory(
        subDirectoryHandle,
        path + item.name + "/",
      );
    } else {
      const file = await item.getFile();
      files[item.name] = file;
    }
  }

  return files;
}

export interface FileReadResponse {
  data: Uint8Array;
  totalSize: number;
}

export class FileReader {
  constructor(public baseUrl: string) {}

  async read(key: string): Promise<FileReadResponse | undefined> {
    const url = this.baseUrl + key;
    try {
      const { data } = await cancellableFetchOk(url, async (response) => ({
        response,
        data: await response.arrayBuffer(),
      }));
      return {
        data: new Uint8Array(data),
        totalSize: data.byteLength,
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
