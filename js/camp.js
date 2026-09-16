import * as THREE from 'three';
import { heightAt } from './world.js';

// Was man aus gesammeltem Material bauen kann. Alles Gebaute bleibt in der
// Welt und im Spielstand — es ist dein Lager, nicht das des Spiels.

export const BUILDINGS = {
  feuer: {
    icon: '🔥', title: 'Lagerfeuer', text: 'Füllt deine Laterne und hält Schatten fern',
    cost: { holz: 4 }, light: 1, heal: true, radius: 0.9, burns: true, reach: 16,
  },
  zelt: {
    icon: '⛺', title: 'Zelt', text: 'Hier wachst du wieder auf',
    cost: { holz: 8, stein: 2 }, home: true, radius: 1.5,
  },
  laterne: {
    icon: '🏮', title: 'Laterne', text: 'Sichert einen Weg durch die Nacht',
    cost: { holz: 3, stein: 1 }, light: 0.6, radius: 0.35, burns: true, reach: 11,
  },
  zaun: {
    icon: '🪵', title: 'Zaun', text: 'Hält Gegner auf',
    cost: { holz: 2 }, radius: 0.9,
  },
};

const M = {
  holz:   new THREE.MeshLambertMaterial({ color: '#8a6a49', flatShading: true }),
  stein:  new THREE.MeshLambertMaterial({ color: '#a3a18b', flatShading: true }),
  plane:  new THREE.MeshLambertMaterial({ color: '#df8a5c', flatShading: true }),
  glut:   new THREE.MeshLambertMaterial({ color: '#f0a05c', flatShading: true, emissive: '#7a3410' }),
  papier: new THREE.MeshLambertMaterial({ color: '#f5e3b8', flatShading: true, emissive: '#5c4416' }),
};

const G = {
  scheit: new THREE.CylinderGeometry(0.09, 0.11, 1.0, 5),
  stein:  new THREE.IcosahedronGeometry(0.26, 0),
  glut:   new THREE.ConeGeometry(0.32, 0.5, 5),
  zelt:   new THREE.CylinderGeometry(1.0, 1.0, 1.9, 3, 1).rotateZ(Math.PI / 2),
  pfosten: new THREE.BoxGeometry(0.14, 1.2, 0.14),
  latte:  new THREE.BoxGeometry(1.9, 0.12, 0.1),
  mast:   new THREE.CylinderGeometry(0.07, 0.09, 1.9, 5),
  lampe:  new THREE.BoxGeometry(0.34, 0.42, 0.34),
};

