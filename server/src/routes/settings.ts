import { Router, Request, Response } from "express";
import path from "path";
import fsp from "fs/promises";
import { getSettings } from "../utils/settings";
import { dialog } from "electron";

const router = Router();

const SETTING_PATH = path.join(process.cwd(), "db", "json", "settings.json");

// Read settings
router.get("/", async (req: Request, res: Response) => {
  try {
    const settings = await getSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: "Failed to read settings file" });
  }
});

// Write settings
router.post("/", async (req: Request, res: Response) => {
  try {
    const newSettings = req.body;
    await fsp.writeFile(
      SETTING_PATH,
      JSON.stringify(newSettings, null, 2),
      "utf-8"
    );
    res.json({ message: "Settings updated successfully" });
  } catch (error) {
    console.error("Error writing settings file:", error);
    res.status(500).json({ error: "Failed to write settings file" });
  }
});

export default router;
