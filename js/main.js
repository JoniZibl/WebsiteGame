import * as THREE from 'three';
import {
  VoxelWorld, B, BLOCKS, AIR, isSolid, setSeed, getSeed, biomeAt, surfaceAt, stratumAt,
  HEIGHT, SEA, CHUNK,
} from './voxel.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { TiltShift } from './postfx.js';
import * as save from './save.js';
import { GameAudio } from './audio.js';
import { Juice } from './juice.js';

/* ==========================================================================
 *  Ein Survival-Spiel von oben: Blockwelt, Biome, Höhlen, graben und bauen.
 *
 *  Der Kniff für die Draufsicht: Sobald man sich eingräbt, wird die Welt
 *  über dem Kopf weggeschnitten. Man sieht in seinen Tunnel hinein, ohne
 *  dass die Kamera die Perspektive wechseln muss.
 * ========================================================================== */

const canvas = document.getElementById('scene');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  document.body.innerHTML = '<div class="overlay"><div class="card"><h1>Kein WebGL</h1></div></div>';
  throw err;
}
renderer.localClippingEnabled = true;

const isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
let quality = isTouch ? 'low' : 'high';

const scene = new THREE.Scene();
scene.background = new THREE.Color('#ede2cd');
scene.fog = new THREE.Fog('#ede2cd', 60, 135);

const camera = new THREE.PerspectiveCamera(40, 1, 0.3, 400);
const CAM_DIR = new THREE.Vector3(0, 26, 22).normalize();
let camDist = 33;

const hemi = new THREE.HemisphereLight('#fff6e4', '#c39a72', 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff4de', 1.1);
scene.add(sun, sun.target);

// Die Schnittebene: alles oberhalb verschwindet, wenn wir unter Tage sind.
const cutPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), HEIGHT + 4);
renderer.clippingPlanes = [cutPlane];

const blockMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

/* Guckloch: Was zwischen Kamera und Zwerg steht, faellt weg - sonst
   verschwindet er unter jedem Blaetterdach. Der Schnitt folgt dem Sehstrahl,
   nicht der Senkrechten, und franst per Punktmuster aus. */
