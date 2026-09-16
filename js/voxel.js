import * as THREE from 'three';
import { fbm, noise2, mulberry32 } from './noise.js';

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
  gras:    1, erde:  2, stein:   3, sand:    4, schnee: 5,
  stamm:   6, laub:  7, wasser:  8, kohle:   9, eisen: 10,
  gold:   11, kristall: 12, bretter: 13, eis: 14, lehm: 15,
  kaktus: 16, pilz:  17, grundstein: 18, fackel: 19,
};

/** Farbe, Härte (Sekunden Grabzeit) und was der Block hergibt. */
export const BLOCKS = {
  [B.gras]:     { name: 'Gras',     color: 0x6cc357, side: 0x7d5a3c, hard: 0.35, drop: B.erde },
  [B.erde]:     { name: 'Erde',     color: 0x8a6242, hard: 0.35 },
  [B.stein]:    { name: 'Stein',    color: 0x9b9a92, hard: 0.9, needs: 1 },
  [B.sand]:     { name: 'Sand',     color: 0xe3cf9a, hard: 0.3 },
  [B.schnee]:   { name: 'Schnee',   color: 0xf0f4f7, side: 0xdfe6ec, hard: 0.25 },
  [B.stamm]:    { name: 'Holz',     color: 0x8a5a38, side: 0x77492c, hard: 0.7 },
  [B.laub]:     { name: 'Laub',     color: 0x4fa34f, hard: 0.25 },
  [B.wasser]:   { name: 'Wasser',   color: 0x3fb0a8, liquid: true, hard: 0 },
  [B.kohle]:    { name: 'Kohle',    color: 0x413f45, hard: 1.2, needs: 1 },
  [B.eisen]:    { name: 'Eisen',    color: 0xc0a58c, hard: 1.8, needs: 2 },
  [B.gold]:     { name: 'Gold',     color: 0xf0c44a, hard: 2.2, needs: 3 },
  [B.kristall]: { name: 'Kristall', color: 0x6fd6e8, hard: 2.8, needs: 3, glow: 0.45 },
  [B.bretter]:  { name: 'Bretter',  color: 0xc79a5e, hard: 0.5 },
  [B.eis]:      { name: 'Eis',      color: 0xa8dbe8, hard: 0.5 },
  [B.lehm]:     { name: 'Lehm',     color: 0xa8968a, hard: 0.5 },
  [B.kaktus]:   { name: 'Kaktus',   color: 0x4d8c46, hard: 0.4 },
  [B.pilz]:     { name: 'Pilz',     color: 0xcf5340, hard: 0.2 },
  [B.grundstein]: { name: 'Grundstein', color: 0x2e2c33, hard: Infinity },
  [B.fackel]:   { name: 'Fackel',   color: 0xffd489, hard: 0.1, glow: 1, thin: true, slim: [0.18, 0.7] },
};

export const isSolid = (b) => b !== AIR && b !== B.wasser && !BLOCKS[b]?.thin;
export const isOpaque = (b) => b !== AIR && b !== B.wasser;

/* -------------------------------- Biome ----------------------------------- */
export const BIOMES = {
  wiese:  { name: 'Wiese',      top: B.gras,   filler: B.erde, tree: 0.012, treeKind: 'laub' },
  wald:   { name: 'Wald',       top: B.gras,   filler: B.erde, tree: 0.07,  treeKind: 'nadel' },
  wueste: { name: 'Wüste',      top: B.sand,   filler: B.sand, tree: 0.008, treeKind: 'kaktus' },
  schnee: { name: 'Schneefeld', top: B.schnee, filler: B.erde, tree: 0.03,  treeKind: 'nadel' },
  berg:   { name: 'Gebirge',    top: B.stein,  filler: B.stein, tree: 0.004, treeKind: 'nadel' },
  sumpf:  { name: 'Sumpf',      top: B.gras,   filler: B.lehm, tree: 0.05,  treeKind: 'pilz' },
};

let SEED = 1337;
export function setSeed(s) { SEED = s | 0; }

/** Temperatur und Feuchte entscheiden, welches Biom hier liegt. */
export function biomeAt(x, z) {
  const t = fbm(x * 0.0022, z * 0.0022, SEED + 11, 3);
  const h = fbm(x * 0.0026, z * 0.0026, SEED + 29, 3);
  const berg = fbm(x * 0.0035, z * 0.0035, SEED + 47, 2);
  if (berg > 0.68) return BIOMES.berg;
  if (t < 0.36) return BIOMES.schnee;
  if (t > 0.66 && h < 0.45) return BIOMES.wueste;
  if (h > 0.66) return t > 0.5 ? BIOMES.sumpf : BIOMES.wald;
  if (h > 0.46) return BIOMES.wald;
  return BIOMES.wiese;
}

/** Höhe der Oberfläche in Blöcken. */
export function surfaceAt(x, z) {
  const base = fbm(x * 0.012, z * 0.012, SEED, 4);
  const hügel = fbm(x * 0.035, z * 0.035, SEED + 5, 3);
  const berg = Math.max(0, fbm(x * 0.0035, z * 0.0035, SEED + 47, 2) - 0.55) * 2.6;
  let h = 14 + base * 12 + hügel * 4 + berg * 26;

  // Flusstäler
  const r = Math.abs(noise2(x * 0.0055, z * 0.0055, SEED + 31) - 0.5);
  if (r < 0.045) h -= (1 - r / 0.045) * 7;

  return Math.max(3, Math.min(HEIGHT - 6, Math.round(h)));
}

