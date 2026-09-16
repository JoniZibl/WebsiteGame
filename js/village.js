import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { doerferUm, surfaceAt } from './voxel.js';
import * as props from './props.js';
import { FARBEN } from './props.js';

/* ==========================================================================
 *  Dörfer aufbauen.
 *
 *  Wo ein Dorf steht, sagt voxel.js — was darin steht, rechnet diese Datei
 *  aus denselben Koordinaten aus. Die Bauteile werden einmal gebaut und danach
 *  nur geklont, und nur Dörfer in Reichweite hängen wirklich in der Szene.
 * ========================================================================== */

const DACHFARBEN = [FARBEN.dach, FARBEN.dachAlt, '#b8474f', '#d9694a'];

/** Der Bauplan eines Dorfs: immer derselbe für dieselben Koordinaten. */
export function bauplan(dorf) {
  const rand = mulberry32(dorf.saat >>> 0);
  const teile = [];
  const leute = [];

  teile.push({ art: 'brunnen', x: dorf.x, z: dorf.z, dreh: 0 });

  // Häuser auf zwei Ringen, jedes zur Mitte gedreht
  const anzahl = 11 + Math.floor(rand() * 5);
  for (let i = 0; i < anzahl; i++) {
    const winkel = (i / anzahl) * Math.PI * 2 + rand() * 0.35;
    const radius = dorf.r * (0.3 + rand() * 0.42);
    const x = Math.round(dorf.x + Math.cos(winkel) * radius);
    const z = Math.round(dorf.z + Math.sin(winkel) * radius);
    teile.push({
      art: 'haus', x, z,
      dreh: -winkel + Math.PI / 2,
      breite: 3.6 + rand() * 1.5,
      tiefe: 3.0 + rand() * 1.0,
      hoehe: 2.3 + rand() * 0.7,
      dach: DACHFARBEN[Math.floor(rand() * DACHFARBEN.length)],
    });
    // Vor jedem Haus wohnt jemand
    leute.push({
      x: x + Math.cos(winkel) * -3.2, z: z + Math.sin(winkel) * -3.2,
      saat: (rand() * 1e9) | 0, heimX: x, heimZ: z,
    });
  }

  // Laternen am Wegkreuz
  for (const [dx, dz] of [[5, 5], [-5, 5], [5, -5], [-5, -5]]) {
    teile.push({ art: 'laterne', x: dorf.x + dx, z: dorf.z + dz, dreh: 0 });
  }

  // Zäune, Bäume und Büsche füllen die Lücken
  for (let i = 0; i < 46; i++) {
    const winkel = rand() * Math.PI * 2;
    const radius = dorf.r * (0.22 + rand() * 0.72);
    const x = Math.round(dorf.x + Math.cos(winkel) * radius);
    const z = Math.round(dorf.z + Math.sin(winkel) * radius);
    const w = rand();
    teile.push({
      art: w < 0.3 ? 'zaun' : w < 0.62 ? 'tanne' : w < 0.85 ? 'busch' : 'laubbaum',
      x, z, dreh: rand() * Math.PI * 2,
    });
  }

  return { teile, leute };
}

export class Doerfer {
  constructor(scene) {
    this.scene = scene;
    this.aktiv = new Map();        // "i,j" -> { gruppe, dorf, plan }
    this.muster = {
      brunnen: props.brunnenBauen(),
      laterne: props.laterneBauen(),
      tanne: props.tanneBauen({ hoehe: 5 }),
      laubbaum: props.laubbaumBauen({ hoehe: 4.2 }),
      busch: props.buschBauen(),
      zaun: props.zaunBauen(4),
      kiste: props.kisteBauen(),
      fels: props.felsBauen(),
      tor: props.torBauen(),
    };
    this.haeuser = new Map();      // Häuser haben Maße, also je Form ein Muster
  }

  hausMuster(t) {
    const key = `${t.breite.toFixed(1)}|${t.tiefe.toFixed(1)}|${t.hoehe.toFixed(1)}|${t.dach}`;
    if (!this.haeuser.has(key)) {
      this.haeuser.set(key, props.hausBauen({
        breite: t.breite, tiefe: t.tiefe, hoehe: t.hoehe, dachFarbe: t.dach,
      }));
    }
    return this.haeuser.get(key);
  }

  /** Hängt Dörfer in Reichweite ein und alte wieder aus. */
  update(px, pz) {
    const nah = doerferUm(px, pz, 150);
    const gewollt = new Set();

    for (const dorf of nah) {
      const key = `${dorf.i},${dorf.j}`;
      gewollt.add(key);
      if (this.aktiv.has(key)) continue;

      const plan = bauplan(dorf);
      const gruppe = new THREE.Group();
      for (const t of plan.teile) {
        const muster = t.art === 'haus' ? this.hausMuster(t) : this.muster[t.art];
        if (!muster) continue;
        const obj = muster.clone();
        obj.position.set(t.x + 0.5, surfaceAt(t.x, t.z) + 1, t.z + 0.5);
        obj.rotation.y = t.dreh;
        gruppe.add(obj);
      }
      this.scene.add(gruppe);
      this.aktiv.set(key, { gruppe, dorf, plan });
    }

    for (const [key, eintrag] of [...this.aktiv]) {
      if (gewollt.has(key)) continue;
      this.scene.remove(eintrag.gruppe);
      this.aktiv.delete(key);
    }
  }

  /** Das Dorf, in dem der Spieler gerade steht — für HUD und Quests. */
  dorfUnter(x, z) {
    for (const { dorf } of this.aktiv.values()) {
      if (Math.hypot(x - dorf.x, z - dorf.z) < dorf.r) return dorf;
    }
    return null;
  }

  alleLeute() {
    const out = [];
    for (const { dorf, plan } of this.aktiv.values()) {
      for (const l of plan.leute) out.push({ ...l, dorf });
    }
    return out;
  }

  clear() {
    for (const { gruppe } of this.aktiv.values()) this.scene.remove(gruppe);
    this.aktiv.clear();
  }
}