function buildMesh(type) {
  const g = new THREE.Group();
  if (type === 'feuer') {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const st = new THREE.Mesh(G.stein, M.stein);
      st.position.set(Math.cos(a) * 0.62, 0.1, Math.sin(a) * 0.62);
      st.scale.set(1, 0.7, 1);
      g.add(st);
    }
    for (let i = 0; i < 3; i++) {
      const log = new THREE.Mesh(G.scheit, M.holz);
      const a = (i / 3) * Math.PI * 2;
      log.position.set(Math.cos(a) * 0.16, 0.34, Math.sin(a) * 0.16);
      log.rotation.set(Math.cos(a) * 0.45, 0, Math.sin(a) * -0.45);
      g.add(log);
    }
    const glut = new THREE.Mesh(G.glut, M.glut);
    glut.position.y = 0.42;
    glut.name = 'flamme';
    g.add(glut);
  } else if (type === 'zelt') {
    const z = new THREE.Mesh(G.zelt, M.plane);
    z.position.y = 0.95;
    const stange = new THREE.Mesh(G.mast, M.holz);
    stange.position.set(0, 1.5, 0);
    g.add(z, stange);
  } else if (type === 'laterne') {
    const mast = new THREE.Mesh(G.mast, M.holz);
    mast.position.y = 0.95;
    const lampe = new THREE.Mesh(G.lampe, M.papier);
    lampe.position.y = 1.95;
    lampe.name = 'flamme';
    g.add(mast, lampe);
  } else {
    const p1 = new THREE.Mesh(G.pfosten, M.holz); p1.position.set(-0.9, 0.6, 0);
    const p2 = new THREE.Mesh(G.pfosten, M.holz); p2.position.set(0.9, 0.6, 0);
    const l1 = new THREE.Mesh(G.latte, M.holz); l1.position.set(0, 0.85, 0);
    const l2 = new THREE.Mesh(G.latte, M.holz); l2.position.set(0, 0.45, 0);
    g.add(p1, p2, l1, l2);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export class Camp {
  constructor(scene) {
    this.scene = scene;
    this.items = [];          // { type, x, y, z, rot, mesh }
    this.colliders = [];      // von der Welt für Kollisionen mitbenutzt

    // zwei warme Lichter wandern zu den nächstgelegenen Feuern/Laternen
    this.lights = [0, 1].map(() => {
      const l = new THREE.PointLight('#ffb069', 0, 13, 2);
      scene.add(l);
      return l;
    });
  }

  /** Alles aus dem Spielstand wieder aufbauen. */
  load(list) {
    this.clear();
    for (const it of list || []) this.place(it.type, it.x, it.z, it.rot || 0, it.fuel ?? 1);
  }

  clear() {
    for (const it of this.items) {
      this.scene.remove(it.mesh);
      it.mesh.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    }
    this.items.length = 0;
    this.colliders.length = 0;
  }

  place(type, x, z, rot = 0, fuel = 1) {
    const def = BUILDINGS[type];
    const y = heightAt(x, z);
    const mesh = buildMesh(type);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rot;
    this.scene.add(mesh);

    const item = {
      type, x, y, z, rot, mesh,
      flamme: mesh.getObjectByName('flamme') || null,
      fuel: def.burns ? Math.max(0, Math.min(1, fuel)) : 1,
    };
    this.items.push(item);
    if (def.radius) {
      item.collider = { x, z, r: def.radius };
      this.colliders.push(item.collider);
    }
    return item;
  }

  /** Für den Spielstand: nur die reinen Zahlen. */
  serialize() {
    return this.items.map(({ type, x, z, rot, fuel }) => ({
      type, x: +x.toFixed(2), z: +z.toFixed(2), rot: +rot.toFixed(2), fuel: +fuel.toFixed(2),
    }));
  }

  /** Brennt hier gerade etwas? Erloschene Feuer geben kein Licht. */
  burning(item) { return !BUILDINGS[item.type].burns || item.fuel > 0; }

  /** Nächstes Feuer, dem Holz fehlt — für den Nachlegen-Knopf. */
  needsFuel(pos, radius) {
    let best = null, bestD = radius * radius;
    for (const it of this.items) {
      if (!BUILDINGS[it.type].burns || it.fuel > 0.92) continue;
      const d = (it.x - pos.x) ** 2 + (it.z - pos.z) ** 2;
      if (d < bestD) { bestD = d; best = it; }
    }
    return best;
  }

  /** Nächstes brennendes Lagerfeuer zum Auffüllen der Laterne. */
  nearestFire(pos, radius) {
    let best = null, bestD = radius * radius;
    for (const it of this.items) {
      if (!BUILDINGS[it.type].heal || !this.burning(it)) continue;
      const d = (it.x - pos.x) ** 2 + (it.z - pos.z) ** 2;
      if (d < bestD) { bestD = d; best = it; }
    }
    return best;
  }

  /** Nächster Schlafplatz – dort wacht man nach einer Niederlage auf. */
  home(pos) {
    let best = null, bestD = Infinity;
    for (const it of this.items) {
      if (!BUILDINGS[it.type].home) continue;
      const d = (it.x - pos.x) ** 2 + (it.z - pos.z) ** 2;
      if (d < bestD) { bestD = d; best = it; }
    }
    return best;
  }

  /**
   * Feuer zehren nachts an ihrem Holz — und schneller, wenn Schatten daneben
   * stehen. Ein erloschenes Feuer bleibt stehen und wartet auf Nachschub.
   */
  consume(dt, nightness, shadowsNear) {
    for (const it of this.items) {
      if (!BUILDINGS[it.type].burns || it.fuel <= 0) continue;
      const drain = (0.004 + nightness * 0.016) * (1 + shadowsNear(it) * 0.5);
      it.fuel = Math.max(0, it.fuel - drain * dt);
    }
  }

  refuel(item, amount = 0.6) {
    item.fuel = Math.min(1, item.fuel + amount);
  }

  update(dt, nightness, playerPos) {
    // Flackern und Lichter auf die nächsten brennenden Feuer setzen
    const lit = this.items
      .filter((it) => BUILDINGS[it.type].light && this.burning(it))
      .map((it) => ({ it, d: (it.x - playerPos.x) ** 2 + (it.z - playerPos.z) ** 2 }))
      .sort((a, b) => a.d - b.d);

    this.lights.forEach((light, i) => {
      const entry = lit[i];
      if (!entry || entry.d > 90 * 90) { light.intensity = 0; return; }
      const def = BUILDINGS[entry.it.type];
      light.position.set(entry.it.x, entry.it.y + (entry.it.type === 'laterne' ? 2.0 : 0.9), entry.it.z);
      light.intensity = def.light * (2.0 + nightness * 3.6) + Math.sin(performance.now() * 0.009 + i) * 0.35;
    });

    for (const it of this.items) {
      if (!it.flamme) continue;
      if (it.fuel <= 0) { it.flamme.visible = false; continue; }
      it.flamme.visible = true;
      const puls = 1 + Math.sin(performance.now() * 0.008 + it.x) * 0.12;
      const size = 0.45 + it.fuel * 0.55;
      it.flamme.scale.set(puls * size, (1 + (puls - 1) * 1.6) * size, puls * size);
    }
  }
}

/** Reicht das Material? */
export function canAfford(def, res) {
  return Object.entries(def.cost).every(([k, v]) => (res[k] | 0) >= v);
}

export function payFor(def, res) {
  for (const [k, v] of Object.entries(def.cost)) res[k] -= v;
}

export function costText(def) {
  const icons = { holz: '🪵', stein: '🪨', beeren: '🫐' };
  return Object.entries(def.cost).map(([k, v]) => `${v} ${icons[k]}`).join('  ');
}
