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
let biomVon = () => 'wiese';
export function verbinden(hoehe, saat, biom) {
  hoeheVon = hoehe;
  saatVon = saat;
  if (biom) biomVon = biom;
}

const RASTER = 170;

/* ------------------------------ Was unten liegt ---------------------------
 * Ein Loch im Boden ist noch keine Gruft. Sechs Arten, und jede hat ihre
 * eigene Bauweise: die Mine gräbt lange schmale Stollen mit Stützbalken, die
 * Halle stellt Säulen in Reihen, die Frostgrotte friert Becken ein, das
 * Moorloch säuft ab und legt Stege darüber. Was hier steht, entscheidet über
 * Grundriss, Stoff, Licht und Getier gleichermaßen — sonst wären es sechs
 * Anstriche auf demselben Keller.
 * -------------------------------------------------------------------------- */
export const GRUFTARTEN = {
  gruft: {
    name: 'Gruft', wort: 'Grabkammern',
    namen: ['Alte Gruft', 'Nebelgrab', 'Steinkammer', 'Rabengruft', 'Stilles Grab'],
    raeume: [4, 3], breite: [5, 4], hoehe: [4, 2], gangBreit: 1,
    saeulen: 0.35, saeulenWeite: 4, becken: 0, adern: 0.15, nischen: 0.8,
    steg: false, podest: true,
    decke: 'voll',
    volk: ['skelett', 'skelett', 'raeuber'], chef: 'hauptmann',
  },
  stollen: {
    name: 'Stollen', wort: 'Stollen',
    namen: ['Rabenstollen', 'Wurmgang', 'Altes Bergwerk', 'Tiefer Stollen', 'Erzloch'],
    raeume: [5, 3], breite: [4, 3], hoehe: [3, 2], gangBreit: 1,
    saeulen: 0.9, saeulenWeite: 3, becken: 0.15, adern: 0.85, nischen: 0.2,
    steg: false, podest: false,
    decke: 'balken',
    volk: ['kriecher', 'spinne', 'raeuber'], chef: 'steinruecken',
  },
  halle: {
    name: 'Halle', wort: 'Hallen',
    namen: ['Versunkene Halle', 'Tiefe Halle', 'Säulengang', 'Königskeller'],
    raeume: [3, 2], breite: [8, 4], hoehe: [5, 2], gangBreit: 2,
    saeulen: 1, saeulenWeite: 4, becken: 0.4, adern: 0.2, nischen: 0.4,
    steg: true, podest: true,
    decke: 'voll',
    volk: ['skelett', 'schuetze', 'skelett'], chef: 'hauptmann',
  },
  frost: {
    name: 'Frostgrotte', wort: 'Eisgänge',
    namen: ['Kalter Schlund', 'Firnhöhle', 'Frostgrotte', 'Eiskeller'],
    raeume: [4, 3], breite: [6, 4], hoehe: [4, 3], gangBreit: 1,
    saeulen: 0.5, saeulenWeite: 5, becken: 0.7, adern: 0.3, nischen: 0.1,
    steg: false, podest: false,
    decke: null,
    volk: ['frostwolf', 'skelett', 'frostwolf'], chef: 'firnriese',
  },
  moor: {
    name: 'Moorloch', wort: 'Moorgänge',
    namen: ['Moorloch', 'Schlickgrube', 'Nasses Grab', 'Unkenkeller'],
    raeume: [4, 3], breite: [6, 4], hoehe: [4, 2], gangBreit: 1,
    saeulen: 0.3, saeulenWeite: 5, becken: 0.85, adern: 0.1, nischen: 0.2,
    steg: true, podest: false,
    decke: null,
    volk: ['unke', 'spinne', 'moorschrat'], chef: 'moorschrat',
  },
  glut: {
    name: 'Glutstollen', wort: 'Glutgänge',
    namen: ['Aschekeller', 'Glutstollen', 'Roter Grund', 'Schwelkammer'],
    raeume: [4, 3], breite: [6, 4], hoehe: [4, 2], gangBreit: 1,
    saeulen: 0.4, saeulenWeite: 4, becken: 0.2, adern: 0.9, nischen: 0.3,
    steg: false, podest: true,
    decke: null,
    volk: ['ghul', 'skelett', 'kriecher'], chef: 'aschwyrm',
  },
};

