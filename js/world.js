import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm, noise2, rngFor, smoothstep, clamp } from './noise.js';

export const CHUNK = 56;        // Kantenlänge eines Chunks in Weltmetern
const RES = 22;                 // Quads pro Chunk-Kante (Auflösung des Bodens)
const STEP = CHUNK / RES;
export const WATER_LEVEL = -1.2;

let SEED = 1337;
export function setSeed(s) { SEED = s | 0; }

/* ------------------------------------------------------------------ */
/*  Höhenfeld — rein aus Noise, damit jeder Chunk nahtlos passt        */
/* ------------------------------------------------------------------ */
export function heightAt(x, z) {
  // große Landform: entscheidet über Ebene, Hügel oder Kuppe
  const shape = fbm(x * 0.004, z * 0.004, SEED + 7, 3);
  const relief = 0.55 + smoothstep(0.35, 0.75, shape) * 1.6;

  let h = (fbm(x * 0.014, z * 0.014, SEED, 4) - 0.45) * 17 * relief;

  // mittlere Wellen, damit nie eine tote Fläche entsteht
  h += (fbm(x * 0.045, z * 0.045, SEED + 21, 2) - 0.5) * 3.2;

  // gewundene Flüsse
  const r = Math.abs(noise2(x * 0.0065, z * 0.0065, SEED + 31) - 0.5);
  h -= smoothstep(0.07, 0.0, r) * 7.0;

  // feine Unebenheiten
  h += (fbm(x * 0.11, z * 0.11, SEED + 13, 2) - 0.5) * 1.1;
  return h;
}

export function isLand(x, z) { return heightAt(x, z) > WATER_LEVEL + 0.45; }

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
  sand:   new THREE.Color('#d6c391'),
  grass1: new THREE.Color('#a8bd78'),
  grass2: new THREE.Color('#91a962'),
  grass3: new THREE.Color('#7d9455'),
  rock:   new THREE.Color('#a6a48d'),
  deep:   new THREE.Color('#7ea184'),
};

const tmpColor = new THREE.Color();
function terrainColor(h, slope, jitter) {
  const shade = 0.95 + jitter * 0.11;   // leichtes Flackern für den Patchwork-Look

  // Gras: zwei Grüntöne weich ineinander, etwas heller mit der Höhe
  const t = clamp((jitter - 0.32) * 2.2, 0, 1);
  tmpColor.copy(C.grass2).lerp(C.grass1, t);
  tmpColor.lerp(C.grass3, clamp((h - 1) * 0.05, 0, 0.3));

  // Fels an steilen Hängen und auf Gipfeln
  tmpColor.lerp(C.rock, clamp((slope - 0.6) * 0.9, 0, 0.45) + clamp((h - 11) * 0.12, 0, 0.4));

  // Strand als weicher Verlauf zum Wasser hin (keine harten Flecken)
  const shore = smoothstep(WATER_LEVEL + 1.4, WATER_LEVEL + 0.2, h);
  tmpColor.lerp(C.sand, shore * 0.85);
  if (h < WATER_LEVEL) tmpColor.lerp(C.deep, smoothstep(WATER_LEVEL, WATER_LEVEL - 1.2, h));

  return tmpColor.multiplyScalar(shade);
}

/* ------------------------------------------------------------------ */
/*  Materialien & Requisiten-Bausteine (einmal erzeugt, dann geklont)   */
/* ------------------------------------------------------------------ */
const mat = (hex, opts = {}) => new THREE.MeshLambertMaterial({ color: hex, flatShading: true, ...opts });

export const MATS = {
  trunk:  mat('#6b5643'),
  leafA:  mat('#87a257'),
  leafB:  mat('#6b8b45'),
  leafC:  mat('#4a6633'),
  leafD:  mat('#2f4423'),
  rock:   mat('#a3a18b'),
  wall:   mat('#eee1c0'),
  roof:   mat('#df8a5c'),
  tent:   mat('#e2915f'),
  flower: mat('#f1e5c2'),
};