const peek = {
  uPeek: { value: new THREE.Vector3(0, 1e6, 0) },
  uPeekR: { value: 1.25 },
};
blockMat.onBeforeCompile = (shader) => {
  shader.uniforms.uPeek = peek.uPeek;
  shader.uniforms.uPeekR = peek.uPeekR;
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
const waterMat = new THREE.MeshLambertMaterial({
  vertexColors: true, transparent: true, opacity: 0.72, flatShading: true,
});

const post = new TiltShift(renderer);
const world = new VoxelWorld(scene, blockMat, waterMat, 4);
const input = new Input();
const player = new Player(scene);
const audio = new GameAudio();
const juice = new Juice(scene, camera);

// Grubenlampe: unter Tage leuchtet die Figur sich selbst
const lamp = new THREE.PointLight('#ffbe72', 0, 34, 1.25);
scene.add(lamp);

// Markierung, auf welchen Block gerade gezielt wird
const marker = new THREE.Mesh(
  new THREE.BoxGeometry(1.04, 1.04, 1.04),
  new THREE.MeshBasicMaterial({ color: '#ffffff', wireframe: true, transparent: true, opacity: 0.5 })
);
marker.visible = false;
scene.add(marker);

/* -------------------------------- Zustand --------------------------------- */
const state = {
  running: false,
  mode: 'grab',           // grab = du frisst dich durch alles | lauf = du gehst nur
  digTarget: null,
  digProgress: 0,
  light: 100,
  deepest: 0,
  time: 0.28,
  depth: 0,
  cut: HEIGHT + 4,
  under: 0,
  dead: false,
  fallFrom: null,
  camPos: new THREE.Vector3(),
};

const DAY = 240;

/* Das Licht ist alles: Leben, Uhr und Punktestand in einem. Es brennt
   langsamer, wenn man stillsteht, und schneller, je tiefer man kommt. */
const BRENN = 100 / 150;

/* --------------------------------- HUD ------------------------------------ */
const depthEl = document.getElementById('depth');
const deepestEl = document.getElementById('deepest');
const stratumEl = document.getElementById('stratum');
const lightRing = document.getElementById('lightRing');
const modeBtn = document.getElementById('modeBtn');

let hudTimer = 0;
function updateHUD() {
  const surface = surfaceAt(Math.floor(player.pos.x), Math.floor(player.pos.z));
  state.depth = Math.max(0, Math.round(surface - player.pos.y));
  if (state.depth > state.deepest) state.deepest = state.depth;

  depthEl.textContent = state.depth > 0 ? `${state.depth} m` : 'oben';
  deepestEl.textContent = `${state.deepest} m`;
  stratumEl.textContent = state.depth > 1
    ? stratumAt(state.depth).name
    : biomeAt(Math.floor(player.pos.x), Math.floor(player.pos.z)).name;

  const l = Math.max(0, Math.min(100, state.light));
  lightRing.style.setProperty('--fill', `${l}%`);
  lightRing.classList.toggle('low', l < 30);
}

function setMode(mode) {
  state.mode = mode;
  modeBtn.textContent = mode === 'grab' ? '⛏' : '👣';
  modeBtn.classList.toggle('walk', mode === 'lauf');
  state.digTarget = null;
  state.digProgress = 0;
  marker.visible = false;
}

/* ------------------------------ Licht ------------------------------------- */
function feed(amount) {
  state.light = Math.min(100, state.light + amount);
  audio.gem(1);
  juice.shake(0.2);
  updateHUD();
}

function erlischt() {
  state.dead = true;
  state.running = false;
  document.getElementById('deadDepth').textContent = `${state.depth} m`;
  document.getElementById('deadBest').textContent = `${state.deepest} m`;
  document.getElementById('dead').classList.remove('hidden');
  audio.hurt();
}

/* --------------------------------- Graben ---------------------------------- */
/* Es gibt keinen Grabknopf. Du läufst gegen die Erde, und die Erde gibt nach.
   Lässt du los, sinkst du. Das ist die ganze Steuerung. */
function digAt(dt, target) {
  const block = world.get(target.x, target.y, target.z);
  const def = BLOCKS[block];
  if (block === AIR || !def || def.hard === Infinity) {
    state.digTarget = null;
    state.digProgress = 0;
    marker.visible = false;
    return false;
  }

  marker.visible = true;
  marker.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);

  const same = state.digTarget && state.digTarget.x === target.x
    && state.digTarget.y === target.y && state.digTarget.z === target.z;
  if (!same) { state.digTarget = target; state.digProgress = 0; }

  // Je tiefer die Schicht, desto zaeher der Fels. Die Farbbaender sind also
  // nicht nur Anstrich - man merkt jeden Uebergang in den Haenden.
  const zaeh = def.erdig
    ? stratumAt(surfaceAt(target.x, target.z) - target.y).zaeh
    : 1;
  state.digProgress += dt / zaeh;
  player.swing = 0.25;
  if (state.digProgress % 0.25 < dt) audio.hit();
  marker.scale.setScalar(1 - Math.min(0.4, state.digProgress / def.hard * 0.4));

  if (state.digProgress >= def.hard) {
    world.set(target.x, target.y, target.z, AIR);
    if (def.licht) {
      feed(def.licht);
      juice.ring({ x: target.x + 0.5, y: target.y + 0.5, z: target.z + 0.5 }, 2.6, '#ffd98a');
      juice.popup({ x: target.x + 0.5, y: target.y + 1, z: target.z + 0.5 },
        `+${def.licht}`, '#ffe9a8');
    } else {
      audio.kill();
      juice.shake(0.22);
    }
    state.digTarget = null;
    state.digProgress = 0;
    marker.scale.setScalar(1);
    return true;
  }
  return false;
}

/* ------------------------------ Tag und Nacht ----------------------------- */
const underColor = new THREE.Color('#9c8168');
const skyDay = new THREE.Color('#ede2cd');
const skyDusk = new THREE.Color('#f2cba4');
const skyNight = new THREE.Color('#8e9bb5');
const sunDay = new THREE.Color('#fff6e4');
const sunDusk = new THREE.Color('#ffb27a');
const sunNight = new THREE.Color('#c3cfe6');
const tmpSky = new THREE.Color();
const tmpSun = new THREE.Color();

