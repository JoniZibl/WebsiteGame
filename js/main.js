import * as THREE from 'three';
import { World, heightAt, setSeed, regionName, windTime, NODE_KINDS, WATER_LEVEL } from './world.js';
import { Input } from './input.js';
import { Player, EnemyManager, ProjectileManager, Particles, Gems, EnemyShots, Boss } from './entities.js';
import { TiltShift } from './postfx.js';
import { freshStats, pickThree, applyUpgrade, xpForLevel } from './upgrades.js';
import { GameAudio } from './audio.js';
import { Villagers } from './villagers.js';
import { Critters } from './critters.js';
import * as Save from './save.js';
import { Camp, BUILDINGS, canAfford, payFor, costText } from './camp.js';

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

const hemi = new THREE.HemisphereLight('#fff6e4', '#8fb96c', 0.78);
scene.add(hemi);

const sun = new THREE.DirectionalLight('#fff6e2', 1.55);
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
const boss = new Boss(scene);
const fx = new Particles(scene);
const audio = new GameAudio();
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

/* --------------------------------- Spiel --------------------------------- */
/* ------------------------------------------------------------------------- */
/*  Tageszeit: ein voller Umlauf dauert gut fünf Minuten                       */
/* ------------------------------------------------------------------------- */
const DAY_LENGTH = 320;   // Sekunden

const SKY_KEYS = [
  { t: 0.00, sky: '#f6d9ac', sun: '#ffcd96', sunI: 0.75, hemi: 0.55, name: 'Morgen', icon: '🌅' },
  { t: 0.18, sky: '#ece0c0', sun: '#fff6e2', sunI: 1.55, hemi: 0.70, name: 'Tag',    icon: '☀️' },
  { t: 0.52, sky: '#ece0c0', sun: '#fff6e2', sunI: 1.55, hemi: 0.70, name: 'Tag',    icon: '☀️' },
  { t: 0.66, sky: '#f0c091', sun: '#ffa472', sunI: 1.00, hemi: 0.58, name: 'Abend',  icon: '🌇' },
  { t: 0.78, sky: '#4e5c78', sun: '#93aad2', sunI: 0.34, hemi: 0.36, name: 'Nacht',  icon: '🌙' },
  { t: 0.94, sky: '#4e5c78', sun: '#93aad2', sunI: 0.34, hemi: 0.36, name: 'Nacht',  icon: '🌙' },
  { t: 1.00, sky: '#f6d9ac', sun: '#ffcd96', sunI: 0.75, hemi: 0.55, name: 'Morgen', icon: '🌅' },
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
  nightness: 0,
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
  tradeBtn.classList.add('hidden');

  camp.load(saveData.camp);
  if (home) { player.pos.set(home.x + 1.6, 0, home.z + 1.6); }
  world.update(player.pos.x, player.pos.z, 60);   // Startgebiet sofort bauen
  player.pos.y = heightAt(player.pos.x, player.pos.z);
  state.camPos.copy(player.pos).add(CAM_OFFSET);
  camera.position.copy(state.camPos);
  camera.lookAt(player.pos.x, player.pos.y + 1.2, player.pos.z);
  updateHUD(true);
  state.running = true;
  hintEl.textContent = 'Loslassen → schießen';
  showHint();
}

function onPlayerHit(enemy) {
  const dead = player.hurt(enemy.damage);
  audio.hurt();
  fx.burst(player.pos, '#df8a5c', 5);
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
  fx.burst(target.pos, target.mat.color.getHex(), 9);
  gems.drop(target.pos);
  if (Math.random() < (stats.luck || 0)) gems.drop(target.pos);   // Glückssteine
}

/* ---------------------------- Wächter ------------------------------------ */
const bossBar = document.getElementById('bossBar');
const bossFill = document.getElementById('bossFill');

const bossCallbacks = {
  onWake: () => {
    audio.bossWake();
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
    fx.burst(pos, '#9b9a84', 12);
    const d = Math.hypot(player.pos.x - pos.x, player.pos.z - pos.z);
    if (d < radius) {
      audio.hurt();
      if (player.hurt(damage)) gameOver();
    }
  },
};

function onBossDown() {
  audio.bossDown();
  fx.burst(boss.pos, '#ffe0ac', 16);
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
  fx.burst(player.pos, '#e2643c', 5);
  audio.hurt();
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
  levelupEl.classList.remove('hidden');
}

function gameOver() {
  state.running = false;
  const home = camp.home(player.pos);
  document.getElementById('deadWhere').textContent = home
    ? 'Du wachst in deinem Zelt wieder auf.'
    : 'Ohne Zelt beginnt der Weg von vorn. Bau dir eins!';
  document.getElementById('deadScore').textContent = state.score + ' 💎';
  document.getElementById('deadLevel').textContent = 'Stufe ' + stats.level + ' erreicht';
  Save.recordRun(saveData, stats.level, state.score, state.bosses);
  document.getElementById('deadStash').textContent = `Vorrat: ${saveData.gems} 💎 · Bester Lauf: Stufe ${saveData.best.level}`;
  document.getElementById('startStash').textContent = `Vorrat: ${saveData.gems} 💎`;
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
    state.fireTimer = stats.fireRate;
    arrows.damage = stats.damage;
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

function floatText(pos, text) {
  fx.burst(pos, '#f2dda2', 4);
  hintEl.textContent = text;
  showHint(1400);
}

actionBtn.addEventListener('click', () => {
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
      `<span class="cost">${cost === null ? `${have}/${perk.max} ✓` : `${cost} 💎`}</span>`;
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
  hpFill.style.transform = `scaleX(${player.hp / player.hpMax})`;
  hpText.textContent = Math.ceil(player.hp);
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
  const dt = Math.min(clock.getDelta(), 1 / 20);

  if (state.running && !state.paused) {
    const move = input.read();
    player.update(dt, move, world);
    combat(dt);
    enemies.update(dt, player, world, onPlayerHit, shots);

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
      state.resting = d < 4.2;
      if (state.resting) player.hp = Math.min(player.hpMax, player.hp + 16 * dt);
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

    // Fundstelle in Reichweite? Dann den Aktionsknopf anbieten
    nearNode = world.nearestNode(player.pos, 3.2);
    if (nearNode && !state.paused) {
      const def = NODE_KINDS[nearNode.node.kind];
      actionBtn.textContent = `${def.icon} ${def.label}`;
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
    actionBtn.classList.toggle('hidden', !nearNode || canTrade);

    // Vorrat gelegentlich sichern
    state.saveTimer -= dt;
    if (state.saveTimer <= 0) { state.saveTimer = 12; saveData.res = res; saveData.camp = camp.serialize(); Save.save(saveData); }

    audio.ambient(dt);

    hudTimer -= dt;
    if (hudTimer <= 0) { hudTimer = 0.1; updateHUD(); }
  }

  // Kamera folgt weich und bleibt in der Top-Down-Perspektive
  const want = state.camPos.copy(player.pos).add(CAM_OFFSET);
  camera.position.lerp(want, 1 - Math.pow(0.0015, dt));
  camera.lookAt(player.pos.x, player.pos.y + 1.1, player.pos.z);

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

document.getElementById('startStash').textContent = `Vorrat: ${saveData.gems} 💎`;

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
window.__game = { state, player, enemies, arrows, shots, gems, boss, audio, villagers, critters, camp, saveData, Save, openShop, openBuild, world,
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
