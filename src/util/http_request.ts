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
