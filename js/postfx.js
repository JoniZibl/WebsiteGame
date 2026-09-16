import * as THREE from 'three';

/**
 * Tilt-Shift: die Szene wird in ein Render-Target gezeichnet, eine halb
 * aufgelöste Kopie zweimal weichgezeichnet und beides über eine Maske
 * gemischt, die nur ein schmales Band in Bildmitte scharf lässt.
 * Genau dieser Trick lässt echte Landschaften wie Miniaturen aussehen.
 */

const quadGeo = new THREE.PlaneGeometry(2, 2);
const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const BLUR_FRAG = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform vec2 uDir;
  varying vec2 vUv;
  void main() {
    vec4 sum = texture2D(tDiffuse, vUv) * 0.227027;
    sum += (texture2D(tDiffuse, vUv + uDir * 1.3846) + texture2D(tDiffuse, vUv - uDir * 1.3846)) * 0.316216;
    sum += (texture2D(tDiffuse, vUv + uDir * 3.2307) + texture2D(tDiffuse, vUv - uDir * 3.2307)) * 0.070270;
    gl_FragColor = sum;
  }
`;

const COMPOSITE_FRAG = /* glsl */`
  uniform sampler2D tSharp;
  uniform sampler2D tBlur;
  uniform float uFocus;      // Höhe des scharfen Bandes (0 unten .. 1 oben)
  uniform float uBand;       // halbe Breite des scharfen Bandes
  uniform float uFeather;    // wie weich es in die Unschärfe übergeht
  uniform float uAmount;     // Stärke insgesamt
  uniform float uTilt;       // leichte Neigung der Schärfeebene
  uniform float uSaturation; // Miniaturen wirken eine Spur farbiger

  uniform float uBloom;      // weicher Lichtschein
  uniform float uBloomCut;   // ab welcher Helligkeit er einsetzt
  uniform float uExposure;
  uniform float uSoftness;   // Rolloff der Lichter: macht harte Kanten mild
  uniform float uContrast;   // sanfte S-Kurve
  uniform vec3  uLift;       // hebt die Schatten an (Filmlook)
  uniform vec3  uGain;       // färbt die Lichter
  uniform float uVignette;
  uniform float uGrain;
  uniform float uTime;
  uniform float uDark;       // 0 = volles Licht, 1 = tiefe Dunkelheit
  uniform vec3  uDarkTint;

  uniform sampler2D tDepth;  // Konturlinien aus der Tiefe
  uniform vec2  uTexel;
  uniform float uOutline;
  uniform float uNear;
  uniform float uFar;
  varying vec2 vUv;

  // Abstand zur Kamera in Metern — daran erkennt man Silhouetten.
  float depthAt(vec2 uv) {
    float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
    return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
  }

  // Die Render-Targets liegen in sRGB, die Hardware gibt beim Lesen lineare
  // Werte zurück. Das Bild geht direkt auf den Bildschirm, also kodieren wir
  // hier von Hand zurück - sonst wird alles zu dunkel.
  vec3 toSRGB(vec3 c) {
    return mix(pow(c, vec3(0.41666)) * 1.055 - 0.055, c * 12.92, step(c, vec3(0.0031308)));
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    float y = vUv.y + (vUv.x - 0.5) * uTilt;
    float m = smoothstep(uBand, uBand + uFeather, abs(y - uFocus));
    m = pow(m, 1.25) * uAmount;

    vec3 sharp = texture2D(tSharp, vUv).rgb;
    vec3 blurred = texture2D(tBlur, vUv).rgb;
    vec3 color = mix(sharp, blurred, m);

    // Konturlinien: wo die Tiefe springt, sitzt eine Silhouette. Die Schwelle
    // wächst mit der Entfernung, sonst wird die Ferne ein Strichgewirr.
    if (uOutline > 0.001) {
      // zwei Ringe von Stichproben ergeben eine dickere, gleichmäßige Linie
      vec2 t1 = uTexel * 1.6;
      vec2 t2 = uTexel * 3.0;
      float d0 = depthAt(vUv);
      float dx = abs(depthAt(vUv + vec2(t1.x, 0.0)) - d0) + abs(depthAt(vUv - vec2(t1.x, 0.0)) - d0)
               + abs(depthAt(vUv + vec2(t2.x, 0.0)) - d0) + abs(depthAt(vUv - vec2(t2.x, 0.0)) - d0);
      float dy = abs(depthAt(vUv + vec2(0.0, t1.y)) - d0) + abs(depthAt(vUv - vec2(0.0, t1.y)) - d0)
               + abs(depthAt(vUv + vec2(0.0, t2.y)) - d0) + abs(depthAt(vUv - vec2(0.0, t2.y)) - d0);
      float edge = smoothstep(0.02 * d0, 0.07 * d0, dx + dy);
      // in unscharfen Bereichen verschwindet die Linie mit
      color *= 1.0 - edge * uOutline * (1.0 - m * 0.9);
    }

    // Der weichgezeichnete Puffer ist schon da – daraus wird der Lichtschein,
    // der die harten Facettenkanten sanft ineinander blendet.
    color += max(blurred - uBloomCut, 0.0) * uBloom;

    // Belichtung und weiches Ausrollen der Lichter
    color *= uExposure;
    color = color / (1.0 + color * uSoftness);

    color = toSRGB(color);

    // sanfte S-Kurve: gibt den Farben wieder Biss, ohne hart zu werden
    color = mix(color, color * color * (3.0 - 2.0 * color), uContrast);

    float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = mix(vec3(lum), color, uSaturation);
    color = uLift + color * (uGain - uLift);        // leicht angehobene Schatten, warme Lichter

    // Die Dunkelheit nimmt der Welt die Farbe und zieht sie ins Kalte —
    // aber nur dort, wo kein Licht hinfällt. Laterne, Feuer und Glut behalten
    // ihre Wärme, und genau davon lebt das Bild.
    if (uDark > 0.001) {
      float grey = dot(color, vec3(0.2126, 0.7152, 0.0722));
      float lit = smoothstep(0.3, 0.8, grey);
      float d = uDark * (1.0 - lit * 0.92);
      vec3 cold = mix(vec3(grey), uDarkTint * grey * 1.7, 0.55);
      color = mix(color, cold, d * 0.9);
      color *= 1.0 - d * 0.34;
    }

    float d = distance(vUv, vec2(0.5, 0.5));
    color *= 1.0 - smoothstep(0.52 - uDark * 0.34, 1.05 - uDark * 0.4, d) * (uVignette + uDark * 0.55);

    color += (hash(vUv * 600.0 + uTime) - 0.5) * uGrain;

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  }
`;

export class TiltShift {
  constructor(renderer) {
    this.renderer = renderer;
    this.enabled = true;
    this.iterations = 2;   // zweiter Durchgang = weicheres Bokeh, kostet Füllrate

    this.scene = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true });
    this.scene.texture.colorSpace = THREE.SRGBColorSpace;
    // Die Tiefe brauchen wir für die Konturlinien.
    this.scene.depthTexture = new THREE.DepthTexture(1, 1);
    this.scene.depthTexture.type = THREE.UnsignedIntType;
    this.a = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
    this.b = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
    for (const rt of [this.a, this.b]) {
      rt.texture.colorSpace = THREE.SRGBColorSpace;
      rt.texture.minFilter = THREE.LinearFilter;
      rt.texture.magFilter = THREE.LinearFilter;
    }

    this.blurMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } },
      vertexShader: VERT,
      fragmentShader: BLUR_FRAG,
      depthTest: false,
      depthWrite: false,
    });

    this.compositeMat = new THREE.ShaderMaterial({
      uniforms: {
        tSharp: { value: null },
        tBlur: { value: null },
        uFocus: { value: 0.5 },
        uBand: { value: 0.3 },
        uFeather: { value: 0.4 },
        uAmount: { value: 0.75 },
        uTilt: { value: 0.03 },
        uSaturation: { value: 1.22 },

        // Bildlook: weicher Schein, Filmkurve, warme Lichter, leichte Vignette
        uBloom: { value: 0.2 },
        uBloomCut: { value: 0.72 },
        uExposure: { value: 1.04 },
        uSoftness: { value: 0.16 },
        uContrast: { value: 0.3 },
        uLift: { value: new THREE.Vector3(0.012, 0.014, 0.02) },
        uGain: { value: new THREE.Vector3(1.02, 1.0, 0.955) },
        uVignette: { value: 0.22 },
        uGrain: { value: 0.016 },
        uTime: { value: 0 },
        tDepth: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uOutline: { value: 0.8 },
        uNear: { value: 0.5 },
        uFar: { value: 320 },
        uDark: { value: 0 },
        uDarkTint: { value: new THREE.Vector3(0.42, 0.5, 0.78) },
      },
      vertexShader: VERT,
      fragmentShader: COMPOSITE_FRAG,
      depthTest: false,
      depthWrite: false,
    });

    this.quad = new THREE.Mesh(quadGeo, this.blurMat);
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
  }

  setSize(width, height, pixelRatio, samples = 4) {
    const w = Math.max(1, Math.floor(width * pixelRatio));
    const h = Math.max(1, Math.floor(height * pixelRatio));
    this.scene.setSize(w, h);
    this.compositeMat.uniforms.uTexel.value.set(1 / w, 1 / h);
    // Die Unschärfe braucht keine volle Auflösung – halbiert spart viel Füllrate.
    this.a.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    this.b.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    this.halfW = Math.max(1, w >> 1);
    this.halfH = Math.max(1, h >> 1);
  }

  _blit(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, quadCam);
  }

  render(scene, camera) {
    const r = this.renderer;
    if (!this.enabled) {
      r.setRenderTarget(null);
      r.render(scene, camera);
      return;
    }

    r.setRenderTarget(this.scene);
    r.clear();
    r.render(scene, camera);

    const step = this.blurMat.uniforms.uDir.value;
    // zwei Durchgänge horizontal/vertikal ergeben eine schön weiche Bokeh-Anmutung
    for (let i = 0; i < this.iterations; i++) {
      const spread = 1.4 + i * 2.1;
      this.blurMat.uniforms.tDiffuse.value = i === 0 ? this.scene.texture : this.b.texture;
      step.set(spread / this.halfW, 0);
      this._blit(this.blurMat, this.a);

      this.blurMat.uniforms.tDiffuse.value = this.a.texture;
      step.set(0, spread / this.halfH);
      this._blit(this.blurMat, this.b);
    }

    this.compositeMat.uniforms.uTime.value = (performance.now() % 10000) * 0.001;
    this.compositeMat.uniforms.tDepth.value = this.scene.depthTexture;
    this.compositeMat.uniforms.uNear.value = camera.near;
    this.compositeMat.uniforms.uFar.value = camera.far;
    this.compositeMat.uniforms.tSharp.value = this.scene.texture;
    this.compositeMat.uniforms.tBlur.value = this.b.texture;
    this._blit(this.compositeMat, null);
  }

  dispose() {
    [this.scene, this.a, this.b].forEach((rt) => rt.dispose());
    this.blurMat.dispose();
    this.compositeMat.dispose();
  }
}
