import "#main";
import { fetchOk } from "#src/util/http_request.ts";

async function test() {
  const input = "http://localhost:9000/scroll.zarr/0/0/1/1";
  const res = await fetchOk(input);

  console.log(res);
}

test();
