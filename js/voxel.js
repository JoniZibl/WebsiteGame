import * as THREE from 'three';
import { fbm, noise2, mulberry32 } from './noise.js';
import * as gruft from './dungeon.js';

/* ==========================================================================
 *  Die Blockwelt.
 *
 *  Ein Chunk ist 16 x 16 Spalten, 44 Blöcke hoch. Die Blöcke entstehen aus
 *  einer reinen Funktion (Noise), Veränderungen des Spielers liegen als
 *  Ausnahmen in einer Karte darüber. Gezeichnet wird pro Chunk ein Mesh, in
 *  dem nur die Flächen stecken, die tatsächlich an Luft grenzen.
 * ========================================================================== */

export const CHUNK = 16;
export const HEIGHT = 44;
export const SEA = 14;

/* ----------------------------- Blocksorten -------------------------------- */
export const AIR = 0;
export const B = {
  gras:  1, erde: 2, stein: 3, sand: 4, schnee: 5,
  stamm: 6, laub: 7, wasser: 8, glimm: 9, moos: 10,
  eis:  11, grundstein: 12, weg: 13, planke: 14,
  heide: 15, trocken: 16, rotfels: 17, taiga: 18, moor: 19, kies: 20,
};

/* ---------------------------- Die Erdschichten ----------------------------
 * Hier liegt der Charakter des Spiels. Nicht jedes Material hat eine eigene
 * Farbe - die Tiefe hat eine. Wer nach unten gräbt, wandert durch Farbbänder
 * wie durch einen geologischen Querschnitt: Krume, Lehm, Roterde, Tiefstein,
 * Kaltstein, Abgrund. Das macht den Abstieg auf einen Blick lesbar und sieht
 * nach nichts sonst aus.
 * -------------------------------------------------------------------------- */
export const STRATA = [
  { bis:  2, color: 0xbe8d5a, zaeh: 0.7,  name: 'Krume' },
  { bis:  7, color: 0xdcb87d, zaeh: 0.9,  name: 'Lehm' },
  { bis: 13, color: 0xc97050, zaeh: 1.1,  name: 'Roterde' },
  { bis: 20, color: 0xb85f5c, zaeh: 1.35, name: 'Rostband' },
  { bis: 28, color: 0xa1708d, zaeh: 1.7,  name: 'Malvenstein' },
  { bis: 37, color: 0x7793a6, zaeh: 2.1,  name: 'Blaustein' },
  { bis: 99, color: 0x5b7391, zaeh: 2.6,  name: 'Tiefblau' },
];

/** Welche Schicht liegt in dieser Tiefe? */
export function stratumAt(depth) {
  for (const st of STRATA) if (depth <= st.bis) return st;
  return STRATA[STRATA.length - 1];
}

/** Farbe, Härte (Sekunden Grabzeit) und was der Block hergibt. */
export const BLOCKS = {
  // Die Erde selbst nimmt ihre Farbe aus der Schicht (erdig: true) - nur die
  // Besonderheiten haben eine eigene.
  [B.gras]:     { name: 'Wiese',   color: 0x93bd6d, side: 0xbe8d5a, hard: 0.22 },
  [B.erde]:     { name: 'Erde',    erdig: true, hard: 0.34 },
  [B.stein]:    { name: 'Stein',   erdig: true, hard: 0.5 },
  [B.sand]:     { name: 'Sand',    color: 0xefdcb2, hard: 0.26 },
  [B.schnee]:   { name: 'Firn',    color: 0xf6f1e6, side: 0xbe8d5a, hard: 0.26 },
  [B.stamm]:    { name: 'Stamm',   color: 0xb5794a, side: 0xa06a40, hard: 0.4 },
  [B.laub]:     { name: 'Laub',    color: 0x4f8f5c, hard: 0.22 },
  [B.wasser]:   { name: 'Wasser',  color: 0x6cb8b4, liquid: true, hard: 0 },
  [B.glimm]:    { name: 'Glimm',   color: 0xf5c451, hard: 0.7, glow: 1, licht: 34 },
  [B.moos]:     { name: 'Leuchtmoos', color: 0xa8d8a0, hard: 0.2, glow: 0.7, licht: 14,
                  thin: true, slim: [0.8, 0.14] },
  [B.eis]:      { name: 'Eis',     color: 0xbfdfe4, hard: 0.4 },
  [B.heide]:    { name: 'Heide',   color: 0x9d8f6e, side: 0xbe8d5a, hard: 0.26 },
  [B.trocken]:  { name: 'Grasland', color: 0xc4b071, side: 0xbe8d5a, hard: 0.24 },
  [B.rotfels]:  { name: 'Rotfels',  color: 0xb5643f, side: 0x9a5030, hard: 0.7 },
  [B.taiga]:    { name: 'Moosgrund', color: 0x6d9b6c, side: 0xbe8d5a, hard: 0.24 },
  [B.moor]:     { name: 'Moor',     color: 0x6f8452, side: 0x6b5a3c, hard: 0.24 },
  [B.kies]:     { name: 'Geröll',   color: 0xa9a293, side: 0x8d8778, hard: 0.5 },
  [B.weg]:      { name: 'Weg',     color: 0xdcc79a, side: 0xbe8d5a, hard: 0.3 },
  [B.planke]:   { name: 'Planke',  color: 0xc98f57, side: 0xa8743f, hard: 0.35 },
  [B.grundstein]: { name: 'Urgestein', color: 0x46597a, hard: Infinity },
};

