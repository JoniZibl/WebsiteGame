import { mulberry32 } from './noise.js';

/* ==========================================================================
 *  Was man findet, trägt und verkauft.
 *
 *  Drei Sorten zählen im Kampf — Waffe, Rüstung, Schmuck —, dazu Tränke und
 *  Krempel, der nur einen Preis hat. Jeder Gegenstand steht genau einmal in
 *  dieser Tabelle; Schaden, Wert und Fundtiefe hängen an derselben Stelle,
 *  damit sich das Gleichgewicht an einem Ort nachziehen lässt.
 * ========================================================================== */

export const DINGE = {
  /* ------------------------------- Waffen -------------------------------- */
  knueppel:    { name: 'Knüppel',        art: 'waffe', sym: 'schwert', schaden: 3,  wert: 18,  rang: 0,
                 klinge: '#9a6138', griff: '#7a4a2e',
                 text: 'Ein Ast mit Entschlossenheit.' },
  kurzschwert: { name: 'Kurzschwert',    art: 'waffe', sym: 'schwert', schaden: 7,  wert: 70,  rang: 1,
                 klinge: '#d8dde2', griff: '#8a5230',
                 text: 'Handlich. Tut, was man von ihm erwartet.' },
  streitkolben:{ name: 'Streitkolben',   art: 'waffe', sym: 'schwert', schaden: 11, wert: 150, rang: 2,
                 klinge: '#b9aa98', griff: '#5e4634',
                 text: 'Gegen Knochen besonders überzeugend.' },
  langschwert: { name: 'Langschwert',    art: 'waffe', sym: 'schwert', schaden: 16, wert: 320, rang: 3,
                 klinge: '#e6ecf2', griff: '#4a3b30',
                 text: 'Reichweite ist die halbe Miete.' },
  runenklinge: { name: 'Runenklinge',    art: 'waffe', sym: 'schwert', schaden: 24, wert: 760, rang: 4,
                 klinge: '#9fd8e8', griff: '#3f3a52',
                 text: 'Die Zeichen darauf liest niemand mehr.' },

  /* ------------------------------ Rüstungen ------------------------------ */
  wams:        { name: 'Lederwams',      art: 'ruestung', sym: 'schild', panzer: 0.07, wert: 55,  rang: 1,
                 text: 'Hält den Wind ab und manchmal mehr.' },
  kettenhemd:  { name: 'Kettenhemd',     art: 'ruestung', sym: 'schild', panzer: 0.14, wert: 170, rang: 2,
                 text: 'Schwer, laut, sein Geld wert.' },
  schuppen:    { name: 'Schuppenpanzer', art: 'ruestung', sym: 'schild', panzer: 0.22, wert: 420, rang: 3,
                 text: 'Woher die Schuppen stammen, sagt der Händler nicht.' },
  grabharnisch:{ name: 'Grabharnisch',   art: 'ruestung', sym: 'schild', panzer: 0.3,  wert: 880, rang: 4,
                 text: 'Jemand hat ihn lange getragen. Sehr lange.' },

  /* ------------------------------- Schmuck ------------------------------- */
  kraftamulett:{ name: 'Amulett der Kraft', art: 'schmuck', sym: 'ring', schaden: 5,  wert: 190, rang: 2,
                 text: 'Der Arm wird nicht müder, nur überzeugter.' },
  lebensring:  { name: 'Ring des Atems',    art: 'schmuck', sym: 'ring', leben: 30,   wert: 220, rang: 2,
                 text: 'Man steht ein wenig länger.' },
  magiestein:  { name: 'Quellstein',        art: 'schmuck', sym: 'ring', magicka: 35, wert: 210, rang: 2,
                 text: 'Kalt, auch in der Sonne.' },
  wanderschuh: { name: 'Schuhe des Boten',  art: 'schmuck', sym: 'stiefel', tempo: 0.18, wert: 240, rang: 3,
                 text: 'Sie kennen den Weg besser als du.' },

  /* -------------------------------- Tränke ------------------------------- */
  heiltrank:   { name: 'Heiltrank',      art: 'trank', sym: 'trank', heilt: 50, wert: 40, rang: 1,
                 text: 'Schmeckt nach Eisen und Minze.' },
  magietrank:  { name: 'Quelltrank',     art: 'trank', sym: 'trank', magie: 45, wert: 35, rang: 1,
                 text: 'Prickelt hinter der Stirn.' },

  /* -------------------------------- Krempel ------------------------------ */
  wolfsfell:   { name: 'Wolfsfell',      art: 'beute', sym: 'fell', wert: 14, rang: 0,
                 text: 'Der Kürschner nimmt es.' },
  knochen:     { name: 'Alter Knochen',  art: 'beute', sym: 'knochen', wert: 9,  rang: 0,
                 text: 'Von jemandem, der nicht mehr fragt.' },
  glimmstein:  { name: 'Glimmstein',     art: 'beute', sym: 'kristall', wert: 30, rang: 1,
                 text: 'Leuchtet noch schwach.' },
  becher:      { name: 'Silberbecher',   art: 'beute', sym: 'becher', wert: 65, rang: 2,
                 text: 'Ein Wappen darauf, das keiner kennt.' },
  siegel:      { name: 'Altes Siegel',   art: 'beute', sym: 'siegel', wert: 120, rang: 3,
                 text: 'Hier stand einmal ein Name.' },
};

