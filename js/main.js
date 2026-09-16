import * as THREE from 'three';
import { World, heightAt, setSeed, regionName, windTime, NODE_KINDS, WATER_LEVEL, setLitZones } from './world.js';
import { Input } from './input.js';
import { Player, EnemyManager, ProjectileManager, Particles, Gems, EnemyShots, Boss } from './entities.js';
import { TiltShift } from './postfx.js';
import { freshStats, pickThree, applyUpgrade, xpForLevel } from './upgrades.js';
import { GameAudio } from './audio.js';
import { Villagers } from './villagers.js';
import { Critters } from './critters.js';
import * as Save from './save.js';
import { Camp, BUILDINGS, canAfford, payFor, costText } from './camp.js';
import { Juice } from './juice.js';

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
renderer.setClearColor('#ece0c0');

const isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
let quality = isTouch ? 'low' : 'high';

const scene = new THREE.Scene();
scene.background = new THREE.Color('#ece0c0');
scene.fog = new THREE.Fog('#ece0c0', 54, 132);

const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 320);
const CAM_OFFSET = new THREE.Vector3(0, 29, 30);

const hemi = new THREE.HemisphereLight('#fff6e4', '#9dc178', 0.8);
scene.add(hemi);

const sun = new THREE.DirectionalLight('#fff6e2', 1.2);
sun.position.set(26, 42, 16);
scene.add(sun, sun.target);

// Ein einziges warmes Licht wandert zur nächsten Feuerstelle – das reicht,
// damit Lager aus der Ferne einladend glimmen.
const fireLight = new THREE.PointLight('#ffb069', 0, 12, 2);
scene.add(fireLight);

// Das Licht der Laterne — es wandert mit der Figur und folgt ihrer Flamme.
const lantern = new THREE.PointLight('#ffc06a', 0, 22, 2);
scene.add(lantern);

const post = new TiltShift(renderer);
const world = new World(scene, 2);
const input = new Input();
const player = new Player(scene);
const enemies = new EnemyManager(scene);
const arrows = new ProjectileManager(scene);
const shots = new EnemyShots(scene);
const gems = new Gems(scene);
const boss = new Boss(scene);
const fx = new Particles(scene);
const audio = new GameAudio();
const juice = new Juice(scene, camera);
const villagers = new Villagers(scene);
const critters = new Critters(scene);
const saveData = Save.load();
const camp = new Camp(scene);
world.extraColliders = camp.colliders;

/* ------------------------------ Bildschirm ------------------------------- */
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const cap = quality === 'high' ? 2 : 1.5;
  const pr = Math.min(devicePixelRatio || 1, cap);
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  post.setSize(w, h, pr, quality === 'high' ? 4 : 2);
  // im Hochformat ist das scharfe Band etwas breiter, sonst verschwindet zu viel Spielfeld
  post.compositeMat.uniforms.uBand.value = h > w ? 0.17 : 0.13;
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
    // Die Schattenkarte muss den ganzen sichtbaren Bereich abdecken, sonst
    // zeichnet sich ihre Kante als dunkler Streifen in die Wiese.
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.035;
    const c = sun.shadow.camera;
    c.left = -62; c.right = 62; c.top = 62; c.bottom = -62; c.near = 1; c.far = 190;
    c.updateProjectionMatrix();
  }
  world.setShadows(high);
  post.iterations = high ? 2 : 1;
  document.getElementById('qualityBtn').classList.toggle('off', !high);
  resize();
}

/* ------------------------------------------------------------------------- */
/*  Lichtkarte: wie hell ist es an einer Stelle?                              */
/*  Tageslicht + jedes Feuer + die eigene Laterne. Sie entscheidet über        */
/*  Farbe, Nebel, wie viele Schatten kommen und ob sie zerfallen.              */
/* ------------------------------------------------------------------------- */
function daylight(t) {
  // 0 tief in der Nacht, 1 am hellen Tag
  if (t < 0.12) return 0.25 + (t / 0.12) * 0.6;
  if (t < 0.6) return 1;
  if (t < 0.72) return 1 - (t - 0.6) / 0.12 * 0.75;
  if (t < 0.9) return 0.2;
  return 0.2 + (t - 0.9) / 0.1 * 0.65;
}

function fireGlow(pos, x, z, reach) {
  const d = Math.hypot(pos.x - x, pos.z - z);
  return Math.max(0, 1 - d / reach);
}

/**
 * Echtes Feuerlicht an einer Stelle, 0..1 — ohne Tageslicht.
 * Daran hängen die Spielregeln: Schatten zerfallen darin, und sie meiden es.
 * Die eigene Laterne zählt nur zur Hälfte: allein reicht sie nie ganz aus.
 */
