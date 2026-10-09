// Arrow keys move the focus around every screen: to the nearest control in the
// arrow's direction, as a TV remote would. The arrows' own jobs come first and
// are routed elsewhere (app.js): the player's seek and speed, the song list's
// rows and groups, the sync test's nudges, a slider's value, a text box's caret.

const DIRS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
const FOCUSABLE = 'button, input, select, summary, a[href], [tabindex]';

export const isArrow = key => key in DIRS;

/* What can take the focus inside roots (an element or several), as drawn: enabled, in
 * the tab order, on screen. */
export function focusables(roots) {
  return [].concat(roots).flatMap(r => [...r.querySelectorAll(FOCUSABLE)])
    .filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
}

/* The control nearest to `from` in the arrow's direction, inside roots; null when there's
 * none that way. Left and Right stay in the row: only controls level with `from` count.
 * Up and Down go to the next row first, and in it, to the control most nearly above or
 * below (the gap along the arrow, plus half the distance off to the side). */
export function nearest(roots, from, key) {
  const [dx, dy] = DIRS[key];
  const f = from.getBoundingClientRect();
  let best = null, bestScore = Infinity;
  for (const el of focusables(roots)) {
    if (el === from || el.contains(from) || from.contains(el)) continue;
    const r = el.getBoundingClientRect();
    // Ahead: past the far edge of `from` (a few px of overlap allowed, for rows that touch).
    const ahead = dx > 0 ? r.left >= f.right - 4 : dx < 0 ? r.right <= f.left + 4 : dy > 0 ? r.top >= f.bottom - 4 : r.bottom <= f.top + 4;
    if (!ahead) continue;
    const along = Math.max(0, dx > 0 ? r.left - f.right : dx < 0 ? f.left - r.right : dy > 0 ? r.top - f.bottom : f.top - r.bottom);
    const side = dx ? Math.max(0, r.top - f.bottom, f.top - r.bottom) : Math.max(0, r.left - f.right, f.left - r.right);
    // Among equals, the one lined up with `from`: centres level, or starting edges (a wide button
    // over a row of small ones goes to the row's first).
    const centre = dx ? Math.abs((r.top + r.bottom) - (f.top + f.bottom)) / 2
      : Math.min(Math.abs((r.left + r.right) - (f.left + f.right)) / 2, Math.abs(r.left - f.left));
    if (dx && side > 0) continue; // not in this row
    const score = along + (dy ? 0.5 * side : 0) + 0.05 * centre;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  return best;
}

/* Move the focus that way inside roots: to the nearest control, or (with nothing focused
 * there yet) to the first one. Returns the control moved to, or null. On a slider, whose
 * Left/Right set its value, Up/Down with nothing that way go to the next or previous
 * control in order instead, so sliders side by side can still reach each other. */
export function moveFocus(roots, key) {
  const from = document.activeElement;
  const inside = from && from !== document.body && [].concat(roots).some(r => r.contains(from));
  let to = inside ? nearest(roots, from, key) : focusables(roots)[0];
  if (!to && inside && from.matches('input[type=range]') && (key === 'ArrowUp' || key === 'ArrowDown')) {
    const all = focusables(roots), i = all.indexOf(from);
    to = all[i + (key === 'ArrowDown' ? 1 : -1)] || null;
  }
  if (!to) return null;
  to.focus({ preventScroll: true });
  to.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  return to;
}
