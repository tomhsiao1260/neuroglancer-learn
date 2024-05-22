export async function cancellableFetchOk(input, transformResponse) {
  const response = await fetchOk(input);
  const body = await transformResponse(response);
  return body;
}

async function fetchOk(input) {
  let response;

  try {
    response = await getFile(input, self.fileTree);
  } catch (e) {
    return false;
  }

  return response;
}

async function getFile(input: string, fileTree: any) {
  let res = fileTree;

  const path = new URL(input).pathname;
  const parts = path
    .split("/")
    .filter((part) => part.length > 0)
    .slice(1);

  for (const part of parts) {
    res = res[part];
  }

  return res;
}

export function responseArrayBuffer(response: Response): Promise<ArrayBuffer> {
  return response.arrayBuffer();
}

export async function responseJson(response: Response): Promise<any> {
  const res = await response.text();
  return JSON.parse(res);
}