function applyDaytime() {
  const t = state.time;
  let k, a, bSky, aSun, bSun;
  if (t < 0.55) { k = Math.min(1, t / 0.2); a = skyDusk; bSky = skyDay; aSun = sunDusk; bSun = sunDay; }
  else if (t < 0.75) { k = (t - 0.55) / 0.2; a = skyDay; bSky = skyDusk; aSun = sunDay; bSun = sunDusk; }
  else if (t < 0.95) { k = (t - 0.75) / 0.2; a = skyDusk; bSky = skyNight; aSun = sunDusk; bSun = sunNight; }
  else { k = (t - 0.95) / 0.05; a = skyNight; bSky = skyDusk; aSun = sunNight; bSun = sunDusk; }

  tmpSky.copy(a).lerp(bSky, k);
  tmpSun.copy(aSun).lerp(bSun, k);

  // Je tiefer wir stecken, desto mehr wird aus Himmel Erdreich.
  // Die Nebelweiten zaehlen ab Kamera, nicht ab Spieler - die Kamera steht
  // camDist entfernt, ein kleinerer Wert taucht die ganze Szene in Nebel.
  tmpSky.lerp(underColor, state.under);
  scene.fog.near = camDist + 10 - state.under * 4;
  scene.fog.far = camDist + 46 - state.under * 8;

  scene.background.copy(tmpSky);
  scene.fog.color.copy(tmpSky);
  renderer.setClearColor(tmpSky);
  sun.color.copy(tmpSun);

  const night = t > 0.78 && t < 0.97;
  const under = state.under;
  sun.intensity = (night ? 0.62 : 1.15) * (1 - under * 0.28);
  hemi.intensity = (night ? 0.6 : 0.95) * (1 - under * 0.2) + under * 0.35;

  const ang = (t - 0.25) * Math.PI * 2;
  sun.position.set(
    player.pos.x + Math.cos(ang) * 40,
    player.pos.y + 20 + Math.max(6, Math.sin(ang) * 40),
    player.pos.z + 22
  );
  sun.target.position.copy(player.pos);
  sun.target.updateMatrixWorld();
}

/* ------------------------------- Bildschirm ------------------------------- */
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const cap = quality === 'high' ? 2 : 1.5;
  const pr = Math.min(devicePixelRatio || 1, cap);
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  post.setSize(w, h, pr);
  camera.aspect = w / h;
  camera.fov = h > w ? 46 : 38;
  camera.updateProjectionMatrix();
  post.compositeMat.uniforms.uBand.value = h > w ? 0.34 : 0.28;
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 150));

function applyQuality() {
  const high = quality === 'high';
  renderer.shadowMap.enabled = high;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  sun.castShadow = high;
  if (high) {
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.06;
    const c = sun.shadow.camera;
    c.left = -46; c.right = 46; c.top = 46; c.bottom = -46; c.near = 1; c.far = 180;
    c.updateProjectionMatrix();
  }
  post.iterations = high ? 2 : 1;
  document.getElementById('qualityBtn').classList.toggle('off', !high);
  resize();
}

/* ------------------------------ Spielstand -------------------------------- */
/* Gespeichert wird nur das Saatkorn und was der Spieler veraendert hat - die
   Welt selbst rechnet sich jederzeit neu aus. */
let saveTimer = 0;

function writeSave() {
  if (!state.running || state.dead) return;
  save.save({
    seed: getSeed(),
    edits: save.packEdits(world.edits),
    light: state.light,
    deepest: state.deepest,
    time: state.time,
    pos: [player.pos.x, player.pos.y, player.pos.z],
  });
}

function clearWorldMeshes() {
  for (const [k, chunk] of [...world.chunks]) {
    for (const key of ['mesh', 'water']) {
      if (chunk[key]) { scene.remove(chunk[key]); chunk[key].geometry.dispose(); }
    }
    world.chunks.delete(k);
  }
  world.queue.length = 0;
}

function resumeRun(d) {
  setSeed(d.seed);
  clearWorldMeshes();
  world.edits.clear();
  save.unpackEdits(d.edits, world.edits);

  state.light = d.light ?? 100;
  state.deepest = d.deepest ?? 0;
  state.time = d.time ?? 0.28;
  state.dead = false;
  state.fallFrom = null;
  state.digTarget = null;
  juice.reset();
  setMode('grab');

  const [px, py, pz] = d.pos;
  world.update(px, pz, 95);
  player.pos.set(px, py, pz);
  player.vel.set(0, 0, 0);

  state.cut = HEIGHT + 4;
  cutPlane.constant = state.cut;
  state.camPos.copy(player.pos).addScaledVector(CAM_DIR, camDist);
  camera.position.copy(state.camPos);
  camera.lookAt(player.pos);
  updateHUD();
  state.running = true;
}

