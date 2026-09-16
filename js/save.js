/* ==========================================================================
 *  Speichern.
 *
 *  Die Welt selbst steht in der Rechenvorschrift — gespeichert wird nur das
 *  Saatkorn und was der Spieler daran geändert hat. Das sind auch nach einer
 *  langen Grabung nur ein paar Kilobyte.
 * ========================================================================== */

const KEY = 'grabwelt.v1';

export function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;          // privater Modus, volle Quote — dann eben nicht
  }
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || typeof d.seed !== 'number' || !Array.isArray(d.edits)) return null;
    return d;
  } catch {
    return null;
  }
}

export function clear() {
  try { localStorage.removeItem(KEY); } catch { /* egal */ }
}

/** Änderungen kompakt: "x,y,z" -> Block wird zu [x, y, z, block, ...]. */
export function packEdits(edits) {
  const out = [];
  for (const [key, block] of edits) {
    const [x, y, z] = key.split(',');
    out.push(+x, +y, +z, block);
  }
  return out;
}

export function unpackEdits(flat, into) {
  for (let i = 0; i + 3 < flat.length; i += 4) {
    into.set(`${flat[i]},${flat[i + 1]},${flat[i + 2]}`, flat[i + 3]);
  }
  return into;
}