export const isSolid = (b) => b !== AIR && b !== B.wasser && !BLOCKS[b]?.thin;
export const isOpaque = (b) => b !== AIR && b !== B.wasser && !BLOCKS[b]?.thin;

/* -------------------------------- Biome ----------------------------------- */
/* Zwölf Gegenden. Jede hat eine eigene Oberfläche, eigene Gewächse und eine
   eigene Dichte — das ist der ganze Unterschied zwischen „Gelände" und einer
   Welt, durch die zu laufen sich lohnt. `busch` ist Kleinkram, der zusätzlich
   zu den Bäumen gestreut wird. */
export const BIOMES = {
  wiese:   { name: 'Wiese',        top: B.gras,    baum: 'laubbaum',   dichte: 0.010, busch: 0.05 },
  bluete:  { name: 'Blütenwiese',  top: B.gras,    baum: 'laubbaum',   dichte: 0.006, busch: 0.11, blumen: true },
  wald:    { name: 'Wald',         top: B.gras,    baum: 'tanne',      dichte: 0.042, busch: 0.05 },
  birken:  { name: 'Birkenhain',   top: B.gras,    baum: 'birke',      dichte: 0.036, busch: 0.05 },
  taiga:   { name: 'Taiga',        top: B.taiga,   baum: 'nadelbaum',  dichte: 0.050, busch: 0.03 },
  schnee:  { name: 'Firnfeld',     top: B.schnee,  baum: 'schneetanne', dichte: 0.020, busch: 0.01 },
  heide:   { name: 'Heide',        top: B.heide,   baum: 'busch',      dichte: 0.022, busch: 0.09 },
  steppe:  { name: 'Grasland',     top: B.trocken, baum: 'laubbaum',   dichte: 0.004, busch: 0.05 },
  wueste:  { name: 'Düne',         top: B.sand,    baum: 'palme',      dichte: 0.005, busch: 0.02, kakteen: true },
  mesa:    { name: 'Roter Grund',  top: B.rotfels, baum: 'kaktus',     dichte: 0.004, busch: 0.01 },
  berg:    { name: 'Gebirge',      top: B.kies,    baum: 'nadelbaum',  dichte: 0.004, busch: 0.02 },
  sumpf:   { name: 'Bruch',        top: B.moor,    baum: 'totholz',    dichte: 0.028, busch: 0.07 },
};

let SEED = 1337;
export function setSeed(s) {
  SEED = s | 0;
  dorfZellen.clear();
  gruft.zellenLeeren();
}

export function getSeed() { return SEED; }

/** Temperatur und Feuchte entscheiden, welches Biom hier liegt. */
// Jede Gegend kennt ihren eigenen Schlüssel — daran hängen Getier und Gefahr.
for (const [schluessel, b] of Object.entries(BIOMES)) b.id = schluessel;

export function biomeAt(x, z) { return rohBiome(x, z); }

