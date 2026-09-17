import * as THREE from 'three';
import { CHUNK, gewaechsBei, surfaceAt, SEA, dorfBei, isSolid } from './voxel.js';
import * as props from './props.js';

/* ==========================================================================
 *  Was auf dem Gelände wächst.
 *
 *  Draußen standen Bäume aus Stamm- und Laubwürfeln — neben den Dorftannen
 *  sah das aus wie zwei verschiedene Spiele. Jetzt sind es überall dieselben
 *  Modelle.
 *
 *  Damit das bezahlbar bleibt, wird je Sorte ein einziges InstancedMesh
 *  gezeichnet: hundert Bäume kosten einen Zeichenaufruf statt hundert. Die
 *  Standorte werden je Chunk einmal ausgerechnet und gemerkt.
 * ========================================================================== */

const HOECHSTZAHL = {
  tanne: 420, nadelbaum: 420, schneetanne: 260, birke: 300, laubbaum: 300,
  palme: 140, totholz: 200, kaktus: 160, busch: 520, halm: 900, blume: 420, fels: 200,
};

const BAUER = {
  tanne:       () => props.tanneBauen({ hoehe: 5 }),
  nadelbaum:   () => props.nadelbaumBauen({ hoehe: 6.5 }),
  schneetanne: () => props.schneetanneBauen({ hoehe: 5.4 }),
  birke:       () => props.birkeBauen({ hoehe: 5 }),
  laubbaum:    () => props.laubbaumBauen({ hoehe: 4.2 }),
  palme:       () => props.palmeBauen({ hoehe: 5 }),
  totholz:     () => props.totholzBauen({ hoehe: 4 }),
  kaktus:      () => props.kaktusBauen(),
  busch:       () => props.buschBauen(),
  halm:        () => props.halmBauen({ farbe: '#6da34e' }),
  blume:       () => props.halmBauen({ farbe: '#6da34e', bluete: '#e8a83c' }),
  fels:        () => props.felsBauen(),
};

/** Was einen aufhält: nur die dicken Stämme, nicht jeder Grashalm. */
const STAMMDICK = { tanne: 0.5, nadelbaum: 0.5, schneetanne: 0.5, birke: 0.42,
  laubbaum: 0.45, palme: 0.4, totholz: 0.42, fels: 0.6 };

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _pos = new THREE.Vector3();
const _skal = new THREE.Vector3();

export class Flora {
  constructor(scene, radius = 4) {
    this.scene = scene;
    this.radius = radius;
    this.chunks = new Map();      // "cx,cz" -> Liste von Gewächsen
    this.netze = {};
    this.letzterChunk = null;

    for (const [art, bauer] of Object.entries(BAUER)) {
      const { geometry, material } = props.bauteil(bauer);
      const netz = new THREE.InstancedMesh(geometry, material, HOECHSTZAHL[art]);
      netz.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      netz.castShadow = true;
      netz.receiveShadow = true;
      netz.count = 0;
      netz.frustumCulled = false;
      scene.add(netz);
      this.netze[art] = netz;
    }
  }

  /** Die Gewächse eines Chunks — einmal gerechnet, dann gemerkt. */
  chunkGewaechse(cx, cz) {
    const key = `${cx},${cz}`;
    if (this.chunks.has(key)) return this.chunks.get(key);

    const liste = [];
    const ox = cx * CHUNK, oz = cz * CHUNK;
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const x = ox + lx, z = oz + lz;
        const g = gewaechsBei(x, z);
        if (!g || !BAUER[g.art]) continue;

        const y = surfaceAt(x, z);
        if (y <= SEA) continue;                       // nichts wächst im Wasser
        const dorf = dorfBei(x, z);
        if (dorf && Math.hypot(x - dorf.x, z - dorf.z) < dorf.r * 0.95) continue;

        const r = g.wuerfel;
        liste.push({
          art: g.art,
          x: x + 0.5, y: y + 1, z: z + 0.5,
          dreh: r() * Math.PI * 2,
          skal: 0.78 + r() * 0.5,
        });
      }
    }
    this.chunks.set(key, liste);
    return liste;
  }

  /** Nur bei Chunkwechsel neu zusammenstellen — das reicht völlig. */
  update(px, pz, erzwingen = false) {
    const ccx = Math.floor(px / CHUNK), ccz = Math.floor(pz / CHUNK);
    const key = `${ccx},${ccz}`;
    if (!erzwingen && key === this.letzterChunk) return;
    this.letzterChunk = key;

    const zaehler = {};
    for (const art of Object.keys(this.netze)) zaehler[art] = 0;
    this.nah = [];

    for (let dz = -this.radius; dz <= this.radius; dz++) {
      for (let dx = -this.radius; dx <= this.radius; dx++) {
        for (const g of this.chunkGewaechse(ccx + dx, ccz + dz)) {
          const netz = this.netze[g.art];
          const i = zaehler[g.art];
          if (i >= HOECHSTZAHL[g.art]) continue;
          _pos.set(g.x, g.y, g.z);
          _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), g.dreh);
          _skal.setScalar(g.skal);
          _m.compose(_pos, _q, _skal);
          netz.setMatrixAt(i, _m);
          zaehler[g.art] = i + 1;
          if (STAMMDICK[g.art]) this.nah.push(g);
        }
      }
    }

    for (const [art, netz] of Object.entries(this.netze)) {
      netz.count = zaehler[art];
      netz.instanceMatrix.needsUpdate = true;
      netz.computeBoundingSphere?.();
    }
  }

  /** Schiebt einen Punkt aus dem nächsten Stamm heraus. */
  wegSchieben(x, z, rand = 0.3) {
    if (!this.nah) return null;
    for (const g of this.nah) {
      const r = STAMMDICK[g.art] * g.skal + rand;
      const dx = x - g.x, dz = z - g.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      // Genau in der Mitte gibt es keine Richtung — dann irgendeine nehmen,
      // sonst klebt man im Stamm fest.
      if (d2 < 1e-6) return { x: g.x + r + 0.02, z: g.z };
      const d = Math.sqrt(d2);
      return { x: g.x + (dx / d) * (r + 0.02), z: g.z + (dz / d) * (r + 0.02) };
    }
    return null;
  }

  clear() {
    this.chunks.clear();
    this.letzterChunk = null;
    for (const netz of Object.values(this.netze)) netz.count = 0;
  }
}
