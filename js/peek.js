import * as THREE from 'three';

/* ==========================================================================
 *  Das Guckloch.
 *
 *  Was zwischen Kamera und Spieler steht, fällt weg. Ohne das verschwindet die
 *  Figur hinter jedem Dach und jedem Blätterdach — und mit ihr der Pfeil, die
 *  Gegner und alles andere, was gerade wichtig ist.
 *
 *  Der Schnitt folgt dem Sehstrahl, nicht der Senkrechten, und franst per
 *  Punktmuster aus, damit die Kante nicht wie ausgestanzt wirkt. Er gilt für
 *  Gelände *und* Modelle — sonst hilft er bei Häusern gar nicht.
 * ========================================================================== */

export const peek = {
  uPeek: { value: new THREE.Vector3(0, 1e6, 0) },
  uPeekR: { value: 1.25 },
};

/** Baut das Guckloch in ein Material ein. */
export function anwenden(material, { radius } = {}) {
  const eigen = radius !== undefined ? { value: radius } : peek.uPeekR;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPeek = peek.uPeek;
    shader.uniforms.uPeekR = eigen;
    shader.vertexShader = 'varying vec3 vWorld;\n' + shader.vertexShader.replace(
      '#include <project_vertex>',
      'vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <project_vertex>'
    );
    shader.fragmentShader = 'varying vec3 vWorld;\nuniform vec3 uPeek;\nuniform float uPeekR;\n'
      + shader.fragmentShader.replace(
        '#include <clipping_planes_fragment>',
        `if (vWorld.y > uPeek.y) {
           vec3 toP = uPeek - cameraPosition;
           float pL = length(toP);
           vec3 pDir = toP / pL;
           vec3 pV = vWorld - cameraPosition;
           float pT = dot(pV, pDir);
           if (pT > 0.0 && pT < pL - 1.2) {
             float d = length(pV - pDir * pT);
             if (d < uPeekR) discard;
             if (d < uPeekR * 1.25) {
               float f = (d - uPeekR) / (uPeekR * 0.35);
               vec2 g = floor(mod(gl_FragCoord.xy, 2.0));
               if (g.x + g.y * 2.0 > f * 4.0) discard;
             }
           }
         }
         #include <clipping_planes_fragment>`
      );
  };
  material.needsUpdate = true;
  return material;
}
