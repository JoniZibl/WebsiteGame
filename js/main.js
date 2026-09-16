import * as THREE from 'three';
import {
  VoxelWorld, B, BLOCKS, AIR, isSolid, setSeed, biomeAt, surfaceAt, HEIGHT, SEA, CHUNK,
} from './voxel.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { TiltShift } from './postfx.js';
import { TOOLS, toolFor, CraftPanel } from './craft.js';
import { MobManager } from './mobs.js';
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
scene.background = new THREE.Color('#bfe0ea');
scene.fog = new THREE.Fog('#bfe0ea', 60, 135);

const camera = new THREE.PerspectiveCamera(40, 1, 0.3, 400);
const CAM_DIR = new THREE.Vector3(0, 26, 22).normalize();
let camDist = 48;

const hemi = new THREE.HemisphereLight('#ffffff', '#6f8a5a', 0.85);
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
  uPeekR: { value: 1.9 },
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
         if (d < uPeekR * 1.35) {
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
const world = new VoxelWorld(scene, blockMat, waterMat, 3);
const input = new Input();
const player = new Player(scene);
const audio = new GameAudio();
const juice = new Juice(scene, camera);

// Grubenlampe: unter Tage leuchtet die Figur sich selbst
const lamp = new THREE.PointLight('#ffc07a', 0, 30, 1.7);
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
  mode: 'dig',            // dig | build
  digTarget: null,
  digProgress: 0,
  nagTimer: 0,
  inventory: new Map(),
  selected: B.erde,
  tier: 0,
  hp: 100,
  food: 100,
  swingTimer: 0,
  fallFrom: null,
  dead: false,
  time: 0.28,
  depth: 0,
  cut: HEIGHT + 4,
  under: 0,
  camPos: new THREE.Vector3(),
};

const DAY = 240;

function give(block, n = 1) {
  state.inventory.set(block, (state.inventory.get(block) || 0) + n);
  renderHotbar();
  if (state.selected === undefined || !state.inventory.has(state.selected)) state.selected = block;
  eatBtn.classList.toggle('hidden', !bestFood());
}

function take(block, n = 1) {
  const have = state.inventory.get(block) || 0;
  if (have < n) return false;
  if (have === n) state.inventory.delete(block);
  else state.inventory.set(block, have - n);
  renderHotbar();
  eatBtn.classList.toggle('hidden', !bestFood());
  return true;
}

/* --------------------------------- HUD ------------------------------------ */
const hotbar = document.getElementById('hotbar');
const biomeEl = document.getElementById('biome');
const depthEl = document.getElementById('depth');
const clockEl = document.getElementById('clock');
const toolEl = document.getElementById('tool');
const toolIconEl = document.getElementById('toolIcon');
const hpFill = document.getElementById('hpFill');
const foodFill = document.getElementById('foodFill');
const eatBtn = document.getElementById('eatBtn');

function renderHotbar() {
  hotbar.replaceChildren();
  const entries = [...state.inventory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!entries.length) {
    const hint = document.createElement('div');
    hint.className = 'slot empty';
    hint.textContent = 'Grab etwas ab';
    hotbar.append(hint);
    return;
  }
  for (const [block, count] of entries) {
    const def = BLOCKS[block];
    const el = document.createElement('button');
    el.className = 'slot' + (block === state.selected ? ' on' : '');
    el.innerHTML = `<span class="swatch" style="background:#${def.color.toString(16).padStart(6, '0')}"></span>` +
      `<span class="n">${count}</span>`;
    el.title = def.name;
    el.addEventListener('click', () => { state.selected = block; renderHotbar(); });
    hotbar.append(el);
  }
}

