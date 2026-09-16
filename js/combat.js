import * as THREE from 'three';
import { isSolid, HEIGHT } from './voxel.js';
import { flattenGroup } from './meshkit.js';

/* ==========================================================================
 *  Gegner und Kampf.
 *
 *  Vier Sorten, bewusst durchschaubar: sie merken dich auf Sichtweite, laufen
 *  dich an, schlagen im Takt zu und bleiben stehen, wenn sie dich verlieren.
 *  Was den Kampf trägt, ist nicht ihre Klugheit, sondern wo sie stehen —
 *  vier Skelette in einer engen Kammer sind etwas anderes als vier auf der Wiese.
 * ========================================================================== */

const GRAVITY = 24;
const RADIUS = 0.34;

export const ARTEN = {
  wolf: {
    name: 'Wolf', fell: '#a39488', dunkel: '#74675c', augen: '#f5c451',
    hp: 26, schaden: 9, tempo: 4.4, reichweite: 1.3, takt: 1.1, xp: 22, gold: 0,
    hoehe: 0.9, vierbeiner: true, sicht: 18,
  },
  raeuber: {
    name: 'Räuber', fell: '#9d86b8', dunkel: '#6a5a86', augen: '#f6ead6',
    hp: 42, schaden: 13, tempo: 3.4, reichweite: 1.5, takt: 1.35, xp: 34, gold: 18,
    hoehe: 1.7, sicht: 20,
  },
  skelett: {
    name: 'Skelett', fell: '#f0e7d2', dunkel: '#c3b79c', augen: '#c9543f',
    hp: 34, schaden: 15, tempo: 2.9, reichweite: 1.5, takt: 1.5, xp: 30, gold: 12,
    hoehe: 1.7, sicht: 22,
  },
  hauptmann: {
    name: 'Hauptmann', fell: '#e0654b', dunkel: '#a8402f', augen: '#f5c451',
    hp: 110, schaden: 24, tempo: 3.2, reichweite: 1.8, takt: 1.5, xp: 120, gold: 90,
    hoehe: 2.0, boss: true, sicht: 26,
  },
};

/* ------------------------------- Die Modelle ------------------------------- */
function mat(color) { return new THREE.MeshLambertMaterial({ color, flatShading: true }); }
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

function bauen(art) {
  const g = new THREE.Group();
  const fell = mat(art.fell), dunkel = mat(art.dunkel);
  const auge = new THREE.MeshBasicMaterial({ color: art.augen });
  const teil = (geo, m, x, y, z) => {
    const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o;
  };

  if (art.vierbeiner) {
    teil(box(0.62, 0.52, 1.18), fell, 0, 0.66, 0);
    teil(box(0.5, 0.44, 0.5), dunkel, 0, 0.82, 0.74);
    teil(box(0.16, 0.2, 0.1), dunkel, -0.16, 1.1, 0.66);
    teil(box(0.16, 0.2, 0.1), dunkel, 0.16, 1.1, 0.66);
    teil(box(0.1, 0.1, 0.05), auge, -0.12, 0.86, 0.99);
    teil(box(0.1, 0.1, 0.05), auge, 0.12, 0.86, 0.99);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      teil(box(0.18, 0.44, 0.18), dunkel, sx * 0.22, 0.22, sz * 0.4);
    }
    teil(box(0.14, 0.14, 0.5), fell, 0, 0.8, -0.78);
  } else {
    teil(box(0.58, 0.76, 0.36), fell, 0, art.hoehe * 0.55, 0);
    teil(box(0.46, 0.44, 0.42), art.boss ? fell : dunkel, 0, art.hoehe * 0.98, 0);
    teil(box(0.1, 0.1, 0.05), auge, -0.11, art.hoehe * 0.99, 0.22);
    teil(box(0.1, 0.1, 0.05), auge, 0.11, art.hoehe * 0.99, 0.22);
    teil(box(0.16, 0.56, 0.18), dunkel, -0.38, art.hoehe * 0.56, 0);
    teil(box(0.16, 0.56, 0.18), dunkel, 0.38, art.hoehe * 0.56, 0);
    teil(box(0.2, 0.5, 0.22), dunkel, -0.14, art.hoehe * 0.2, 0);
    teil(box(0.2, 0.5, 0.22), dunkel, 0.14, art.hoehe * 0.2, 0);
    // Klinge
    teil(box(0.1, 0.72, 0.1), mat('#b9aa98'), 0.44, art.hoehe * 0.62, 0.2);
    if (art.boss) {
      teil(box(0.7, 0.14, 0.7), mat('#f5c451'), 0, art.hoehe * 1.24, 0);
      teil(box(0.16, 0.26, 0.16), mat('#f5c451'), 0, art.hoehe * 1.38, 0);
    }
  }
  return flattenGroup(g);
}

export class Feinde {
  constructor(scene, haken) {
    this.scene = scene;
    this.haken = haken;               // onTreffer, onTod
    this.liste = [];
    this.muster = {};
    for (const [id, art] of Object.entries(ARTEN)) this.muster[id] = bauen(art);
  }

  get anzahl() { return this.liste.length; }

  spawn(id, x, y, z, stufe = 1, herkunft = null) {
    const art = ARTEN[id];
    if (!art) return null;
    const obj = this.muster[id].clone();
    obj.position.set(x, y, z);
    this.scene.add(obj);
    const skalierung = 1 + (stufe - 1) * 0.22;
    const f = {
      id, art, obj, herkunft,
      pos: new THREE.Vector3(x, y, z),
      vy: 0,
      hp: Math.round(art.hp * skalierung), hpMax: Math.round(art.hp * skalierung),
      schaden: Math.round(art.schaden * skalierung),
      wach: false, takt: 0, weh: 0, wank: Math.random() * 7,
      heimX: x, heimZ: z,
    };
    this.liste.push(f);
    return f;
  }

