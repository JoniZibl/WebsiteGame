import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm, noise2, rngFor, smoothstep, clamp } from './noise.js';

export const CHUNK = 56;        // Kantenlänge eines Chunks in Weltmetern
const RES = 20;                 // Quads pro Chunk-Kante (bewusst grob, große Flächen)
const STEP = CHUNK / RES;
export const WATER_LEVEL = -1.2;

let SEED = 1337;
export function setSeed(s) { SEED = s | 0; }

// Stellen, an denen einmal ein Feuer brannte. Das Land erinnert sich daran,
// auch wenn das Feuer längst aus ist: dort wächst es dichter und grüner.
let LIT = [];
export function setLitZones(list) { LIT = list || []; }

export function bloomAt(x, z) {
  let best = 0;
  for (const zone of LIT) {
    const d = Math.hypot(x - zone.x, z - zone.z);
    if (d < zone.r) best = Math.max(best, 1 - d / zone.r);
  }
  return best;
}

/* ------------------------------------------------------------------ */
/*  Höhenfeld — rein aus Noise, damit jeder Chunk nahtlos passt        */
/* ------------------------------------------------------------------ */
export function heightAt(x, z) {
  // große Landform: entscheidet über Ebene, Hügel oder Kuppe
  const shape = fbm(x * 0.004, z * 0.004, SEED + 7, 3);
  const relief = 0.55 + smoothstep(0.35, 0.75, shape) * 1.6;

  let h = (fbm(x * 0.014, z * 0.014, SEED, 4) - 0.45) * 17 * relief;

  // mittlere Wellen, damit nie eine tote Fläche entsteht
  h += (fbm(x * 0.038, z * 0.038, SEED + 21, 2) - 0.5) * 3.0;

  // gewundene Flüsse
  const r = Math.abs(noise2(x * 0.0065, z * 0.0065, SEED + 31) - 0.5);
  h -= smoothstep(0.07, 0.0, r) * 7.0;

  // nur ganz feine Unebenheiten: große Flächen sollen ruhig bleiben,
  // damit die Facetten als klare Flächen lesen statt als Geflimmer
  h += (fbm(x * 0.08, z * 0.08, SEED + 13, 2) - 0.5) * 0.45;
  return h;
}

export function isLand(x, z) { return heightAt(x, z) > WATER_LEVEL + 0.45; }

/* ------------------------------------------------------------------ */
/*  Zwei Biom-Felder statt harter Grenzen: wie trocken und wie bewaldet */
/*  eine Stelle ist. Beides blendet weich ineinander.                   */
/* ------------------------------------------------------------------ */
export function drynessAt(x, z) {
  return smoothstep(0.44, 0.72, fbm(x * 0.0028, z * 0.0028, SEED + 201, 3));
}

export function woodinessAt(x, z) {
  return smoothstep(0.34, 0.66, fbm(x * 0.0035, z * 0.0035, SEED + 311, 3));
}

export function regionName(x, z) {
  const dry = drynessAt(x, z), wood = woodinessAt(x, z);
  if (dry > 0.6) return wood > 0.5 ? 'Trockenwald' : 'Heide';
  if (wood > 0.6) return 'Tiefer Wald';
  if (wood > 0.3) return 'Hain';
  return 'Wiesen';
}

function slopeAt(x, z) {
  const d = 1.2;
  const hx = heightAt(x + d, z) - heightAt(x - d, z);
  const hz = heightAt(x, z + d) - heightAt(x, z - d);
  return Math.hypot(hx, hz) / (2 * d);
}

/* ------------------------------------------------------------------ */
/*  Cozy-Palette                                                       */
/* ------------------------------------------------------------------ */
// Eine Familie: warme Salbei- und Olivgrüne, dazu Sand und Stein im selben
// warmen Grau. Terrakotta ist der einzige Fremdton und bleibt den Dingen
// vorbehalten, die auffallen sollen (Dächer, Zelte, Gegner, die Figur).
const C = {
  sand:   new THREE.Color('#e9d29b'),
  grass1: new THREE.Color('#76c565'),
  grass2: new THREE.Color('#62b25b'),
  grass3: new THREE.Color('#93d878'),
  rock:   new THREE.Color('#b6b3a2'),
  deep:   new THREE.Color('#45a89e'),
  dry1:   new THREE.Color('#e3cd7e'),
  dry2:   new THREE.Color('#cdb768'),
  bloom:  new THREE.Color('#7fd464'),
};

const tmpColor = new THREE.Color();
function terrainColor(h, slope, jitter, dry, bloom = 0) {
  const shade = 0.975 + jitter * 0.05;   // leichtes Flackern für den Patchwork-Look

  // Gras: zwei Grüntöne weich ineinander, dazu große, helle Wiesenflecken
  const t = clamp((jitter - 0.32) * 2.2, 0, 1);
  tmpColor.copy(C.grass2).lerp(C.grass1, t);
  tmpColor.lerp(C.grass3, clamp((h - 1) * 0.05, 0, 0.3) + clamp((jitter - 0.55) * 1.6, 0, 0.45));

  // in trockenen Gegenden zieht dasselbe Grün ins Goldene
  if (dry > 0) tmpColor.lerp(t > 0.5 ? C.dry1 : C.dry2, dry * 0.95);

  // wo einmal Licht brannte, wird das Land satter und wärmer
  if (bloom > 0) tmpColor.lerp(C.bloom, Math.min(0.75, bloom * 0.9));

  // Fels an steilen Hängen und auf Gipfeln
  tmpColor.lerp(C.rock, clamp((slope - 0.6) * 0.9, 0, 0.45) + clamp((h - 11) * 0.12, 0, 0.4));

  // Strand: schmaler Saum am Wasser, die Kante wird vom Noise leicht ausgefranst
  const shoreH = WATER_LEVEL + 1.0 + (jitter - 0.5) * 0.7;
  tmpColor.lerp(C.sand, smoothstep(shoreH, WATER_LEVEL + 0.05, h) * 0.9);
  if (h < WATER_LEVEL) tmpColor.lerp(C.deep, smoothstep(WATER_LEVEL, WATER_LEVEL - 1.2, h));

  return tmpColor.multiplyScalar(shade);
}

