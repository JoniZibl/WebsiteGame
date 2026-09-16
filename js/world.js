import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm, noise2, rngFor, smoothstep, clamp } from './noise.js';

/* ==========================================================================
 *  Die Welt von MAMPF: eine Klötzchenlandschaft mit Dörfern darin.
 *
 *  Der Boden besteht aus Stufen — jede Zelle ist ein Block mit Grasdeckel und
 *  Erdwänden. Alles, was darauf steht, ist ein Objekt mit einer Größe: Gras,
 *  Zaun, Baum, Haus, Turm. Wer groß genug ist, frisst es einfach weg.
 * ========================================================================== */

export const CELL = 2.4;         // Kantenlänge eines Bodenblocks
const RES = 18;                  // Blöcke je Chunk-Kante
export const CHUNK = CELL * RES;
export const STEP_H = 1.2;       // Höhe einer Geländestufe
export const WATER_LEVEL = -2.4;

let SEED = 1337;
export function setSeed(s) { SEED = s | 0; }

/* -------------------------------------------------------------------------- */
/*  Höhe                                                                       */
/* -------------------------------------------------------------------------- */
function rawHeight(x, z) {
  const shape = fbm(x * 0.004, z * 0.004, SEED + 7, 3);
  let h = (fbm(x * 0.013, z * 0.013, SEED, 4) - 0.45) * 15 * (0.5 + smoothstep(0.35, 0.75, shape) * 1.5);
  h += (fbm(x * 0.04, z * 0.04, SEED + 21, 2) - 0.5) * 2.6;
  const r = Math.abs(noise2(x * 0.006, z * 0.006, SEED + 31) - 0.5);
  h -= smoothstep(0.07, 0.0, r) * 7.0;
  return h;
}

/** Gestufte Höhe — der Boden ist eine Treppe, keine Rampe. */
export function heightAt(x, z) {
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  return Math.round(rawHeight(cx * CELL + CELL / 2, cz * CELL + CELL / 2) / STEP_H) * STEP_H;
}

export function isLand(x, z) { return heightAt(x, z) > WATER_LEVEL; }

/** Wie trocken ist die Gegend? Färbt Gras und entscheidet über Bewuchs. */
export function drynessAt(x, z) {
  return smoothstep(0.46, 0.74, fbm(x * 0.0028, z * 0.0028, SEED + 201, 3));
}

/** Wo steht ein Dorf? Ein grobes Raster mit Zufall darin. */
export function villageAt(cx, cz) {
  return noise2(cx * 0.8 + 0.3, cz * 0.8 + 0.7, SEED + 55) > 0.62;
}

/**
 * Ein guter Anfang: saftige Wiese, kein Wasser, ein Dorf in Laufweite.
 * Wer als Käfer in der Heide startet, findet nichts zu fressen.
 */
export function findStart() {
  let best = { x: 0, z: 0, score: -1 };
  for (let i = 0; i < 900; i++) {
    const a = i * 2.39996, r = Math.sqrt(i) * 11;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!isLand(x, z)) continue;
    const dry = drynessAt(x, z);
    const wood = fbm(x * 0.0035, z * 0.0035, SEED + 311, 3);
    let dorf = 0;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) if (villageAt(cx + dx, cz + dz)) dorf = 1;
    }
    const score = (1 - dry) * 2 + wood + dorf * 1.5 - r * 0.002;
    if (score > best.score) best = { x, z, score };
  }
  return best;
}

export function regionName(x, z) {
  const dry = drynessAt(x, z);
  if (dry > 0.62) return 'Heide';
  const wood = fbm(x * 0.0035, z * 0.0035, SEED + 311, 3);
  if (wood > 0.62) return 'Tiefer Wald';
  if (wood > 0.38) return 'Hain';
  return 'Wiesen';
}

/* -------------------------------------------------------------------------- */
/*  Farben                                                                     */
/* -------------------------------------------------------------------------- */
const hex = (h) => new THREE.Color(h);