/* Wärme und Feuchte spannen ein Feld auf, ein drittes Rauschen sorgt für die
   selteneren Gegenden. So liegen ähnliche Landschaften beieinander, ohne dass
   die Karte in Streifen zerfällt. */
function rohBiome(x, z) {
  const waerme = fbm(x * 0.0022, z * 0.0022, SEED + 11, 3);
  const feucht = fbm(x * 0.0026, z * 0.0026, SEED + 29, 3);
  const berg   = fbm(x * 0.0035, z * 0.0035, SEED + 47, 2);
  const laune  = fbm(x * 0.0061, z * 0.0061, SEED + 67, 2);

  if (berg > 0.70) return BIOMES.berg;

  if (waerme < 0.30) return BIOMES.schnee;
  if (waerme < 0.42) return feucht > 0.45 ? BIOMES.taiga : BIOMES.heide;

  if (waerme > 0.72) {
    if (feucht < 0.34) return laune > 0.58 ? BIOMES.mesa : BIOMES.wueste;
    if (feucht < 0.55) return BIOMES.steppe;
    return BIOMES.sumpf;
  }

  if (feucht > 0.68) return BIOMES.sumpf;
  if (feucht > 0.52) return laune > 0.55 ? BIOMES.birken : BIOMES.wald;
  if (feucht > 0.40) return laune > 0.62 ? BIOMES.bluete : BIOMES.wiese;
  return laune > 0.6 ? BIOMES.heide : BIOMES.steppe;
}

/* ---------------------------------- Dörfer --------------------------------
 * Dörfer liegen auf einem groben Raster mit Versatz, damit sie verstreut
 * wirken und trotzdem jederzeit ohne Speicher ausrechenbar sind. Wer eines
 * berührt, bekommt ebenen Grund: das Gelände wird zur Dorfhöhe hin
 * überblendet, sonst stehen die Häuser am Hang in der Luft.
 * -------------------------------------------------------------------------- */
const DORF_RASTER = 230;

const dorfZellen = new Map();

/** Liegt in dieser Rasterzelle ein Dorf? Rein aus den Koordinaten gerechnet.
 *  Gemerkt wird es trotzdem: surfaceAt fragt für jeden Block nach. */
export function dorfInZelle(i, j) {
  const key = i + ',' + j;
  if (dorfZellen.has(key)) return dorfZellen.get(key);
  const d = rechneDorf(i, j);
  dorfZellen.set(key, d);
  return d;
}

function rechneDorf(i, j) {
  const rand = mulberry32(((i * 341873128) ^ (j * 132897987) ^ (SEED * 7919)) >>> 0);
  if (rand() > 0.62) return null;
  const x = Math.round(i * DORF_RASTER + (rand() - 0.5) * DORF_RASTER * 0.55);
  const z = Math.round(j * DORF_RASTER + (rand() - 0.5) * DORF_RASTER * 0.55);
  const h = rohSurface(x, z);
  if (h <= SEA + 3) return null;
  const biome = rohBiome(x, z);
  // Dörfer stehen auf Grün: im Fels, in der Düne, im Firn und in der Asche
  // baut niemand.
  if (biome === BIOMES.berg || biome === BIOMES.wueste
      || biome === BIOMES.schnee || biome === BIOMES.mesa) return null;
  return { i, j, x, z, h, r: 34 + Math.round(rand() * 12), saat: (rand() * 1e9) | 0 };
}

/** Das Dorf, in dessen Umkreis dieser Punkt liegt — oder nichts. */
export function dorfBei(x, z) {
  const i0 = Math.round(x / DORF_RASTER), j0 = Math.round(z / DORF_RASTER);
  for (let j = j0 - 1; j <= j0 + 1; j++) {
    for (let i = i0 - 1; i <= i0 + 1; i++) {
      const d = dorfInZelle(i, j);
      if (!d) continue;
      if (Math.hypot(x - d.x, z - d.z) < d.r) return d;
    }
  }
  return null;
}

