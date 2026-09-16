import * as THREE from 'three';
import { World, heightAt, setSeed, regionName, THINGS, PALETTE, WATER_LEVEL, CHUNK } from './world.js';
import { Creature, Beings, KINDS } from './creatures.js';
import { Input } from './input.js';
import { TiltShift } from './postfx.js';
import { GameAudio } from './audio.js';
import { Juice } from './juice.js';

/* ==========================================================================
 *  MAMPF — du frisst, was kleiner ist als du, und wirst dabei größer.
 *  Die Kamera weicht zurück, je größer du wirst: Die Welt schrumpft zum
 *  Modell. Das ist die Aussage des Spiels, und es ist zugleich die Mechanik.
 * ========================================================================== */

const canvas = document.getElementById('scene');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  document.body.innerHTML =
    '<div class="overlay"><div class="card"><h1>Kein WebGL</h1>' +
    '<p class="sub">Dieser Browser kann keine 3D-Grafik anzeigen.</p></div></div>';
  throw err;
}

const isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
let quality = isTouch ? 'low' : 'high';

const scene = new THREE.Scene();
scene.background = new THREE.Color('#cfe4ea');
scene.fog = new THREE.Fog('#cfe4ea', 60, 150);

const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 900);
const CAM_DIR = new THREE.Vector3(0, 29, 30).normalize();
const CAM_BASE = 42;

const hemi = new THREE.HemisphereLight('#ffffff', '#7ba659', 0.78);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff3d8', 1.25);
sun.position.set(30, 46, 18);
scene.add(sun, sun.target);

const post = new TiltShift(renderer);
const world = new World(scene, 2);
const input = new Input();
const player = new Creature(scene);
const beings = new Beings(scene);
const audio = new GameAudio();
const juice = new Juice(scene, camera);

/* ------------------------------ Rangstufen -------------------------------- */
const RANKS = [
  { at: 0.00, name: 'Käfer', icon: '🐛' },
  { at: 0.80, name: 'Huhn', icon: '🐔' },
  { at: 1.40, name: 'Schaf', icon: '🐑' },
  { at: 2.20, name: 'Schwein', icon: '🐖' },
  { at: 3.20, name: 'Dorfbewohner', icon: '🧍' },
  { at: 4.40, name: 'Bauer', icon: '🧔' },
  { at: 6.00, name: 'Hütte', icon: '🛖' },
  { at: 8.00, name: 'Haus', icon: '🏠' },
  { at: 11.0, name: 'Ritter', icon: '🛡️' },
  { at: 14.0, name: 'Turm', icon: '🗼' },
  { at: 18.0, name: 'Turmwächter', icon: '🗿' },
  { at: 24.0, name: 'Hügel', icon: '⛰️' },
];

function rankFor(size) {
  let i = 0;
  while (i < RANKS.length - 1 && RANKS[i + 1].at <= size) i++;
  return { cur: RANKS[i], next: RANKS[i + 1] || null, index: i };
}

const ENDE_GROESSE = 24;

/* -------------------------------- Zustand --------------------------------- */
const state = {
  running: false,
  paused: false,
  eaten: 0,
  best: 0,
  rankIndex: 0,
  intro: 0,
  ending: 0,          // 0 = läuft, 1 = alles leer, 2 = Entscheidung gefallen
  sprout: null,
  sproutTimer: 0,
  camPos: new THREE.Vector3(),
};

try { state.best = Number(localStorage.getItem('mampf-best')) || 0; } catch (err) { /* egal */ }

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
  post.compositeMat.uniforms.uBand.value = h > w ? 0.19 : 0.15;
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
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
  }
  post.iterations = high ? 2 : 1;
  document.getElementById('qualityBtn').classList.toggle('off', !high);
  resize();
}

/** Alles skaliert mit der Größe: Kamera, Nebel, Schattenkasten. */
function scaleWorldToSize() {
  const f = 0.78 + Math.pow(player.size, 0.72) * 0.40;
  state.camDist = CAM_BASE * f;
  scene.fog.near = 40 * f;
  scene.fog.far = 118 * f;
  camera.far = 340 * f;
  camera.updateProjectionMatrix();
  if (sun.castShadow) {
    const c = sun.shadow.camera;
    const r = 58 * f;
    c.left = -r; c.right = r; c.top = r; c.bottom = -r; c.near = 1; c.far = 240 * f;
    c.updateProjectionMatrix();
  }
  sun.position.set(player.pos.x + 30 * f, player.pos.y + 46 * f, player.pos.z + 18 * f);
  sun.target.position.copy(player.pos);
  sun.target.updateMatrixWorld();
}

