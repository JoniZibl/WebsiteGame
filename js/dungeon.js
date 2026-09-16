import { mulberry32 } from './noise.js';

/* ==========================================================================
 *  Gruften.
 *
 *  Eine Gruft ist ein Satz Quader: ein Schacht vom Eingang nach unten, Räume
 *  auf einem lockeren Raster und Gänge dazwischen. Das Gelände fragt für jeden
 *  Block nur, ob er in einem dieser Quader liegt — dann ist dort Luft.
 *
 *  Die Höhe des Geländes kommt von außen herein (voxel.js reicht sie durch),
 *  damit die beiden Dateien sich nicht gegenseitig importieren müssen.
 * ========================================================================== */

let hoeheVon = () => 20;
let saatVon = () => 1337;
export function verbinden(hoehe, saat) { hoeheVon = hoehe; saatVon = saat; }

const RASTER = 170;
const NAMEN = ['Grimmhöhle', 'Alte Gruft', 'Wolfsloch', 'Steinkammer', 'Nebelgrab',
  'Rabenstollen', 'Tiefe Halle', 'Aschekeller', 'Kalter Schlund', 'Wurmgang'];

const plaene = new Map();
const zellen = new Map();
export function zellenLeeren() { zellen.clear(); plaene.clear(); }

/** Liegt in dieser Rasterzelle eine Gruft? Das Ergebnis wird gemerkt — sonst
 *  liefe für jeden einzelnen Block ein neuer Zufallsgenerator an. */
export function gruftInZelle(i, j) {
  const key = i + ',' + j;
  if (zellen.has(key)) return zellen.get(key);
  const g = rechneZelle(i, j);
  zellen.set(key, g);
  return g;
}

function rechneZelle(i, j) {
  const rand = mulberry32(((i * 668265263) ^ (j * 2246822519) ^ (saatVon() * 31)) >>> 0);
  if (rand() > 0.55) return null;
  const x = Math.round(i * RASTER + (rand() - 0.5) * RASTER * 0.6);
  const z = Math.round(j * RASTER + (rand() - 0.5) * RASTER * 0.6);
  const h = hoeheVon(x, z);
  if (h < 8) return null;
  return {
    i, j, x, z, h,
    id: `${i},${j}`,
    name: NAMEN[Math.abs((i * 7 + j * 13)) % NAMEN.length],
    stufe: 1 + Math.min(5, Math.floor(Math.hypot(x, z) / 420)),
    saat: (rand() * 1e9) | 0,
  };
}

export function grueftUm(x, z, reichweite = RASTER * 1.5) {
  const out = [];
  const n = Math.ceil(reichweite / RASTER) + 1;
  const i0 = Math.round(x / RASTER), j0 = Math.round(z / RASTER);
  for (let j = j0 - n; j <= j0 + n; j++) {
    for (let i = i0 - n; i <= i0 + n; i++) {
      const d = gruftInZelle(i, j);
      if (d && Math.hypot(x - d.x, z - d.z) < reichweite) out.push(d);
    }
  }
  return out;
}