/** Alle Dörfer, die von hier aus in Reichweite liegen. */
export function doerferUm(x, z, reichweite = DORF_RASTER * 1.5) {
  const out = [];
  const n = Math.ceil(reichweite / DORF_RASTER) + 1;
  const i0 = Math.round(x / DORF_RASTER), j0 = Math.round(z / DORF_RASTER);
  for (let j = j0 - n; j <= j0 + n; j++) {
    for (let i = i0 - n; i <= i0 + n; i++) {
      const d = dorfInZelle(i, j);
      if (d && Math.hypot(x - d.x, z - d.z) < reichweite) out.push(d);
    }
  }
  return out;
}

/** Liegt hier ein Weg? Ein Kreuz durch die Mitte und ein Ring darum. */
export function wegBei(d, x, z) {
  const dx = x - d.x, dz = z - d.z;
  const dist = Math.hypot(dx, dz);
  if (dist > d.r * 0.92) return false;
  if (Math.abs(dx) <= 0 || Math.abs(dz) <= 0) return true;
  const ring = d.r * 0.46;
  return Math.abs(dist - ring) <= 0.8;
}

/** Höhe des gewachsenen Geländes, ohne Rücksicht auf Dörfer. */
function rohSurface(x, z) {
  const base = fbm(x * 0.012, z * 0.012, SEED, 4);
  const hügel = fbm(x * 0.035, z * 0.035, SEED + 5, 3);
  const berg = Math.max(0, fbm(x * 0.0035, z * 0.0035, SEED + 47, 2) - 0.55) * 2.6;
  let h = 14 + base * 12 + hügel * 4 + berg * 26;

  // Flusstäler
  const r = Math.abs(noise2(x * 0.0055, z * 0.0055, SEED + 31) - 0.5);
  if (r < 0.045) h -= (1 - r / 0.045) * 7;

  return Math.max(3, Math.min(HEIGHT - 6, Math.round(h)));
}

/** Höhe der Oberfläche in Blöcken — im Dorf eingeebnet. */
export function surfaceAt(x, z) {
  const d = dorfBei(x, z);
  if (!d) return rohSurface(x, z);
  const dist = Math.hypot(x - d.x, z - d.z);
  const kern = d.r * 0.35;
  const k = dist <= kern ? 1 : Math.max(0, 1 - (dist - kern) / (d.r - kern));
  const weich = k * k * (3 - 2 * k);
  return Math.round(rohSurface(x, z) * (1 - weich) + d.h * weich);
}

/* Höhlen als Röhren, nicht als Schächte.
 *
 * Zwei Rauschfelder werden je auf ihren Nulldurchgang eingedampft - das gibt
 * zwei gewundene Flächen. Hohl ist nur, wo beide zugleich nahe null sind, also
 * ihre Schnittlinie: eine Röhre. Beide Felder nehmen y mit auf, sonst laufen
 * die Gänge senkrecht durch und die halbe Welt fällt in sich zusammen. */
function isCave(x, y, z) {
  if (y < 2) return false;
  const a = Math.abs(fbm(x * 0.026, z * 0.026 + y * 0.052, SEED + 71, 2) - 0.5);
  const b = Math.abs(fbm(x * 0.029 + y * 0.048, z * 0.031, SEED + 83, 2) - 0.5);
  const weite = 0.05 + Math.max(0, y < 12 ? (12 - y) * 0.0035 : 0);
  return a < weite && b < weite;
}

/* Es gibt nur einen einzigen Fund: Glimm. Kein Erzsortiment, keine Tabelle
   im Kopf - man sieht ein Leuchten im Fels und weiss sofort, was es ist.
   Je tiefer, desto mehr davon: das ist der ganze Grund, weiterzugraben. */
function oreAt(x, y, z, depth) {
  const n = noise2(x * 0.22 + y * 0.13, z * 0.22 - y * 0.07, SEED + 151);
  const dichte = 0.955 - Math.min(0.06, depth * 0.0022);
  if (depth > 2 && n > dichte) return B.glimm;
  return B.stein;
}

/** Der Block an dieser Stelle, bevor jemand daran gegraben hat. */
/* Alles, was für eine ganze Spalte gilt, wird einmal berechnet. Vorher lief
   das pro Block — bei 44 Blöcken je Spalte war das der Hauptgrund, warum ein
   Chunk vierzig Millisekunden brauchte. */
