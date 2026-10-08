// Talking to the PumaBass server (server/server.js).



/* Every request to the PumaBass server goes through api(). When one fails it
 * throws an Error whose message is ready to show the player: the server isn't
 * running, or it is older than this page (the page is always read fresh from
 * disk, the server only when it starts). Nothing fails silently. */
export const START_AGAIN = 'start it again (start.bat on Windows, ./start.sh on Linux)';
export const SERVER_DOWN = `PumaBass can't reach its server: its window may have been closed. Please ${START_AGAIN} and leave that window open.`;
export const SERVER_API = 4; // must match API_VERSION in server/server.js
export const SERVER_OLD = `PumaBass was updated while it was running. To finish the update, close its window and ${START_AGAIN}.`;
export async function api(path, opts) {
  let res;
  try { res = await fetch(path, opts); } catch (e) { throw new Error(SERVER_DOWN); }
  let body = null;
  try { body = await res.json(); } catch (e) { /* not JSON */ }
  if (res.status === 404 && !body) throw new Error(SERVER_OLD); // an address this server doesn't know yet
  if (!res.ok) throw new Error((body && body.error) || `The PumaBass server answered ${res.status}.`);
  return body;
}