let hudTimer = 0;
function updateHUD() {
  const biome = biomeAt(Math.floor(player.pos.x), Math.floor(player.pos.z));
  const surface = surfaceAt(Math.floor(player.pos.x), Math.floor(player.pos.z));
  state.depth = Math.max(0, Math.round(surface - player.pos.y));
  biomeEl.textContent = biome.name;
  depthEl.textContent = state.depth > 1 ? `${state.depth} m tief` : 'über Tage';
  const t = state.time;
  clockEl.textContent = t < 0.25 ? '🌅 Morgen' : t < 0.55 ? '☀️ Tag' : t < 0.72 ? '🌇 Abend' : '🌙 Nacht';
  toolEl.textContent = TOOLS[state.tier].short;
  toolIconEl.textContent = TOOLS[state.tier].icon;
  hpFill.style.width = `${Math.max(0, state.hp)}%`;
  foodFill.style.width = `${Math.max(0, state.food)}%`;
  hpFill.parentElement.classList.toggle('low', state.hp < 30);
  foodFill.parentElement.classList.toggle('low', state.food < 25);
  eatBtn.classList.toggle('hidden', !bestFood());
}

/* ------------------------------ Graben & Bauen ---------------------------- */
function digStep(dt, mode) {
  // Steht ein Wesen in Reichweite, gilt der Knopf ihm - nicht dem Stein.
  // Der Knopf bleibt dann beim Wesen, auch waehrend der Schlag nachlaedt;
  // sonst haut der Zwerg zwischendurch Loecher in den Boden.
  if (mobs.nearest(player)) {
    marker.visible = false;
    state.digTarget = null;
    state.digProgress = 0;
    if (state.swingTimer <= 0) {
      state.swingTimer = 0.34;
      mobs.strike(player, 2 + state.tier);
      player.swing = 0.3;
      audio.hit();
      juice.shake(0.22);
    }
    return;
  }

  const target = player.aim(world, mode);
  const block = world.get(target.x, target.y, target.z);
  const def = BLOCKS[block];

  if (block === AIR || !def || def.hard === Infinity) {
    state.digTarget = null;
    state.digProgress = 0;
    marker.visible = false;
    return;
  }

  // Zu hart fuer das, was der Zwerg in der Hand hat
  if ((def.needs ?? 0) > state.tier) {
    marker.visible = true;
    marker.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);
    state.digTarget = null;
    state.digProgress = 0;
    if (state.nagTimer <= 0) {
      state.nagTimer = 1.6;
      juice.popup({ x: target.x + 0.5, y: target.y + 1, z: target.z + 0.5 },
        `Braucht ${toolFor(block)}`, '#ffb4a2');
      audio.step();
    }
    return;
  }

  marker.visible = true;
  marker.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);

  const same = state.digTarget && state.digTarget.x === target.x
    && state.digTarget.y === target.y && state.digTarget.z === target.z;
  if (!same) { state.digTarget = target; state.digProgress = 0; }

  state.digProgress += dt * TOOLS[state.tier].speed;
  player.swing = 0.25;
  if (state.digProgress % 0.3 < dt * TOOLS[state.tier].speed) audio.hit();

  marker.scale.setScalar(1 - Math.min(0.35, state.digProgress / def.hard * 0.35));

  if (state.digProgress >= def.hard) {
    world.set(target.x, target.y, target.z, AIR);
    if (torches.delete(`${target.x},${target.y},${target.z}`)) updateTorchLights();
    give(def.drop ?? block);
    audio.kill();
    juice.shake(0.28);
    juice.freeze(0.03);
    juice.popup({ x: target.x + 0.5, y: target.y + 1, z: target.z + 0.5 }, def.name, '#ffe9a8');
    state.digTarget = null;
    state.digProgress = 0;
    marker.scale.setScalar(1);
  }
}

function placeBlock(mode) {
  const target = player.placeTarget(world, mode);
  if (!target) return;
  if (world.get(target.x, target.y, target.z) !== AIR
      && world.get(target.x, target.y, target.z) !== B.wasser) return;

  // nicht in sich selbst bauen
  const px = Math.floor(player.pos.x), py = Math.floor(player.pos.y), pz = Math.floor(player.pos.z);
  if (target.x === px && target.z === pz && (target.y === py || target.y === py + 1)) return;

  if (!take(state.selected)) return;
  world.set(target.x, target.y, target.z, state.selected);
  if (state.selected === B.fackel) {
    torches.add(`${target.x},${target.y},${target.z}`);
    updateTorchLights();
  }
  audio.gem(1);
  juice.shake(0.15);
  player.swing = 0.25;
}

/* --------------------------- Leben und Sättigung --------------------------- */
/* Die Sättigung fällt langsam und zieht erst danach am Leben. Wer oben bleibt
   und isst, stirbt nie - gefährlich wird nur, wer tief gräbt und nichts
   mitnimmt. */