function placeLightAt(pos) {
  let light = 0;
  for (const it of camp.items) {
    const def = BUILDINGS[it.type];
    if (!def.light || !camp.burning(it)) continue;
    light += fireGlow(pos, it.x, it.z, def.reach) * def.light * 0.95 * (0.35 + it.fuel * 0.65);
  }

  const wf = world.nearestFire(pos, 22);
  if (wf) light += fireGlow(pos, wf.x, wf.z, 22) * 0.75;

  return Math.min(1, light);
}

/** Feuerlicht inklusive der eigenen Laterne — daran zerfallen die Schatten. */
function fireLightAt(pos) {
  const dp = Math.hypot(pos.x - player.pos.x, pos.z - player.pos.z);
  return Math.min(1, placeLightAt(pos) + Math.max(0, 1 - dp / 7) * player.flame * 0.45);
}

/**
 * Wie hell die Welt hier wirkt: Tageslicht plus Feuer plus ein wenig eigene
 * Laterne. Daran hängen Farbe, Nebel und wie schnell die Laterne zehrt.
 */
function ambientAt(pos) {
  const dp = Math.hypot(pos.x - player.pos.x, pos.z - player.pos.z);
  const own = Math.max(0, 1 - dp / 10) * player.flame * 0.16;
  return Math.min(1, state.day * 0.95 + placeLightAt(pos) * 0.85 + own);
}

/* --------------------------------- Spiel --------------------------------- */
/* ------------------------------------------------------------------------- */
/*  Tageszeit: ein voller Umlauf dauert gut fünf Minuten                       */
/* ------------------------------------------------------------------------- */
const DAY_LENGTH = 320;   // Sekunden

const SKY_KEYS = [
  { t: 0.00, sky: '#f6d9ac', sun: '#ffcd96', sunI: 0.75, hemi: 0.68, name: 'Morgen', icon: '🌅' },
  { t: 0.18, sky: '#ece0c0', sun: '#fff6e2', sunI: 1.20, hemi: 0.80, name: 'Tag',    icon: '☀️' },
  { t: 0.52, sky: '#ece0c0', sun: '#fff6e2', sunI: 1.20, hemi: 0.80, name: 'Tag',    icon: '☀️' },
  { t: 0.66, sky: '#f0c091', sun: '#ffa472', sunI: 0.95, hemi: 0.70, name: 'Abend',  icon: '🌇' },
  { t: 0.78, sky: '#4e5c78', sun: '#93aad2', sunI: 0.28, hemi: 0.48, name: 'Nacht',  icon: '🌙' },
  { t: 0.94, sky: '#4e5c78', sun: '#93aad2', sunI: 0.28, hemi: 0.48, name: 'Nacht',  icon: '🌙' },
  { t: 1.00, sky: '#f6d9ac', sun: '#ffcd96', sunI: 0.75, hemi: 0.68, name: 'Morgen', icon: '🌅' },
];

const skyA = new THREE.Color();
const skyB = new THREE.Color();
const sunA = new THREE.Color();

function applyDaytime(t) {
  let i = 0;
  while (i < SKY_KEYS.length - 2 && SKY_KEYS[i + 1].t <= t) i++;
  const a = SKY_KEYS[i], b = SKY_KEYS[i + 1];
  const k = (t - a.t) / (b.t - a.t);

  skyA.set(a.sky); skyB.set(b.sky);
  skyA.lerp(skyB, k);
  scene.background.copy(skyA);
  scene.fog.color.copy(skyA);
  renderer.setClearColor(skyA);

  sunA.set(a.sun); skyB.set(b.sun);
  sun.color.copy(sunA.lerp(skyB, k));
  sun.intensity = a.sunI + (b.sunI - a.sunI) * k;
  hemi.intensity = a.hemi + (b.hemi - a.hemi) * k;

  // Sonne wandert von Ost nach West und steht nachts tief
  const ang = (t - 0.2) * Math.PI * 2;
  state.sunDir.set(Math.cos(ang) * 40, 20 + Math.sin(ang) * 34, 18);
  if (state.sunDir.y < 12) state.sunDir.y = 12;

  const label = k < 0.5 ? a : b;
  return label;
}

const SHOT_COST = 0.9;          // Licht pro Pfeil
const EMBER_GAIN = 7;           // Licht aus einer Glut

const state = {
  running: false,
  paused: false,          // während der Upgrade-Wahl
  score: 0,
  idleTime: 0,
  fireTimer: 0,
  resting: false,
  camPos: new THREE.Vector3(),
  cleared: new Set(),      // besiegte Wächter
  gemStreak: 0,
  streakTimer: 0,
  shrineCheck: 0,
  time: 0.22,                    // Spielstart am Vormittag
  sunDir: new THREE.Vector3(26, 42, 16),
  bosses: 0,
  saveTimer: 0,
  tradeOpen: false,
  intro: 0,
  nightness: 0,
  day: 1,
  light: 1,
  embers: 0,
};

let stats = freshStats();
let res = saveData.res;

const hintEl = document.getElementById('hint');
let hintTimer = null;
function showHint(ms = 6000) {
  hintEl.classList.remove('hidden');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => hintEl.classList.add('hidden'), ms);
}