/* ------------------------------- Neuer Lauf ------------------------------- */
function newRun() {
  save.clear();
  setSeed((Math.random() * 1e9) | 0);
  clearWorldMeshes();
  world.edits.clear();

  state.light = 100;
  state.deepest = 0;
  state.dead = false;
  state.fallFrom = null;
  setMode('grab');
  state.time = 0.28;
  state.digTarget = null;
  juice.reset();

  // Startplatz: grüne Gegend mit Bäumen, nicht mitten im Fels
  let sx = 0, sz = 0, bestScore = -1;
  for (let i = 0; i < 700; i++) {
    const a = i * 2.39996, r = Math.sqrt(i) * 7;
    const x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r);
    const s2 = surfaceAt(x, z);
    if (s2 <= SEA + 2) continue;
    const biome = biomeAt(x, z);
    const score = (biome.name === 'Wald' ? 3 : biome.name === 'Wiese' ? 2.4 : 0.5) - r * 0.004;
    if (score > bestScore) { bestScore = score; sx = x; sz = z; }
  }
  world.update(sx, sz, 95);
  player.spawn(world, sx, sz);

  state.cut = HEIGHT + 4;
  cutPlane.constant = state.cut;
  state.camPos.copy(player.pos).addScaledVector(CAM_DIR, camDist);
  camera.position.copy(state.camPos);
  camera.lookAt(player.pos);

  updateHUD();
  state.running = true;
  writeSave();
}

/* -------------------------------- Schleife -------------------------------- */
const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const raw = Math.min(clock.getDelta(), 1 / 20);
  const dt = juice.update(raw);

  if (state.running) {
    const move = input.read();
    const zieht = move.x !== 0 || move.y !== 0;

    player.update(dt, move, world);
    world.update(player.pos.x, player.pos.z, 2);
    state.time = (state.time + dt / DAY) % 1;

    // ----- Die ganze Steuerung -----
    // Im Grabmodus frisst du dich durch alles: ziehst du, geht es zur Seite;
    // lässt du los, sinkst du. Im Laufmodus rührst du die Erde nicht an.
    if (state.mode === 'grab') {
      if (zieht) {
        const t = player.aim(world, 'front');
        if (!digAt(dt, t)) {
          // Steht nichts im Weg, läuft man einfach weiter - nichts blockiert.
        }
      } else {
        digAt(dt, player.aim(world, 'down'));
      }
    } else {
      state.digTarget = null;
      state.digProgress = 0;
      marker.visible = false;
    }

    // Die Welt über dem Kopf wegschneiden, sobald wir unter Tage sind.
    // Maßstab ist die ursprüngliche Geländehöhe — sonst zählt das eigene
    // Loch als Oberfläche und die Decke bleibt stehen.
    const surface = surfaceAt(Math.floor(player.pos.x), Math.floor(player.pos.z));
    const wantCut = player.pos.y + 3 < surface ? Math.floor(player.pos.y) + 4 : HEIGHT + 4;
    state.cut += (wantCut - state.cut) * Math.min(1, dt * 7);
    // Die Ebene darf nie genau auf einer Blockfläche liegen, sonst flimmert
    // der Schnitt. Ein Hauch darunter schneidet sauber zwischen den Blöcken.
    cutPlane.constant = Math.round(state.cut) - 0.03;

    const underground = Math.max(0, Math.min(1, (surface - player.pos.y) / 3));
    state.under = underground;
    applyDaytime();
    const night = state.time > 0.78 && state.time < 0.97 ? 1 : 0;
    peek.uPeek.value.set(player.pos.x, player.pos.y + 2.9, player.pos.z);

    // Ein harter Sturz kostet kein Leben, sondern Licht: die Flamme schlaegt
    // aus. Eine Hoehle ist also der schnelle Weg nach unten - aber nie umsonst.
    if (player.onGround) {
      if (state.fallFrom !== null) {
        const sturz = state.fallFrom - player.pos.y;
        if (sturz > 5) {
          state.light = Math.max(0, state.light - (sturz - 5) * 2.4);
          juice.shake(0.6);
          audio.hurt();
          juice.popup({ x: player.pos.x, y: player.pos.y + 2.2, z: player.pos.z },
            'die Flamme schlägt aus', '#ffb08a');
          if (state.light <= 0) erlischt();
        }
        state.fallFrom = null;
      }
    } else {
      state.fallFrom = state.fallFrom === null
        ? player.pos.y : Math.max(state.fallFrom, player.pos.y);
    }

    // ----- Das Licht -----
    // Es brennt schneller, je tiefer du steckst. Oben an der Luft füllt es
    // sich von allein wieder - die Oberfläche ist der sichere Hafen.
    const tief = Math.max(0, state.depth);
    if (underground > 0.2) {
      state.light -= BRENN * dt * (1 + tief * 0.035);
      if (state.light <= 0) { state.light = 0; erlischt(); }
    } else if (!night) {
      state.light = Math.min(100, state.light + 14 * dt);
    }

    // Die Laterne selbst folgt dem Licht: geht es zur Neige, wird es eng
    const glut = Math.max(0, Math.min(1, state.light / 100));
    const flacker = 0.9 + Math.sin(state.time * 9000) * 0.1 * (1 - glut);
    lamp.position.set(player.pos.x, player.pos.y + 1.6, player.pos.z);
    lamp.intensity = Math.max(underground, night * 0.5) * (2 + glut * 5) * flacker;
    lamp.distance = 12 + glut * 14;

    // Untertage kippt die Graduierung ins Warme, nachts ins Kalte
    const darkU = post.compositeMat.uniforms;
    darkU.uDark.value = Math.max(0, (1 - glut) * 0.35 + night * 0.22);
    darkU.uDarkTint.value.set(0.72, 0.58, 0.46);

    hudTimer -= dt;
    if (hudTimer <= 0) { hudTimer = 0.25; updateHUD(); }
    saveTimer -= dt;
    if (saveTimer <= 0) { saveTimer = 8; writeSave(); }
  }

  const want = state.camPos.copy(player.pos).addScaledVector(CAM_DIR, camDist);
  camera.position.lerp(want, 1 - Math.pow(0.002, raw));
  camera.lookAt(player.pos.x, player.pos.y + 1, player.pos.z);
  juice.applyToCamera();

  post.render(scene, camera);
}