const STARVE = 100 / 420;      // eine volle Leiste hält rund sieben Minuten

function bestFood() {
  for (const [block] of state.inventory) if (BLOCKS[block]?.food) return block;
  return null;
}

function eat() {
  const block = bestFood();
  if (!block || state.food > 97) return;
  take(block);
  state.food = Math.min(100, state.food + BLOCKS[block].food);
  state.hp = Math.min(100, state.hp + 6);
  audio.chomp();
  juice.popup({ x: player.pos.x, y: player.pos.y + 2.3, z: player.pos.z }, 'Mmh', '#c8e6a0');
  updateHUD();
}

function hurt(amount, why) {
  if (state.dead || !state.running) return;
  state.hp -= amount;
  juice.shake(0.5);
  juice.freeze(0.05);
  audio.hurt();
  if (state.hp <= 0) die(why);
  updateHUD();
}

function die(why) {
  state.hp = 0;
  state.dead = true;
  state.running = false;
  document.getElementById('deadWhy').textContent = why;
  document.getElementById('deadStats').textContent =
    `${state.depth} m tief · ${TOOLS[state.tier].name}`;
  document.getElementById('dead').classList.remove('hidden');
}

/* ------------------------------ Höhlenvolk --------------------------------- */
const mobs = new MobManager(scene, {
  onHit: (damage, m) => {
    hurt(damage, `${m.kind.name} hat dich erwischt.`);
    juice.popup({ x: player.pos.x, y: player.pos.y + 2.2, z: player.pos.z },
      `−${damage}`, '#ff9c86');
  },
  onKill: (m) => {
    audio.kill();
    juice.shake(0.3);
    if (m.kind.drop) give(m.kind.drop);
    juice.popup({ x: m.pos.x, y: m.pos.y + 1.2, z: m.pos.z }, m.kind.name, '#ffe9a8');
  },
});

/* ------------------------------- Werkbank --------------------------------- */
const craft = new CraftPanel(document.getElementById('craft'), {
  state,
  take,
  give,
  onTier(tier) {
    state.tier = tier;
    audio.gem(3);
    juice.shake(0.3);
    juice.popup({ x: player.pos.x, y: player.pos.y + 2.4, z: player.pos.z },
      TOOLS[tier].name, '#ffe9a8');
    updateHUD();
  },
  onClose() { renderHotbar(); },
});

/* -------------------------------- Fackeln ---------------------------------- */
/* Gesetzte Fackeln merken wir uns, aber nur die naechsten paar bekommen
   wirklich eine Lampe - mehr vertraegt der Renderer nicht. */
const torches = new Set();
const torchLights = [];
for (let i = 0; i < 6; i++) {
  const l = new THREE.PointLight('#ffb457', 0, 14, 1.6);
  scene.add(l);
  torchLights.push(l);
}

function updateTorchLights() {
  const near = [...torches]
    .map((k) => { const [x, y, z] = k.split(',').map(Number); return { x, y, z,
      d: (x - player.pos.x) ** 2 + (z - player.pos.z) ** 2 + (y - player.pos.y) ** 2 }; })
    .sort((a, b) => a.d - b.d)
    .slice(0, torchLights.length);
  torchLights.forEach((l, i) => {
    const t = near[i];
    if (!t || t.d > 60 * 60) { l.intensity = 0; return; }
    l.position.set(t.x + 0.5, t.y + 0.7, t.z + 0.5);
    l.intensity = 7;
  });
}

/* ------------------------------ Tag und Nacht ----------------------------- */
const underColor = new THREE.Color('#2a211c');
const skyDay = new THREE.Color('#bfe0ea');
const skyDusk = new THREE.Color('#f0b98a');
const skyNight = new THREE.Color('#1d2438');
const sunDay = new THREE.Color('#fff4de');
const sunDusk = new THREE.Color('#ffb27a');
const sunNight = new THREE.Color('#8fa4d8');
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
  scene.fog.near = camDist + 12 - state.under * 6;
  scene.fog.far = camDist + 87 - state.under * 42;

  scene.background.copy(tmpSky);
  scene.fog.color.copy(tmpSky);
  renderer.setClearColor(tmpSky);
  sun.color.copy(tmpSun);

  const night = t > 0.78 && t < 0.97;
  const under = state.under;
  sun.intensity = (night ? 0.28 : 1.1) * (1 - under * 0.85);
  hemi.intensity = (night ? 0.32 : 0.85) * (1 - under * 0.7) + under * 0.1;

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

