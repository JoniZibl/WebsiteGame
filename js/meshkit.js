import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { anwenden } from './peek.js';

// Figuren baut man am besten aus vielen kleinen Teilen — zeichnen sollte man
// sie aber als ein Stück. flattenGroup backt die Materialfarben in die
// Eckpunkte und verschmilzt alles zu einem einzigen Mesh.

/* Alle Modelle teilen sich ein Material — und damit auch das Guckloch. Ohne
   das steht der Spieler hinter dem ersten Haus und ist weg. */
const sharedMat = anwenden(
  new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  { radius: 2.1 }
);

export function flattenGroup(group, { material = sharedMat } = {}) {
  group.updateMatrixWorld(true);
  const geos = [];

  group.traverse((o) => {
    if (!o.isMesh) return;
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
    g.applyMatrix4(o.matrixWorld);

    const count = g.attributes.position.count;
    const colors = new Float32Array(count * 3);
    const c = o.material.color;
    for (let i = 0; i < count; i++) {
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    for (const key of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv', 'color'].includes(key)) g.deleteAttribute(key);
    }
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }
    geos.push(g);
  });

  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());

  const mesh = new THREE.Mesh(merged, material);
  mesh.castShadow = true;
  const out = new THREE.Group();
  out.add(mesh);
  out.userData.mesh = mesh;
  return out;
}
