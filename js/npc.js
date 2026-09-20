import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { isSolid } from './voxel.js';
import { flattenGroup } from './meshkit.js';
import { FARBEN } from './props.js';

/* ==========================================================================
 *  Die Leute im Dorf.
 *
 *  Jeder hat einen Namen, ein Gewerbe und genau einen Auftrag zu vergeben —
 *  immer denselben, weil er aus seinem Saatkorn gewürfelt wird. Sie laufen um
 *  ihr Haus herum, damit das Dorf nicht wie eine Kulisse wirkt.
 * ========================================================================== */

const VORNAMEN = ['Alrik', 'Brida', 'Corin', 'Dela', 'Edran', 'Fenna', 'Garv', 'Hilde',
  'Ivar', 'Jorun', 'Kell', 'Linnea', 'Morn', 'Nesta', 'Orin', 'Runa', 'Sten', 'Tove'];
const GEWERBE = [
  { name: 'Schmiedin', kleid: '#8a5230', gruss: 'Die Esse frisst mehr, als sie hergibt.' },
  { name: 'Jäger', kleid: '#4f8f5c', gruss: 'Im Wald ist es unruhig geworden.' },
  { name: 'Wirt', kleid: '#c9543f', gruss: 'Setzt Euch — oder auch nicht, wie Ihr wollt.' },
  { name: 'Kräuterfrau', kleid: '#7a6a8c', gruss: 'Ich kenne jedes Blatt hier. Fast jedes.' },
  { name: 'Bauer', kleid: '#b5794a', gruss: 'Der Boden gibt, was er will, nicht was ich will.' },
  { name: 'Wache', kleid: '#5e7a92', gruss: 'Haltet Euch an die Wege, dann haltet Ihr durch.' },
  { name: 'Händlerin', kleid: '#c98f57', gruss: 'Alles hat einen Preis. Auch das Schweigen.' },
];

/* Der Chronist gibt es genau einmal. Er trägt Grau und sitzt näher an seinem
   Haus als die anderen — er läuft nicht mehr viel. */
const CHRONIST = { name: 'Chronist', kleid: '#6a6a78', gruss: 'Ich schreibe auf, was aufhört.' };

function mat(color) { return new THREE.MeshLambertMaterial({ color, flatShading: true }); }
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

function bauen(kleid, haar) {
  const g = new THREE.Group();
  const teil = (geo, m, x, y, z) => {
    const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o;
  };
  const stoff = mat(kleid);
  teil(box(0.62, 0.44, 0.46), mat(kleid), 0, 0.24, 0);       // Rocksaum
  teil(box(0.5, 0.68, 0.36), stoff, 0, 0.78, 0);
  teil(box(0.44, 0.42, 0.4), mat('#f0cba0'), 0, 1.31, 0);
  teil(box(0.5, 0.16, 0.46), mat(haar), 0, 1.53, -0.02);
  teil(box(0.08, 0.08, 0.04), new THREE.MeshBasicMaterial({ color: '#3f3328' }), -0.1, 1.31, 0.21);
  teil(box(0.08, 0.08, 0.04), new THREE.MeshBasicMaterial({ color: '#3f3328' }), 0.1, 1.31, 0.21);
  teil(box(0.14, 0.5, 0.16), stoff, -0.33, 0.8, 0);
  teil(box(0.14, 0.5, 0.16), stoff, 0.33, 0.8, 0);
  return flattenGroup(g);
}

const HAARE = ['#5a3d2b', '#3f3328', '#a8743f', '#d9c08a', '#8a7e72'];

export class Leute {
  constructor(scene) {
    this.scene = scene;
    this.liste = [];
    this.muster = new Map();
    this.stand = -1;              // Stand der Dorfliste, die zuletzt gesehen wurde
  }

  musterFuer(kleid, haar) {
    const key = kleid + haar;
    if (!this.muster.has(key)) this.muster.set(key, bauen(kleid, haar));
    return this.muster.get(key);
  }

  clear() {
    for (const n of this.liste) this.scene.remove(n.obj);
    this.liste.length = 0;
    this.stand = -1;              // beim nächsten Mal wieder neu aufstellen
  }

