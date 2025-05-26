import path from "path";
import fsp from "fs/promises";

const SETTING_PATH = path.join(process.cwd(), "db", "json", "settings.json");

export async function getSettings() {
  try {
    const data = await fsp.readFile(SETTING_PATH, "utf-8");
    const json = JSON.parse(data);
    return json;
  } catch (error) {
    console.error("Error reading settings file:", error);
  }
}