/* ------------------------------ Der Grundriss ------------------------------ */
export function plan(gruft) {
  if (plaene.has(gruft.id)) return plaene.get(gruft.id);
  const rand = mulberry32(gruft.saat >>> 0);

  const raeume = [];
  const gaenge = [];
  const bodenY = Math.max(6, gruft.h - 16);

  // Der Schacht vom Eingang nach unten
  gaenge.push({ x0: gruft.x - 1, x1: gruft.x + 1, y0: bodenY, y1: gruft.h + 1,
                z0: gruft.z - 1, z1: gruft.z + 1 });

  let cx = gruft.x, cz = gruft.z, cy = bodenY;
  const anzahl = 4 + Math.floor(rand() * 4);
  let letztes = { x: cx, z: cz, y: cy };

  for (let n = 0; n < anzahl; n++) {
    const winkel = rand() * Math.PI * 2;
    const weite = 14 + rand() * 12;
    cx = Math.round(cx + Math.cos(winkel) * weite);
    cz = Math.round(cz + Math.sin(winkel) * weite);
    if (n > 1 && rand() < 0.5) cy = Math.max(4, cy - 3 - Math.floor(rand() * 3));

    const bw = 5 + Math.floor(rand() * 5);
    const bt = 5 + Math.floor(rand() * 5);
    const bh = 4 + Math.floor(rand() * 2);
    const raum = {
      x0: cx - bw, x1: cx + bw, y0: cy, y1: cy + bh,
      z0: cz - bt, z1: cz + bt,
      mitte: { x: cx, y: cy, z: cz },
      letzter: n === anzahl - 1,
    };
    raeume.push(raum);

    // Gang vom letzten Raum hierher: erst in x, dann in z, auf Gehhöhe
    const gy = Math.min(letztes.y, cy);
    gaenge.push({ x0: Math.min(letztes.x, cx) - 1, x1: Math.max(letztes.x, cx) + 1,
                  y0: gy, y1: gy + 3, z0: letztes.z - 1, z1: letztes.z + 1 });
    gaenge.push({ x0: cx - 1, x1: cx + 1, y0: gy, y1: gy + 3,
                  z0: Math.min(letztes.z, cz) - 1, z1: Math.max(letztes.z, cz) + 1 });
    letztes = { x: cx, z: cz, y: cy };
  }

  // Umfassender Quader für den schnellen Ausschluss
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const q of [...raeume, ...gaenge]) {
    minX = Math.min(minX, q.x0); maxX = Math.max(maxX, q.x1);
    minZ = Math.min(minZ, q.z0); maxZ = Math.max(maxZ, q.z1);
    minY = Math.min(minY, q.y0); maxY = Math.max(maxY, q.y1);
  }

  const p = { gruft, raeume, gaenge, bodenY, huelle: { minX, maxX, minY, maxY, minZ, maxZ } };
  plaene.set(gruft.id, p);
  return p;
}

const drin = (q, x, y, z) =>
  x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1 && z >= q.z0 && z <= q.z1;

/** Die Grundrisse, die diese Spalte überhaupt treffen können. Einmal je
 *  Spalte bestimmt, dann für alle 44 Blöcke wiederverwendet. */
export function gruftenNahe(x, z) {
  const treffer = [];
  const i0 = Math.round(x / RASTER), j0 = Math.round(z / RASTER);
  for (let j = j0 - 1; j <= j0 + 1; j++) {
    for (let i = i0 - 1; i <= i0 + 1; i++) {
      const g = gruftInZelle(i, j);
      if (!g) continue;
      if (Math.abs(x - g.x) > 95 || Math.abs(z - g.z) > 95) continue;
      const p = plan(g);
      const h = p.huelle;
      if (x < h.minX - 1 || x > h.maxX + 1 || z < h.minZ - 1 || z > h.maxZ + 1) continue;
      treffer.push(p);
    }
  }
  return treffer;
}

/** Ist dieser Block ausgehöhlt? 0 = nein, 1 = Luft, 2 = Bodenplatte. */
export function hohlIn(plaeneNah, x, y, z) {
  for (const p of plaeneNah) {
    const h = p.huelle;
    if (y < h.minY - 1 || y > h.maxY + 1) continue;
    for (const q of p.raeume) if (drin(q, x, y, z)) return y === q.y0 ? 2 : 1;
    for (const q of p.gaenge) if (drin(q, x, y, z)) return y === q.y0 ? 2 : 1;
  }
  return 0;
}

export function hohlBei(x, y, z) { return hohlIn(gruftenNahe(x, z), x, y, z); }

/** Alles, was in einer Gruft an Leben und Beute steht. */
export function bewohner(gruft) {
  const p = plan(gruft);
  const rand = mulberry32((gruft.saat ^ 0x5f3759df) >>> 0);
  const feinde = [];
  const truhen = [];

  p.raeume.forEach((raum, idx) => {
    const n = idx === 0 ? 1 : 1 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      feinde.push({
        x: raum.mitte.x + (rand() - 0.5) * (raum.x1 - raum.x0) * 0.7,
        y: raum.y0 + 1,
        z: raum.mitte.z + (rand() - 0.5) * (raum.z1 - raum.z0) * 0.7,
        art: raum.letzter && k === 0 ? 'hauptmann' : rand() < 0.45 ? 'skelett' : 'raeuber',
        stufe: gruft.stufe,
      });
    }
    if (raum.letzter || rand() < 0.4) {
      truhen.push({ x: raum.mitte.x + 2, y: raum.y0 + 1, z: raum.mitte.z + 2,
                    gross: raum.letzter });
    }
  });

  return { feinde, truhen, plan: p };
}