  /** Stellt die Leute der Dörfer in Reichweite auf und räumt ferne ab. */
  update(dt, world, doerfer, spielerPos, nacht = false) {
    // Nur wenn ein Dorf dazugekommen oder weggefallen ist — sonst steht die
    // Mannschaft ja schon.
    if (this.stand !== doerfer.stand) {
      this.stand = doerfer.stand;
      this.aufstellen(world, doerfer);
    }
    this.laufen(dt, world, spielerPos, nacht);
  }

  aufstellen(world, doerfer) {
    const gewollt = new Map();
    for (const l of doerfer.alleLeute()) {
      // Der Schlüssel muss die Person meinen, nicht das Haus — im Wirtshaus
      // wohnen mehrere unter derselben Adresse.
      gewollt.set(`${l.dorf.i},${l.dorf.j},${l.saat}`, l);
    }

    for (let i = this.liste.length - 1; i >= 0; i--) {
      if (!gewollt.has(this.liste[i].key)) {
        this.scene.remove(this.liste[i].obj);
        this.liste.splice(i, 1);
      }
    }
    const da = new Set(this.liste.map((n) => n.key));

    for (const [key, l] of gewollt) {
      if (da.has(key)) continue;
      const rand = mulberry32(l.saat >>> 0);
      const gewerbe = l.chronist ? CHRONIST
        : l.beruf ? (GEWERBE.find((g) => g.name === l.beruf) || GEWERBE[0])
        : l.handel ? GEWERBE.find((g) => g.name === 'Händlerin')
        : GEWERBE[Math.floor(rand() * GEWERBE.length)];
      const name = VORNAMEN[Math.floor(rand() * VORNAMEN.length)];
      const haar = l.chronist ? '#e6e0d4' : HAARE[Math.floor(rand() * HAARE.length)];
      const obj = this.musterFuer(gewerbe.kleid, haar).clone();

      let y = l.dorf.h + 1;
      for (let probe = y + 6; probe > 2; probe--) {
        if (isSolid(world.get(Math.round(l.x), probe - 1, Math.round(l.z)))) { y = probe; break; }
      }
      obj.position.set(l.x, y, l.z);
      this.scene.add(obj);

      this.liste.push({
        key, name, gewerbe, saat: l.saat, dorf: l.dorf,
        obj, pos: new THREE.Vector3(l.x, y, l.z), handel: !!l.handel, chronist: !!l.chronist,
        heimX: l.x, heimZ: l.z,
        hausX: l.heimX, hausZ: l.heimZ,
        // Stubenhocker gehen nie vor die Tür — Wirt, Gäste, Schmiedin
        stubenhocker: !!l.stubenhocker,
        drinnen: !!l.stubenhocker, stufe: l.stubenhocker ? 'drin' : 'draussen',
        takt: rand() * 6, ziel: null, auftrag: null,
      });
    }
  }