/* --------------------------------- HUD ------------------------------------ */
const rankIcon = document.getElementById('rankIcon');
const rankName = document.getElementById('rankName');
const nextName = document.getElementById('nextName');
const growFill = document.getElementById('growFill');
const sizeText = document.getElementById('sizeText');
const areaEl = document.getElementById('area');
let hudTimer = 0;

function updateHUD(force) {
  const { cur, next, index } = rankFor(player.size);
  rankIcon.textContent = cur.icon;
  rankName.textContent = cur.name;
  if (next) {
    const span = next.at - cur.at;
    growFill.style.transform = `scaleX(${Math.max(0, Math.min(1, (player.size - cur.at) / span))})`;
    nextName.textContent = `${next.icon} ${next.name}`;
  } else {
    growFill.style.transform = 'scaleX(1)';
    nextName.textContent = 'alles';
  }
  sizeText.textContent = player.size.toFixed(1) + '×';
  areaEl.textContent = regionName(player.pos.x, player.pos.z);

  if (index !== state.rankIndex) {
    state.rankIndex = index;
    onRankUp(cur);
  }
  if (force) hudTimer = 0;
}

function onRankUp(rank) {
  audio.levelUp();
  juice.freeze(0.1);
  juice.shake(0.9);
  juice.ring(player.pos, 6 + player.size, '#ffe9a8', 0.8);
  juice.popup(player.pos, `${rank.icon} ${rank.name}!`, '#ffe9a8');
  const banner = document.getElementById('rankBanner');
  banner.textContent = `Jetzt so groß wie: ${rank.icon} ${rank.name}`;
  banner.classList.remove('hidden');
  clearTimeout(onRankUp.timer);
  onRankUp.timer = setTimeout(() => banner.classList.add('hidden'), 2200);
}

/* -------------------------------- Fressen --------------------------------- */
function tryEat() {
  const reach = player.reach;

  // Dinge in der Welt
  for (const { chunk, thing } of world.nearbyThings(player.pos, reach + 4)) {
    const def = THINGS[thing.kind];
    if (player.size < def.size) continue;
    const d = Math.hypot(thing.x - player.pos.x, thing.z - player.pos.z);
    if (d > reach + thing.r) continue;

    world.eat(chunk, thing);
    devour(def.label, def.food, { x: thing.x, y: thing.y + 0.5, z: thing.z }, colorOf(thing.kind));
  }

  // Lebendiges
  for (const b of beings.living) {
    if (player.size < b.size) continue;
    const d = Math.hypot(b.pos.x - player.pos.x, b.pos.z - player.pos.z);
    if (d > reach + b.size * 0.4) continue;
    b.devour();
    devour(b.def.label, b.def.food, { x: b.pos.x, y: b.pos.y + b.def.h * 0.5, z: b.pos.z },
           new THREE.Color(b.def.body).getHex());
  }
}

function colorOf(kind) {
  if (kind === 'baum' || kind === 'busch') return PALETTE.laub1.getHex();
  if (kind === 'haus' || kind === 'hütte' || kind === 'turm') return PALETTE.ziegel.getHex();
  return PALETTE.holz.getHex();
}

function devour(label, food, pos, color) {
  player.swallow(food, color);
  state.eaten += 1;
  audio.chomp(food);
  juice.freeze(0.04 + Math.min(0.09, food * 0.01));
  juice.shake(0.25 + Math.min(0.9, food * 0.06));
  juice.ring(pos, 1.5 + food * 0.3, '#ffe9a8', 0.35);
  juice.popup(pos, label, '#ffe9a8');
  updateHUD(true);
}

function onHitByHunter(being) {
  player.hurt(being.def.damage);
  audio.hurt();
  juice.freeze(0.07);
  juice.shake(1.1);
  juice.popup(player.pos, `Aua! ${being.def.label}`, '#ff8f6a');
  if (player.size <= 0.36) gameOver();
}

