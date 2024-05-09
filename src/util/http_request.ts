/**
 * Issues a `fetch` request.
 */
export async function fetchOk(input) {
  let response;

  try {
    response = await fetch(input);
  } catch (e) {
    return false;
  }

  return response;
}

export async function cancellableFetchOk(input, transformResponse) {
  const response = await fetchOk(input);
  const body = await transformResponse(response);
  return body;
}