/* ------------------------------------------------------------------ */
/*  Materialien & Requisiten-Bausteine (einmal erzeugt, dann geklont)   */
/* ------------------------------------------------------------------ */
const mat = (hex, opts = {}) => new THREE.MeshLambertMaterial({ color: hex, flatShading: true, ...opts });

// Ein einziger Zeitwert treibt den Wind in allen Blattmaterialien.
export const windTime = { value: 0 };

/** Lässt ein Material seine Geometrie im Wind wiegen (Stärke aus aSway). */
function makeWindy(material, strength = 0.32) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windTime;
    shader.uniforms.uWind = { value: strength };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSway;\nuniform float uTime;\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float gust = sin(uTime * 1.3 + transformed.x * 0.14 + transformed.z * 0.11)
                   + sin(uTime * 2.1 + transformed.z * 0.23) * 0.4;
        transformed.x += gust * aSway * uWind;
        transformed.z += gust * aSway * uWind * 0.6;`);
  };
  return material;
}

// Farben der Requisiten. Sie landen in den Eckpunkten, nicht in Materialien.
const hex = (h) => new THREE.Color(h);

export const PALETTE = {
  trunk:  hex('#a9713f'),
  leafA:  hex('#5aab58'),
  leafB:  hex('#469149'),
  leafC:  hex('#3d8746'),
  leafD:  hex('#2f7040'),
  leafE:  hex('#9bb257'),
  leafF:  hex('#7d9a45'),
  rock:   hex('#b3b0a0'),
  shroom: hex('#cf5340'),
  shroomStem: hex('#f6ead0'),
  reed:   hex('#8cb355'),
  pad:    hex('#4f9b55'),
  wall:   hex('#f6e6c6'),
  trim:   hex('#fdf6e4'),
  roof:   hex('#c9563f'),
  roofDark: hex('#a8412d'),
  wood:   hex('#a9713f'),
  woodDark: hex('#7d4f2e'),
  glass:  hex('#79c6c0'),
  path:   hex('#e4cd98'),
  tent:   hex('#d9603f'),
  flower: hex('#fbead2'),
  // Fundstellen
  birkeStamm: hex('#e9e2cd'),
  birkeLaub:  hex('#8fce6a'),
  findling:   hex('#bcb9a8'),
  busch:      hex('#4f9b55'),
  beere:      hex('#cf5340'),
};

// Zwei Materialien für alles: eins ruhend, eins vom Wind bewegt.
export const PROP_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
export const PROP_MAT_WIND = makeWindy(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
const SLOT_MAT = { static: PROP_MAT, windy: PROP_MAT_WIND };

const G = {
  trunk:  new THREE.CylinderGeometry(0.16, 0.24, 1.1, 5).toNonIndexed(),
  cone1:  new THREE.ConeGeometry(1.25, 2.4, 7).toNonIndexed(),
  cone2:  new THREE.ConeGeometry(0.9, 2.0, 7).toNonIndexed(),
  rock:   new THREE.IcosahedronGeometry(0.7, 0).toNonIndexed(),
  wall:   new THREE.BoxGeometry(2.6, 1.7, 2.2).toNonIndexed(),
  sockel: new THREE.BoxGeometry(2.8, 0.22, 2.4).toNonIndexed(),
  dach:   new THREE.BoxGeometry(3.1, 0.16, 1.65).toNonIndexed(),
  first:  new THREE.BoxGeometry(3.15, 0.16, 0.2).toNonIndexed(),
  balken: new THREE.BoxGeometry(0.14, 1.7, 0.14).toNonIndexed(),
  tuer:   new THREE.BoxGeometry(0.55, 0.85, 0.1).toNonIndexed(),
  fenster: new THREE.BoxGeometry(0.42, 0.42, 0.1).toNonIndexed(),
  kamin:  new THREE.BoxGeometry(0.3, 0.9, 0.3).toNonIndexed(),
  stufe:  new THREE.BoxGeometry(0.8, 0.12, 0.3).toNonIndexed(),
  platte: new THREE.BoxGeometry(0.85, 0.09, 0.85).toNonIndexed(),
  zaunPfosten: new THREE.BoxGeometry(0.13, 0.9, 0.13).toNonIndexed(),
  zaunLatte: new THREE.BoxGeometry(1.5, 0.11, 0.09).toNonIndexed(),
  pillar: new THREE.BoxGeometry(0.75, 2.6, 0.6).toNonIndexed(),
  lintel: new THREE.BoxGeometry(1.9, 0.5, 0.6).toNonIndexed(),
  bud:    new THREE.SphereGeometry(0.22, 5, 4).toNonIndexed(),
  blob:   new THREE.IcosahedronGeometry(1.0, 0).toNonIndexed(),
  tent:   new THREE.CylinderGeometry(1.0, 1.0, 1.9, 3, 1).rotateZ(Math.PI / 2).toNonIndexed(),
  ember:  new THREE.ConeGeometry(0.3, 0.45, 5).toNonIndexed(),
  cap:    new THREE.SphereGeometry(0.3, 7, 4, 0, Math.PI * 2, 0, Math.PI * 0.55).toNonIndexed(),
  stem:   new THREE.CylinderGeometry(0.07, 0.1, 0.32, 5).toNonIndexed(),
  reed:   new THREE.ConeGeometry(0.09, 1.5, 4).toNonIndexed(),
  pad:    new THREE.CylinderGeometry(0.5, 0.5, 0.06, 7).toNonIndexed(),
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

/**
 * Legt ein Teil in den Chunk. Die Farbe des benannten Materials wird in die
 * Eckpunkte gebacken — dadurch braucht ein ganzer Chunk nur zwei Meshes
 * (ruhend und im Wind wiegend) statt eines pro Material.
 */
function push(bucket, key, geo, x, y, z, rotY = 0, sx = 1, sy = 1, sz = 1, rotX = 0, sway = 0, rotZ = 0) {
  _e.set(rotX, rotY, rotZ, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  _m.compose(_p, _q, _s);
  const g = geo.clone();

  const posAttr = g.attributes.position;
  const count = posAttr.count;

  // Wie stark wiegt sich welcher Punkt? Oben mehr als unten.
  const sways = new Float32Array(count);
  if (sway > 0) {
    g.computeBoundingBox();
    const minY = g.boundingBox.min.y, spanY = Math.max(0.001, g.boundingBox.max.y - minY);
    for (let i = 0; i < count; i++) {
      const t = (posAttr.getY(i) - minY) / spanY;
      sways[i] = t * t * sway;
    }
  }
  g.setAttribute('aSway', new THREE.BufferAttribute(sways, 1));

  const c = PALETTE[key] || PALETTE.wall;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  g.applyMatrix4(_m);
  const slot = sway > 0 ? 'windy' : 'static';
  (bucket[slot] || (bucket[slot] = [])).push(g);
}

/* ------------------------------------------------------------------ */
/*  Abbaubare Fundstellen: Birken (Holz), Findlinge (Stein), Beeren     */
/*  Sie liegen getrennt von den verschmolzenen Requisiten, damit eine   */
/*  einzelne Fundstelle verschwinden kann.                              */
/* ------------------------------------------------------------------ */
export const NODE_KINDS = {
  birke:    { label: 'Birke',       icon: '🪓', hits: 3, res: 'holz',   amount: 3, radius: 0.5 },
  findling: { label: 'Findling',    icon: '⛏️', hits: 3, res: 'stein',  amount: 2, radius: 0.8 },
  beere:    { label: 'Beerenbusch', icon: '🫐', hits: 1, res: 'beeren', amount: 2, radius: 0.5 },
};

const NG = {
  stamm: new THREE.CylinderGeometry(0.17, 0.22, 2.3, 6).toNonIndexed(),
  laub:  new THREE.IcosahedronGeometry(0.95, 0).toNonIndexed(),
  fels:  new THREE.IcosahedronGeometry(1.0, 0).toNonIndexed(),
  busch: new THREE.SphereGeometry(0.8, 7, 5, 0, Math.PI * 2, 0, Math.PI * 0.62).toNonIndexed(),
  beere: new THREE.SphereGeometry(0.13, 5, 4).toNonIndexed(),
};

function nodeGeometry(node, bucket) {
  const { x, y, z, s, rot } = node;
  if (node.kind === 'birke') {
    push(bucket, 'birkeStamm', NG.stamm, x, y + 1.15 * s, z, rot, s, s, s);
    push(bucket, 'birkeLaub', NG.laub, x, y + 2.5 * s, z, rot, s, s * 0.9, s, 0, 0.9);
    push(bucket, 'birkeLaub', NG.laub, x + 0.4 * s, y + 3.1 * s, z - 0.25 * s, rot * 2, s * 0.6, s * 0.6, s * 0.6, 0, 1);
  } else if (node.kind === 'findling') {
    push(bucket, 'findling', NG.fels, x, y + 0.55 * s, z, rot, s, s * 0.8, s);
    push(bucket, 'findling', NG.fels, x + 0.8 * s, y + 0.25 * s, z + 0.3 * s, rot * 1.7, s * 0.45, s * 0.4, s * 0.45);
  } else {
    push(bucket, 'busch', NG.busch, x, y, z, rot, s, s, s, 0, 0.5);
    for (let i = 0; i < 5; i++) {
      const a = rot + i * 1.3;
      push(bucket, 'beere', NG.beere,
           x + Math.cos(a) * 0.55 * s, y + 0.35 * s + (i % 2) * 0.2 * s, z + Math.sin(a) * 0.55 * s, 0, s, s, s);
    }
  }
}

/** Baut die Meshes aller Fundstellen eines Chunks neu auf. */
export function buildNodeMeshes(nodes) {
  const group = new THREE.Group();
  const bucket = {};
  for (const node of nodes) nodeGeometry(node, bucket);
  for (const key in bucket) {
    const merged = mergeGeometries(bucket[key], false);
    if (merged) group.add(new THREE.Mesh(merged, SLOT_MAT[key]));
    bucket[key].forEach((g) => g.dispose());
  }
  return group;
}

/**
 * Ein kleines Haus aus Einzelteilen: heller Putz, rotes Giebeldach mit
 * Überstand, Holztür mit Stufe, ein Fenster und ein Kamin.
 */
function buildHouse(bucket, x, y, z, rot, sc, rand) {
  const s2 = sc;
  push(bucket, 'trim', G.sockel, x, y + 0.11 * s2, z, rot, s2, s2, s2);
  push(bucket, 'wall', G.wall, x, y + 1.07 * s2, z, rot, s2, s2, s2);

  // Eckbalken geben dem Haus Fachwerk-Charakter
  for (const [ox2, oz2] of [[-1.28, -1.08], [1.28, -1.08], [-1.28, 1.08], [1.28, 1.08]]) {
    const px = x + (Math.cos(rot) * ox2 - Math.sin(rot) * oz2) * s2;
    const pz = z + (Math.sin(rot) * ox2 + Math.cos(rot) * oz2) * s2;
    push(bucket, 'wood', G.balken, px, y + 1.07 * s2, pz, rot, s2, s2, s2);
  }

  // zwei geneigte Dachflächen plus Firstbalken
  // Die beiden Dachflächen liegen vor und hinter dem First, also entlang der
  // lokalen Z-Achse des Hauses – nicht entlang des Firsts.
  const tilt = 0.56;
  const fwdX = Math.sin(rot), fwdZ = Math.cos(rot);
  push(bucket, 'roof', G.dach, x + fwdX * 0.68 * s2, y + 2.28 * s2, z + fwdZ * 0.68 * s2,
       rot, s2, s2, s2, tilt);
  push(bucket, 'roof', G.dach, x - fwdX * 0.68 * s2, y + 2.28 * s2, z - fwdZ * 0.68 * s2,
       rot, s2, s2, s2, -tilt);
  push(bucket, 'roofDark', G.first, x, y + 2.68 * s2, z, rot, s2, s2, s2);

  // Front: Tür mit Stufe, daneben ein Fenster
  const fx2 = Math.sin(rot) * 1.13 * s2, fz2 = Math.cos(rot) * 1.13 * s2;
  const sx2 = Math.cos(rot), sz2 = -Math.sin(rot);
  push(bucket, 'woodDark', G.tuer, x + fx2, y + 0.53 * s2, z + fz2, rot, s2, s2, s2);
  push(bucket, 'trim', G.stufe, x + fx2 * 1.2, y + 0.06 * s2, z + fz2 * 1.2, rot, s2, s2, s2);
  push(bucket, 'glass', G.fenster, x + fx2 + sx2 * 0.8 * s2, y + 1.15 * s2, z + fz2 + sz2 * 0.8 * s2, rot, s2, s2, s2);
  push(bucket, 'trim', G.fenster, x + fx2 * 0.98 + sx2 * 0.8 * s2, y + 1.15 * s2,
       z + fz2 * 0.98 + sz2 * 0.8 * s2, rot, s2 * 1.2, s2 * 1.2, s2 * 0.5);

  if (rand() < 0.7) {
    push(bucket, 'roofDark', G.kamin, x - sx2 * 0.85 * s2, y + 2.6 * s2, z - sz2 * 0.85 * s2, rot, s2, s2, s2);
  }
}

/** Trittsteine vom Dorfplatz zu einem Haus. */
function buildPath(bucket, ax, az, bx, bz, rand) {
  const steps = Math.max(2, Math.round(Math.hypot(bx - ax, bz - az) / 1.1));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const px = ax + (bx - ax) * t + (rand() - 0.5) * 0.35;
    const pz = az + (bz - az) * t + (rand() - 0.5) * 0.35;
    push(bucket, 'path', G.platte, px, heightAt(px, pz) + 0.05, pz, rand() * 6.28,
         0.8 + rand() * 0.35, 1, 0.8 + rand() * 0.35);
  }
}

/** Ein Zaunstück aus zwei Pfosten und zwei Latten. */
function buildFence(bucket, x, y, z, rot, colliders) {
  push(bucket, 'wood', G.zaunPfosten, x - Math.cos(rot) * 0.72, y + 0.45, z + Math.sin(rot) * 0.72, rot);
  push(bucket, 'wood', G.zaunPfosten, x + Math.cos(rot) * 0.72, y + 0.45, z - Math.sin(rot) * 0.72, rot);
  push(bucket, 'wood', G.zaunLatte, x, y + 0.66, z, rot);
  push(bucket, 'wood', G.zaunLatte, x, y + 0.34, z, rot);
  colliders.push({ x, z, r: 0.75 });
}

/* ------------------------------------------------------------------ */
/*  Requisiten eines Chunks                                            */
/* ------------------------------------------------------------------ */
function buildProps(cx, cz, bucket, colliders, fires, shrines, villages, nodes) {
  const rand = rngFor(cx, cz, SEED);
  const ox = cx * CHUNK, oz = cz * CHUNK;

  // --- Dorf? (Häusergruppe wie in der Referenz) ---
  const villageRoll = noise2(cx * 0.9 + 0.3, cz * 0.9 + 0.7, SEED + 55);
  if (villageRoll > 0.74) {
    const vx = ox + 8 + rand() * (CHUNK - 16);
    const vz = oz + 8 + rand() * (CHUNK - 16);
    if (isLand(vx, vz) && slopeAt(vx, vz) < 0.5) {
      villages.push({ x: vx, y: heightAt(vx, vz), z: vz });
      const houses = [];
      const n = 3 + Math.floor(rand() * 4);
      for (let i = 0; i < n; i++) {
        const a = rand() * Math.PI * 2, d = 2.5 + rand() * 7;
        const hx = vx + Math.cos(a) * d, hz = vz + Math.sin(a) * d;
        const hy = heightAt(hx, hz);
        if (hy < WATER_LEVEL + 1.0 || slopeAt(hx, hz) > 0.7) continue;
        const rot = Math.round(rand() * 4) * (Math.PI / 2) + (rand() - 0.5) * 0.25;
        const sc = 0.8 + rand() * 0.4;
        buildHouse(bucket, hx, hy, hz, rot, sc, rand);
        colliders.push({ x: hx, z: hz, r: 1.8 * sc });
        houses.push({ x: hx, z: hz, rot });
      }

      // Trittsteinwege vom Platz zu jedem Haus, dazu ein paar Zäune
      for (const h of houses) buildPath(bucket, vx, vz, h.x, h.z, rand);
      const fences = 2 + Math.floor(rand() * 4);
      for (let i = 0; i < fences; i++) {
        const a = rand() * Math.PI * 2, d = 7 + rand() * 5;
        const fx3 = vx + Math.cos(a) * d, fz3 = vz + Math.sin(a) * d;
        if (heightAt(fx3, fz3) < WATER_LEVEL + 1) continue;
        buildFence(bucket, fx3, heightAt(fx3, fz3), fz3, -a + Math.PI / 2, colliders);
      }
    }
  }

  // --- Zeltlager auf einer Lichtung ---
  if (rand() < 0.14) {
    const tx = ox + 8 + rand() * (CHUNK - 16);
    const tz = oz + 8 + rand() * (CHUNK - 16);
    const ty = heightAt(tx, tz);
    if (ty > WATER_LEVEL + 1.2 && slopeAt(tx, tz) < 0.35) {
      const sc = 0.85 + rand() * 0.3;
      const rot = rand() * Math.PI * 2;
      push(bucket, 'tent', G.tent, tx, ty + 0.5 * sc, tz, rot, sc, sc, sc);
      // Feuerstelle daneben
      const fx2 = tx + Math.cos(rot) * 2.2, fz2 = tz + Math.sin(rot) * 2.2;
      push(bucket, 'rock', G.rock, fx2, heightAt(fx2, fz2) + 0.12, fz2, 0, 0.7, 0.4, 0.7);
      push(bucket, 'tent', G.ember, fx2, heightAt(fx2, fz2) + 0.3, fz2, rand() * 6.28, 0.8, 0.8, 0.8);
      colliders.push({ x: tx, z: tz, r: 1.5 * sc });
      fires.push({ x: fx2, y: heightAt(fx2, fz2), z: fz2 });
    }
  }

  // --- einzelne Feuerstelle auf einer Lichtung ---
  if (rand() < 0.3) {
    const fx0 = ox + 6 + rand() * (CHUNK - 12);
    const fz0 = oz + 6 + rand() * (CHUNK - 12);
    const fy0 = heightAt(fx0, fz0);
    if (fy0 > WATER_LEVEL + 1.0 && slopeAt(fx0, fz0) < 0.45) {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        push(bucket, 'rock', G.rock, fx0 + Math.cos(a) * 0.7, fy0 + 0.1, fz0 + Math.sin(a) * 0.7,
             rand() * 6.28, 0.45, 0.35, 0.45);
      }
      push(bucket, 'tent', G.ember, fx0, fy0 + 0.32, fz0, rand() * 6.28, 0.85, 0.9, 0.85);
      fires.push({ x: fx0, y: fy0, z: fz0 });
    }
  }

  // --- Steinkreis als seltenes Wahrzeichen ---
  if (rand() < 0.15) {
    const sx = ox + 10 + rand() * (CHUNK - 20);
    const sz = oz + 10 + rand() * (CHUNK - 20);
    if (isLand(sx, sz) && slopeAt(sx, sz) < 0.45) {
      const ringR = 4.2;
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const px = sx + Math.cos(a) * ringR, pz = sz + Math.sin(a) * ringR;
        const py = heightAt(px, pz);
        push(bucket, 'rock', G.pillar, px, py + 1.2, pz, -a, 1, 1 + rand() * 0.25, 1);
        push(bucket, 'rock', G.lintel, px, py + 2.6, pz, -a);
        colliders.push({ x: px, z: pz, r: 0.8 });
      }
      shrines.push({ x: sx, y: heightAt(sx, sz), z: sz, key: shrineKey(sx, sz) });
    }
  }

  // --- Fundstellen zum Abbauen ---
  for (let i = 0; i < 26; i++) {
    const nx = ox + rand() * CHUNK;
    const nz = oz + rand() * CHUNK;
    const ny = heightAt(nx, nz);
    if (ny < WATER_LEVEL + 1.0 || slopeAt(nx, nz) > 0.6) continue;

    let blocked = false;
    for (const c of colliders) {
      if ((nx - c.x) ** 2 + (nz - c.z) ** 2 < (c.r + 2.4) ** 2) { blocked = true; break; }
    }
    if (blocked) continue;

    const dryHere = drynessAt(nx, nz);
    const r = rand();
    const kind = r < 0.45 ? 'birke' : r < 0.75 ? 'findling' : 'beere';
    if (kind === 'birke' && dryHere > 0.7) continue;      // in der Heide wachsen kaum Birken
    if (nodes.length >= 9) break;

    const node = {
      kind, x: nx, y: ny, z: nz,
      s: kind === 'findling' ? 0.7 + rand() * 0.5 : 0.85 + rand() * 0.4,
      rot: rand() * 6.28,
      hp: NODE_KINDS[kind].hits,
    };
    node.collider = { x: nx, z: nz, r: NODE_KINDS[kind].radius * node.s };
    colliders.push(node.collider);
    nodes.push(node);
  }

  // --- Bäume, Steine, Blumen ---
  const tries = 260;
  for (let i = 0; i < tries; i++) {
    const x = ox + rand() * CHUNK;
    const z = oz + rand() * CHUNK;
    const y = heightAt(x, z);

    // Uferzone: Schilf im flachen Wasser, Seerosen auf dem Wasser
    if (y < WATER_LEVEL + 0.8) {
      if (y > WATER_LEVEL - 0.9 && rand() < 0.35) {
        const n = 3 + Math.floor(rand() * 4);
        for (let k = 0; k < n; k++) {
          const rx = x + (rand() - 0.5) * 1.8, rz = z + (rand() - 0.5) * 1.8;
          const rs = 0.7 + rand() * 0.7;
          push(bucket, 'reed', G.reed, rx, Math.max(heightAt(rx, rz), WATER_LEVEL - 0.2) + 0.7 * rs, rz,
               rand() * 6.28, rs, rs, rs, (rand() - 0.5) * 0.25, 1);
        }
      } else if (y < WATER_LEVEL - 0.4 && rand() < 0.12) {
        const n = 1 + Math.floor(rand() * 3);
        for (let k = 0; k < n; k++) {
          push(bucket, 'pad', G.pad, x + (rand() - 0.5) * 2.4, WATER_LEVEL + 0.04, z + (rand() - 0.5) * 2.4,
               rand() * 6.28, 0.7 + rand() * 0.6, 1, 0.7 + rand() * 0.6);
        }
      }
      continue;
    }

    const slope = slopeAt(x, z);
    if (slope > 0.9) continue;

    // in der Nähe eines Hauses nichts pflanzen
    let blocked = false;
    for (const c of colliders) {
      if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + 1.6) ** 2) { blocked = true; break; }
    }
    if (blocked) continue;

    const dry = drynessAt(x, z);
    const wood = woodinessAt(x, z);
    const forest = fbm(x * 0.018, z * 0.018, SEED + 91, 3) * (0.45 + wood * 1.5) * (1 - dry * 0.65);
    const roll = rand();

    if (roll < forest * forest * 1.9 && slope < 0.75) {
      const sc = 0.75 + rand() * 0.75;
      // im tiefen Wald dunkle Nadeln, in der Heide ausgetrocknetes Oliv
      let leaf;
      if (dry > 0.5 && rand() < dry) {
        leaf = rand() < 0.5 ? 'leafE' : 'leafF';
      } else {
        const shift = clamp(wood + (rand() - 0.5) * 0.6, 0, 0.999);
        const leaf4 = ['leafA', 'leafB', 'leafC', 'leafD'];
        leaf = leaf4[(shift * 4) | 0];
      }
      if (rand() < 0.26) {
        // runder Laubbaum als Auflockerung
        push(bucket, 'trunk', G.trunk, x, y + 0.6 * sc, z, 0, sc * 1.1, sc * 1.3, sc * 1.1);
        push(bucket, leaf, G.blob, x, y + 1.9 * sc, z, rand() * 6.28, sc * 1.05, sc * 0.95, sc * 1.05, 0, 0.9);
        push(bucket, leaf, G.blob, x + 0.35 * sc, y + 2.5 * sc, z - 0.2 * sc, rand() * 6.28, sc * 0.6, sc * 0.6, sc * 0.6, 0, 1);
      } else {
        // Nadelbaum aus zwei Kegeln; ein Teil davon schlank und hoch
        const slim = rand() < 0.45;
        const w = slim ? sc * 0.62 : sc;
        const hgt = slim ? sc * 1.7 : sc;
        push(bucket, 'trunk', G.trunk, x, y + 0.5 * sc, z, 0, sc * 0.8, sc, sc * 0.8);
        const spin = rand() * 6.28;
        push(bucket, leaf, G.cone1, x, y + 1.35 * hgt, z, spin, w * 1.12, hgt * 0.9, w * 1.12, 0, 0.35);
        push(bucket, leaf, G.cone1, x, y + 2.15 * hgt, z, spin + 0.5, w * 0.86, hgt * 0.8, w * 0.86, 0, 0.6);
        push(bucket, leaf, G.cone2, x, y + 2.95 * hgt, z, spin + 1.0, w * 0.75, hgt * 0.75, w * 0.75, 0, 0.9);
      }
      colliders.push({ x, z, r: 0.55 * sc });
    } else if (roll < 0.16 + dry * 0.1) {
      const sc = 0.5 + rand() * 0.9;
      push(bucket, 'rock', G.rock, x, y + 0.25 * sc, z, rand() * 6.28, sc, sc * 0.8, sc, rand() * 0.4);
      if (sc > 0.9) colliders.push({ x, z, r: 0.6 * sc });
    } else if (roll < 0.30 && dry < 0.6 && wood > 0.3) {
      // Pilzgruppe im Schatten der Bäume
      const n = 2 + Math.floor(rand() * 3);
      for (let k = 0; k < n; k++) {
        const mx2 = x + (rand() - 0.5) * 1.4, mz2 = z + (rand() - 0.5) * 1.4;
        const my = heightAt(mx2, mz2);
        const ms = 0.7 + rand() * 0.6;
        push(bucket, 'shroomStem', G.stem, mx2, my + 0.16 * ms, mz2, 0, ms, ms, ms);
        push(bucket, 'shroom', G.cap, mx2, my + 0.3 * ms, mz2, rand() * 6.28, ms, ms, ms);
      }
    } else if (roll < 0.40 + bloomAt(x, z) * 0.45 && dry < 0.5) {
      // kleine Blütenbüschel
      const n = 2 + Math.floor(rand() * 4);
      for (let k = 0; k < n; k++) {
        const fx = x + (rand() - 0.5) * 1.6, fz = z + (rand() - 0.5) * 1.6;
        push(bucket, 'flower', G.bud, fx, heightAt(fx, fz) + 0.22, fz, 0, 0.7, 0.7, 0.7);
      }
    }
  }
}

// Steinkreise bekommen einen festen Schlüssel, damit ein besiegter Wächter
// besiegt bleibt, auch wenn der Chunk zwischendurch entladen wird.
export function shrineKey(x, z) { return Math.round(x) + '_' + Math.round(z); }

// Lichtsäule über einem Steinkreis – von Weitem sichtbares Ziel.
const beaconGeo = new THREE.CylinderGeometry(0.35, 0.85, 13, 6, 1, true);
const beaconMat = new THREE.MeshBasicMaterial({
  color: '#ffe0ac', transparent: true, opacity: 0.1,
  depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
});

// Ein Schimmer am Boden verrät den Steinkreis auch, wenn der Strahl im Nebel liegt.
const glowGeo = new THREE.CircleGeometry(3.4, 18).rotateX(-Math.PI / 2);
const glowMat = new THREE.MeshBasicMaterial({
  color: '#ffdca0', transparent: true, opacity: 0.16,
  depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
});

/* ------------------------------------------------------------------ */
/*  Boden-Mesh eines Chunks (facettiert — das ist gewollt)              */
/*                                                                     */
/*  Jede Kachel bekommt eine eigene Farbe und eine eigene Normale, die  */
/*  Flächen sollen sichtbar bleiben. Damit daraus kein Karomuster wird, */
/*  variiert die Farbe nur sehr langsam über die Landschaft und die     */
/*  Diagonale der Kacheln kippt abwechselnd.                            */
/* ------------------------------------------------------------------ */
function buildGround(cx, cz) {
  const ox = cx * CHUNK, oz = cz * CHUNK;
  const quads = RES * RES;
  const pos = new Float32Array(quads * 6 * 3);
  const col = new Float32Array(quads * 6 * 3);

  const side = RES + 1;
  const hs = new Float32Array(side * side);
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) hs[j * side + i] = heightAt(ox + i * STEP, oz + j * STEP);
  }

  let p = 0, c = 0;
  const writeTri = (ax, ay, az, bx, by, bz, cx2, cy, cz2, color) => {
    pos[p++] = ax; pos[p++] = ay; pos[p++] = az;
    pos[p++] = bx; pos[p++] = by; pos[p++] = bz;
    pos[p++] = cx2; pos[p++] = cy; pos[p++] = cz2;
    for (let k = 0; k < 3; k++) { col[c++] = color.r; col[c++] = color.g; col[c++] = color.b; }
  };

  for (let j = 0; j < RES; j++) {
    for (let i = 0; i < RES; i++) {
      const x0 = ox + i * STEP, z0 = oz + j * STEP, x1 = x0 + STEP, z1 = z0 + STEP;
      const h00 = hs[j * side + i], h10 = hs[j * side + i + 1];
      const h01 = hs[(j + 1) * side + i], h11 = hs[(j + 1) * side + i + 1];

      const mx = x0 + STEP * 0.5, mz = z0 + STEP * 0.5;
      const hAvg = (h00 + h10 + h01 + h11) * 0.25;
      const slope = (Math.abs(h00 - h11) + Math.abs(h10 - h01)) / (2 * STEP);
      // große, ruhige Farbflächen statt kachelweisem Flimmern
      const jitter = fbm(mx * 0.012, mz * 0.012, SEED + 3, 2);
      const color = terrainColor(hAvg, slope, jitter, drynessAt(mx, mz), bloomAt(mx, mz)).clone();

      if ((i + j) & 1) {
        writeTri(x0, h00, z0, x0, h01, z1, x1, h11, z1, color);
        writeTri(x0, h00, z0, x1, h11, z1, x1, h10, z0, color);
      } else {
        writeTri(x0, h00, z0, x0, h01, z1, x1, h10, z0, color);
        writeTri(x1, h10, z0, x0, h01, z1, x1, h11, z1, color);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

const groundMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

function pushOut(pos, radius, c) {
  const dx = pos.x - c.x, dz = pos.z - c.z;
  const min = c.r + radius;
  const d2 = dx * dx + dz * dz;
  if (d2 > min * min || d2 === 0) return;
  const d = Math.sqrt(d2);
  pos.x = c.x + (dx / d) * min;
  pos.z = c.z + (dz / d) * min;
}

/* ------------------------------------------------------------------ */
/*  Welt: lädt Chunks rund um den Spieler und wirft ferne wieder weg    */
/* ------------------------------------------------------------------ */
export class World {
  constructor(scene, radius = 2) {
    this.scene = scene;
    this.radius = radius;
    this.chunks = new Map();
    this.queue = [];
    this.extraColliders = [];      // z. B. selbst gebautes Lager
    this.castShadows = false;

    const waterGeo = new THREE.PlaneGeometry(CHUNK * (radius * 2 + 3), CHUNK * (radius * 2 + 3));
    waterGeo.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(
      waterGeo,
      new THREE.MeshLambertMaterial({ color: '#57bdb0', transparent: true, opacity: 0.8 })
    );
    this.water.position.y = WATER_LEVEL;
    this.water.renderOrder = -1;
    scene.add(this.water);
  }

  key(cx, cz) { return cx + ',' + cz; }

  update(px, pz, budget = 1) {
    const ccx = Math.floor(px / CHUNK), ccz = Math.floor(pz / CHUNK);
    this.water.position.set(ccx * CHUNK, WATER_LEVEL, ccz * CHUNK);

    // fehlende Chunks einreihen (nächste zuerst)
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

    // zu weit entfernte Chunks entsorgen
    for (const [k, chunk] of this.chunks) {
      if (Math.abs(chunk.cx - ccx) > this.radius + 1 || Math.abs(chunk.cz - ccz) > this.radius + 1) {
        this.disposeChunk(k, chunk);
        continue;
      }
      // Fundstellen nur im direkten Umfeld als Meshes halten – spart Draw Calls
      const near = Math.abs(chunk.cx - ccx) <= 1 && Math.abs(chunk.cz - ccz) <= 1;
      if (near && !chunk.nodeGroup) this.rebuildNodes(chunk);
      else if (!near && chunk.nodeGroup) this.dropNodeMeshes(chunk);
    }
  }

  buildChunk(cx, cz) {
    const group = new THREE.Group();
    const colliders = [];

    const ground = new THREE.Mesh(buildGround(cx, cz), groundMat);
    ground.receiveShadow = this.castShadows;
    group.add(ground);

    const bucket = {};
    const fires = [];
    const shrines = [];
    const villages = [];
    const nodes = [];
    buildProps(cx, cz, bucket, colliders, fires, shrines, villages, nodes);

    for (const sh of shrines) {
      const beacon = new THREE.Mesh(beaconGeo, beaconMat);
      beacon.position.set(sh.x, sh.y + 6.5, sh.z);
      beacon.renderOrder = 2;
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.set(sh.x, sh.y + 0.12, sh.z);
      glow.renderOrder = 2;
      group.add(beacon, glow);
    }
    for (const key in bucket) {
      const merged = mergeGeometries(bucket[key], false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, SLOT_MAT[key]);
      mesh.castShadow = this.castShadows;
      mesh.receiveShadow = this.castShadows;
      group.add(mesh);
      bucket[key].forEach((g) => g.dispose());
    }

    this.scene.add(group);
    // Die Meshes der Fundstellen entstehen erst, wenn der Chunk nah genug ist.
    this.chunks.set(this.key(cx, cz), { cx, cz, group, colliders, fires, shrines, villages, nodes, nodeGroup: null });
  }

  disposeChunk(k, chunk) {
    chunk.group.traverse((o) => {
      if (o.isMesh && o.geometry !== beaconGeo && o.geometry !== glowGeo) o.geometry.dispose();
    });
    this.scene.remove(chunk.group);
    this.chunks.delete(k);
  }

  setShadows(on) {
    this.castShadows = on;
    for (const [, chunk] of this.chunks) {
      chunk.group.traverse((o) => {
        if (!o.isMesh || o.material === beaconMat || o.material === glowMat) return;
        o.castShadow = on && o.material !== groundMat;
        o.receiveShadow = on;
      });
    }
  }

  // Nächster Punkt einer Art ("fires", "shrines", "villages") im Umkreis.
  nearestOf(list, pos, radius) {
    const ccx = Math.floor(pos.x / CHUNK), ccz = Math.floor(pos.z / CHUNK);
    let best = null, bestD = radius * radius;
    const reach = Math.ceil(radius / CHUNK);
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const chunk = this.chunks.get(this.key(ccx + dx, ccz + dz));
        if (!chunk) continue;
        for (const item of chunk[list]) {
          const d = (item.x - pos.x) ** 2 + (item.z - pos.z) ** 2;
          if (d < bestD) { bestD = d; best = item; }
        }
      }
    }
    return best;
  }

  nearestFire(pos, radius) { return this.nearestOf('fires', pos, radius); }
  nearestVillage(pos, radius) { return this.nearestOf('villages', pos, radius); }

  // Nächster Steinkreis im Umkreis – dort wartet ein Wächter.
  nearestShrine(pos, radius) { return this.nearestOf('shrines', pos, radius); }

  /** Nächste abbaubare Fundstelle – für den Aktionsknopf. */
  nearestNode(pos, radius) {
    const ccx = Math.floor(pos.x / CHUNK), ccz = Math.floor(pos.z / CHUNK);
    let best = null, bestD = radius * radius;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chunk = this.chunks.get(this.key(ccx + dx, ccz + dz));
        if (!chunk) continue;
        for (const node of chunk.nodes) {
          const d = (node.x - pos.x) ** 2 + (node.z - pos.z) ** 2;
          if (d < bestD) { bestD = d; best = { chunk, node, dist: Math.sqrt(d) }; }
        }
      }
    }
    return best;
  }

  /** Ein Schlag auf eine Fundstelle. Gibt zurück, ob sie dabei umgefallen ist. */
  hitNode(chunk, node) {
    node.hp -= 1;
    if (node.hp > 0) return false;

    chunk.nodes.splice(chunk.nodes.indexOf(node), 1);
    const ci = chunk.colliders.indexOf(node.collider);
    if (ci >= 0) chunk.colliders.splice(ci, 1);
    this.rebuildNodes(chunk);
    return true;
  }

  /** Baut alle Chunks neu, die von einer neuen Lichtinsel berührt werden. */
  refreshArea(x, z, radius) {
    const reach = Math.ceil(radius / CHUNK) + 1;
    const ccx = Math.floor(x / CHUNK), ccz = Math.floor(z / CHUNK);
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const key = this.key(ccx + dx, ccz + dz);
        const chunk = this.chunks.get(key);
        if (chunk) this.disposeChunk(key, chunk);
      }
    }
  }

  dropNodeMeshes(chunk) {
    if (!chunk.nodeGroup) return;
    chunk.group.remove(chunk.nodeGroup);
    chunk.nodeGroup.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    chunk.nodeGroup = null;
  }

  rebuildNodes(chunk) {
    this.dropNodeMeshes(chunk);
    chunk.nodeGroup = buildNodeMeshes(chunk.nodes);
    chunk.nodeGroup.traverse((o) => { if (o.isMesh) { o.castShadow = this.castShadows; o.receiveShadow = this.castShadows; } });
    chunk.group.add(chunk.nodeGroup);
  }

  // Schiebt eine Position aus Bäumen/Häusern heraus.
  resolveCollisions(pos, radius) {
    for (const c of this.extraColliders) pushOut(pos, radius, c);

    const ccx = Math.floor(pos.x / CHUNK), ccz = Math.floor(pos.z / CHUNK);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chunk = this.chunks.get(this.key(ccx + dx, ccz + dz));
        if (!chunk) continue;
        for (const c of chunk.colliders) pushOut(pos, radius, c);
      }
    }
  }
}
