import * as THREE from 'three';
import { World, CHUNK, heightAt, setSeed } from './world.js';
import { Input } from './input.js';
import { Player, EnemyManager, ProjectileManager, Particles, Gems } from './entities.js';

/* --------------------------------- Setup --------------------------------- */
const canvas = document.getElementById('scene');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  document.body.innerHTML =
    '<div id="fatal" class="overlay"><div class="card"><h1>Kein WebGL</h1>' +
    '<p class="sub">Dieser Browser kann leider keine 3D-Grafik anzeigen. ' +
    'Auf dem Handy hilft meist Chrome oder Safari in einem normalen Tab.</p></div></div>';
  throw err;
}
renderer.setClearColor('#a9dbd4');

const isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
let quality = isTouch ? 'low' : 'high';

const scene = new THREE.Scene();
scene.background = new THREE.Color('#a9dbd4');
scene.fog = new THREE.Fog('#a9dbd4', 58, 140);

const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 320);
const CAM_OFFSET = new THREE.Vector3(0, 33, 25);

const hemi = new THREE.HemisphereLight('#dff3ec', '#7aa891', 0.62);
scene.add(hemi);

const sun = new THREE.DirectionalLight('#fff4dc', 1.25);
sun.position.set(26, 42, 16);
scene.add(sun, sun.target);

const world = new World(scene, 2);
const input = new Input();
const player = new Player(scene);
const enemies = new EnemyManager(scene);
const arrows = new ProjectileManager(scene);
const gems = new Gems(scene);
const fx = new Particles(scene);

/* ------------------------------ Bildschirm ------------------------------- */
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const cap = quality === 'high' ? 2 : 1.5;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, cap));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // im Hochformat etwas weiter rauszoomen, damit man genug Umgebung sieht
  camera.fov = h > w ? 48 : 40;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 150));

function applyQuality() {
  const high = quality === 'high';
  renderer.shadowMap.enabled = high;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  sun.castShadow = high;
  if (high) {
    sun.shadow.mapSize.set(1024, 1024);
    const c = sun.shadow.camera;
    c.left = -34; c.right = 34; c.top = 34; c.bottom = -34; c.near = 1; c.far = 120;
    c.updateProjectionMatrix();
  }
  world.setShadows(high);
  document.getElementById('qualityBtn').classList.toggle('off', !high);
  resize();
}

/* --------------------------------- Spiel --------------------------------- */
const state = {
  running: false,
  score: 0,
  idleTime: 0,
  fireTimer: 0,
  fireRate: 0.42,
  camPos: new THREE.Vector3(),
  started: false,
};

const hintEl = document.getElementById('hint');
let hintTimer = null;
function showHint() {
  hintEl.classList.remove('hidden');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => hintEl.classList.add('hidden'), 6000);
}

function newRun() {
  setSeed((Math.random() * 1e9) | 0);
  for (const [k, c] of [...world.chunks]) world.disposeChunk(k, c);
  world.queue.length = 0;

  player.reset();
  enemies.reset();
  arrows.reset();
  gems.reset();
  fx.reset();
  state.score = 0;
  state.idleTime = 0;
  state.fireTimer = 0;

  world.update(player.pos.x, player.pos.z, 60);   // Startgebiet sofort bauen
  player.pos.y = heightAt(player.pos.x, player.pos.z);
  state.camPos.copy(player.pos).add(CAM_OFFSET);
  camera.position.copy(state.camPos);
  camera.lookAt(player.pos.x, player.pos.y + 1.2, player.pos.z);
  updateHUD(true);
  state.running = true;
  showHint();
}

function onPlayerHit(enemy) {
  const dead = player.hurt(enemy.damage);
  fx.burst(player.pos, '#ef8a72', 5);
  // kleiner Rückstoß für den Gegner
  const dx = enemy.pos.x - player.pos.x, dz = enemy.pos.z - player.pos.z;
  const d = Math.hypot(dx, dz) || 1;
  enemy.pos.x += (dx / d) * 1.2;
  enemy.pos.z += (dz / d) * 1.2;
  if (dead) gameOver();
}

function onKill(enemy) {
  fx.burst(enemy.pos, enemy.mat.color.getHex(), 9);
  gems.drop(enemy.pos);
}

