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
  varying vec2 vUv;

  // Die Render-Targets liegen in sRGB, die Hardware gibt beim Lesen lineare
  // Werte zurück. Das Bild geht direkt auf den Bildschirm, also kodieren wir
  // hier von Hand zurück - sonst wird alles zu dunkel.
  vec3 toSRGB(vec3 c) {
    return mix(pow(c, vec3(0.41666)) * 1.055 - 0.055, c * 12.92, step(c, vec3(0.0031308)));
  }

  void main() {
    float y = vUv.y + (vUv.x - 0.5) * uTilt;
    float m = smoothstep(uBand, uBand + uFeather, abs(y - uFocus));
    m = pow(m, 1.25) * uAmount;

    vec3 color = mix(texture2D(tSharp, vUv).rgb, texture2D(tBlur, vUv).rgb, m);
    float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = mix(vec3(lum), color, uSaturation);
    gl_FragColor = vec4(toSRGB(color), 1.0);
  }
`;

export class TiltShift {
  constructor(renderer) {
    this.renderer = renderer;
    this.enabled = true;
    this.iterations = 2;   // zweiter Durchgang = weicheres Bokeh, kostet Füllrate

    this.scene = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true, samples: 4 });
    this.scene.texture.colorSpace = THREE.SRGBColorSpace;
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
        uBand: { value: 0.16 },
        uFeather: { value: 0.3 },
        uAmount: { value: 1.0 },
        uTilt: { value: 0.03 },
        uSaturation: { value: 1.08 },
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
    this.scene.samples = samples;
    this.scene.setSize(w, h);
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
      const spread = 1 + i * 1.6;
      this.blurMat.uniforms.tDiffuse.value = i === 0 ? this.scene.texture : this.b.texture;
      step.set(spread / this.halfW, 0);
      this._blit(this.blurMat, this.a);

      this.blurMat.uniforms.tDiffuse.value = this.a.texture;
      step.set(0, spread / this.halfH);
      this._blit(this.blurMat, this.b);
    }

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
