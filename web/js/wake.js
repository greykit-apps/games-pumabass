// Keeps the screen on while PumaBass is open, always, so a TV doesn't dim or sleep in
// the middle of playing along, or of reading a chart. The Screen Wake Lock is only a request:
// where the browser refuses it, or has none, the screen sleeps as it would anyway.

let lock = null, wanted = false, asking = false;

async function take() {
  if (!wanted || lock || asking || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  asking = true;
  try {
    const l = await navigator.wakeLock.request('screen');
    lock = l;
    lock.addEventListener('release', () => { lock = null; });
  } catch (e) { /* refused (a low battery, a policy): the screen sleeps as usual */ }
  finally { asking = false; }
}

/* On from the start, for as long as the page is open. */
export function keepScreenOn() {
  wanted = true;
  take();
}

// The browser lets go whenever the page is hidden: take it again on the way back.
document.addEventListener('visibilitychange', take);

export const screenLocked = () => !!lock; // for checking