export function spalte(x, z) {
  const surface = surfaceAt(x, z);
  const biome = biomeAt(x, z);
  const dorf = dorfBei(x, z);
  return {
    surface, biome,
    weg: dorf ? wegBei(dorf, x, z) : false,
    gruften: gruft.gruftenNahe(x, z),
  };
}

/** Der Block an dieser Stelle, bevor jemand daran gegraben hat. */
export function generateIn(sp, x, y, z) {
  if (y <= 0) return B.grundstein;
  if (y >= HEIGHT) return AIR;

  // Gruften stechen durch alles hindurch - auch durch die Oberfläche, denn
  // der Schacht muss ja irgendwo anfangen.
  if (sp.gruften.length) {
    const hohl = gruft.hohlIn(sp.gruften, x, y, z);
    if (hohl === 1) return AIR;
    if (hohl === 2 || hohl === 3) return B.planke;
  }

  const surface = sp.surface;
  if (y > surface) return y <= SEA ? B.wasser : AIR;

  if (isCave(x, y, z) && y < surface - 2) {
    // Auf Hoehlenboeden waechst Leuchtmoos. Es ist der Grund, Hoehlen
    // ueberhaupt zu betreten: eine Hoehle ist der billige Weg nach unten.
    if (!isCave(x, y - 1, z) && y - 1 < surface - 2 && y > 2) {
      const r = mulberry32(((x * 374761393) ^ (y * 668265263) ^ (z * 2246822519) ^ SEED) >>> 0)();
      if (r < 0.022) return B.moos;
    }
    return AIR;
  }

  const depth = surface - y;
  if (y === surface) {
    if (sp.weg) return B.weg;
    if (surface <= SEA + 1 && sp.biome !== BIOMES.wueste) return B.sand;
    return sp.biome.top;
  }
  if (depth < 4) return B.erde;
  return oreAt(x, y, z, depth);
}

/** Einzelabfrage — bequem, aber teuer. In Schleifen lieber spalte() nehmen. */
export function generate(x, y, z) {
  if (y <= 0) return B.grundstein;
  if (y >= HEIGHT) return AIR;
  return generateIn(spalte(x, z), x, y, z);
}

/* --------------------------- Bäume und Gewächse ----------------------------
 * Hier wächst nichts mehr. Was auf dem Gelände steht, sind richtige Modelle
 * (js/flora.js) — Blockbäume aus Stamm- und Laubwürfeln sahen aus wie ein
 * anderes Spiel als das Dorf daneben. Diese Datei sagt nur noch, *wo* etwas
 * steht, damit Gelände und Bewuchs aus derselben Rechnung kommen.
 * -------------------------------------------------------------------------- */

/** Steht auf dieser Spalte ein Gewächs? Rein deterministisch. */
export function gewaechsBei(x, z) {
  const biome = biomeAt(x, z);
  const r = mulberry32(((x * 73856093) ^ (z * 19349663) ^ SEED) >>> 0);
  const w = r();

  if (w < biome.dichte) {
    return { art: biome.baum, gross: true, wuerfel: r };
  }
  const kleinAb = biome.dichte;
  if (w < kleinAb + biome.busch) {
    if (biome.kakteen && r() < 0.35) return { art: 'kaktus', wuerfel: r };
    if (biome.blumen && r() < 0.55) return { art: 'blume', wuerfel: r };
    return { art: r() < 0.4 ? 'busch' : 'halm', wuerfel: r };
  }
  // Findlinge, überall selten
  if (w < kleinAb + biome.busch + 0.004) return { art: 'fels', wuerfel: r };
  return null;
}