function newRun(keepPlace = false) {
  setSeed(Save.worldSeed(saveData));          // eine Welt pro Spielstand
  for (const [k, c] of [...world.chunks]) world.disposeChunk(k, c);
  world.queue.length = 0;

  const home = keepPlace ? camp.home(player.pos) : null;
  player.reset();
  enemies.reset();
  arrows.reset();
  shots.reset();
  gems.reset();
  boss.reset();
  villagers.hide();
  fx.reset();
  juice.reset();
  stats = freshStats();
  Save.applyPerks(saveData, stats, player);
  res = saveData.res;
  state.cleared.clear();
  state.bosses = 0;
  state.time = 0.22;
  state.gemStreak = 0;
  bossBar.classList.add('hidden');
  state.score = 0;
  state.idleTime = 0;
  state.fireTimer = 0;
  state.paused = false;
  state.tradeOpen = false;
  document.getElementById('levelup').classList.add('hidden');
  shopEl.classList.add('hidden');
  mapEl.classList.add('hidden');
  tradeBtn.classList.add('hidden');

  setLitZones(saveData.lit);
  camp.load(saveData.camp);
  if (home) { player.pos.set(home.x + 1.6, 0, home.z + 1.6); }
  world.update(player.pos.x, player.pos.z, 60);   // Startgebiet sofort bauen
  player.pos.y = heightAt(player.pos.x, player.pos.z);
  state.camPos.copy(player.pos).add(CAM_OFFSET);
  camera.position.copy(state.camPos);
  camera.lookAt(player.pos.x, player.pos.y + 1.2, player.pos.z);
  updateHUD(true);
  state.running = true;

  // Kaltstart: Kamera fällt ein, und die ersten Schatten sind schon da.
  state.intro = 1.5;
  juice.ring(player.pos, 7, '#ffd27a', 0.8);
  juice.popup(player.pos, 'Wach auf!', '#ffd27a');
  audio.levelUp();
  for (let i = 0; i < 3; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 11 + Math.random() * 5;
    enemies.spawnAt(player.pos.x + Math.cos(a) * d, player.pos.z + Math.sin(a) * d, 'hopper', 0);
  }
  hintEl.textContent = 'Loslassen → schießen';
  showHint();
}

function onPlayerHit(enemy) {
  const dead = player.hurt(enemy.damage);
  audio.hurt();
  juice.freeze(0.06);
  juice.shake(0.9);
  juice.popup(player.pos, `−${Math.round(enemy.damage)}`, '#ff8f6a');
  fx.burst(player.pos, 0xdf8a5c, 5);
  // kleiner Rückstoß für den Gegner
  const dx = enemy.pos.x - player.pos.x, dz = enemy.pos.z - player.pos.z;
  const d = Math.hypot(dx, dz) || 1;
  enemy.pos.x += (dx / d) * 1.2;
  enemy.pos.z += (dz / d) * 1.2;
  if (dead) gameOver();
}

function onKill(target) {
  if (target === boss) { onBossDown(); return; }
  audio.kill();
  juice.freeze(0.055);
  juice.shake(0.45);
  juice.ring(target.pos, 2.6, '#ffd27a', 0.35);
  fx.burst(target.pos, 0xffd27a, 11);
  gems.drop(target.pos);
  if (Math.random() < (stats.luck || 0)) gems.drop(target.pos);   // Glückssteine
}

/* ---------------------------- Wächter ------------------------------------ */
const bossBar = document.getElementById('bossBar');
const bossFill = document.getElementById('bossFill');

enemies.onSpawn = (enemy) => {
  juice.ring(enemy.pos, 1.8, '#5b5a78', 0.45);
  fx.burst(enemy.pos, 0x3a3f56, 5);
};

enemies.onBurn = (enemy) => {
  audio.kill();
  juice.ring(enemy.pos, 2.2, '#ffe6a8', 0.4);
  juice.popup(enemy.pos, 'puff!', '#ffe6a8');
  fx.burst(enemy.pos, 0xffd27a, 7);
  gems.drop(enemy.pos);
};

const bossCallbacks = {
  onWake: () => {
    audio.bossWake();
    juice.shake(0.9);
    bossBar.classList.remove('hidden');
    juice.popup(boss.pos, 'Wächter erwacht!', '#ffd27a');
    bossBar.classList.remove('hidden');
  },
  onSummon: (pos) => {
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      enemies.spawnAt(pos.x + Math.cos(a) * 6, pos.z + Math.sin(a) * 6, 'hopper', 1);
    }
  },
  onSlam: (pos, radius, damage) => {
    audio.bossSlam();
    juice.shake(1.3);
    juice.freeze(0.08);
    juice.ring(pos, radius * 1.15, '#e2643c', 0.5);
    fx.burst(pos, 0x9b9a84, 12);
    const d = Math.hypot(player.pos.x - pos.x, player.pos.z - pos.z);
    if (d < radius) {
      audio.hurt();
      if (player.hurt(damage)) gameOver();
    }
  },
};