/** Höhlen: ein 3D-Rauschen frisst Gänge ins Gestein. */
function isCave(x, y, z) {
  if (y < 3) return false;
  const a = fbm(x * 0.045, z * 0.045, SEED + 71, 2) + Math.sin(y * 0.35) * 0.1;
  const b = fbm(x * 0.05 + 40, z * 0.05 - 20, SEED + 83, 2);
  const c = noise2(x * 0.06, y * 0.09 + z * 0.02, SEED + 97);
  return a * 0.5 + b * 0.3 + c * 0.35 > 0.62;
}

function oreAt(x, y, z, depth) {
  const n = noise2(x * 0.22 + y * 0.13, z * 0.22 - y * 0.07, SEED + 151);
  if (depth > 22 && n > 0.965) return B.kristall;
  if (depth > 16 && n > 0.955) return B.gold;
  if (depth > 8 && n > 0.935) return B.eisen;
  if (depth > 3 && n > 0.905) return B.kohle;
  return B.stein;
}

/** Der Block an dieser Stelle, bevor jemand daran gegraben hat. */
export function generate(x, y, z) {
  if (y <= 0) return B.grundstein;
  if (y >= HEIGHT) return AIR;

  const surface = surfaceAt(x, z);
  const biome = biomeAt(x, z);

  if (y > surface) {
    return y <= SEA ? B.wasser : AIR;
  }

  if (isCave(x, y, z) && y < surface - 2) return AIR;

  const depth = surface - y;
  if (y === surface) {
    if (surface <= SEA + 1 && biome !== BIOMES.wueste) return B.sand;
    return biome.top;
  }
  if (depth < 4) return biome.filler;
  return oreAt(x, y, z, depth);
}

/* --------------------------- Bäume und Gewächse ---------------------------- */
/** Steht auf dieser Spalte ein Baum? Rein deterministisch. */
function treeHere(x, z, biome) {
  const r = mulberry32(((x * 73856093) ^ (z * 19349663) ^ SEED) >>> 0)();
  return r < biome.tree;
}

/** Trägt Bäume und Gewächse in einen Chunk ein. */
function plantInto(set, ox, oz) {
  for (let dz = -3; dz < CHUNK + 3; dz++) {
    for (let dx = -3; dx < CHUNK + 3; dx++) {
      const x = ox + dx, z = oz + dz;
      const biome = biomeAt(x, z);
      if (!treeHere(x, z, biome)) continue;

      const s = surfaceAt(x, z);
      if (s <= SEA) continue;
      const rand = mulberry32(((x * 2654435761) ^ (z * 40503) ^ SEED) >>> 0);

      if (biome.treeKind === 'kaktus') {
        const h = 2 + Math.floor(rand() * 3);
        for (let i = 1; i <= h; i++) set(x, s + i, z, B.kaktus);
        continue;
      }
      if (biome.treeKind === 'pilz') {
        const h = 2 + Math.floor(rand() * 2);
        for (let i = 1; i <= h; i++) set(x, s + i, z, B.stamm);
        for (let ddx = -2; ddx <= 2; ddx++) {
          for (let ddz = -2; ddz <= 2; ddz++) {
            if (Math.abs(ddx) + Math.abs(ddz) > 2) continue;
            set(x + ddx, s + h + 1, z + ddz, B.pilz);
          }
        }
        continue;
      }

      const nadel = biome.treeKind === 'nadel';
      const h = nadel ? 5 + Math.floor(rand() * 4) : 4 + Math.floor(rand() * 3);
      for (let i = 1; i <= h; i++) set(x, s + i, z, B.stamm);

      if (nadel) {
        for (let layer = 0; layer < 3; layer++) {
          const r = 2 - layer;
          const y = s + h - 2 + layer;
          for (let ddx = -r; ddx <= r; ddx++) {
            for (let ddz = -r; ddz <= r; ddz++) {
              if (Math.abs(ddx) + Math.abs(ddz) > r) continue;
              set(x + ddx, y, z + ddz, B.laub);
            }
          }
        }
        set(x, s + h + 1, z, B.laub);
      } else {
        for (let ddx = -2; ddx <= 2; ddx++) {
          for (let ddy = 0; ddy <= 2; ddy++) {
            for (let ddz = -2; ddz <= 2; ddz++) {
              const d = Math.abs(ddx) + Math.abs(ddz) + ddy;
              if (d > 3) continue;
              set(x + ddx, s + h - 1 + ddy, z + ddz, B.laub);
            }
          }
        }
      }
    }
  }
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
        for (let y = 0; y < HEIGHT; y++) data[base + y] = generate(x, y, z);
      }
    }

    // Pflanzen greifen über Chunkgrenzen, deshalb erst hier eintragen
    plantInto((x, y, z, block) => {
      if (y < 0 || y >= HEIGHT) return;
      if (x < ox || x >= ox + CHUNK || z < oz || z >= oz + CHUNK) return;
      const i = ((z - oz) * CHUNK + (x - ox)) * HEIGHT + y;
      if (data[i] === AIR) data[i] = block;
    }, ox, oz);

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
        for (let y = 0; y < HEIGHT; y++) {
          const block = data[(lz * CHUNK + lx) * HEIGHT + y];
          if (block === AIR) continue;
          const def = BLOCKS[block];
          if (!def) continue;

          const liquid = def.liquid;
          const P = liquid ? wpos : pos, C = liquid ? wcol : col, I = liquid ? widx : idx;

          for (const face of FACES) {
            const nx = x + face.dir[0], ny = y + face.dir[1], nz = z + face.dir[2];
            const neighbour = at(nx, ny, nz);
            if (liquid ? (neighbour === block || isOpaque(neighbour)) : isOpaque(neighbour)) continue;

            const shade = face.shade;
            const base = def.side !== undefined && face.dir[1] === 0 ? def.side : def.color;
            _c.setHex(base).multiplyScalar(shade);

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