/* ------------------------------- Neuer Lauf ------------------------------- */
function newRun() {
  setSeed((Math.random() * 1e9) | 0);
  for (const [k, chunk] of [...world.chunks]) {
    for (const key of ['mesh', 'water']) {
      if (chunk[key]) { scene.remove(chunk[key]); chunk[key].geometry.dispose(); }
    }
    world.chunks.delete(k);
  }
  world.queue.length = 0;
  world.edits.clear();

  state.inventory.clear();
  state.selected = B.erde;
  state.tier = 0;
  state.hp = 100;
  state.food = 100;
  state.dead = false;
  state.fallFrom = null;
  torches.clear();
  updateTorchLights();
  mobs.clear();
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
  world.update(sx, sz, 60);
  player.spawn(world, sx, sz);

  state.cut = HEIGHT + 4;
  cutPlane.constant = state.cut;
  state.camPos.copy(player.pos).addScaledVector(CAM_DIR, camDist);
  camera.position.copy(state.camPos);
  camera.lookAt(player.pos);

  renderHotbar();
  updateHUD();
  state.running = true;
}

/* -------------------------------- Schleife -------------------------------- */
const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const raw = Math.min(clock.getDelta(), 1 / 20);
  const dt = juice.update(raw);

  if (state.running) {
    const move = input.read();
    player.update(dt, move, world);
    world.update(player.pos.x, player.pos.z, 1);

    state.time = (state.time + dt / DAY) % 1;
    if (state.nagTimer > 0) state.nagTimer -= dt;

    // Graben oder Bauen, solange der Knopf gehalten wird
    if (held.dig) digStep(dt, 'front');
    else if (held.down) digStep(dt, 'down');
    else { state.digTarget = null; state.digProgress = 0; marker.visible = false; }

    // Die Welt über dem Kopf wegschneiden, sobald wir unter Tage sind.
    // Maßstab ist die ursprüngliche Geländehöhe — sonst zählt das eigene
    // Loch als Oberfläche und die Decke bleibt stehen.
    const surface = surfaceAt(Math.floor(player.pos.x), Math.floor(player.pos.z));
    const wantCut = player.pos.y + 3 < surface ? Math.floor(player.pos.y) + 4 : HEIGHT + 4;
    state.cut += (wantCut - state.cut) * Math.min(1, dt * 7);
    // Die Ebene darf nie genau auf einer Blockfläche liegen, sonst flimmert
    // der Schnitt. Ein Hauch darunter schneidet sauber zwischen den Blöcken.
    cutPlane.constant = Math.round(state.cut) - 0.03;

    // Grubenlampe an, sobald es dunkel um uns wird. Die Tiefe zaehlt schnell
    // hoch: schon nach ein paar Metern soll es sich nach Untertage anfuehlen.
    const underground = Math.max(0, Math.min(1, (surface - player.pos.y - 1) / 5));
    state.under = underground;
    applyDaytime();
    const night = state.time > 0.78 && state.time < 0.97 ? 1 : 0;
    peek.uPeek.value.set(player.pos.x, player.pos.y + 1.9, player.pos.z);
    lamp.position.set(player.pos.x, player.pos.y + 1.6, player.pos.z);
    lamp.intensity = Math.max(underground, night * 0.6) * 9;

    // Untertage kippt die Graduierung ins Warme, nachts ins Kalte
    const darkU = post.compositeMat.uniforms;
    darkU.uDark.value = Math.max(underground * 0.6, night * 0.55);
    if (underground > night * 0.8) darkU.uDarkTint.value.set(0.78, 0.52, 0.34);
    else darkU.uDarkTint.value.set(0.42, 0.5, 0.78);

    // Sättigung fällt, danach erst das Leben
    state.food -= STARVE * dt;
    if (state.food <= 0) {
      state.food = 0;
      state.hp -= 3.5 * dt;
      if (state.hp <= 0) die('Du bist verhungert.');
    } else if (state.hp < 100 && state.food > 55) {
      state.hp = Math.min(100, state.hp + 1.6 * dt);   // satt heilt langsam
    }

    // Sturzschaden: gezählt wird der höchste Punkt seit dem letzten Bodenkontakt
    if (player.onGround) {
      if (state.fallFrom !== null) {
        const drop = state.fallFrom - player.pos.y;
        if (drop > 4) hurt(Math.round((drop - 4) * 7), 'Zu tief gesprungen.');
        state.fallFrom = null;
      }
    } else {
      state.fallFrom = state.fallFrom === null
        ? player.pos.y : Math.max(state.fallFrom, player.pos.y);
    }

    // Unter Wasser geht die Luft aus
    const head = world.get(Math.floor(player.pos.x), Math.floor(player.pos.y + 1.5),
      Math.floor(player.pos.z));
    if (head === B.wasser) {
      state.breath = (state.breath ?? 12) - dt;
      if (state.breath <= 0) { state.breath = 1.2; hurt(9, 'Ertrunken.'); }
    } else {
      state.breath = 12;
    }

    // Das Höhlenvolk kommt nur im Dunkeln
    const dark = Math.max(state.under, night * 0.8);
    mobs.update(dt, world, player, dark);
    if (state.swingTimer > 0) state.swingTimer -= dt;

    hudTimer -= dt;
    if (hudTimer <= 0) { hudTimer = 0.25; updateHUD(); }
  }

  const want = state.camPos.copy(player.pos).addScaledVector(CAM_DIR, camDist);
  camera.position.lerp(want, 1 - Math.pow(0.002, raw));
  camera.lookAt(player.pos.x, player.pos.y + 1, player.pos.z);
  juice.applyToCamera();

  post.render(scene, camera);
}

