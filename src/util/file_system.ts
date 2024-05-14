export const handleFileBtnOnClick = async () => {
  const directoryHandle = await window.showDirectoryPicker();
  const dir = await readDirectory(directoryHandle);

  return dir;
};

export const handleFileOnClick = async (file: File) => {
  const arraybuffer = await file.arrayBuffer();
  const blob = new Blob([arraybuffer], { type: file.name });
  const text = await file.text();

  return arraybuffer;
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