const G = {
  trunk:  new THREE.CylinderGeometry(0.16, 0.24, 1.1, 5).toNonIndexed(),
  cone1:  new THREE.ConeGeometry(1.25, 2.4, 7).toNonIndexed(),
  cone2:  new THREE.ConeGeometry(0.9, 2.0, 7).toNonIndexed(),
  rock:   new THREE.IcosahedronGeometry(0.7, 0).toNonIndexed(),
  wall:   new THREE.BoxGeometry(2.6, 1.9, 2.3).toNonIndexed(),
  roof:   new THREE.ConeGeometry(2.25, 1.5, 4).toNonIndexed(),
  pillar: new THREE.BoxGeometry(0.75, 2.6, 0.6).toNonIndexed(),
  lintel: new THREE.BoxGeometry(1.9, 0.5, 0.6).toNonIndexed(),
  bud:    new THREE.SphereGeometry(0.22, 5, 4).toNonIndexed(),
  blob:   new THREE.IcosahedronGeometry(1.0, 0).toNonIndexed(),
  tent:   new THREE.CylinderGeometry(1.0, 1.0, 1.9, 3, 1).rotateZ(Math.PI / 2).toNonIndexed(),
  ember:  new THREE.ConeGeometry(0.3, 0.45, 5).toNonIndexed(),
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

function push(bucket, key, geo, x, y, z, rotY = 0, sx = 1, sy = 1, sz = 1, rotX = 0) {
  _e.set(rotX, rotY, 0);
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  _m.compose(_p, _q, _s);
  const g = geo.clone().applyMatrix4(_m);
  (bucket[key] || (bucket[key] = [])).push(g);
}

/* ------------------------------------------------------------------ */
/*  Requisiten eines Chunks                                            */
/* ------------------------------------------------------------------ */
function buildProps(cx, cz, bucket, colliders) {
  const rand = rngFor(cx, cz, SEED);
  const ox = cx * CHUNK, oz = cz * CHUNK;

  // --- Dorf? (Häusergruppe wie in der Referenz) ---
  const villageRoll = noise2(cx * 0.9 + 0.3, cz * 0.9 + 0.7, SEED + 55);
  if (villageRoll > 0.74) {
    const vx = ox + 8 + rand() * (CHUNK - 16);
    const vz = oz + 8 + rand() * (CHUNK - 16);
    if (isLand(vx, vz) && slopeAt(vx, vz) < 0.5) {
      const n = 3 + Math.floor(rand() * 4);
      for (let i = 0; i < n; i++) {
        const a = rand() * Math.PI * 2, d = 2.5 + rand() * 7;
        const hx = vx + Math.cos(a) * d, hz = vz + Math.sin(a) * d;
        const hy = heightAt(hx, hz);
        if (hy < WATER_LEVEL + 1.0 || slopeAt(hx, hz) > 0.7) continue;
        const rot = Math.round(rand() * 4) * (Math.PI / 2) + (rand() - 0.5) * 0.3;
        const sc = 0.8 + rand() * 0.45;
        push(bucket, 'wall', G.wall, hx, hy + 0.95 * sc - 0.15, hz, rot, sc, sc, sc);
        push(bucket, 'roof', G.roof, hx, hy + 1.9 * sc + 0.6, hz, rot + Math.PI / 4, sc, sc, sc);
        colliders.push({ x: hx, z: hz, r: 1.9 * sc });
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
    }
  }

  // --- Steinkreis als seltenes Wahrzeichen ---
  if (rand() < 0.05) {
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
    }
  }

  // --- Bäume, Steine, Blumen ---
  const tries = 260;
  for (let i = 0; i < tries; i++) {
    const x = ox + rand() * CHUNK;
    const z = oz + rand() * CHUNK;
    const y = heightAt(x, z);
    if (y < WATER_LEVEL + 0.8) continue;

    const slope = slopeAt(x, z);
    if (slope > 0.9) continue;

    // in der Nähe eines Hauses nichts pflanzen
    let blocked = false;
    for (const c of colliders) {
      if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + 1.6) ** 2) { blocked = true; break; }
    }
    if (blocked) continue;

    const forest = fbm(x * 0.018, z * 0.018, SEED + 91, 3);
    const roll = rand();

    if (roll < forest * forest * 1.9 && slope < 0.75) {
      const sc = 0.75 + rand() * 0.75;
      const leaf = ['leafA', 'leafB', 'leafC', 'leafD'][(rand() * 4) | 0];
      if (rand() < 0.26) {
        // runder Laubbaum als Auflockerung
        push(bucket, 'trunk', G.trunk, x, y + 0.6 * sc, z, 0, sc * 1.1, sc * 1.3, sc * 1.1);
        push(bucket, leaf, G.blob, x, y + 1.9 * sc, z, rand() * 6.28, sc * 1.05, sc * 0.95, sc * 1.05);
        push(bucket, leaf, G.blob, x + 0.35 * sc, y + 2.5 * sc, z - 0.2 * sc, rand() * 6.28, sc * 0.6, sc * 0.6, sc * 0.6);
      } else {
        // Nadelbaum aus zwei Kegeln; ein Teil davon schlank und hoch
        const slim = rand() < 0.45;
        const w = slim ? sc * 0.62 : sc;
        const hgt = slim ? sc * 1.7 : sc;
        push(bucket, 'trunk', G.trunk, x, y + 0.5 * sc, z, 0, sc * 0.8, sc, sc * 0.8);
        push(bucket, leaf, G.cone1, x, y + 1.5 * hgt, z, rand() * 6.28, w, hgt, w);
        push(bucket, leaf, G.cone2, x, y + 2.7 * hgt, z, rand() * 6.28, w, hgt, w);
      }
      colliders.push({ x, z, r: 0.55 * sc });
    } else if (roll < 0.28) {
      const sc = 0.5 + rand() * 0.9;
      push(bucket, 'rock', G.rock, x, y + 0.25 * sc, z, rand() * 6.28, sc, sc * 0.8, sc, rand() * 0.4);
      if (sc > 0.9) colliders.push({ x, z, r: 0.6 * sc });
    } else if (roll < 0.40) {
      // kleine Blütenbüschel
      const n = 2 + Math.floor(rand() * 4);
      for (let k = 0; k < n; k++) {
        const fx = x + (rand() - 0.5) * 1.6, fz = z + (rand() - 0.5) * 1.6;
        push(bucket, 'flower', G.bud, fx, heightAt(fx, fz) + 0.22, fz, 0, 0.7, 0.7, 0.7);
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Boden-Mesh eines Chunks (facettiert, Farbe pro Dreieck)            */
/* ------------------------------------------------------------------ */
function buildGround(cx, cz) {
  const ox = cx * CHUNK, oz = cz * CHUNK;
  const quads = RES * RES;
  const pos = new Float32Array(quads * 6 * 3);
  const col = new Float32Array(quads * 6 * 3);

  // Höhen an den Gitterpunkten vorberechnen
  const hs = new Float32Array((RES + 1) * (RES + 1));
  for (let j = 0; j <= RES; j++) {
    for (let i = 0; i <= RES; i++) hs[j * (RES + 1) + i] = heightAt(ox + i * STEP, oz + j * STEP);
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
      const h00 = hs[j * (RES + 1) + i], h10 = hs[j * (RES + 1) + i + 1];
      const h01 = hs[(j + 1) * (RES + 1) + i], h11 = hs[(j + 1) * (RES + 1) + i + 1];

      const mx = x0 + STEP * 0.5, mz = z0 + STEP * 0.5;
      const hAvg = (h00 + h10 + h01 + h11) * 0.25;
      const slope = (Math.abs(h00 - h11) + Math.abs(h10 - h01)) / (2 * STEP);
      const jitter = fbm(mx * 0.035, mz * 0.035, SEED + 3, 2);
      const color = terrainColor(hAvg, slope, jitter).clone();

      // Diagonale abwechselnd kippen -> kein Streifenmuster im Licht
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

/* ------------------------------------------------------------------ */
/*  Welt: lädt Chunks rund um den Spieler und wirft ferne wieder weg    */
/* ------------------------------------------------------------------ */
export class World {
  constructor(scene, radius = 2) {
    this.scene = scene;
    this.radius = radius;
    this.chunks = new Map();
    this.queue = [];
    this.castShadows = false;

    const waterGeo = new THREE.PlaneGeometry(CHUNK * (radius * 2 + 3), CHUNK * (radius * 2 + 3));
    waterGeo.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(
      waterGeo,
      new THREE.MeshLambertMaterial({ color: '#7fa88b', transparent: true, opacity: 0.85 })
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
      }
    }
  }

  buildChunk(cx, cz) {
    const group = new THREE.Group();
    const colliders = [];

    const ground = new THREE.Mesh(buildGround(cx, cz), groundMat);
    ground.receiveShadow = this.castShadows;
    group.add(ground);

    const bucket = {};
    buildProps(cx, cz, bucket, colliders);
    for (const key in bucket) {
      const merged = mergeGeometries(bucket[key], false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, MATS[key]);
      mesh.castShadow = this.castShadows;
      mesh.receiveShadow = this.castShadows;
      group.add(mesh);
      bucket[key].forEach((g) => g.dispose());
    }

    this.scene.add(group);
    this.chunks.set(this.key(cx, cz), { cx, cz, group, colliders });
  }

  disposeChunk(k, chunk) {
    chunk.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    this.scene.remove(chunk.group);
    this.chunks.delete(k);
  }

  setShadows(on) {
    this.castShadows = on;
    for (const [, chunk] of this.chunks) {
      chunk.group.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = on && o.material !== groundMat;
        o.receiveShadow = on;
      });
    }
  }

  // Schiebt eine Position aus Bäumen/Häusern heraus.
  resolveCollisions(pos, radius) {
    const ccx = Math.floor(pos.x / CHUNK), ccz = Math.floor(pos.z / CHUNK);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chunk = this.chunks.get(this.key(ccx + dx, ccz + dz));
        if (!chunk) continue;
        for (const c of chunk.colliders) {
          const ddx = pos.x - c.x, ddz = pos.z - c.z;
          const min = c.r + radius;
          const d2 = ddx * ddx + ddz * ddz;
          if (d2 > min * min || d2 === 0) continue;
          const d = Math.sqrt(d2);
          pos.x = c.x + (ddx / d) * min;
          pos.z = c.z + (ddz / d) * min;
        }
      }
    }
  }
}
