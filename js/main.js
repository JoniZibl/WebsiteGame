import * as THREE from 'three';
import { World, heightAt, setSeed, regionName } from './world.js';
import { Input } from './input.js';
import { Player, EnemyManager, ProjectileManager, Particles, Gems, EnemyShots } from './entities.js';
import { TiltShift } from './postfx.js';
import { freshStats, pickThree, applyUpgrade, xpForLevel } from './upgrades.js';

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
renderer.setClearColor('#cdd6ad');

const isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
let quality = isTouch ? 'low' : 'high';

const scene = new THREE.Scene();
scene.background = new THREE.Color('#cdd6ad');
scene.fog = new THREE.Fog('#d3dab4', 62, 150);

const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 320);
const CAM_OFFSET = new THREE.Vector3(0, 33, 25);

const hemi = new THREE.HemisphereLight('#e7ecc9', '#6c7a49', 0.52);
scene.add(hemi);

const sun = new THREE.DirectionalLight('#fff2d2', 1.4);
sun.position.set(26, 42, 16);
scene.add(sun, sun.target);

// Ein einziges warmes Licht wandert zur nächsten Feuerstelle – das reicht,
// damit Lager aus der Ferne einladend glimmen.
const fireLight = new THREE.PointLight('#ffb069', 0, 12, 2);
scene.add(fireLight);

const post = new TiltShift(renderer);
const world = new World(scene, 2);
const input = new Input();
const player = new Player(scene);
const enemies = new EnemyManager(scene);
const arrows = new ProjectileManager(scene);
const shots = new EnemyShots(scene);
const gems = new Gems(scene);
const fx = new Particles(scene);

/* ------------------------------ Bildschirm ------------------------------- */
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const cap = quality === 'high' ? 2 : 1.5;
  const pr = Math.min(devicePixelRatio || 1, cap);
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  post.setSize(w, h, pr, quality === 'high' ? 4 : 2);
  // im Hochformat ist das scharfe Band etwas breiter, sonst verschwindet zu viel Spielfeld
  post.compositeMat.uniforms.uBand.value = h > w ? 0.2 : 0.16;
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
  post.iterations = high ? 2 : 1;
  document.getElementById('qualityBtn').classList.toggle('off', !high);
  resize();
}

/* --------------------------------- Spiel --------------------------------- */
const state = {
  running: false,
  paused: false,          // während der Upgrade-Wahl
  score: 0,
  idleTime: 0,
  fireTimer: 0,
  resting: false,
  camPos: new THREE.Vector3(),
};

let stats = freshStats();

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
  player.hpMax = 100;
  player.hp = 100;
  enemies.reset();
  arrows.reset();
  shots.reset();
  gems.reset();
  fx.reset();
  stats = freshStats();
  state.score = 0;
  state.idleTime = 0;
  state.fireTimer = 0;
  state.paused = false;
  document.getElementById('levelup').classList.add('hidden');

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
  fx.burst(player.pos, '#df8a5c', 5);
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
  stats.xp += 1;
  if (stats.xp >= stats.xpNeed) levelUp();
}

function onShotHit(damage) {
  fx.burst(player.pos, '#8a4a33', 5);
  if (player.hurt(damage)) gameOver();
}

/* ------------------------- Stufenaufstieg ------------------------------- */
const cardsEl = document.getElementById('cards');
const levelupEl = document.getElementById('levelup');

function levelUp() {
  stats.xp -= stats.xpNeed;
  stats.level += 1;
  stats.xpNeed = xpForLevel(stats.level);
  enemies.tough = stats.level - 1;

  document.getElementById('levelTitle').textContent = 'Stufe ' + stats.level;
  cardsEl.replaceChildren();
  for (const up of pickThree(stats)) {
    const taken = stats.taken[up.id] || 0;
    const btn = document.createElement('button');
    btn.className = 'upgrade';
    btn.innerHTML =
      `<span class="ic">${up.icon}</span><span><b>${up.title}</b><small>${up.text}</small></span>` +
      (up.max < 99 ? `<span class="lvl">${taken}/${up.max}</span>` : '');
    btn.addEventListener('click', () => {
      applyUpgrade(up, stats, player);
      levelupEl.classList.add('hidden');
      state.paused = false;
      updateHUD(true);
    }, { once: true });
    cardsEl.append(btn);
  }
  state.paused = true;
  levelupEl.classList.remove('hidden');
}

function gameOver() {
  state.running = false;
  document.getElementById('deadScore').textContent = state.score + ' 💎';
  document.getElementById('deadLevel').textContent = 'Stufe ' + stats.level + ' erreicht';
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

  const target = enemies.nearest(player.pos, stats.range);
  if (!target) return;

  player.aimAt(target.pos.x, target.pos.z);
  state.fireTimer -= dt;
  if (state.fireTimer <= 0) {
    state.fireTimer = stats.fireRate;
    arrows.damage = stats.damage;
    const dx = target.pos.x - player.pos.x, dz = target.pos.z - player.pos.z;
    const base = Math.atan2(dx, dz);
    for (let i = 0; i < stats.arrows; i++) {
      const a = base + (i - (stats.arrows - 1) / 2) * stats.spread;
      arrows.fire(player.pos, Math.sin(a), Math.cos(a), stats.pierce);
    }
    player.bow.rotation.z = player.bowRest + 0.5;   // kleines Zucken beim Schuss
  }
}

/* --------------------------------- HUD ----------------------------------- */
const hpFill = document.getElementById('hpFill');
const hpText = document.getElementById('hpText');
const scoreEl = document.getElementById('score');
const areaEl = document.getElementById('area');
const xpFill = document.getElementById('xpFill');
const xpText = document.getElementById('xpText');
const restEl = document.getElementById('rest');
let hudTimer = 0;

function updateHUD(force) {
  hpFill.style.transform = `scaleX(${player.hp / player.hpMax})`;
  hpText.textContent = Math.ceil(player.hp);
  xpFill.style.transform = `scaleX(${Math.min(1, stats.xp / stats.xpNeed)})`;
  xpText.textContent = 'Stufe ' + stats.level;
  scoreEl.textContent = state.score;
  areaEl.textContent = regionName(player.pos.x, player.pos.z);
  restEl.classList.toggle('hidden', !state.resting);
  if (force) hudTimer = 0;
}

/* -------------------------------- Schleife -------------------------------- */
const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 1 / 20);

  if (state.running && !state.paused) {
    const move = input.read();
    player.update(dt, move, world);
    combat(dt);
    enemies.update(dt, player, world, onPlayerHit, shots);

    // Lagerfeuer: in der Nähe erholt man sich spürbar
    const fire = world.nearestFire(player.pos, 34);
    if (fire) {
      const d = Math.hypot(fire.x - player.pos.x, fire.z - player.pos.z);
      fireLight.position.set(fire.x, fire.y + 1.1, fire.z);
      fireLight.intensity = 2.4 + Math.sin(state.idleTime * 9 + fire.x) * 0.4;
      state.resting = d < 4.2;
      if (state.resting) player.hp = Math.min(player.hpMax, player.hp + 16 * dt);
    } else {
      fireLight.intensity = 0;
      state.resting = false;
    }
    arrows.update(dt, enemies, onKill);
    shots.update(dt, player, onShotHit);
    gems.update(dt, player, onCollect, stats.magnet);
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

  post.render(scene, camera);
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
window.__game = { state, player, enemies, arrows, shots, gems, world, renderer, scene, camera, sun, post,
  get stats() { return stats; }, levelUp };

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
