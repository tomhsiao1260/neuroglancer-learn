import "#main";
import { cancellableFetchOk } from "#src/util/http_request.ts";

const url = {};
url.zarray = "http://localhost:9000/scroll.zarr/0/.zarray";
url.zattrs = "http://localhost:9000/scroll.zarr/.zattrs";
url.data = "http://localhost:9000/scroll.zarr/0/0/0/0";

async function test() {
  const [zarray, zattrs, data] = await Promise.all([
    cancellableFetchOk(url.zarray, (res) => res.json()),
    cancellableFetchOk(url.zattrs, (res) => res.json()),
    cancellableFetchOk(url.data, (res) => res.arrayBuffer()),
  ]);

  console.log(zarray, zattrs, data);
}

test();
