import { Router, Request, Response } from "express";
import path from "path";
import fsp from "fs/promises";
import fs from "fs";
import { getSettings } from "../utils/settings";
import vcgrab from "../utils/vcgrab";

const router = Router();

router.get("/zarr/all", async (req: Request, res: Response) => {
  const settings = await getSettings();
  const zarrMap = {} as any;

  if (settings.zarr_data_path) {
    const entries = await fsp.readdir(settings.zarr_data_path, {
      recursive: true,
      withFileTypes: true,
    });
    for (const entry of entries) {
      let isFile = entry.isFile();
      if (isFile) {
        const data = await fsp.readFile(
          path.join(entry.parentPath, entry.name)
        );

        const id = path.relative(
          settings.zarr_data_path,
          path.join(entry.parentPath, entry.name)
        );

        zarrMap[id] = data;
      }
    }
  }

  res.json({ zarrMap });
});

// http://localhost:3005/api/data/zarr?key=0/52/12/13
router.get("/zarr", async (req: Request, res: Response) => {
  const { key } = req.query as { key: string };

  const settings = await getSettings();

  const zarrPath = path.join(settings.zarr_data_path, key);

  if (fs.existsSync(zarrPath)) {
    const data = await fsp.readFile(path.join(settings.zarr_data_path, key));
    res.json(data);
  } else {
    res.json({});
  }
});

router.get("/zarr/dir", async (req: Request, res: Response) => {
  const settings = await getSettings();

  const zarrPath = settings.zarr_data_path;

  try {
    const tree = await getDirectoryTree(zarrPath);
    res.json(tree);
  } catch (err) {
    res.status(500).json({ error: "Failed to read directory" });
  }
});

async function getDirectoryTree(dirPath: string): Promise<any> {
  const entries = await fsp.readdir(dirPath, { withFileTypes: true });

  const result: Record<string, any> = {};

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      result[entry.name] = await getDirectoryTree(fullPath);
    } else {
      result[entry.name] = { name: entry.name };
    }
  }

  return result;
}

router.get("/zarr/config", async (req: Request, res: Response) => {
  const settings = await getSettings();
  const zarrPath = settings.zarr_data_path;

  try {
    const data = await getZarrConfig(zarrPath);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to read Zarr config files" });
  }
});

async function getZarrConfig(basePath: string): Promise<Record<string, any>> {
  const targets = [
    ".zattrs",
    ".zgroup",
    "0/.zarray",
    "1/.zarray",
    "2/.zarray",
    "3/.zarray",
    "4/.zarray",
    "5/.zarray",
  ];

  const result: Record<string, any> = {};

  for (const relativePath of targets) {
    const fullPath = path.join(basePath, relativePath);

    try {
      const content = await fsp.readFile(fullPath, "utf-8");
      result[relativePath] = { data: JSON.parse(content) };
    } catch (err) {
      result[relativePath] = { error: "File not found or invalid JSON" };
    }
  }

  return result;
}

// http://localhost:3005/api/data/zarr/download?key=0/52/12/13
router.get("/zarr/download", async (req: Request, res: Response) => {
  const { key } = req.query as { key: string };

  const settings = await getSettings();

  const zarrPath = path.join(settings.zarr_data_path, key);

  if (!fs.existsSync(zarrPath)) {
    await vcgrab(
      "https://dl.ash2txt.org/full-scrolls/Scroll1/PHercParis4.volpkg/volumes_zarr_standardized/54keV_7.91um_Scroll1A.zarr/" +
        key,
      settings.zarr_data_path,
      "full-scrolls/Scroll1/PHercParis4.volpkg/volumes_zarr_standardized/54keV_7.91um_Scroll1A.zarr/"
    );
  }
  res.json({ success: true });
});

export default router;