  /** Umherlaufen — tagsüber ums Haus, nachts hinein. */
  laufen(dt, world, spielerPos, nacht) {
    for (const n of this.liste) {
      if (n.stubenhocker) this.stubenlauf(n, dt);
      else if (nacht) this.heimgehen(n, dt);
      else this.tagslauf(n, dt);
      const nah = Math.hypot(n.pos.x - spielerPos.x, n.pos.z - spielerPos.z) < 3.2;
      // Wer schlafen gegangen ist, steht still. Wirt und Gäste nicht.
      if (n.drinnen && !n.stubenhocker) { n.obj.position.copy(n.pos); if (nah) {
        n.obj.rotation.y = Math.atan2(spielerPos.x - n.pos.x, spielerPos.z - n.pos.z);
      } continue; }
      if (nah) {
        // Wer angesprochen wird, dreht sich zu und bleibt stehen
        n.obj.rotation.y = Math.atan2(spielerPos.x - n.pos.x, spielerPos.z - n.pos.z);
      } else if (n.ziel) {
        const dx = n.ziel.x - n.pos.x, dz = n.ziel.z - n.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.4) { n.ziel = null; }
        else {
          const s = Math.min(1.5 * dt, d);
          const nx = n.pos.x + (dx / d) * s, nz = n.pos.z + (dz / d) * s;
          if (!isSolid(world.get(Math.floor(nx), Math.floor(n.pos.y), Math.floor(nz)))) {
            n.pos.x = nx; n.pos.z = nz;
          } else { n.ziel = null; }
          n.obj.rotation.y = Math.atan2(dx, dz);
        }
      }
      // auf dem Boden bleiben
      const unten = Math.floor(n.pos.y) - 1;
      if (!isSolid(world.get(Math.floor(n.pos.x), unten, Math.floor(n.pos.z)))) {
        if (isSolid(world.get(Math.floor(n.pos.x), unten - 1, Math.floor(n.pos.z)))) n.pos.y -= 1;
      } else if (isSolid(world.get(Math.floor(n.pos.x), unten + 1, Math.floor(n.pos.z)))) {
        n.pos.y += 1;
      }
      n.obj.position.copy(n.pos);
    }
  }

  /* Wer im Haus lebt, tritt nur ein paar Schritte hin und her — genug,
     damit die Stube nicht wie ein Standbild wirkt. */
  stubenlauf(n, dt) {
    n.takt -= dt;
    if (n.takt <= 0) {
      n.takt = 4 + Math.random() * 6;
      n.ziel = Math.random() < 0.5 ? null : {
        x: n.heimX + (Math.random() - 0.5) * 1.6,
        z: n.heimZ + (Math.random() - 0.5) * 1.6,
      };
    }
  }

  /* Tagsüber schlendert jeder um sein Haus. */
  tagslauf(n, dt) {
    if (n.stufe !== 'draussen') {
      // Morgens wieder vor die Tür
      n.stufe = 'draussen';
      n.drinnen = false;
      n.obj.visible = true;
      const t = this.tuerVon(n);
      n.pos.x = t.x; n.pos.z = t.z;
    }
    if (n.chronist) { n.ziel = null; return; }
    n.takt -= dt;
    if (n.takt <= 0) {
      n.takt = 3 + Math.random() * 5;
      n.ziel = Math.random() < 0.4 ? null : {
        x: n.heimX + (Math.random() - 0.5) * 9,
        z: n.heimZ + (Math.random() - 0.5) * 9,
      };
    }
  }

  /* Nachts geht jeder heim: erst an die Tür, dann hinein. Wer drin ist,
     bleibt stehen — ansprechen kann man ihn trotzdem, man muss nur
     hineingehen. */
  heimgehen(n, dt) {
    if (n.stufe === 'drin') { n.ziel = null; return; }
    const tuer = this.tuerVon(n);
    if (n.stufe === 'draussen') {
      n.ziel = tuer;
      if (Math.hypot(n.pos.x - tuer.x, n.pos.z - tuer.z) < 1.4) n.stufe = 'tuer';
      return;
    }
    // In der Tür: einen Schritt hinein, dann ist Feierabend. Nicht ganz in die
    // Mitte — die Bettstelle gehört dem Gast.
    const dx = n.heimX - n.hausX, dz = n.heimZ - n.hausZ;
    const d = Math.hypot(dx, dz) || 1;
    n.pos.x = n.hausX + 0.5 + (dx / d) * 0.9;
    n.pos.z = n.hausZ + 0.5 + (dz / d) * 0.9;
    n.ziel = null;
    n.stufe = 'drin';
    n.drinnen = true;
  }

  /* Der Platz vor der Haustür — genau der, auf dem er tagsüber steht. Wo
     die Tür liegt, weiß der Bauplan; hier nachrechnen wäre nur eine zweite,
     schlechtere Wahrheit. */
  tuerVon(n) {
    return { x: n.heimX, z: n.heimZ };
  }

  /** Wen kann der Spieler gerade ansprechen? */
  naechster(pos, reichweite = 3.2) {
    let best = null, bestD = reichweite;
    for (const n of this.liste) {
      const d = Math.hypot(n.pos.x - pos.x, n.pos.z - pos.z);
      if (d < bestD && Math.abs(n.pos.y - pos.y) < 3) { bestD = d; best = n; }
    }
    return best;
  }
}