export const TRAGBAR = ['waffe', 'ruestung', 'schmuck'];

/** Was ein Gegenstand beim Verkauf bringt — Händler zahlen nie den vollen Preis. */
export const verkaufswert = (id) => Math.max(1, Math.round(DINGE[id].wert * 0.45));

/* ------------------------------ Beutetabellen ------------------------------ */
const NACH_RANG = {};
for (const [id, d] of Object.entries(DINGE)) {
  (NACH_RANG[d.rang] ||= []).push(id);
}

/** Zieht einen Gegenstand passend zur Gefahr des Orts. */
export function beuteZiehen(rand, stufe, nurKrempel = false) {
  // Meist etwas vom eigenen Rang, manchmal eine Stufe darüber
  let rang = Math.min(4, Math.max(0, stufe - 1 + (rand() < 0.25 ? 1 : 0)));
  if (rand() < 0.2) rang = Math.max(0, rang - 1);
  let topf = NACH_RANG[rang] || NACH_RANG[0];
  if (nurKrempel) {
    topf = topf.filter((id) => DINGE[id].art === 'beute' || DINGE[id].art === 'trank');
    if (!topf.length) return 'knochen';
  }
  return topf[Math.floor(rand() * topf.length)];
}

/** Der Inhalt einer Truhe: immer derselbe für dieselbe Truhe. */
export function truhenInhalt(saat, stufe, gross) {
  const rand = mulberry32(saat >>> 0);
  const stuecke = [];
  const anzahl = gross ? 2 + Math.floor(rand() * 2) : 1 + Math.floor(rand() * 2);
  for (let i = 0; i < anzahl; i++) stuecke.push(beuteZiehen(rand, stufe + (gross ? 1 : 0)));
  const gold = Math.round((gross ? 110 : 40) * (1 + stufe * 0.35) * (0.7 + rand() * 0.6));
  return { stuecke, gold };
}

/* ------------------------------- Der Beutel -------------------------------- */
export function nehmen(held, id, n = 1) {
  held.beutel[id] = (held.beutel[id] || 0) + n;
}

export function ablegen(held, id, n = 1) {
  const da = held.beutel[id] || 0;
  if (da < n) return false;
  if (da === n) delete held.beutel[id];
  else held.beutel[id] = da - n;
  return true;
}

/** Anlegen. Was vorher an dem Platz hing, wandert zurück in den Beutel. */
export function anlegen(held, id) {
  const d = DINGE[id];
  if (!d || !TRAGBAR.includes(d.art)) return false;
  if (!ablegen(held, id)) return false;
  const alt = held.rue[d.art];
  if (alt) nehmen(held, alt);
  held.rue[d.art] = id;
  return true;
}

export function ausziehen(held, art) {
  const id = held.rue[art];
  if (!id) return false;
  held.rue[art] = null;
  nehmen(held, id);
  return true;
}

/** Summe aller Boni aus dem, was gerade am Körper hängt. */
export function boni(held) {
  const b = { schaden: 0, panzer: 0, leben: 0, magicka: 0, tempo: 0 };
  for (const art of TRAGBAR) {
    const id = held.rue[art];
    if (!id) continue;
    const d = DINGE[id];
    b.schaden += d.schaden || 0;
    b.panzer += d.panzer || 0;
    b.leben += d.leben || 0;
    b.magicka += d.magicka || 0;
    b.tempo += d.tempo || 0;
  }
  return b;
}

/* -------------------------------- Der Laden -------------------------------- */
/** Was eine Händlerin führt. Hängt am Dorf, wechselt mit dem Tag. */
export function warenFuer(dorfSaat, tag, stufe) {
  const rand = mulberry32(((dorfSaat ^ (tag * 7919)) >>> 0));
  const waren = new Set(['heiltrank', 'heiltrank', 'magietrank']);
  const liste = ['heiltrank', 'magietrank'];
  for (let i = 0; i < 5; i++) {
    const id = beuteZiehen(rand, Math.min(4, stufe + 1));
    if (DINGE[id].art === 'beute') continue;
    if (!liste.includes(id)) liste.push(id);
  }
  return liste;
}