function onBossDown() {
  audio.bossDown();
  juice.freeze(0.16);
  juice.shake(1.4);
  juice.ring(boss.pos, 9, '#ffe0ac', 0.8);
  juice.popup(boss.pos, 'Bezwungen!', '#ffe0ac');
  fx.burst(boss.pos, 0xffe0ac, 16);
  state.cleared.add(boss.shrine.key);
  state.bosses += 1;
  bossBar.classList.add('hidden');
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    gems.drop({ x: boss.pos.x + Math.cos(a) * 2.2, y: boss.pos.y, z: boss.pos.z + Math.sin(a) * 2.2 });
  }
  player.hp = Math.min(player.hpMax, player.hp + 40);
  levelUp();                       // der Segen des Steinkreises
}

function onCollect() {
  player.feed(EMBER_GAIN);
  juice.popup(player.pos, '+' + EMBER_GAIN, '#ffd27a');
  state.score += 1;
  stats.xp += 1;
  saveData.gems += 1;
  state.saveTimer = Math.min(state.saveTimer, 3);
  state.gemStreak = state.streakTimer > 0 ? state.gemStreak + 1 : 0;
  state.streakTimer = 1.6;
  audio.gem(state.gemStreak);
  if (stats.xp >= stats.xpNeed) levelUp();
}

function onShotHit(damage) {
  fx.burst(player.pos, 0xe2643c, 5);
  audio.hurt();
  juice.shake(0.7);
  juice.popup(player.pos, `−${Math.round(damage)}`, '#ff8f6a');
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
  audio.levelUp();
  juice.ring(player.pos, 6, '#ffd27a', 0.7);
  levelupEl.classList.remove('hidden');
}

function gameOver() {
  if (!state.running) return;
  state.running = false;
  // Das Lager muss gesichert sein, bevor der nächste Lauf es wieder aufbaut.
  persist();
  const home = camp.home(player.pos);
  document.getElementById('deadWhere').textContent = home
    ? 'Dein Zelt hat die Glut bewahrt. Du entzündest sie neu.'
    : 'Ohne Zelt bleibt nur ein Funke. Bau dir eins — dann hast du einen Ort, der dich zurückholt.';
  document.getElementById('deadScore').textContent = state.score + ' ✨';
  document.getElementById('deadLevel').textContent = 'Stufe ' + stats.level + ' erreicht';
  Save.recordRun(saveData, stats.level, state.score, state.bosses);
  document.getElementById('deadStash').textContent = `Glut im Beutel: ${saveData.gems} ✨ · Weiteste Stufe: ${saveData.best.level}`;
  document.getElementById('startStash').textContent = `Glut im Beutel: ${saveData.gems} ✨`;
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

  let target = enemies.nearest(player.pos, stats.range);
  if (boss.awake) {
    const d = Math.hypot(boss.pos.x - player.pos.x, boss.pos.z - player.pos.z);
    const dt2 = target ? Math.hypot(target.pos.x - player.pos.x, target.pos.z - player.pos.z) : 1e9;
    if (d < stats.range + 2 && d < dt2) target = boss;
  }
  if (!target) return;

  player.aimAt(target.pos.x, target.pos.z);
  state.fireTimer -= dt;
  if (state.fireTimer <= 0) {
    if (!player.spend(SHOT_COST * stats.arrows)) return;   // ohne Licht kein Schuss
    state.fireTimer = stats.fireRate;
    arrows.damage = stats.damage * (0.55 + player.flame * 0.65);
    const dx = target.pos.x - player.pos.x, dz = target.pos.z - player.pos.z;
    const base = Math.atan2(dx, dz);
    for (let i = 0; i < stats.arrows; i++) {
      const a = base + (i - (stats.arrows - 1) / 2) * stats.spread;
      arrows.fire(player.pos, Math.sin(a), Math.cos(a), stats.pierce);
    }
    audio.shoot();
    player.bow.rotation.z = player.bowRest + 0.5;   // kleines Zucken beim Schuss
  }
}

/* --------------------------- Sammeln & Bauen ----------------------------- */
const actionBtn = document.getElementById('actionBtn');
const buildBtn = document.getElementById('buildBtn');
const eatBtn = document.getElementById('eatBtn');
const buildEl = document.getElementById('build');
const buildList = document.getElementById('buildList');
const buildRes = document.getElementById('buildRes');
const resEls = {
  holz: document.getElementById('resHolz'),
  stein: document.getElementById('resStein'),
  beeren: document.getElementById('resBeeren'),
};

let nearNode = null;
let nearFire = null;

function floatText(pos, text) {
  fx.burst(pos, 0xf2dda2, 4);
  juice.popup(pos, text, '#ffe6a8');
}

