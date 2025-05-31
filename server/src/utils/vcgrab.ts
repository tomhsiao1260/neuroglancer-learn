import * as cheerio from "cheerio";
import fs from "fs/promises";
import path from "path";
import { getSettings } from "./settings";

export default async function vcgrab(
  url: string,
  downloadPath: string,
  downloadRelative: string
) {
  fetchNode(url, downloadPath, downloadRelative);
}

async function fetchNode(
  url: string,
  downloadPath: string,
  downloadRelative: string
) {
  sleep(100);

  const settings = await getSettings();

  const USERNAME = settings.username || "";
  const PASSWORD = settings.password || "";

  var headers = new Headers({
    Authorization: `Basic ${btoa(USERNAME + ":" + PASSWORD)}`,
  });

  try {
    const res = await fetch(url, { headers: headers });

    // download files

    const node = url.split("/").slice(-1)[0];

    if (!node?.endsWith("/")) {
      const buffer = await res.arrayBuffer();

      await fs.mkdir(
        path.join(
          downloadPath,
          path.relative(downloadRelative, url.slice(23, -node.length))
        ),
        {
          recursive: true,
        }
      );

      fs.writeFile(
        path.join(
          downloadPath,
          path.relative(downloadRelative, url.slice(23, -node.length)),
          node
        ),
        Buffer.from(buffer)
      );
    } else {
      const html = await res.text();
      const $ = cheerio.load(html);

      const hrefs = $(".link a")
        .slice(1)
        .map(function () {
          // console.log($(this).attr("href"));
          return $(this).attr("href");
        })
        .toArray();

      hrefs.forEach((href) => {
        fetchNode(url + "/" + href, downloadPath, downloadRelative);
      });
    }
  } catch (e: any) {
    console.log("Grabbing Failed: " + e.message);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