function onCollect() {
  state.score += 1;
}

function gameOver() {
  state.running = false;
  document.getElementById('deadScore').textContent = state.score + ' 💎';
  document.getElementById('dead').classList.remove('hidden');
}

/* ------------------------------ Kampf-Logik ------------------------------ */
// Archero-Regel: laufen ODER schießen. Wer stehen bleibt, zielt automatisch.
function combat(dt) {
  const moving = player.moving;
  if (moving) {
    state.idleTime = 0;
    state.fireTimer = 0.18;                 // kurze Ausholzeit nach dem Stehenbleiben
    return;
  }
  state.idleTime += dt;
  if (state.idleTime < 0.1) return;

  const target = enemies.nearest(player.pos, 17);
  if (!target) return;

  player.aimAt(target.pos.x, target.pos.z);
  state.fireTimer -= dt;
  if (state.fireTimer <= 0) {
    state.fireTimer = state.fireRate;
    arrows.fire(player.pos, target.pos.x - player.pos.x, target.pos.z - player.pos.z);
    player.bow.rotation.z = player.bowRest + 0.5;   // kleines Zucken beim Schuss
  }
}

/* --------------------------------- HUD ----------------------------------- */
const hpFill = document.getElementById('hpFill');
const hpText = document.getElementById('hpText');
const scoreEl = document.getElementById('score');
const areaEl = document.getElementById('area');
let hudTimer = 0;

function updateHUD(force) {
  const pct = player.hp / player.hpMax;
  hpFill.style.transform = `scaleX(${pct})`;
  hpText.textContent = Math.ceil(player.hp);
  scoreEl.textContent = state.score;
  areaEl.textContent = `${Math.floor(player.pos.x / CHUNK)}, ${Math.floor(player.pos.z / CHUNK)}`;
  if (force) hudTimer = 0;
}

/* -------------------------------- Schleife -------------------------------- */
const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 1 / 20);

  if (state.running) {
    const move = input.read();
    player.update(dt, move, world);
    combat(dt);
    enemies.update(dt, player, world, onPlayerHit);
    arrows.update(dt, enemies, onKill);
    gems.update(dt, player, onCollect);
    fx.update(dt);
    player.bow.rotation.z += (player.bowRest - player.bow.rotation.z) * Math.min(1, dt * 10);

    world.update(player.pos.x, player.pos.z, 1);   // höchstens ein Chunk pro Frame

    hudTimer -= dt;
    if (hudTimer <= 0) { hudTimer = 0.1; updateHUD(); }
  }

  // Kamera folgt weich und bleibt in der Top-Down-Perspektive
  const want = state.camPos.copy(player.pos).add(CAM_OFFSET);
  camera.position.lerp(want, 1 - Math.pow(0.0015, dt));
  camera.lookAt(player.pos.x, player.pos.y + 1.1, player.pos.z);

  sun.position.set(player.pos.x + 26, player.pos.y + 42, player.pos.z + 16);
  sun.target.position.copy(player.pos);
  sun.target.updateMatrixWorld();

  renderer.render(scene, camera);
}

/* --------------------------------- Menüs --------------------------------- */
document.getElementById('startBtn').addEventListener('click', () => {
  document.getElementById('start').classList.add('hidden');
  newRun();
});

document.getElementById('againBtn').addEventListener('click', () => {
  document.getElementById('dead').classList.add('hidden');
  newRun();
});

document.getElementById('qualityBtn').addEventListener('click', () => {
  quality = quality === 'high' ? 'low' : 'high';
  applyQuality();
});

// Kleiner Debug-Zugang (auch praktisch für automatisierte Tests)
window.__game = { state, player, enemies, arrows, gems, world, renderer, scene, camera, sun };

document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

resize();
applyQuality();

// Vorschau hinter dem Startmenü, damit sofort etwas Hübsches zu sehen ist
setSeed(20260915);
player.reset();
world.update(player.pos.x, player.pos.z, 60);
camera.position.copy(player.pos).add(CAM_OFFSET);
camera.lookAt(player.pos.x, player.pos.y + 1.1, player.pos.z);
frame();