/* --------------------------------- Knöpfe ---------------------------------
 * Es gibt genau einen: er schaltet zwischen Graben und Laufen um. Alles
 * andere macht der Finger auf dem Bildschirm.
 * -------------------------------------------------------------------------- */
modeBtn.addEventListener('click', () => {
  setMode(state.mode === 'grab' ? 'lauf' : 'grab');
  audio.gem(state.mode === 'grab' ? 2 : 0);
});

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === ' ' || k === 'e') { setMode(state.mode === 'grab' ? 'lauf' : 'grab'); e.preventDefault(); }
});

const soundBtn = document.getElementById('soundBtn');
let muted = false;
try { muted = localStorage.getItem('block-muted') === '1'; } catch (err) { /* egal */ }
audio.setMuted(muted);
soundBtn.textContent = muted ? '🔇' : '🔊';
soundBtn.addEventListener('click', () => {
  muted = !muted;
  audio.unlock();
  audio.setMuted(muted);
  soundBtn.textContent = muted ? '🔇' : '🔊';
  try { localStorage.setItem('block-muted', muted ? '1' : '0'); } catch (err) { /* egal */ }
});

document.getElementById('qualityBtn').addEventListener('click', () => {
  quality = quality === 'high' ? 'low' : 'high';
  applyQuality();
});

document.getElementById('startBtn').addEventListener('click', () => {
  audio.unlock();
  document.getElementById('start').classList.add('hidden');
  newRun();
});

// Ein alter Stand darf weitergehen - sonst waere jedes Zumachen des Browsers
// das Ende der Grabung.
const saved = save.load();
if (saved) {
  const btn = document.getElementById('resumeBtn');
  btn.classList.remove('hidden');
  btn.addEventListener('click', () => {
    audio.unlock();
    document.getElementById('start').classList.add('hidden');
    resumeRun(saved);
  });
}

window.addEventListener('pagehide', writeSave);
document.addEventListener('visibilitychange', () => { if (document.hidden) writeSave(); });

document.getElementById('againBtn').addEventListener('click', () => {
  document.getElementById('dead').classList.add('hidden');
  newRun();
});


document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

window.__game = { state, player, world, scene, camera, renderer, juice, audio, post, B, BLOCKS,
  writeSave, save, setMode, feed };

resize();
applyQuality();

setSeed(20260916);
world.update(0, 0, 95);
player.spawn(world, 0, 0);
camera.position.copy(player.pos).addScaledVector(CAM_DIR, camDist);
camera.lookAt(player.pos);
updateHUD();
frame();