/* --------------------------------- Ende ----------------------------------- */
const sproutMat = new THREE.MeshLambertMaterial({ color: '#8ad76a', flatShading: true });

function startEnding() {
  state.ending = 1;
  beings.reset();
  world.strip();                  // nichts bleibt stehen
  audio.setMuffled(true);
  juice.freeze(0.2);
  juice.shake(1.6);
  juice.ring(player.pos, 40, '#e8dcbf', 1.2);

  const g = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.4, 0.5), sproutMat);
  stem.position.y = 1.2;
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 1.2), sproutMat);
  leaf.position.y = 2.4;
  g.add(stem, leaf);
  // weit genug weg, dass ein Riese ihn nicht aus Versehen verschluckt
  const d = player.reach * 2.2 + 18;
  const a = player.facing + Math.PI * 0.6;
  const sx = player.pos.x + Math.cos(a) * d;
  const sz = player.pos.z + Math.sin(a) * d;
  g.position.set(sx, heightAt(sx, sz), sz);
  g.scale.setScalar(1 + player.size * 0.25);   // damit man ihn überhaupt sieht
  scene.add(g);
  state.sprout = g;
  state.sproutTimer = 0;

  const banner = document.getElementById('rankBanner');
  banner.textContent = 'Nichts mehr übrig. Nur noch ein Keim.';
  banner.classList.remove('hidden');
  setTimeout(() => {
    if (state.ending !== 1) return;
    banner.textContent = 'Du könntest auch einfach stehen bleiben.';
  }, 4500);
}

function finishEnding(ate) {
  state.ending = 2;
  state.running = false;
  document.getElementById('rankBanner').classList.add('hidden');
  const card = document.getElementById('endCard');
  card.querySelector('h1').textContent = ate ? 'Satt.' : 'Genug.';
  card.querySelector('.sub').textContent = ate
    ? 'Du hast alles gefressen, auch das Letzte. Es ist sehr still geworden.'
    : 'Du hast den Keim stehen lassen. Langsam wächst wieder etwas — ohne dich.';
  document.getElementById('endStats').textContent =
    `${state.eaten} Dinge verschlungen · Endgröße ${player.size.toFixed(1)}×`;
  document.getElementById('end').classList.remove('hidden');
  audio.setMuffled(false);
  if (ate) audio.hurt(); else audio.levelUp();
}

function gameOver() {
  state.running = false;
  document.getElementById('deadStats').textContent =
    `${state.eaten} Dinge verschlungen · Größe ${player.size.toFixed(1)}×`;
  document.getElementById('dead').classList.remove('hidden');
}

/* ------------------------------- Neuer Lauf ------------------------------- */
function newRun() {
  setSeed((Math.random() * 1e9) | 0);
  for (const [k, c] of [...world.chunks]) world.disposeChunk(k, c);
  world.queue.length = 0;
  world.barren = false;

  player.reset();
  beings.reset();
  juice.reset();

  if (state.sprout) { scene.remove(state.sprout); state.sprout = null; }
  state.eaten = 0;
  state.rankIndex = 0;
  state.ending = 0;
  state.paused = false;
  audio.setMuffled(false);

  document.getElementById('dead').classList.add('hidden');
  document.getElementById('end').classList.add('hidden');

  world.update(player.pos.x, player.pos.z, 40);
  player.pos.y = heightAt(player.pos.x, player.pos.z);
  scaleWorldToSize();
  state.camPos.copy(player.pos).addScaledVector(CAM_DIR, state.camDist);
  camera.position.copy(state.camPos);
  camera.lookAt(player.pos);

  // Kaltstart: die Kamera fällt ein, drei Hühner stehen schon da
  state.intro = 1.4;
  juice.ring(player.pos, 4, '#ffe9a8', 0.7);
  juice.popup(player.pos, 'Hunger!', '#ffe9a8');
  for (let i = 0; i < 3; i++) {
    const a = Math.random() * 6.28, d = 5 + Math.random() * 4;
    const free = beings.pool.find((b) => !b.alive);
    free?.spawn('huhn', player.pos.x + Math.cos(a) * d, player.pos.z + Math.sin(a) * d);
  }

  updateHUD(true);
  state.running = true;
}

