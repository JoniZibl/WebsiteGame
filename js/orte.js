import { mulberry32 } from './noise.js';
import { surfaceAt, dorfBei, SEA } from './voxel.js';

/* ==========================================================================
 *  Landmarken.
 *
 *  Dörfer und Gruften allein machen eine leere Welt. Hier liegt alles andere,
 *  worauf man zuläuft: ein Wachturm, den man über den Wald hinweg sieht,
 *  Mauerreste mit einer Truhe darin, ein Räuberlager, das man besser nicht
 *  übersieht, und ein Schrein, der einen belohnt, weil man ihn gefunden hat.
 *
 *  Wie die Dörfer liegen sie auf einem versetzten Raster und rechnen sich aus
 *  ihren Koordinaten aus — dieselbe Welt zeigt immer dieselben Orte.
 * ========================================================================== */

const RASTER = 165;

export const ORTSARTEN = {
  turm:    { name: 'Wachturm',   farbe: '#b9aa98', gewicht: 1.0, fest: [[0, 0, 2.9]] },
  ruine:   { name: 'Mauerreste', farbe: '#9a8b79', gewicht: 1.2,
             fest: [[0, -3.7, 3.0], [-4.0, -1.2, 2.2], [4.0, -2.4, 1.6]] },
  lager:   { name: 'Lager',      farbe: '#8c7a5c', gewicht: 1.0, fest: [] },
  schrein: { name: 'Schrein',    farbe: '#e8a83c', gewicht: 0.8, fest: [[0, 0, 1.1]] },
};

const NAMEN = {
  turm: ['Hohe Warte', 'Grauturm', 'Letzter Ausguck', 'Rabenwarte', 'Windwarte'],
  ruine: ['Alte Mauern', 'Verlassenes Gehöft', 'Steinrest', 'Was blieb', 'Brandstelle'],
  lager: ['Räuberlager', 'Wegelagerer', 'Fremdes Feuer', 'Lager am Weg'],
  schrein: ['Alter Schrein', 'Stiller Bogen', 'Lichtschale', 'Wegzeichen'],
};

const zellen = new Map();
export function zellenLeeren() { zellen.clear(); }

/* Wie bei den Gruften: gemerkt bleibt die Nachbarschaft, nicht die ganze
   zurückgelegte Strecke. Alles hier hängt nur am Saatkorn, steht also beim
   Zurückkommen unverändert wieder da. */
const GEDAECHTNIS = 9;

export function vergessen(x, z) {
  if (zellen.size <= (GEDAECHTNIS * 2 + 1) * (GEDAECHTNIS * 2 + 1)) return;
  const i0 = Math.round(x / RASTER), j0 = Math.round(z / RASTER);
  for (const key of zellen.keys()) {
    const k = key.indexOf(',');
    if (Math.abs(+key.slice(0, k) - i0) > GEDAECHTNIS
        || Math.abs(+key.slice(k + 1) - j0) > GEDAECHTNIS) zellen.delete(key);
  }
}

export function ortInZelle(i, j) {
  const key = i + ',' + j;
  if (zellen.has(key)) return zellen.get(key);
  const o = rechneZelle(i, j);
  zellen.set(key, o);
  return o;
}

let saatVon = () => 1337;
export function verbinden(saat) { saatVon = saat; zellenLeeren(); }

function rechneZelle(i, j) {
  const rand = mulberry32(((i * 374761393) ^ (j * 668265263) ^ (saatVon() * 17)) >>> 0);
  if (rand() > 0.62) return null;
  const x = Math.round(i * RASTER + (rand() - 0.5) * RASTER * 0.7);
  const z = Math.round(j * RASTER + (rand() - 0.5) * RASTER * 0.7);
  const h = surfaceAt(x, z);
  if (h <= SEA + 2) return null;
  // Nichts davon steht in einem Dorf — dort ist schon genug los
  if (dorfBei(x, z)) return null;

  // Nach Gewicht ziehen, damit Ruinen häufiger sind als Schreine
  const eintraege = Object.entries(ORTSARTEN);
  let summe = 0;
  for (const [, a] of eintraege) summe += a.gewicht;
  let w = rand() * summe;
  let art = eintraege[0][0];
  for (const [id, a] of eintraege) { w -= a.gewicht; if (w <= 0) { art = id; break; } }

  const namen = NAMEN[art];
  return {
    i, j, x, z, h, art,
    id: `${art}:${i},${j}`,
    name: namen[Math.abs(i * 5 + j * 11) % namen.length],
    stufe: 1 + Math.min(4, Math.floor(Math.hypot(x, z) / 520)),
    saat: (rand() * 1e9) | 0,
  };
}

export function orteUm(x, z, reichweite = RASTER * 1.5) {
  const out = [];
  const n = Math.ceil(reichweite / RASTER) + 1;
  const i0 = Math.round(x / RASTER), j0 = Math.round(z / RASTER);
  for (let j = j0 - n; j <= j0 + n; j++) {
    for (let i = i0 - n; i <= i0 + n; i++) {
      const o = ortInZelle(i, j);
      if (o && Math.hypot(x - o.x, z - o.z) < reichweite) out.push(o);
    }
  }
  return out;
}

/* Was an einem Ort steht und wer dort wohnt. Immer dasselbe für denselben Ort;
   was man geleert hat, merkt sich der Held, nicht die Welt. */
export function inhalt(ort) {
  const rand = mulberry32((ort.saat ^ 0x5bf03635) >>> 0);
  const teile = [];
  const feinde = [];
  const truhen = [];
  const y = ort.h + 1;

  if (ort.art === 'turm') {
    teile.push({ art: 'turm', x: 0, z: 0, dreh: rand() * 6.28 });
    truhen.push({ x: 2.6, y, z: 2.6, gross: true });
    const wer = rand() < 0.5 ? 'schuetze' : 'raeuber';
    for (let k = 0; k < 2; k++) {
      feinde.push({ art: wer, x: (rand() - 0.5) * 9, y, z: 4 + rand() * 4 });
    }

  } else if (ort.art === 'ruine') {
    teile.push({ art: 'ruine', x: 0, z: 0, dreh: rand() * 6.28 });
    truhen.push({ x: -1.5, y, z: -1.8, gross: rand() < 0.4 });
    for (let k = 0; k < 2 + Math.floor(rand() * 2); k++) {
      feinde.push({ art: 'skelett', x: (rand() - 0.5) * 8, y, z: (rand() - 0.5) * 7 });
    }

  } else if (ort.art === 'lager') {
    teile.push({ art: 'feuer', x: 0, z: 0, dreh: 0 });
    const n = 2 + Math.floor(rand() * 2);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rand() * 0.5;
      teile.push({ art: 'zelt', x: Math.cos(a) * 4.5, z: Math.sin(a) * 4.5, dreh: -a });
      feinde.push({ art: rand() < 0.4 ? 'schuetze' : 'raeuber',
                    x: Math.cos(a) * 3, y, z: Math.sin(a) * 3 });
    }
    teile.push({ art: 'kiste', x: -3.4, z: 2.6, dreh: rand() });
    truhen.push({ x: 3.2, y, z: -2.8, gross: rand() < 0.5 });

  } else {
    teile.push({ art: 'schrein', x: 0, z: 0, dreh: rand() * 6.28 });
    for (const s of [-1, 1]) {
      teile.push({ art: 'fels', x: s * 3.6, z: 2.2 + rand(), dreh: rand() * 6.28 });
    }
  }
  return { teile, feinde, truhen };
}