/* Was ein Block in einer Gruft ist. Welcher Stoff dahintersteckt, entscheidet
   voxel.js — hier steht nur die Rolle, damit die beiden Dateien sich nicht
   gegenseitig in die Materialliste greifen müssen. */
export const M = {
  fest: 0, luft: 1, boden: 2, stufe: 3, wasser: 4, licht: 5, saeule: 6, zier: 7,
};

/* Welche Art wo liegt: die Gegend darüber entscheidet mit. Eine Frostgrotte
   unter der Wiese wäre ein Gag, keine Welt. */
function artFuer(biom, stufe, rand) {
  const w = rand();
  if (biom === 'schnee' || biom === 'taiga' || biom === 'berg') {
    if (w < 0.5) return 'frost';
  }
  if (biom === 'sumpf') {
    if (w < 0.65) return 'moor';
  }
  if (biom === 'mesa' || biom === 'wueste') {
    if (w < 0.5) return 'glut';
  }
  if (stufe >= 3 && w < 0.22) return 'halle';
  return w < 0.55 ? 'stollen' : 'gruft';
}

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
  const stufe = 1 + Math.min(5, Math.floor(Math.hypot(x, z) / 420));
  const art = artFuer(biomVon(x, z), stufe, rand);
  const vorlage = GRUFTARTEN[art];
  return {
    i, j, x, z, h, art,
    id: `${i},${j}`,
    name: vorlage.namen[Math.abs(i * 7 + j * 13) % vorlage.namen.length],
    stufe,
    saat: (rand() * 1e9) | 0,
  };
}

export const artVon = (gruft) => GRUFTARTEN[gruft && gruft.art] || GRUFTARTEN.gruft;

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

/* ------------------------------ Der Grundriss ------------------------------
 * Jede Art baut anders: wie viele Kammern, wie breit, wie hoch, wie breit die
 * Gänge. Dazu kommt, was in den Kammern steht — Säulen, Becken, Grabnischen,
 * Adern im Fels, ein Podest für die letzte Truhe. Alles bleibt ein Satz
 * Quader plus ein paar Regeln, damit die Abfrage je Block billig bleibt.
 * -------------------------------------------------------------------------- */