/* -------------------------------- Vernetzung ------------------------------- */
const FACES = [
  { dir: [0, 1, 0], shade: 1.00, corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { dir: [0, -1, 0], shade: 0.55, corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { dir: [1, 0, 0], shade: 0.80, corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { dir: [-1, 0, 0], shade: 0.72, corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { dir: [0, 0, 1], shade: 0.88, corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { dir: [0, 0, -1], shade: 0.66, corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];

const _c = new THREE.Color();
const _glow = new THREE.Color(0xffe0a8);

/* ---------------------------------- Welt ----------------------------------- */
export class VoxelWorld {
  constructor(scene, material, waterMaterial, radius = 3) {
    this.scene = scene;
    this.material = material;
    this.waterMaterial = waterMaterial;
    this.radius = radius;
    this.chunks = new Map();
    this.queue = [];
    this.edits = new Map();      // "x,y,z" -> Blocksorte (auch AIR)
    this.plants = new Map();     // vorgemerkte Pflanzenblöcke je Chunk
  }

  key(cx, cz) { return cx + ',' + cz; }
  ekey(x, y, z) { return x + ',' + y + ',' + z; }

  /* --------------------------- Blöcke lesen/schreiben --------------------- */
  get(x, y, z) {
    if (y < 0 || y >= HEIGHT) return AIR;
    const e = this.edits.get(this.ekey(x, y, z));
    if (e !== undefined) return e;

    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const chunk = this.chunks.get(this.key(cx, cz));
    if (chunk) {
      const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
      return chunk.data[(lz * CHUNK + lx) * HEIGHT + y];
    }
    return generate(x, y, z);
  }

  set(x, y, z, block) {
    this.edits.set(this.ekey(x, y, z), block);
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const chunk = this.chunks.get(this.key(cx, cz));
    if (chunk) {
      const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
      chunk.data[(lz * CHUNK + lx) * HEIGHT + y] = block;
      this.remesh(chunk);
      // Nachbarchunk mitnehmen, wenn wir am Rand stehen
      if (lx === 0) this.remeshAt(cx - 1, cz);
      if (lx === CHUNK - 1) this.remeshAt(cx + 1, cz);
      if (lz === 0) this.remeshAt(cx, cz - 1);
      if (lz === CHUNK - 1) this.remeshAt(cx, cz + 1);
    }
  }

  remeshAt(cx, cz) {
    const c = this.chunks.get(this.key(cx, cz));
    if (c) this.remesh(c);
  }

  /* ------------------------------ Chunk bauen ----------------------------- */
  buildChunk(cx, cz) {
    const ox = cx * CHUNK, oz = cz * CHUNK;
    const data = new Uint8Array(CHUNK * CHUNK * HEIGHT);

    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const x = ox + lx, z = oz + lz;
        const base = (lz * CHUNK + lx) * HEIGHT;
        const sp = spalte(x, z);
        for (let y = 0; y < HEIGHT; y++) data[base + y] = generateIn(sp, x, y, z);
      }
    }

    // Veränderungen des Spielers gewinnen immer
    for (const [k, block] of this.edits) {
      const [ex, ey, ez] = k.split(',').map(Number);
      if (ex < ox || ex >= ox + CHUNK || ez < oz || ez >= oz + CHUNK) continue;
      data[((ez - oz) * CHUNK + (ex - ox)) * HEIGHT + ey] = block;
    }

    const chunk = { cx, cz, data, mesh: null, water: null };
    this.chunks.set(this.key(cx, cz), chunk);
    this.remesh(chunk);
    return chunk;
  }

  /** Baut die sichtbaren Flächen eines Chunks neu. */
  remesh(chunk) {
    const { cx, cz, data } = chunk;
    const ox = cx * CHUNK, oz = cz * CHUNK;

    const pos = [], col = [], idx = [];
    const wpos = [], wcol = [], widx = [];

    const at = (x, y, z) => {
      if (y < 0 || y >= HEIGHT) return AIR;
      if (x >= ox && x < ox + CHUNK && z >= oz && z < oz + CHUNK) {
        return data[((z - oz) * CHUNK + (x - ox)) * HEIGHT + y];
      }
      return this.get(x, y, z);
    };

    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const x = ox + lx, z = oz + lz;
        // Einmal je Spalte: ab hier zaehlt die Tiefe, und die Tiefe gibt die Farbe.
        const surf = surfaceAt(x, z);
        for (let y = 0; y < HEIGHT; y++) {
          const block = data[(lz * CHUNK + lx) * HEIGHT + y];
          if (block === AIR) continue;
          const def = BLOCKS[block];
          if (!def) continue;

          // Ein Hauch Farbrauschen, tieffrequent. Ohne das wirken große gleiche
          // Flächen wie Pappe; zu feinkörnig wird daraus ein Schachbrett.
          const tupf = 1 + (noise2(x * 0.085, z * 0.085, SEED + 5) - 0.5) * 0.075
                         + (noise2(x * 0.021, z * 0.021, SEED + 9) - 0.5) * 0.06;

          const liquid = def.liquid;
          const P = liquid ? wpos : pos, C = liquid ? wcol : col, I = liquid ? widx : idx;

          for (const face of FACES) {
            const nx = x + face.dir[0], ny = y + face.dir[1], nz = z + face.dir[2];
            const neighbour = at(nx, ny, nz);
            if (liquid ? (neighbour === block || isOpaque(neighbour)) : isOpaque(neighbour)) continue;

            const shade = face.shade;
            let base;
            if (def.erdig) {
              base = stratumAt(surf - y).color;
            } else {
              base = def.side !== undefined && face.dir[1] === 0 ? def.side : def.color;
            }
            _c.setHex(base).multiplyScalar(shade * tupf);

            // Wo der Spieler gegraben hat, glimmt die Wand nach. So bleibt der
            // eigene Gang als leuchtendes Geflecht in der Erde stehen - die
            // einzige Spur, die man hier hinterlaesst.
            if (this.edits.has(this.ekey(nx, ny, nz))) {
              _c.lerp(_glow, 0.34).multiplyScalar(1.1);
            }

            const start = P.length / 3;
            const top = liquid ? 0.88 : def.slim ? def.slim[1] : 1;
            // Schmale Blöcke (Fackeln) stehen als Pfosten in der Blockmitte
            const w = def.slim ? def.slim[0] : 1, o = (1 - w) / 2;
            for (const [dx, dy, dz] of face.corners) {
              P.push(x + o + dx * w, y + (dy ? top : 0), z + o + dz * w);
              C.push(_c.r, _c.g, _c.b);
            }
            I.push(start, start + 1, start + 2, start, start + 2, start + 3);
          }
        }
      }
    }

    const make = (P, C, I, material) => {
      if (!I.length) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
      g.setIndex(I);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, material);
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    };

    for (const key of ['mesh', 'water']) {
      if (chunk[key]) {
        this.scene.remove(chunk[key]);
        chunk[key].geometry.dispose();
        chunk[key] = null;
      }
    }
    chunk.mesh = make(pos, col, idx, this.material);
    chunk.water = make(wpos, wcol, widx, this.waterMaterial);
    if (chunk.mesh) this.scene.add(chunk.mesh);
    if (chunk.water) this.scene.add(chunk.water);
  }

  /* ------------------------------- Streaming ------------------------------ */
  update(px, pz, budget = 1) {
    const ccx = Math.floor(px / CHUNK), ccz = Math.floor(pz / CHUNK);

    for (let dz = -this.radius; dz <= this.radius; dz++) {
      for (let dx = -this.radius; dx <= this.radius; dx++) {
        const cx = ccx + dx, cz = ccz + dz;
        const k = this.key(cx, cz);
        if (this.chunks.has(k) || this.queue.some((q) => q.k === k)) continue;
        this.queue.push({ k, cx, cz, d: dx * dx + dz * dz });
      }
    }
    this.queue.sort((a, b) => a.d - b.d);
    while (budget-- > 0 && this.queue.length) {
      const job = this.queue.shift();
      this.buildChunk(job.cx, job.cz);
    }

    for (const [k, chunk] of this.chunks) {
      if (Math.abs(chunk.cx - ccx) > this.radius + 1 || Math.abs(chunk.cz - ccz) > this.radius + 1) {
        for (const key of ['mesh', 'water']) {
          if (!chunk[key]) continue;
          this.scene.remove(chunk[key]);
          chunk[key].geometry.dispose();
        }
        this.chunks.delete(k);
      }
    }
  }

  /** Oberste feste Stelle einer Spalte — gut für Spawn und Fallhöhe. */
  surfaceY(x, z) {
    for (let y = HEIGHT - 1; y > 0; y--) if (isSolid(this.get(x, y, z))) return y;
    return 1;
  }
}

/* Die Gruften bekommen Gelände und Saatkorn erst hier - vorher gibt es
   rohSurface noch nicht. */
gruft.verbinden(rohSurface, () => SEED);
