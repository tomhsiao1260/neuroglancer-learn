import * as cheerio from "cheerio";
import fs from "fs/promises";
import path from "path";
import { getSettings } from "./settings";

export default async function vcgrab(
  url: string,
  downloadPath: string,
  downloadRelative: string
) {
  await fetchNode(url, downloadPath, downloadRelative); // ✅ 加上 await
}

async function fetchNode(
  url: string,
  downloadPath: string,
  downloadRelative: string
) {
  await sleep(100); // ✅ 加 await

  const settings = await getSettings();

  const USERNAME = settings.username || "";
  const PASSWORD = settings.password || "";

  const headers = new Headers({
    Authorization: `Basic ${btoa(USERNAME + ":" + PASSWORD)}`,
  });

  try {
    const res = await fetch(url, { headers });

    const node = url.split("/").slice(-1)[0];

    if (!node?.endsWith("/")) {
      const buffer = await res.arrayBuffer();

      const targetDir = path.join(
        downloadPath,
        path.relative(downloadRelative, url.slice(23, -node.length))
      );

      await fs.mkdir(targetDir, { recursive: true });

      await fs.writeFile(path.join(targetDir, node), Buffer.from(buffer)); // ✅ 加 await
    } else {
      const html = await res.text();
      const $ = cheerio.load(html);

      const hrefs = $(".link a")
        .slice(1)
        .map(function () {
          return $(this).attr("href");
        })
        .toArray();

      // ✅ 遞迴處理時使用 for...of 搭配 await
      for (const href of hrefs) {
        await fetchNode(`${url}/${href}`, downloadPath, downloadRelative);
      }
    }
  } catch (e: any) {
    console.error("Grabbing Failed:", e.message);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