/* --------------------------------- Knöpfe --------------------------------- */
const held = { dig: false, down: false };

function bindHold(id, key) {
  const el = document.getElementById(id);
  // Der Zeiger wird festgehalten: sonst reisst der Druck ab, sobald sich der
  // Knopf unter dem Finger auch nur ein bisschen verschiebt.
  const on = (e) => {
    held[key] = true;
    el.classList.add('on');
    el.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };
  const off = (e) => {
    held[key] = false;
    el.classList.remove('on');
    if (e && el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
  };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('lostpointercapture', off);
}
bindHold('digBtn', 'dig');
bindHold('downBtn', 'down');

document.getElementById('buildBtn').addEventListener('click', () => placeBlock('front'));
document.getElementById('upBtn').addEventListener('click', () => {
  // Treppe bauen: Block unter die Füße, dabei selbst hochspringen
  const px = Math.floor(player.pos.x), py = Math.floor(player.pos.y), pz = Math.floor(player.pos.z);
  if (world.get(px, py, pz) !== AIR && world.get(px, py, pz) !== B.wasser) return;
  if (!take(state.selected)) return;
  world.set(px, py, pz, state.selected);
  player.pos.y = py + 1;
  player.vel.y = 0;
  audio.gem(2);
});
document.getElementById('jumpBtn').addEventListener('click', () => player.jump());
document.getElementById('craftBtn').addEventListener('click', () => craft.toggle());

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === ' ') player.jump();
  if (k === 'e') held.dig = true;
  if (k === 'q') held.down = true;
  if (k === 'f') placeBlock('front');
  if (k === 'c') craft.toggle();
  if (k === 'r') eat();
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'e') held.dig = false;
  if (k === 'q') held.down = false;
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

document.getElementById('againBtn').addEventListener('click', () => {
  document.getElementById('dead').classList.add('hidden');
  newRun();
});

document.getElementById('eatBtn').addEventListener('click', eat);

document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

window.__game = { state, player, world, scene, camera, renderer, juice, audio, post, B, BLOCKS, give,
  torchCount: () => torches.size, mobs, eat, hurt };

resize();
applyQuality();

setSeed(20260916);
world.update(0, 0, 25);
player.spawn(world, 0, 0);
camera.position.copy(player.pos).addScaledVector(CAM_DIR, camDist);
camera.lookAt(player.pos);
renderHotbar();
frame();