/* -------------------------------- Schleife -------------------------------- */
const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const raw = Math.min(clock.getDelta(), 1 / 20);
  const dt = juice.update(raw);

  if (state.running && !state.paused) {
    const move = input.read();
    player.update(dt, move, world);
    // Wonach schaut das Wesen gerade? Die nächste fressbare Sache.
    let look = null, lookD = 26 * 26;
    for (const b of beings.living) {
      const d = (b.pos.x - player.pos.x) ** 2 + (b.pos.z - player.pos.z) ** 2;
      if (d < lookD) { lookD = d; look = b.pos; }
    }
    player.lookAt = look;

    if (state.ending === 0) tryEat();
    beings.update(dt, player, world, onHitByHunter);
    world.update(player.pos.x, player.pos.z, 1);
    scaleWorldToSize();
    audio.ambient(dt);

    if (player.size > state.best) {
      state.best = player.size;
      try { localStorage.setItem('mampf-best', String(state.best)); } catch (err) { /* egal */ }
    }

    if (state.ending === 0 && player.size >= ENDE_GROESSE) startEnding();

    if (state.ending === 1 && state.sprout) {
      const d = Math.hypot(state.sprout.position.x - player.pos.x, state.sprout.position.z - player.pos.z);
      state.sprout.rotation.y += dt * 0.6;
      state.sprout.position.y = heightAt(state.sprout.position.x, state.sprout.position.z)
        + Math.sin(performance.now() * 0.002) * 0.2;

      if (d < player.reach + 2) {
        // Hingehen und fressen: das laute Ende
        scene.remove(state.sprout);
        state.sprout = null;
        finishEnding(true);
      } else if (!move.active) {
        // Aufhören: das leise Ende. Man muss dafür wirklich nichts tun.
        state.sproutTimer += dt;
        if (state.sproutTimer > 6) finishEnding(false);
      } else {
        state.sproutTimer = Math.max(0, state.sproutTimer - dt * 2);
      }
    }

    hudTimer -= dt;
    if (hudTimer <= 0) { hudTimer = 0.15; updateHUD(); }
  }

  // Kamera: weicht mit der Größe zurück, die Welt wird zum Modell
  const want = state.camPos.copy(player.pos).addScaledVector(CAM_DIR, state.camDist || CAM_BASE);
  if (state.intro > 0) {
    state.intro = Math.max(0, state.intro - raw);
    const k = state.intro / 1.4;
    want.addScaledVector(CAM_DIR, k * k * 90);
  }
  camera.position.lerp(want, 1 - Math.pow(state.intro > 0 ? 0.03 : 0.002, raw));
  camera.lookAt(player.pos.x, player.pos.y + player.size * 0.6, player.pos.z);
  juice.applyToCamera();

  post.render(scene, camera);
}

/* --------------------------------- Menüs ---------------------------------- */
const soundBtn = document.getElementById('soundBtn');
let muted = false;
try { muted = localStorage.getItem('mampf-muted') === '1'; } catch (err) { /* egal */ }
audio.setMuted(muted);
soundBtn.textContent = muted ? '🔇' : '🔊';

soundBtn.addEventListener('click', () => {
  muted = !muted;
  audio.unlock();
  audio.setMuted(muted);
  soundBtn.textContent = muted ? '🔇' : '🔊';
  try { localStorage.setItem('mampf-muted', muted ? '1' : '0'); } catch (err) { /* egal */ }
});

document.getElementById('qualityBtn').addEventListener('click', () => {
  quality = quality === 'high' ? 'low' : 'high';
  applyQuality();
});

for (const id of ['startBtn', 'againBtn', 'endAgainBtn']) {
  document.getElementById(id).addEventListener('click', () => {
    audio.unlock();
    document.getElementById('start').classList.add('hidden');
    newRun();
  });
}

document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

window.__game = { state, player, beings, world, juice, audio, renderer, scene, camera, post, rankFor };

resize();
applyQuality();

// Vorschau hinter dem Startbild
setSeed(20260916);
player.reset();
world.update(player.pos.x, player.pos.z, 30);
scaleWorldToSize();
camera.position.copy(player.pos).addScaledVector(CAM_DIR, state.camDist);
camera.lookAt(player.pos);
document.getElementById('startBest').textContent =
  state.best > 0.6 ? `Bisher größte Größe: ${state.best.toFixed(1)}×` : '';
frame();