actionBtn.addEventListener('click', () => {
  // Am Feuer stehen heißt: Holz nachlegen
  if (nearFire) {
    if (res.holz <= 0) return;
    res.holz -= 1;
    camp.refuel(nearFire);
    saveData.res = res;
    saveData.camp = camp.serialize();
    Save.save(saveData);
    audio.gem(1);
    juice.ring(nearFire, 2.2, '#ffb347', 0.4);
    juice.popup(nearFire, 'nachgelegt', '#ffb347');
    fx.burst({ x: nearFire.x, y: nearFire.y, z: nearFire.z }, 0xffb347, 7);
    updateHUD(true);
    return;
  }
  if (!nearNode) return;
  audio.unlock();
  const { chunk, node } = nearNode;
  const def = NODE_KINDS[node.kind];
  audio.hit();
  fx.burst({ x: node.x, y: node.y + 0.6, z: node.z }, node.kind === 'findling' ? '#b5b3a0' : '#9dbf6a', 5);

  if (world.hitNode(chunk, node)) {
    const amount = def.amount + (Math.random() < 0.3 ? 1 : 0);
    res[def.res] += amount;
    saveData.res = res;
    state.saveTimer = Math.min(state.saveTimer, 2);
    audio.kill();
    floatText({ x: node.x, y: node.y, z: node.z }, `+${amount} ${def.res === 'holz' ? '🪵' : def.res === 'stein' ? '🪨' : '🫐'}`);
    nearNode = null;
    actionBtn.classList.add('hidden');
    updateHUD(true);
  }
});

function renderBuild() {
  buildRes.textContent = `${res.holz} 🪵 · ${res.stein} 🪨`;
  buildList.replaceChildren();
  for (const [type, def] of Object.entries(BUILDINGS)) {
    const btn = document.createElement('button');
    btn.className = 'upgrade buy';
    btn.disabled = !canAfford(def, res);
    btn.innerHTML =
      `<span class="ic">${def.icon}</span>` +
      `<span><b>${def.title}</b><small>${def.text}</small></span>` +
      `<span class="cost">${costText(def)}</span>`;
    btn.addEventListener('click', () => {
      if (!canAfford(def, res)) return;
      payFor(def, res);
      // zwei Schritte vor der Figur aufstellen
      const bx = player.pos.x + Math.sin(player.facing) * 2.2;
      const bz = player.pos.z + Math.cos(player.facing) * 2.2;
      camp.place(type, bx, bz, player.facing + Math.PI);

      // Feuer und Laternen machen ihre Umgebung dauerhaft grüner
      if (def.reach) {
        saveData.lit.push({ x: +bx.toFixed(1), z: +bz.toFixed(1), r: def.reach });
        setLitZones(saveData.lit);
        world.refreshArea(bx, bz, def.reach);
      }
      saveData.camp = camp.serialize();
      saveData.res = res;
      Save.save(saveData);
      audio.levelUp();
      closeBuild();
      updateHUD(true);
    });
    buildList.append(btn);
  }
}

function openBuild() {
  state.paused = true;
  renderBuild();
  buildEl.classList.remove('hidden');
}

function closeBuild() {
  buildEl.classList.add('hidden');
  state.paused = false;
}

buildBtn.addEventListener('click', () => { audio.unlock(); openBuild(); });
document.getElementById('buildClose').addEventListener('click', closeBuild);

eatBtn.addEventListener('click', () => {
  if (res.beeren <= 0 || player.hp >= player.hpMax) return;
  res.beeren -= 1;
  player.hp = Math.min(player.hpMax, player.hp + 30);
  saveData.res = res;
  audio.gem(2);
  fx.burst(player.pos, '#c4504a', 6);
  updateHUD(true);
});

/* ------------------------------ Lichtkarte ------------------------------- */
const mapEl = document.getElementById('map');
const mapCanvas = document.getElementById('mapCanvas');

