import * as THREE from 'three';
import { isSolid } from './voxel.js';
import { flattenGroup } from './meshkit.js';

/* ==========================================================================
 *  Was durch die Luft fliegt.
 *
 *  Pfeile, Funken und Ascheklumpen sind dasselbe Ding mit anderem Aussehen:
 *  eine gerade Bahn, ein Bogen nach unten, und der erste Treffer zählt. Wer
 *  schießt, steht in `wem` — daran hängt, wen es treffen darf.
 * ========================================================================== */

const SCHWERE = 4.2;          // sanft, damit man den Bogen noch zielen kann

function mat(color, leuchtet) {
  return leuchtet
    ? new THREE.MeshBasicMaterial({ color })
    : new THREE.MeshLambertMaterial({ color, flatShading: true });
}

function pfeilBauen() {
  const g = new THREE.Group();
  const schaft = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.9), mat('#a8743f'));
  const spitze = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.18), mat('#d8dde2'));
  spitze.position.z = 0.5;
  const feder = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.22), mat('#f0e7d2'));
  feder.position.z = -0.4;
  g.add(schaft, spitze, feder);
  return flattenGroup(g);
}

function kugelBauen(farbe) {
  const g = new THREE.Group();
  const kern = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), mat(farbe, true));
  const huelle = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0),
    new THREE.MeshBasicMaterial({ color: farbe, transparent: true, opacity: 0.35 }));
  g.add(kern, huelle);
  return flattenGroup(g);
}

export const GESCHOSSE = {
  pfeil:  { tempo: 26, leben: 2.4, schwere: 1.0, dreht: true },
  funke:  { tempo: 17, leben: 2.2, schwere: 0.35, farbe: '#9fd8e8' },
  asche:  { tempo: 15, leben: 2.6, schwere: 0.6, farbe: '#e0654b' },
  stein:  { tempo: 19, leben: 2.2, schwere: 0.9, farbe: '#b9aa98' },
};

export class Geschosse {
  constructor(scene) {
    this.scene = scene;
    this.liste = [];
    this.muster = {
      pfeil: pfeilBauen(),
      funke: kugelBauen(GESCHOSSE.funke.farbe),
      asche: kugelBauen(GESCHOSSE.asche.farbe),
      stein: kugelBauen(GESCHOSSE.stein.farbe),
    };
  }

  /** Schießt eines los. `wem` ist 'spieler' oder 'feind'. */
  schiessen(art, x, y, z, rx, rz, schaden, wem, weite = 26) {
    const k = GESCHOSSE[art] || GESCHOSSE.pfeil;
    const laenge = Math.hypot(rx, rz) || 1;
    const obj = this.muster[art].clone();
    obj.position.set(x, y, z);
    this.scene.add(obj);
    const g = {
      art, obj, wem, schaden,
      pos: new THREE.Vector3(x, y, z),
      vx: (rx / laenge) * k.tempo,
      vz: (rz / laenge) * k.tempo,
      // Ein Hauch Aufwärts, damit die Bahn über die Entfernung nicht absackt
      vy: (weite / 26) * 1.6,
      leben: k.leben,
      schwere: k.schwere,
      dreht: !!k.dreht,
    };
    this.liste.push(g);
    return g;
  }

  entfernen(g) {
    this.scene.remove(g.obj);
    const i = this.liste.indexOf(g);
    if (i >= 0) this.liste.splice(i, 1);
  }

  clear() {
    for (const g of this.liste) this.scene.remove(g.obj);
    this.liste.length = 0;
  }

  /**
   * Bewegt alles und meldet Treffer.
   * `trefferFeind(feind, schaden)` und `trefferSpieler(schaden)` kommen von außen.
   */
  update(dt, world, feinde, spielerPos, haken) {
    for (let i = this.liste.length - 1; i >= 0; i--) {
      const g = this.liste[i];
      g.leben -= dt;
      g.vy -= SCHWERE * g.schwere * dt;
      g.pos.x += g.vx * dt;
      g.pos.y += g.vy * dt;
      g.pos.z += g.vz * dt;

      if (g.leben <= 0 || g.pos.y < 1) { this.entfernen(g); continue; }

      // In die Landschaft geschlagen
      if (isSolid(world.get(Math.floor(g.pos.x), Math.floor(g.pos.y), Math.floor(g.pos.z)))) {
        haken.aufschlag?.(g);
        this.entfernen(g);
        continue;
      }

      let getroffen = false;
      if (g.wem === 'spieler') {
        for (const f of feinde.liste) {
          const hoch = f.art.hoehe || 1.2;
          if (Math.abs(f.pos.y + hoch * 0.5 - g.pos.y) > hoch * 0.8 + 0.3) continue;
          if (Math.hypot(f.pos.x - g.pos.x, f.pos.z - g.pos.z) > 0.7) continue;
          haken.trefferFeind(f, g.schaden, g);
          getroffen = true;
          break;
        }
      } else if (Math.hypot(spielerPos.x - g.pos.x, spielerPos.z - g.pos.z) < 0.7
                 && Math.abs(spielerPos.y + 0.9 - g.pos.y) < 1.2) {
        haken.trefferSpieler(g.schaden, g);
        getroffen = true;
      }
      if (getroffen) { this.entfernen(g); continue; }

      g.obj.position.copy(g.pos);
      if (g.dreht) {
        g.obj.rotation.y = Math.atan2(g.vx, g.vz);
        g.obj.rotation.x = -Math.atan2(g.vy, Math.hypot(g.vx, g.vz));
      } else {
        g.obj.rotation.y += dt * 6;
      }
    }
  }
}