export const PALETTE = {
  gras:     hex('#6cc357'),
  grasHell: hex('#83d566'),
  grasTrocken: hex('#cfbc6b'),
  erde:     hex('#8a6242'),
  erdeTief: hex('#6d4c33'),
  fels:     hex('#a8a596'),
  sand:     hex('#e3cf9a'),
  wasser:   hex('#3fb0a8'),

  stamm:    hex('#8a5a38'),
  laub1:    hex('#4fa34f'),
  laub2:    hex('#3d8a45'),
  laub3:    hex('#6cbb59'),

  putz:     hex('#f2e3c2'),
  balken:   hex('#8b5a3c'),
  ziegel:   hex('#c9563f'),
  ziegelD:  hex('#a8412d'),
  holz:     hex('#a9713f'),
  stein:    hex('#b3b0a0'),
  stroh:    hex('#e0c169'),
  glas:     hex('#7fc8cf'),
};

const groundMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
export const PROP_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

/* -------------------------------------------------------------------------- */
/*  Bausteine                                                                  */
/* -------------------------------------------------------------------------- */
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d).toNonIndexed();

const G = {
  cube:   box(1, 1, 1),
  plank:  box(1, 0.16, 0.16),
  post:   box(0.18, 1, 0.18),
  roof:   box(1, 0.2, 1),
  cone:   new THREE.ConeGeometry(0.7, 1.4, 5).toNonIndexed(),
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Legt ein eingefärbtes Teil in einen Eimer von Geometrien. */
export function piece(bucket, geo, color, x, y, z, sx = 1, sy = 1, sz = 1, rotY = 0, rotX = 0) {
  _e.set(rotX, rotY, 0, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  _m.compose(_p, _q, _s);

  const g = geo.clone();
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.applyMatrix4(_m);
  bucket.push(g);
}

export function buildMesh(bucket, material = PROP_MAT) {
  if (!bucket.length) return null;
  const merged = mergeGeometries(bucket, false);
  bucket.forEach((g) => g.dispose());
  if (!merged) return null;
  const mesh = new THREE.Mesh(merged, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/* -------------------------------------------------------------------------- */
/*  Fressbare Dinge in der Welt                                                */
/*  size: ab welcher eigenen Größe man es verschlucken kann                    */
/* -------------------------------------------------------------------------- */
export const THINGS = {
  gras:   { size: 0.2, label: 'Grasbüschel', food: 0.18, r: 0.4 },
  pilz:   { size: 0.3, label: 'Pilz',     food: 0.3, r: 0.4 },
  busch:  { size: 0.6, label: 'Busch',    food: 0.5, r: 0.7 },
  zaun:   { size: 1.1, label: 'Zaun',     food: 0.8, r: 1.0 },
  fass:   { size: 1.3, label: 'Fass',     food: 1.0, r: 0.7 },
  baum:   { size: 2.6, label: 'Baum',     food: 3.0, r: 1.1 },
  karren: { size: 2.2, label: 'Karren',   food: 2.4, r: 1.3 },
  hütte:  { size: 4.5, label: 'Hütte',    food: 7.0, r: 2.2 },
  haus:   { size: 6.5, label: 'Haus',     food: 13.0, r: 2.8 },
  turm:   { size: 11,  label: 'Turm',     food: 30.0, r: 2.6 },
};

function thingGeometry(kind, bucket, x, y, z, rot, rand) {
  const P = PALETTE;
  if (kind === 'gras') {
    for (let i = 0; i < 3; i++) {
      const a = rot + i * 2.1;
      piece(bucket, G.cube, P.laub3, x + Math.cos(a) * 0.22, y + 0.26, z + Math.sin(a) * 0.22,
            0.12, 0.55, 0.12, a);
    }
  } else if (kind === 'pilz') {
    piece(bucket, G.cube, P.putz, x, y + 0.18, z, 0.16, 0.36, 0.16, rot);
    piece(bucket, G.cube, P.ziegel, x, y + 0.42, z, 0.46, 0.2, 0.46, rot);
  } else if (kind === 'busch') {
    const s = 0.8 + rand() * 0.5;
    piece(bucket, G.cube, P.laub2, x, y + 0.45 * s, z, s, s * 0.9, s, rot);
    piece(bucket, G.cube, P.laub3, x + 0.25 * s, y + 0.95 * s, z - 0.15 * s, s * 0.6, s * 0.6, s * 0.6, rot * 1.7);
  } else if (kind === 'zaun') {
    for (const dx of [-0.8, 0.8]) {
      piece(bucket, G.post, P.holz, x + Math.cos(rot) * dx, y + 0.5, z - Math.sin(rot) * dx, 1, 1, 1, rot);
    }
    piece(bucket, G.plank, P.holz, x, y + 0.75, z, 1.9, 1, 1, rot);
    piece(bucket, G.plank, P.holz, x, y + 0.4, z, 1.9, 1, 1, rot);
  } else if (kind === 'fass') {
    piece(bucket, G.cube, P.holz, x, y + 0.45, z, 0.8, 0.9, 0.8, rot);
    piece(bucket, G.cube, P.stein, x, y + 0.92, z, 0.84, 0.1, 0.84, rot);
  } else if (kind === 'baum') {
    const h = 2.4 + rand() * 1.6;
    piece(bucket, G.cube, P.stamm, x, y + h * 0.5, z, 0.55, h, 0.55, rot);
    const leaf = rand() < 0.5 ? P.laub1 : P.laub2;
    piece(bucket, G.cube, leaf, x, y + h + 0.6, z, 2.4, 1.4, 2.4, rot);
    piece(bucket, G.cube, P.laub3, x, y + h + 1.6, z, 1.5, 1.0, 1.5, rot * 1.3);
  } else if (kind === 'karren') {
    piece(bucket, G.cube, P.holz, x, y + 0.7, z, 2.0, 0.7, 1.2, rot);
    piece(bucket, G.cube, P.stroh, x, y + 1.15, z, 1.7, 0.4, 1.0, rot);
    for (const dx of [-0.7, 0.7]) {
      piece(bucket, G.cube, P.balken, x + Math.cos(rot) * dx, y + 0.35, z - Math.sin(rot) * dx, 0.25, 0.7, 0.7, rot);
    }
  } else if (kind === 'hütte' || kind === 'haus' || kind === 'turm') {
    const big = kind === 'haus';
    const tower = kind === 'turm';
    const w = tower ? 2.6 : big ? 4.2 : 3.0;
    const h = tower ? 7.5 : big ? 3.2 : 2.4;
    const d = tower ? 2.6 : big ? 3.6 : 2.8;

    piece(bucket, G.cube, P.putz, x, y + h * 0.5, z, w, h, d, rot);
    // Eckbalken
    for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const px = x + (Math.cos(rot) * ox * w * 0.48 - Math.sin(rot) * oz * d * 0.48);
      const pz = z + (Math.sin(rot) * ox * w * 0.48 + Math.cos(rot) * oz * d * 0.48);
      piece(bucket, G.cube, P.balken, px, y + h * 0.5, pz, 0.26, h, 0.26, rot);
    }
    // Dach in zwei Stufen — das liest sich auch aus der Ferne als Haus
    piece(bucket, G.cube, P.ziegel, x, y + h + 0.35, z, w * 1.15, 0.7, d * 1.15, rot);
    piece(bucket, G.cube, P.ziegelD, x, y + h + 0.95, z, w * 0.75, 0.6, d * 0.75, rot);
    // Tür und Fenster
    const fx = Math.sin(rot) * d * 0.51, fz = Math.cos(rot) * d * 0.51;
    piece(bucket, G.cube, P.balken, x + fx, y + 0.6, z + fz, 0.7, 1.2, 0.12, rot);
    piece(bucket, G.cube, P.glas, x + fx + Math.cos(rot) * 1.0, y + 1.5, z + fz - Math.sin(rot) * 1.0,
          0.6, 0.6, 0.12, rot);
    if (tower) piece(bucket, G.cone, P.ziegelD, x, y + h + 2.0, z, 1.9, 1.4, 1.9, rot);
  }
}

/* -------------------------------------------------------------------------- */
/*  Boden eines Chunks: Deckel und Wände                                       */
/* -------------------------------------------------------------------------- */
const tmp = new THREE.Color();

function topColor(h, dry, jitter) {
  if (h <= WATER_LEVEL) return tmp.copy(PALETTE.sand);
  if (h > 9) return tmp.copy(PALETTE.fels);
  tmp.copy(jitter > 0.55 ? PALETTE.grasHell : PALETTE.gras);
  if (dry > 0) tmp.lerp(PALETTE.grasTrocken, dry * 0.9);
  if (h < WATER_LEVEL + STEP_H * 1.5) tmp.lerp(PALETTE.sand, 0.65);
  return tmp;
}

function buildGround(cx, cz) {
  const ox = cx * CHUNK, oz = cz * CHUNK;
  const bucket = [];
  const half = CELL / 2;

  for (let j = 0; j < RES; j++) {
    for (let i = 0; i < RES; i++) {
      const wx = ox + i * CELL + half;
      const wz = oz + j * CELL + half;
      const h = heightAt(wx, wz);
      const dry = drynessAt(wx, wz);
      const jitter = fbm(wx * 0.02, wz * 0.02, SEED + 3, 2);

      // Deckel
      piece(bucket, G.cube, topColor(h, dry, jitter).clone(), wx, h - 0.1, wz, CELL, 0.2, CELL);

      // Wände nur so tief, wie der niedrigste Nachbar sitzt
      let lowest = h;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        lowest = Math.min(lowest, heightAt(wx + dx * CELL, wz + dz * CELL));
      }
      const drop = h - lowest;
      if (drop > 0.01) {
        const wallH = Math.min(drop, STEP_H * 4);
        const c = wallH > STEP_H * 1.5 ? PALETTE.erdeTief : PALETTE.erde;
        piece(bucket, G.cube, c.clone(), wx, h - 0.2 - wallH / 2, wz, CELL, wallH, CELL);
      }
    }
  }

  const merged = mergeGeometries(bucket, false);
  bucket.forEach((g) => g.dispose());
  return merged;
}

/* -------------------------------------------------------------------------- */
/*  Chunk-Inhalt                                                               */
/* -------------------------------------------------------------------------- */
function fillChunk(cx, cz, things) {
  const rand = rngFor(cx, cz, SEED);
  const ox = cx * CHUNK, oz = cz * CHUNK;

  const add = (kind, x, z, rot) => {
    const y = heightAt(x, z);
    if (y <= WATER_LEVEL) return;
    things.push({ kind, x, y, z, rot, r: THINGS[kind].r, eaten: false });
  };

  // ---- Dorf ----
  if (villageAt(cx, cz)) {
    const vx = ox + CHUNK * (0.3 + rand() * 0.4);
    const vz = oz + CHUNK * (0.3 + rand() * 0.4);
    const houses = 4 + Math.floor(rand() * 4);
    for (let i = 0; i < houses; i++) {
      const a = (i / houses) * Math.PI * 2 + rand() * 0.6;
      const d = 5 + rand() * 11;
      add(rand() < 0.45 ? 'haus' : 'hütte', vx + Math.cos(a) * d, vz + Math.sin(a) * d,
          Math.round(rand() * 4) * (Math.PI / 2));
    }
    if (rand() < 0.5) add('turm', vx, vz, rand() * 6.28);
    for (let i = 0; i < 8; i++) {
      const a = rand() * 6.28, d = 8 + rand() * 12;
      add('zaun', vx + Math.cos(a) * d, vz + Math.sin(a) * d, a + Math.PI / 2);
    }
    for (let i = 0; i < 4; i++) {
      const a = rand() * 6.28, d = 3 + rand() * 8;
      add(rand() < 0.5 ? 'fass' : 'karren', vx + Math.cos(a) * d, vz + Math.sin(a) * d, rand() * 6.28);
    }
  }

  // ---- Natur ----
  const tries = 90;
  for (let i = 0; i < tries; i++) {
    const x = ox + rand() * CHUNK;
    const z = oz + rand() * CHUNK;
    const dry = drynessAt(x, z);
    const wood = fbm(x * 0.0035, z * 0.0035, SEED + 311, 3);
    const roll = rand();

    let blocked = false;
    for (const t of things) {
      if ((x - t.x) ** 2 + (z - t.z) ** 2 < (t.r + 2.2) ** 2) { blocked = true; break; }
    }
    if (blocked) continue;

    if (roll < wood * wood * 2.2 * (1 - dry * 0.7)) add('baum', x, z, rand() * 6.28);
    else if (roll < 0.22) add('busch', x, z, rand() * 6.28);
    else if (roll < 0.34 && wood > 0.3) add('pilz', x, z, rand() * 6.28);
    else add('gras', x, z, rand() * 6.28);
  }
}

/* -------------------------------------------------------------------------- */
/*  Welt                                                                       */
/* -------------------------------------------------------------------------- */
export class World {
  constructor(scene, radius = 2) {
    this.scene = scene;
    this.radius = radius;
    this.chunks = new Map();
    this.queue = [];
    this.barren = false;      // am Ende wächst nichts mehr nach

    const waterGeo = new THREE.PlaneGeometry(CHUNK * (radius * 2 + 3), CHUNK * (radius * 2 + 3));
    waterGeo.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(waterGeo, new THREE.MeshLambertMaterial({
      color: PALETTE.wasser, transparent: true, opacity: 0.85,
    }));
    this.water.position.y = WATER_LEVEL + 0.35;
    this.water.renderOrder = -1;
    scene.add(this.water);
  }

  key(cx, cz) { return cx + ',' + cz; }

  update(px, pz, budget = 1) {
    const ccx = Math.floor(px / CHUNK), ccz = Math.floor(pz / CHUNK);
    this.water.position.set(ccx * CHUNK, WATER_LEVEL + 0.35, ccz * CHUNK);

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
        this.disposeChunk(k, chunk);
      }
    }
  }

  buildChunk(cx, cz) {
    const group = new THREE.Group();

    const ground = new THREE.Mesh(buildGround(cx, cz), groundMat);
    ground.receiveShadow = true;
    group.add(ground);

    const things = [];
    if (!this.barren) fillChunk(cx, cz, things);

    const chunk = { cx, cz, group, things, propMesh: null };
    this.scene.add(group);
    this.chunks.set(this.key(cx, cz), chunk);
    this.rebuildThings(chunk);
    return chunk;
  }

  /** Baut die Dinge eines Chunks neu — nach jedem Bissen. */
  rebuildThings(chunk) {
    if (chunk.propMesh) {
      chunk.group.remove(chunk.propMesh);
      chunk.propMesh.geometry.dispose();
      chunk.propMesh = null;
    }
    const bucket = [];
    const rand = rngFor(chunk.cx, chunk.cz, SEED + 9);
    for (const t of chunk.things) {
      if (t.eaten) continue;
      thingGeometry(t.kind, bucket, t.x, t.y, t.z, t.rot, rand);
    }
    const mesh = buildMesh(bucket);
    if (mesh) {
      chunk.propMesh = mesh;
      chunk.group.add(mesh);
    }
  }

  disposeChunk(k, chunk) {
    chunk.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    this.scene.remove(chunk.group);
    this.chunks.delete(k);
  }

  /** Alle Dinge im Umkreis — für Fressen und Anstoßen. */
  *nearbyThings(pos, radius) {
    const ccx = Math.floor(pos.x / CHUNK), ccz = Math.floor(pos.z / CHUNK);
    const reach = Math.ceil(radius / CHUNK);
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const chunk = this.chunks.get(this.key(ccx + dx, ccz + dz));
        if (!chunk) continue;
        for (const t of chunk.things) {
          if (t.eaten) continue;
          if ((t.x - pos.x) ** 2 + (t.z - pos.z) ** 2 < radius * radius) yield { chunk, thing: t };
        }
      }
    }
  }

  eat(chunk, thing) {
    thing.eaten = true;
    this.rebuildThings(chunk);
  }

  /** Alles verschwinden lassen — der Moment, in dem nichts mehr übrig ist. */
  strip() {
    this.barren = true;
    for (const [, chunk] of this.chunks) {
      for (const t of chunk.things) t.eaten = true;
      this.rebuildThings(chunk);
    }
  }
}