function drawMap() {
  const ctx = mapCanvas.getContext('2d');
  const W = mapCanvas.width, H = mapCanvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#1b2130';
  ctx.fillRect(0, 0, W, H);

  // Ausschnitt so wählen, dass Spieler und alle Lichter hineinpassen
  const pts = [{ x: player.pos.x, z: player.pos.z }, ...saveData.lit, ...camp.items];
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p2 of pts) {
    minX = Math.min(minX, p2.x); maxX = Math.max(maxX, p2.x);
    minZ = Math.min(minZ, p2.z); maxZ = Math.max(maxZ, p2.z);
  }
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const span = Math.max(160, (maxX - minX) * 1.35, (maxZ - minZ) * 1.35);
  const toX = (x) => W / 2 + ((x - cx) / span) * W;
  const toY = (z) => H / 2 + ((z - cz) / span) * H;

  // Lichtinseln als weicher Schein — das ist die eigentliche Karte
  for (const zone of saveData.lit) {
    const r = Math.max(6, (zone.r / span) * W);
    const g = ctx.createRadialGradient(toX(zone.x), toY(zone.z), 0, toX(zone.x), toY(zone.z), r);
    g.addColorStop(0, 'rgba(255, 186, 96, .5)');
    g.addColorStop(1, 'rgba(255, 186, 96, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(toX(zone.x), toY(zone.z), r, 0, Math.PI * 2);
    ctx.fill();
  }

  // gebautes Lager
  const marks = { feuer: '#ffb347', laterne: '#ffe08a', zelt: '#e0654a', zaun: '#9a7a52' };
  for (const it of camp.items) {
    ctx.fillStyle = camp.burning(it) ? (marks[it.type] || '#fff') : '#6b6f7e';
    ctx.beginPath();
    ctx.arc(toX(it.x), toY(it.z), it.type === 'zelt' ? 7 : 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // besiegte Wächter
  ctx.strokeStyle = 'rgba(210, 225, 255, .55)';
  ctx.lineWidth = 2;
  for (const key of state.cleared) {
    const [sx, sz] = key.split('_').map(Number);
    ctx.beginPath();
    ctx.arc(toX(sx), toY(sz), 9, 0, Math.PI * 2);
    ctx.stroke();
  }

  // der Zwerg selbst, mit Blickrichtung
  const px = toX(player.pos.x), py = toY(player.pos.z);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(-player.facing);
  ctx.fillStyle = '#fff3d8';
  ctx.beginPath();
  ctx.moveTo(0, -11);
  ctx.lineTo(7, 8);
  ctx.lineTo(0, 4);
  ctx.lineTo(-7, 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Maßstab
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  ctx.font = '600 15px system-ui, sans-serif';
  ctx.fillText(`${Math.round(span)} m`, 14, H - 14);
}

function openMap() {
  state.paused = true;
  drawMap();
  mapEl.classList.remove('hidden');
}

document.getElementById('mapBtn').addEventListener('click', () => { audio.unlock(); openMap(); });
document.getElementById('mapClose').addEventListener('click', () => {
  mapEl.classList.add('hidden');
  state.paused = false;
});

/* ------------------------------ Krämerstand ------------------------------ */
const shopEl = document.getElementById('shop');
const shopList = document.getElementById('shopList');
const shopGems = document.getElementById('shopGems');
const tradeBtn = document.getElementById('tradeBtn');

function renderShop() {
  shopGems.textContent = saveData.gems;
  shopList.replaceChildren();
  for (const perk of Save.PERKS) {
    const have = Save.perkLevel(saveData, perk.id);
    const cost = Save.perkCost(perk, saveData);
    const btn = document.createElement('button');
    btn.className = 'upgrade buy';
    btn.disabled = cost === null || saveData.gems < cost;
    btn.innerHTML =
      `<span class="ic">${perk.icon}</span>` +
      `<span><b>${perk.title}</b><small>${perk.text}</small></span>` +
      `<span class="cost">${cost === null ? `${have}/${perk.max} ✓` : `${cost} ✨`}</span>`;
    btn.addEventListener('click', () => {
      if (Save.buyPerk(saveData, perk)) {
        audio.levelUp();
        applyPerkToRun(perk.id);
        renderShop();
        updateHUD(true);
      }
    });
    shopList.append(btn);
  }
}

// Gekauftes wirkt sofort, nicht erst im nächsten Lauf.
function applyPerkToRun(id) {
  const lvl = Save.perkLevel(saveData, id);
  if (id === 'leben') { player.hpMax = 100 + lvl * 20; player.hp = player.hpMax; }
  if (id === 'schaden') stats.damage += 1;
  if (id === 'pfeil') stats.arrows += 1;
  if (id === 'tempo') player.speed = player.baseSpeed * (1 + lvl * 0.06);
  if (id === 'glueck') stats.luck = lvl * 0.2;
}

function openShop() {
  state.tradeOpen = true;
  state.paused = true;
  renderShop();
  shopEl.classList.remove('hidden');
}

tradeBtn.addEventListener('click', () => { audio.unlock(); openShop(); });
document.getElementById('shopClose').addEventListener('click', () => {
  shopEl.classList.add('hidden');
  state.tradeOpen = false;
  state.paused = false;
});

/* --------------------------------- HUD ----------------------------------- */
const hpBar = document.getElementById('hpBar');
const hpFill = document.getElementById('hpFill');
const hpText = document.getElementById('hpText');
const scoreEl = document.getElementById('score');
const areaEl = document.getElementById('area');
const xpFill = document.getElementById('xpFill');
const xpText = document.getElementById('xpText');
const restEl = document.getElementById('rest');
const timeIcon = document.getElementById('timeIcon');
const timeText = document.getElementById('timeText');
let hudTimer = 0;

function updateHUD(force) {
  const f = player.flame;
  hpFill.style.transform = `scaleX(${f})`;
  hpFill.style.filter = f < 0.25 ? 'saturate(1.3) brightness(0.9)' : '';
  hpBar.classList.toggle('low', f < 0.25);
  hpText.textContent = Math.round(f * 100) + '%';
  xpFill.style.transform = `scaleX(${Math.min(1, stats.xp / stats.xpNeed)})`;
  xpText.textContent = 'Stufe ' + stats.level;
  scoreEl.textContent = state.score;
  areaEl.textContent = regionName(player.pos.x, player.pos.z);
  restEl.classList.toggle('hidden', !state.resting);
  resEls.holz.textContent = res.holz;
  resEls.stein.textContent = res.stein;
  resEls.beeren.textContent = res.beeren;
  eatBtn.classList.toggle('hidden', res.beeren <= 0);
  if (force) hudTimer = 0;
}

/* -------------------------------- Schleife -------------------------------- */
const clock = new THREE.Clock();
const targets = [];

function frame() {
  requestAnimationFrame(frame);
  const raw = Math.min(clock.getDelta(), 1 / 20);
  const dt = juice.update(raw);

  if (state.running && !state.paused) {
    const move = input.read();
    player.update(dt, move, world);
    combat(dt);
    // Wie hell ist es hier? Daran hängt alles: Farbe, Nebel, Gegner, Brennrate.
    state.day = daylight(state.time);
    const here = ambientAt(player.pos);
    state.light += (here - state.light) * Math.min(1, dt * 4);
    const dark = Math.max(0, 1 - state.light);

    // Tageslicht speist die Laterne langsam, Dunkelheit zehrt sie schnell aus.
    // Daraus entsteht der Rhythmus: tagsüber sammeln und bauen, nachts zählt,
    // wie viel Licht man vorher in die Welt gesetzt hat.
    player.burn = -0.25 + dark * 3.0;

    enemies.lightHere = state.light;
    enemies.update(dt, player, world, onPlayerHit, shots, fireLightAt);

    // Die Laterne leuchtet so weit, wie sie gefüllt ist
    lantern.position.set(player.pos.x, player.pos.y + 2.4, player.pos.z);
    lantern.intensity = (0.5 + player.flame * 3.4) * (0.55 + dark * 0.8);
    lantern.distance = 12 + player.flame * 14;

    // Bild: je dunkler, desto farbloser und enger
    post.compositeMat.uniforms.uDark.value = dark * 0.92;
    scene.fog.near = 54 - dark * 26;
    scene.fog.far = 132 - dark * 62;

    if (player.hp <= 0) gameOver();

    // Wächter: schläft im Steinkreis, bis man hineintritt
    state.shrineCheck -= dt;
    if (!boss.alive && state.shrineCheck <= 0) {
      state.shrineCheck = 0.5;
      const shrine = world.nearestShrine(player.pos, 26);
      if (shrine && !state.cleared.has(shrine.key)) boss.spawn(shrine, stats.level);
    }
    boss.update(dt, player, world, bossCallbacks);
    if (boss.awake) bossFill.style.transform = `scaleX(${Math.max(0, boss.hp / boss.hpMax)})`;
    else if (!boss.alive) bossBar.classList.add('hidden');

    if (state.streakTimer > 0) state.streakTimer -= dt;

    // Lagerfeuer: in der Nähe erholt man sich spürbar – eigene zählen mit
    const nightness = Math.max(0, Math.min(1, (state.time - 0.66) * 6, (0.96 - state.time) * 6));
    state.nightness = nightness;
    camp.consume(dt, nightness, (it) => {
      let n = 0;
      for (const e of enemies.living) if (Math.hypot(e.pos.x - it.x, e.pos.z - it.z) < 9) n++;
      return n;
    });
    camp.update(dt, nightness, player.pos);

    const worldFire = world.nearestFire(player.pos, 34);
    const campFire = camp.nearestFire(player.pos, 34);
    const fire = !worldFire ? campFire : !campFire ? worldFire
      : (campFire.x - player.pos.x) ** 2 + (campFire.z - player.pos.z) ** 2
        < (worldFire.x - player.pos.x) ** 2 + (worldFire.z - player.pos.z) ** 2 ? campFire : worldFire;
    if (fire) {
      const d = Math.hypot(fire.x - player.pos.x, fire.z - player.pos.z);
      fireLight.position.set(fire.x, fire.y + 1.1, fire.z);
      fireLight.intensity = (2.2 + nightness * 3.4) + Math.sin(state.idleTime * 9 + fire.x) * 0.4;
      state.resting = d < 4.6;
      if (state.resting) player.feed(30 * dt);
      audio.setFireDistance(d);
    } else {
      fireLight.intensity = 0;
      state.resting = false;
      audio.setFireDistance(null);
    }
    targets.length = 0;
    for (const e of enemies.living) targets.push(e);
    if (boss.awake) targets.push(boss);
    arrows.update(dt, targets, onKill);
    shots.update(dt, player, onShotHit);
    gems.update(dt, player, onCollect, stats.magnet);
    fx.update(dt);
    player.bow.rotation.z += (player.bowRest - player.bow.rotation.z) * Math.min(1, dt * 10);

    world.update(player.pos.x, player.pos.z, 1);   // höchstens ein Chunk pro Frame
    villagers.update(dt, player, world);
    critters.update(dt, player, world, state.nightness);
    windTime.value += dt;

    // Aktionsknopf: erst Holz nachlegen, sonst die nächste Fundstelle
    nearFire = res.holz > 0 ? camp.needsFuel(player.pos, 4) : null;
    nearNode = nearFire ? null : world.nearestNode(player.pos, 3.2);
    if ((nearFire || nearNode) && !state.paused) {
      actionBtn.textContent = nearFire
        ? `🪵 Nachlegen (${Math.round(nearFire.fuel * 100)} %)`
        : `${NODE_KINDS[nearNode.node.kind].icon} ${NODE_KINDS[nearNode.node.kind].label}`;
      actionBtn.classList.remove('hidden');
    } else {
      actionBtn.classList.add('hidden');
    }

    // Tageszeit weiterdrehen
    state.time = (state.time + dt / DAY_LENGTH) % 1;
    const phase = applyDaytime(state.time);
    timeIcon.textContent = phase.icon;
    timeText.textContent = phase.name;

    // nachts wird es voller draußen
    enemies.nightBonus = phase.name === 'Nacht' ? 2 : 0;

    // Händler in Reichweite?
    const canTrade = villagers.nearTrader(player.pos) && !state.paused;
    tradeBtn.classList.toggle('hidden', !canTrade);
    actionBtn.classList.toggle('hidden', (!nearNode && !nearFire) || canTrade);

    // Vorrat gelegentlich sichern
    state.saveTimer -= dt;
    if (state.saveTimer <= 0) { state.saveTimer = 12; saveData.res = res; saveData.camp = camp.serialize(); Save.save(saveData); }

    audio.ambient(dt);

    hudTimer -= dt;
    if (hudTimer <= 0) { hudTimer = 0.1; updateHUD(); }
  }

  // Kamera folgt weich und bleibt in der Top-Down-Perspektive
  const want = state.camPos.copy(player.pos).add(CAM_OFFSET);
  if (state.intro > 0) {
    state.intro = Math.max(0, state.intro - raw);
    const k = state.intro / 1.5;
    const ease = k * k;                       // fällt weich ein statt zu rutschen
    want.y += ease * 46;
    want.z += ease * 14;
  }
  camera.position.lerp(want, 1 - Math.pow(state.intro > 0 ? 0.02 : 0.0015, dt || raw));
  camera.lookAt(player.pos.x, player.pos.y + 1.1, player.pos.z);
  juice.applyToCamera();

  sun.position.set(player.pos.x + state.sunDir.x, player.pos.y + state.sunDir.y, player.pos.z + state.sunDir.z);
  sun.target.position.copy(player.pos);
  sun.target.updateMatrixWorld();

  post.render(scene, camera);
}

/* --------------------------------- Menüs --------------------------------- */
const soundBtn = document.getElementById('soundBtn');
let muted = false;
try { muted = localStorage.getItem('cozy-muted') === '1'; } catch (err) { /* egal */ }
audio.setMuted(muted);
soundBtn.textContent = muted ? '🔇' : '🔊';
soundBtn.classList.toggle('off', muted);

soundBtn.addEventListener('click', () => {
  muted = !muted;
  audio.unlock();
  audio.setMuted(muted);
  soundBtn.textContent = muted ? '🔇' : '🔊';
  soundBtn.classList.toggle('off', muted);
  try { localStorage.setItem('cozy-muted', muted ? '1' : '0'); } catch (err) { /* egal */ }
});

document.getElementById('startStash').textContent = `Glut im Beutel: ${saveData.gems} ✨`;

document.getElementById('startBtn').addEventListener('click', () => {
  audio.unlock();
  document.getElementById('start').classList.add('hidden');
  newRun();
});

document.getElementById('againBtn').addEventListener('click', () => {
  audio.unlock();
  document.getElementById('dead').classList.add('hidden');
  newRun(true);        // gleiche Welt, Aufwachen im eigenen Zelt
});

document.getElementById('qualityBtn').addEventListener('click', () => {
  quality = quality === 'high' ? 'low' : 'high';
  applyQuality();
});

// Kleiner Debug-Zugang (auch praktisch für automatisierte Tests)
window.__game = { state, player, enemies, juice, fireLightAt, ambientAt, arrows, shots, gems, boss, audio, villagers, critters, camp, saveData, Save, openShop, openBuild, world,
  get res() { return res; }, get nearNode() { return nearNode; }, renderer, scene, camera, sun, post,
  get stats() { return stats; }, levelUp };

function persist() {
  saveData.res = res;
  saveData.camp = camp.serialize();
  Save.save(saveData);
}
window.addEventListener('pagehide', persist);
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });

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
