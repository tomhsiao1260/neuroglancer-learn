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