export function plan(gruft) {
  if (plaene.has(gruft.id)) return plaene.get(gruft.id);
  const rand = mulberry32(gruft.saat >>> 0);
  const a = artVon(gruft);

  const raeume = [];
  const gaenge = [];
  const bodenY = Math.max(4, gruft.h - (gruft.schlund ? 26 : 16));

  // Der Schacht vom Eingang nach unten, fünf mal fünf breit — hinein passt
  // eine Wendeltreppe, und damit kommt man auch wieder heraus.
  const schacht = { x: gruft.x, z: gruft.z, unten: bodenY, oben: gruft.h + 1 };
  gaenge.push({ x0: gruft.x - 2, x1: gruft.x + 2, y0: bodenY, y1: gruft.h + 1,
                z0: gruft.z - 2, z1: gruft.z + 2 });

  let cx = gruft.x, cz = gruft.z, cy = bodenY;
  const anzahl = a.raeume[0] + Math.floor(rand() * a.raeume[1]);
  let letztes = { x: cx, z: cz, y: cy };
  const gb = a.gangBreit;

  for (let n = 0; n < anzahl; n++) {
    const winkel = rand() * Math.PI * 2;
    const weite = 14 + rand() * 12;
    cx = Math.round(cx + Math.cos(winkel) * weite);
    cz = Math.round(cz + Math.sin(winkel) * weite);
    if (n > 1 && rand() < 0.5) cy = Math.max(4, cy - 3 - Math.floor(rand() * 3));

    const bw = a.breite[0] + Math.floor(rand() * a.breite[1]);
    const bt = a.breite[0] + Math.floor(rand() * a.breite[1]);
    const bh = a.hoehe[0] + Math.floor(rand() * a.hoehe[1]);
    const letzter = n === anzahl - 1;
    const gross = Math.min(bw, bt);
    const raum = {
      x0: cx - bw, x1: cx + bw, y0: cy, y1: cy + bh,
      z0: cz - bt, z1: cz + bt,
      mitte: { x: cx, y: cy, z: cz },
      letzter,
      /* Was in dieser Kammer steht. Säulen brauchen Platz, Becken auch —
         in einer Besenkammer wirkt beides wie ein Möbelhaus. */
      saeulen: gross >= 5 && rand() < a.saeulen ? a.saeulenWeite : 0,
      becken: gross >= 5 && !letzter && rand() < a.becken
        ? Math.max(2, Math.floor(gross * 0.55)) : 0,
      adern: rand() < a.adern,
      steg: a.steg,
      decke: a.decke,
      podest: letzter && a.podest,
    };
    raeume.push(raum);

    // Gang vom letzten Raum hierher: erst in x, dann in z, auf Gehhöhe
    const gy = Math.min(letztes.y, cy);
    gaenge.push({ x0: Math.min(letztes.x, cx) - gb, x1: Math.max(letztes.x, cx) + gb,
                  y0: gy, y1: gy + 2 + gb, z0: letztes.z - gb, z1: letztes.z + gb,
                  gang: true });
    gaenge.push({ x0: cx - gb, x1: cx + gb, y0: gy, y1: gy + 2 + gb,
                  z0: Math.min(letztes.z, cz) - gb, z1: Math.max(letztes.z, cz) + gb,
                  gang: true });

    /* Grabnischen: flache Löcher in der Wand, eines je zwei Blöcke, mit einem
       Sarg darin. Sie kosten fast nichts und machen aus einem Kasten einen
       Ort, an dem einmal jemand gelegen hat. */
    if (rand() < a.nischen) {
      const tief = 2;
      for (let t = -bt + 2; t <= bt - 2; t += 3) {
        const links = rand() < 0.5;
        const wx = links ? cx - bw - tief : cx + bw;
        gaenge.push({ x0: wx, x1: wx + tief, y0: cy, y1: cy + 2,
                      z0: cz + t - 1, z1: cz + t, nische: true });
      }
    }
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

  const p = { gruft, art: gruft.art || 'gruft', vorlage: a, raeume, gaenge, bodenY,
              schacht, huelle: { minX, maxX, minY, maxY, minZ, maxZ } };
  plaene.set(gruft.id, p);
  return p;
}

/* Die Treppe läuft am Rand des Schachts entlang, eine Stufe je Blockhöhe.
   Aufeinanderfolgende Stufen grenzen aneinander — damit ist sie begehbar,
   ohne dass jemand springen können muss. */
const RING = [
  [2, -2], [2, -1], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [-1, 2],
  [-2, 2], [-2, 1], [-2, 0], [-2, -1], [-2, -2], [-1, -2], [0, -2], [1, -2],
];

function stufeBei(p, x, y, z) {
  const s = p.schacht;
  if (!s || y < s.unten || y > s.oben) return false;
  const dx = x - s.x, dz = z - s.z;
  if (Math.abs(dx) > 2 || Math.abs(dz) > 2) return false;
  const i = ((s.oben - y) % RING.length + RING.length) % RING.length;
  const [sx, sz] = RING[i];
  return dx === sx && dz === sz;
}

/** Wo die Treppe oben anfängt — dort setzt man den Fuß hinein. */
export function treppenKopf(gruft) {
  const p = plan(gruft);
  const s = p.schacht;
  const [sx, sz] = RING[0];
  return { x: s.x + sx + 0.5, y: s.oben + 1, z: s.z + sz + 0.5 };
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

/* Was in einer Kammer an dieser Stelle steht. Die Reihenfolge ist die
   Bauordnung: erst das Podest, dann die Säulen, dann das Becken, dann die
   Adern in der Wand, zuletzt der nackte Boden. */
function raumStoff(q, x, y, z) {
  const dx = x - q.mitte.x, dz = z - q.mitte.z;

  /* Das Podest der letzten Kammer: eine Stufe hoch, fünf im Quadrat. Darauf
     steht die große Truhe — so sieht man schon vom Eingang, wohin man will. */
  if (q.podest && Math.abs(dx) <= 2 && Math.abs(dz) <= 2) {
    if (y === q.y0) return M.saeule;
    if (y === q.y0 + 1) return M.boden;
  }

  // Säulen: massiv vom Boden bis zur Decke, in Reihen, nie an der Wand
  if (q.saeulen && y > q.y0 && y < q.y1) {
    const ax = Math.abs(dx), az = Math.abs(dz);
    const innenX = ax >= 2 && ax <= (q.x1 - q.x0) / 2 - 2;
    const innenZ = az >= 2 && az <= (q.z1 - q.z0) / 2 - 2;
    if (innenX && innenZ && ax % q.saeulen === 0 && az % q.saeulen === 0) {
      // Oben und unten ein Kranz, dazwischen der Schaft
      return (y === q.y0 + 1 || y === q.y1 - 1) ? M.zier : M.saeule;
    }
  }

  // Becken: die Mitte säuft ab, ein Steg führt hindurch
  if (q.becken && y === q.y0) {
    const weit = Math.max(Math.abs(dx), Math.abs(dz));
    const steg = q.steg && Math.abs(dz) <= 1;
    if (weit <= q.becken && !steg) return M.wasser;
  }

  if (y === q.y0) return M.boden;

  if (y === q.y1) {
    // Adern im Fels: in der Decke glimmt es stellenweise
    if (q.adern && Math.abs(dx * 3 + dz * 7) % 9 === 0) return M.licht;
    /* Gebaute Gruften haben eine Decke, Stollen nur Balken quer darüber.
       Eine Höhle bekommt gar nichts — sie ist ja keine. */
    if (q.decke === 'voll') return M.zier;
    if (q.decke === 'balken' && Math.abs(dx) % 3 === 0) return M.zier;
  }
  return M.luft;
}

/** Was dieser Block in einer Gruft ist — siehe M. 0 heißt: gewachsener Fels. */
export function hohlIn(plaeneNah, x, y, z) {
  for (const p of plaeneNah) {
    const h = p.huelle;
    if (y < h.minY - 1 || y > h.maxY + 1) continue;
    // Die Stufen stehen im ausgehöhlten Schacht, also erst fragen
    if (stufeBei(p, x, y, z)) return M.stufe;
    for (const q of p.raeume) if (drin(q, x, y, z)) return raumStoff(q, x, y, z);
    for (const q of p.gaenge) {
      if (!drin(q, x, y, z)) continue;
      /* In der Grabnische liegt ein Sarg: ein Block auf dem Boden, der sie
         von einem Loch in der Wand unterscheidet. */
      if (q.nische) return y === q.y0 ? M.saeule : M.luft;
      if (y !== q.y0) return M.luft;
      // Stützbalken im Stollen: alle paar Schritte ein Rahmen im Gang
      return M.boden;
    }
  }
  return M.fest;
}

export function hohlBei(x, y, z) { return hohlIn(gruftenNahe(x, z), x, y, z); }

/** Alles, was in einer Gruft an Leben und Beute steht. */
export function bewohner(gruft) {
  const p = plan(gruft);
  const a = artVon(gruft);
  const rand = mulberry32((gruft.saat ^ 0x5f3759df) >>> 0);
  const feinde = [];
  const truhen = [];

  p.raeume.forEach((raum, idx) => {
    // Ein bis zwei je Kammer. Mehr ist kein Kampf mehr, sondern ein Unfall:
    // die Gänge sind eng, und was wach wird, kommt gemeinsam.
    const n = idx === 0 ? 1 : 1 + Math.floor(rand() * 2);
    for (let k = 0; k < n; k++) {
      const chef = raum.letzter && k === 0;
      // Im Becken steht keiner — er stünde bis zum Hals im Wasser
      const weit = raum.becken ? 0.95 : 0.7;
      feinde.push({
        x: raum.mitte.x + (rand() - 0.5) * (raum.x1 - raum.x0) * weit,
        y: raum.y0 + 1,
        z: raum.mitte.z + (rand() - 0.5) * (raum.z1 - raum.z0) * weit,
        art: chef ? (gruft.schlund ? 'waechter' : a.chef)
           : a.volk[Math.floor(rand() * a.volk.length)],
        stufe: gruft.stufe,
      });
    }
    if (raum.letzter || rand() < 0.4) {
      // Die große Truhe steht auf dem Podest, wenn die Art eines baut
      const hoch = raum.podest ? raum.y0 + 2 : raum.y0 + 1;
      const ab = raum.podest ? 0 : 2;
      truhen.push({ x: raum.mitte.x + ab, y: hoch, z: raum.mitte.z + ab,
                    gross: raum.letzter });
    }
  });

  return { feinde, truhen, plan: p };
}