  clear() {
    for (const f of this.liste) this.scene.remove(f.obj);
    this.liste.length = 0;
  }

  entfernen(f) {
    this.scene.remove(f.obj);
    const i = this.liste.indexOf(f);
    if (i >= 0) this.liste.splice(i, 1);
  }

  /** Alles, was weiter weg ist als die Sichtgrenze, wird abgeräumt. */
  aufraeumen(px, pz, grenze = 120) {
    for (let i = this.liste.length - 1; i >= 0; i--) {
      const f = this.liste[i];
      if (Math.hypot(f.pos.x - px, f.pos.z - pz) > grenze) this.entfernen(f);
    }
  }

  blockiert(world, x, y, z, hoehe) {
    for (const ox of [-RADIUS, RADIUS]) {
      for (const oz of [-RADIUS, RADIUS]) {
        for (let h = 0; h <= hoehe; h += 0.7) {
          if (isSolid(world.get(Math.floor(x + ox), Math.floor(y + h), Math.floor(z + oz)))) return true;
        }
      }
    }
    return false;
  }

  update(dt, world, spielerPos, spielerLebt) {
    for (let i = this.liste.length - 1; i >= 0; i--) {
      const f = this.liste[i];
      const art = f.art;
      const dx = spielerPos.x - f.pos.x;
      const dz = spielerPos.z - f.pos.z;
      const dy = Math.abs(spielerPos.y - f.pos.y);
      const dist = Math.hypot(dx, dz);

      if (!f.wach && spielerLebt && dist < art.sicht && dy < 7) f.wach = true;
      if (f.wach && (dist > art.sicht * 2.2 || dy > 14)) f.wach = false;

      let zielX = 0, zielZ = 0;
      if (f.wach && spielerLebt) {
        if (dist > art.reichweite * 0.8) { zielX = dx / dist; zielZ = dz / dist; }
        f.obj.rotation.y = Math.atan2(dx, dz);
      } else {
        // Ohne Ziel wandert er ein wenig um seinen Platz
        f.wank += dt * 0.6;
        const hx = f.heimX - f.pos.x, hz = f.heimZ - f.pos.z;
        const hd = Math.hypot(hx, hz);
        if (hd > 6) { zielX = hx / hd * 0.4; zielZ = hz / hd * 0.4; }
        else { zielX = Math.cos(f.wank) * 0.25; zielZ = Math.sin(f.wank * 0.7) * 0.25; }
        if (zielX || zielZ) f.obj.rotation.y = Math.atan2(zielX, zielZ);
      }

      const schritt = art.tempo * dt;
      this.schieben(world, f, zielX * schritt, zielZ * schritt);

      f.vy -= GRAVITY * dt;
      const ny = f.pos.y + f.vy * dt;
      if (this.blockiert(world, f.pos.x, ny, f.pos.z, art.hoehe)) {
        if (f.vy < 0) f.pos.y = Math.floor(f.pos.y) + (f.pos.y % 1 > 0.5 ? 1 : 0);
        f.vy = 0;
      } else if (ny > 0) {
        f.pos.y = ny;
      }
      if (f.pos.y < 1) { this.entfernen(f); continue; }

      f.obj.position.copy(f.pos);
      f.wank += dt * (art.vierbeiner ? 9 : 6);
      if (Math.abs(zielX) + Math.abs(zielZ) > 0.05) {
        f.obj.position.y += Math.abs(Math.sin(f.wank)) * 0.07;
      }
      if (f.weh > 0) { f.weh -= dt; f.obj.position.x += Math.sin(f.weh * 70) * 0.05; }

      f.takt -= dt;
      if (f.wach && spielerLebt && dist < art.reichweite && dy < 2.2 && f.takt <= 0) {
        f.takt = art.takt;
        this.haken.onTreffer(f);
      }
    }
  }

  schieben(world, f, dx, dz) {
    const h = f.art.hoehe;
    if (!this.blockiert(world, f.pos.x + dx, f.pos.y, f.pos.z, h)) f.pos.x += dx;
    else if (!this.blockiert(world, f.pos.x + dx, f.pos.y + 1, f.pos.z, h)) { f.pos.x += dx; f.pos.y += 1.02; }
    if (!this.blockiert(world, f.pos.x, f.pos.y, f.pos.z + dz, h)) f.pos.z += dz;
    else if (!this.blockiert(world, f.pos.x, f.pos.y + 1, f.pos.z + dz, h)) { f.pos.z += dz; f.pos.y += 1.02; }
  }

  /** Das nächste Ziel vor dem Spieler — für Anzeige und Zuschlagen. */
  ziel(pos, blick, reichweite = 2.6) {
    let best = null, bestWert = Infinity;
    for (const f of this.liste) {
      const dx = f.pos.x - pos.x, dz = f.pos.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d > reichweite || Math.abs(f.pos.y - pos.y) > 2.4) continue;
      // Was hinter einem steht, zählt weniger als was vor einem steht
      const winkel = Math.abs(((Math.atan2(dx, dz) - blick + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      const wert = d + winkel * 1.6;
      if (wert < bestWert) { bestWert = wert; best = f; }
    }
    return best;
  }

  schlagen(f, schaden) {
    f.hp -= schaden;
    f.weh = 0.22;
    f.wach = true;
    if (f.hp <= 0) {
      this.entfernen(f);
      this.haken.onTod(f);
      return true;
    }
    return false;
  }
}
