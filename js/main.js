import * as THREE from 'three';
import {
  VoxelWorld, B, BLOCKS, AIR, isSolid, setSeed, getSeed, biomeAt, surfaceAt, stratumAt,
  doerferUm, dorfBei, HEIGHT, SEA, CHUNK,
} from './voxel.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { TiltShift } from './postfx.js';
import * as save from './save.js';
import { Doerfer } from './village.js';
import { Leute } from './npc.js';
import { Feinde, ARTEN } from './combat.js';
import * as gruft from './dungeon.js';
import * as fert from './skills.js';
import { Auftragsbuch, auftragFuer } from './quest.js';
import * as dinge from './items.js';
import * as story from './story.js';
import { ICONS, symbol } from './icons.js';
import { peek, anwenden } from './peek.js';
import { DINGE } from './items.js';
import { kisteBauen, torBauen } from './props.js';
import { GameAudio } from './audio.js';
import { Juice } from './juice.js';

/* ==========================================================================
 *  Talkunde — ein Rollenspiel von oben.
 *
 *  Eine endlose Welt aus Blöcken mit Dörfern, Leuten, Aufträgen und Gruften.
 *  Das Gelände rechnet sich aus seinen Koordinaten aus; was darauf steht, sind
 *  richtige kleine Modelle.
 *
 *  Der Kniff für die Draufsicht: unter Tage wird die Welt über dem Kopf
 *  weggeschnitten. Man sieht in die Gruft hinein, ohne dass die Kamera die
 *  Perspektive wechseln muss.
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
const CAM_DIR = new THREE.Vector3(0, 24, 19).normalize();
let camDist = 56;

const hemi = new THREE.HemisphereLight('#fff6e4', '#c39a72', 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff4de', 1.1);
scene.add(sun, sun.target);

// Die Schnittebene: alles oberhalb verschwindet, wenn wir unter Tage sind.
const cutPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), HEIGHT + 4);
renderer.clippingPlanes = [cutPlane];

const blockMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

anwenden(blockMat);

const waterMat = new THREE.MeshLambertMaterial({
  vertexColors: true, transparent: true, opacity: 0.72, flatShading: true,
});

const post = new TiltShift(renderer);
const world = new VoxelWorld(scene, blockMat, waterMat, 4);
const doerfer = new Doerfer(scene);
const leute = new Leute(scene);
const input = new Input();
const player = new Player(scene);
const audio = new GameAudio();
const juice = new Juice(scene, camera);

// Grubenlampe: unter Tage leuchtet die Figur sich selbst
const lamp = new THREE.PointLight('#ffbe72', 0, 34, 1.25);
scene.add(lamp);

/* Ein Ring unter den Füßen. Von oben, zwischen fünfzehn Dorfleuten, findet
   man sich sonst nicht wieder. */
const fussring = new THREE.Mesh(
  new THREE.RingGeometry(0.52, 0.72, 20),
  new THREE.MeshBasicMaterial({ color: '#fdf6e8', transparent: true, opacity: 0.5,
    depthWrite: false, side: THREE.DoubleSide })
);
fussring.rotation.x = -Math.PI / 2;
scene.add(fussring);

/* -------------------------------- Zustand --------------------------------- */
const state = {
  running: false,
  dead: false,
  held: fert.neuerHeld(),
  buch: new Auftragsbuch(),
  time: 0.3,
  cut: HEIGHT + 4,
  under: 0,
  hieb: 0,            // Nachladen des Schlags
  zauber: 0,
  ort: 'Wildnis',
  imDungeon: null,    // die Gruft, in der wir stecken
  gespraech: null,
  camPos: new THREE.Vector3(),
  fallFrom: null,
  gelesen: new Set(), // schon geöffnete Truhen
  geschichte: story.neueGeschichte(),
  schlund: null,
  heimat: null,
  tag: 0,
};

const DAY = 420;
const held = () => state.held;

const feinde = new Feinde(scene, {
  onTreffer: (f) => spielerNimmtSchaden(f.schaden, f.art.name),
  onTod: (f) => feindGefallen(f),
});

/* ------------------------------- Anzeige ----------------------------------
 * Die Symbole kommen aus icons.js und werden einmal hineingesetzt. Emoji
 * haben hier nichts verloren - sie bringen einen ganz anderen Strich mit als
 * die Welt darunter.
 * -------------------------------------------------------------------------- */
const el = (id) => document.getElementById(id);
const hpBar = el('hpText').parentElement;
const ui = {
  hp: hpBar.querySelector('i'), hpText: el('hpText'), hpBar,
  aus: document.querySelector('.balken.ausdauer i'),
  mag: document.querySelector('.balken.magicka i'),
  ortName: el('ortName'), ortInfo: el('ortInfo'),
  stufe: el('stufeZahl'), xp: el('xpFill'), gold: el('goldZahl'),
  auftrag: el('auftragTafel'), aTitel: el('auftragTitel'), aStand: el('auftragStand'),
  ziel: el('zielleiste'), zielName: el('zielName'), zielHp: el('zielHp'),
  weg: el('wegweiser'), wegText: el('wegText'),
  rede: el('redeBtn'), wirk: el('wirkBtn'),
};

/* Die Symbole einmal hineinsetzen. Alles, was sich je nach Lage ändert,
   bekommt sein Symbol dort, wo es sich ändert. */
/** Ein Symbol als Markup — für Listen, die per innerHTML gebaut werden. */
const sym = (name) => `<span class="ic">${ICONS[name] || ''}</span>`;

symbol(el('hauBtn'), 'schwert');
symbol(el('wirkBtn'), 'funke');
symbol(el('menuBtn'), 'beutel');
symbol(el('qualityBtn'), 'glanz');
symbol(el('redeBtn'), 'rede');
for (const m of document.querySelectorAll('.ic-muenze')) m.innerHTML = ICONS.muenze;

let hudTimer = 0;
function waffeZeigen() {
  const id = held().rue.waffe;
  player.setWaffe(id ? DINGE[id] : null);
}

function updateHUD() {
  const h = held();
  waffeZeigen();
  const hpMax = fert.werte.lebenMax(h);
  const magMax = fert.werte.magickaMax(h);
  ui.hp.style.width = `${Math.max(0, h.hp / hpMax * 100)}%`;
  ui.hpText.textContent = Math.max(0, Math.round(h.hp));
  ui.hpBar.classList.toggle('wenig', h.hp < hpMax * 0.3);
  ui.aus.style.width = `${Math.max(0, h.ausdauer / h.ausdauerMax * 100)}%`;
  ui.mag.style.width = `${Math.max(0, h.magicka / magMax * 100)}%`;
  ui.stufe.textContent = h.stufe;
  ui.xp.style.width = `${Math.min(100, h.xp / h.xpZiel * 100)}%`;
  ui.gold.textContent = h.gold;
  ui.wirk.classList.toggle('leer', h.magicka < 18);
  trinkKnopfPflegen();

  ui.ortName.textContent = state.ort;
  ui.ortInfo.textContent = state.imDungeon
    ? `Gruft · Stufe ${state.imDungeon.stufe}`
    : biomeAt(Math.floor(player.pos.x), Math.floor(player.pos.z)).name;

  // Die Geschichte steht vor den Nebenaufträgen
  const st = state.geschichte;
  const k = st.gestartet ? story.aktuell(st) : null;
  if (k) {
    ui.auftrag.classList.remove('hidden');
    ui.aTitel.textContent = `✦ ${k.titel}`;
    const fertig = story.kapitelFertig(st);
    ui.aStand.textContent = fertig
      ? 'zurück zum Chronisten'
      : `${story.fuellen(k.ziel, st)} · ${st.ziel}/${k.menge}`;
    ui.auftrag.classList.toggle('fertig', fertig);
  } else {
    const q = state.buch.verfolgt();
    ui.auftrag.classList.toggle('hidden', !q);
    if (q) {
      ui.aTitel.textContent = q.titel;
      ui.aStand.textContent = q.fertig
        ? 'erledigt — bring die Nachricht zurück'
        : `${q.stand} / ${q.menge}`;
      ui.auftrag.classList.toggle('fertig', q.fertig);
    }
  }
}

function meldung(text, farbe = '#4a3b30', hoch = 2.4) {
  juice.popup({ x: player.pos.x, y: player.pos.y + hoch, z: player.pos.z }, text, farbe);
}

/* --------------------------------- Kampf ---------------------------------- */
function spielerNimmtSchaden(menge, von) {
  if (state.dead || !state.running) return;
  const h = held();
  const abgewehrt = menge * Math.min(0.6, fert.werte.ruestung(h));
  const echt = Math.max(1, Math.round(menge - abgewehrt));
  h.hp -= echt;
  fert.uebung(h, 'zaehe', 1);
  juice.shake(0.55);
  juice.freeze(0.04);
  audio.hurt();
  meldung(`−${echt}`, '#c9543f');
  if (h.hp <= 0) sterben(von);
  updateHUD();
}

function feindGefallen(f) {
  const h = held();
  h.getoetet++;
  h.gold += f.art.gold;

  // Was ein Gegner hinterlässt: meist Krempel, selten etwas Brauchbares
  const stufe = state.imDungeon ? state.imDungeon.stufe : 1;
  const rand = Math.random;
  if (f.art.boss || rand() < 0.28 * fert.werte.beute(h)) {
    const id = f.art.boss ? dinge.beuteZiehen(rand, stufe + 2) : dinge.beuteZiehen(rand, stufe, true);
    dinge.nehmen(h, id);
    juice.popup({ x: f.pos.x, y: f.pos.y + 1.1, z: f.pos.z },
      DINGE[id].name, '#7fae5e');
  }
  audio.kill();
  juice.shake(0.35);
  juice.ring({ x: f.pos.x, y: f.pos.y + 0.6, z: f.pos.z }, 2.4, '#e8a83c');
  const auf = fert.xpGeben(h, f.art.xp);
  juice.popup({ x: f.pos.x, y: f.pos.y + 1.8, z: f.pos.z }, `+${f.art.xp} EP`, '#e8a83c');
  if (auf) {
    audio.gem(3);
    meldung(`Stufe ${h.stufe}!`, '#e8a83c', 3.2);
  }
  const fertigeQ = state.buch.melden('toeten', { imDungeon: !!state.imDungeon });
  for (const q of fertigeQ) meldung(`„${q.titel}" erledigt`, '#7fae5e', 3.0);
  if (f.id === 'waechter' && story.melden(state.geschichte, 'waechter', {})) {
     endeZeigen('klinge');
  }
  updateHUD();
}

function zuschlagen() {
  const h = held();
  if (state.hieb > 0 || h.ausdauer < 12) return;
  state.hieb = 0.44;
  h.ausdauer -= 12;
  player.swing = 0.28;
  audio.hit();

  const ziel = feinde.ziel(player.pos, player.facing, 2.7);
  if (!ziel) { juice.shake(0.1); return; }

  const schaden = Math.round(fert.werte.schaden(h) * (0.85 + Math.random() * 0.3));
  feinde.schlagen(ziel, schaden);
  fert.uebung(h, 'klinge', 1);
  juice.shake(0.28);
  juice.freeze(0.03);
  juice.popup({ x: ziel.pos.x, y: ziel.pos.y + 1.6, z: ziel.pos.z }, `${schaden}`, '#fdf6e8');

  if (h.vorteile.has('klinge4')) {
    const zweit = feinde.ziel(player.pos, player.facing + 0.9, 2.7);
    if (zweit && zweit !== ziel) feinde.schlagen(zweit, Math.round(schaden * 0.7));
  }
  updateHUD();
}

function zaubern() {
  const h = held();
  if (state.zauber > 0 || h.magicka < 18) return;
  state.zauber = 0.75;
  h.magicka -= 18;
  player.swing = 0.3;
  audio.spit();

  const schaden = Math.round(fert.werte.zauber(h));
  let getroffen = 0;
  for (const f of [...feinde.liste]) {
    const d = Math.hypot(f.pos.x - player.pos.x, f.pos.z - player.pos.z);
    if (d > 7 || Math.abs(f.pos.y - player.pos.y) > 3) continue;
    feinde.schlagen(f, schaden);
    getroffen++;
  }
  juice.ring({ x: player.pos.x, y: player.pos.y + 0.6, z: player.pos.z }, 7, '#8fb8cf', 0.55);
  juice.shake(0.3);
  if (getroffen) fert.uebung(h, 'magie', getroffen);
  updateHUD();
}

/* ------------------------------ Trinken ----------------------------------- */
function besterTrank(was) {
  const h = held();
  let best = null, bestWert = 0;
  for (const id of Object.keys(h.beutel)) {
    const d = DINGE[id];
    if (!d || d.art !== 'trank') continue;
    const wirkt = was === 'heilt' ? d.heilt : d.magie;
    if (wirkt && wirkt > bestWert) { bestWert = wirkt; best = id; }
  }
  return best;
}

function trinken() {
  const h = held();
  const hpMax = fert.werte.lebenMax(h);
  // Was fehlt mehr? Danach richtet sich, was er greift.
  const heilNot = 1 - h.hp / hpMax;
  const magNot = 1 - h.magicka / fert.werte.magickaMax(h);
  const erst = heilNot >= magNot ? 'heilt' : 'magie';
  const id = besterTrank(erst) || besterTrank(erst === 'heilt' ? 'magie' : 'heilt');
  if (!id) return;
  const d = DINGE[id];
  dinge.ablegen(h, id);
  if (d.heilt) h.hp = Math.min(hpMax, h.hp + d.heilt);
  if (d.magie) h.magicka = Math.min(fert.werte.magickaMax(h), h.magicka + d.magie);
  audio.chomp();
  juice.ring({ x: player.pos.x, y: player.pos.y + 0.5, z: player.pos.z }, 2.2,
    d.heilt ? '#d9533f' : '#5e8aa8');
  meldung(d.name, d.heilt ? '#d9533f' : '#5e8aa8');
  updateHUD();
}

function traenkeDa() {
  const h = held();
  return Object.keys(h.beutel).some((id) => DINGE[id]?.art === 'trank');
}

function trinkKnopfPflegen() {
  const b = el('trinkBtn');
  if (!b) return;
  const da = traenkeDa();
  b.classList.toggle('hidden', !da);
  if (da) {
    const h = held();
    const anzahl = Object.entries(h.beutel)
      .filter(([id]) => DINGE[id]?.art === 'trank')
      .reduce((n, [, k]) => n + k, 0);
    if (!b.dataset.gefuellt) { b.insertAdjacentHTML('afterbegin', ICONS.trank); b.dataset.gefuellt = '1'; }
    const zahl = document.getElementById('trinkZahl');
    if (zahl) zahl.textContent = anzahl > 1 ? anzahl : '';
  }
}

function sterben(von) {
  state.dead = true;
  state.running = false;
  el('deadWer').textContent = von ? `${von} war stärker als du.` : 'Etwas war stärker als du.';
  el('deadStats').textContent = `Stufe ${held().stufe} · ${held().getoetet} erlegt · ${held().gold} Gold`;
  el('dead').classList.remove('hidden');
}

/* ------------------------------ Truhen & Gruften --------------------------- */
const truhenMuster = kisteBauen();
const torMuster = torBauen();
const truhen = [];      // { obj, pos, id, gross, gruft }
const tore = [];        // { obj, pos, gruft }

function gruftenPflegen(px, pz) {
  const nah = gruft.grueftUm(px, pz, 230);
  const gewollt = new Set(nah.map((g) => g.id));

  for (let i = tore.length - 1; i >= 0; i--) {
    if (!gewollt.has(tore[i].gruft.id)) { scene.remove(tore[i].obj); tore.splice(i, 1); }
  }
  const da = new Set(tore.map((t) => t.gruft.id));
  for (const g of nah) {
    if (da.has(g.id)) continue;
    const obj = torMuster.clone();
    obj.position.set(g.x + 0.5, surfaceAt(g.x, g.z) + 1, g.z + 2.5);
    scene.add(obj);
    tore.push({ obj, gruft: g, pos: obj.position.clone() });
  }

  // Bewohner und Truhen nur, wenn wir wirklich drin sind
  const drin = state.imDungeon;
  if (drin && !drin.gefuellt) {
    const b = gruft.bewohner(drin);
    for (const f of b.feinde) feinde.spawn(f.art, f.x, f.y, f.z, f.stufe, drin.id);
    for (const [i, t] of b.truhen.entries()) {
      const id = `${drin.id}#${i}`;
      if (held().dungeons.has(id)) continue;
      const obj = truhenMuster.clone();
      obj.position.set(t.x, t.y, t.z);
      scene.add(obj);
      truhen.push({ obj, pos: obj.position.clone(), id, gross: t.gross, gruft: drin });
    }
    drin.gefuellt = true;
  }
}

function truheOeffnen(t) {
  const h = held();
  const saat = (t.gruft.saat ^ (t.id.length * 7919) ^ t.pos.x ^ (t.pos.z << 8)) >>> 0;
  const inhalt = dinge.truhenInhalt(saat, t.gruft.stufe, t.gross);
  const gold = Math.round(inhalt.gold * fert.werte.beute(h));
  h.gold += gold;
  for (const id of inhalt.stuecke) dinge.nehmen(h, id);
  h.dungeons.add(t.id);
  fert.uebung(h, 'spuren', 2);
  fert.xpGeben(h, t.gross ? 80 : 35);
  scene.remove(t.obj);
  truhen.splice(truhen.indexOf(t), 1);
  audio.gem(2);
  juice.ring({ x: t.pos.x, y: t.pos.y + 0.5, z: t.pos.z }, 2.6, '#e8a83c');
  meldung(`+${gold} Gold`, '#e8a83c');
  inhalt.stuecke.forEach((id, i) => {
    juice.popup({ x: t.pos.x, y: t.pos.y + 1.4 + i * 0.7, z: t.pos.z },
      DINGE[id].name, '#7fae5e');
  });
  const fertigeQ = state.buch.melden('truhe', {});
  for (const q of fertigeQ) meldung(`„${q.titel}" erledigt`, '#7fae5e', 3.0);
  if (story.melden(state.geschichte, 'truhe', { gruftId: t.gruft.id })) {
    dinge.nehmen(h, 'siegel');
    meldung('📜 Altes Siegel', '#e8a83c', 3.2);
    kapitelGeschafft();
  }
  updateHUD();
}

/* ------------------------------ Glimm brechen ------------------------------
 * Die Adern im Fels sind das Einzige, was man noch aus der Welt selbst holt.
 * Ohne sie waere der Auftrag "Glimm fuer die Schmiede" unerfuellbar - graben
 * kann man seit dem Umbau zum Rollenspiel nicht mehr.
 * -------------------------------------------------------------------------- */
function glimmInReichweite() {
  const px = Math.floor(player.pos.x), py = Math.floor(player.pos.y), pz = Math.floor(player.pos.z);
  let best = null, bestD = 99;
  for (let dy = -1; dy <= 2; dy++) {
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (world.get(px + dx, py + dy, pz + dz) !== B.glimm) continue;
        const d = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
        if (d < bestD) { bestD = d; best = { x: px + dx, y: py + dy, z: pz + dz }; }
      }
    }
  }
  return best;
}

function glimmBrechen(ort) {
  const h = held();
  world.set(ort.x, ort.y, ort.z, AIR);
  dinge.nehmen(h, 'glimmstein');
  fert.uebung(h, 'spuren', 2);
  fert.xpGeben(h, 12);
  audio.gem(2);
  juice.shake(0.25);
  juice.ring({ x: ort.x + 0.5, y: ort.y + 0.5, z: ort.z + 0.5 }, 2.0, '#f5c451');
  juice.popup({ x: ort.x + 0.5, y: ort.y + 1.2, z: ort.z + 0.5 }, '💎 Glimmstein', '#e8a83c');
  const fertigeQ = state.buch.melden('sammeln', {});
  for (const q of fertigeQ) meldung(`„${q.titel}" erledigt`, '#7fae5e', 3.0);
  if (story.melden(state.geschichte, 'glimm', {})) kapitelGeschafft();
  updateHUD();
}

/* -------------------------- Womit kann man reden? -------------------------- */
function was() {
  const p = player.pos;
  const w = waechterInReichweite();
  if (w) return { art: 'waechter', ziel: w };
  const n = leute.naechster(p, 3.4);
  if (n) return { art: 'npc', ziel: n };
  for (const t of truhen) {
    if (Math.hypot(t.pos.x - p.x, t.pos.z - p.z) < 2.4 && Math.abs(t.pos.y - p.y) < 2.5) {
      return { art: 'truhe', ziel: t };
    }
  }
  for (const t of tore) {
    if (Math.hypot(t.pos.x - p.x, t.pos.z - p.z) < 4.5) return { art: 'tor', ziel: t };
  }
  const ader = glimmInReichweite();
  if (ader) return { art: 'glimm', ziel: ader };
  return null;
}

function handeln() {
  const w = was();
  if (!w) return;
  if (w.art === 'truhe') { truheOeffnen(w.ziel); return; }
  if (w.art === 'glimm') { glimmBrechen(w.ziel); return; }
  if (w.art === 'tor') { gruftBetreten(w.ziel.gruft); return; }
  if (w.art === 'npc') {
    if (w.ziel.chronist) chronistOeffnen(w.ziel);
    else redeOeffnen(w.ziel);
  }
  if (w.art === 'waechter') waechterAnsprechen(w.ziel);
}

/* In welcher Gruft stecken wir? Das wird aus der Lage bestimmt, nicht aus dem
   Betreten - sonst gilt man schon auf der obersten Treppenstufe als draußen,
   und wer durch eine Höhle hineinfällt, gälte nie als drinnen. */
function gruftUnter(x, y, z) {
  for (const g of gruft.grueftUm(x, z, 130)) {
    const h = gruft.plan(g).huelle;
    if (x >= h.minX - 2 && x <= h.maxX + 2 && z >= h.minZ - 2 && z <= h.maxZ + 2
        && y >= h.minY - 2 && y <= h.maxY + 3) return g;
  }
  return null;
}

function gruftBetreten(g) {
  state.imDungeon = g;
  state.ort = g.name;
  // Oben auf die Treppe stellen — hinunter geht man selbst, und genauso
  // wieder hinauf.
  const kopf = gruft.treppenKopf(g);
  player.pos.set(kopf.x, kopf.y, kopf.z);
  player.vel.set(0, 0, 0);
  world.update(player.pos.x, player.pos.z, 30);
  gruftenPflegen(player.pos.x, player.pos.z);
  audio.gem(0);
  meldung(g.name, '#4a3b30', 3.0);
  updateHUD();
}

/* --------------------------------- Wegweiser -------------------------------
 * Ein Auftrag ohne Richtung schickt einen ins Leere. Der Pfeil liegt flach am
 * Boden neben dem Spieler und dreht sich zum Ziel — von oben gesehen ist das
 * lesbarer als ein Zeiger am Bildschirmrand.
 * -------------------------------------------------------------------------- */
const pfeilGeo = new THREE.BufferGeometry();
pfeilGeo.setAttribute('position', new THREE.Float32BufferAttribute([
  0, 0, 1.15,  -0.62, 0, -0.35,  -0.24, 0, -0.12,
  0, 0, 1.15,  0.24, 0, -0.12,  0.62, 0, -0.35,
  -0.24, 0, -0.12,  0.24, 0, -0.12,  0, 0, 1.15,
], 3));
pfeilGeo.computeVertexNormals();
const pfeil = new THREE.Mesh(pfeilGeo, new THREE.MeshBasicMaterial({
  color: '#e8a83c', transparent: true, opacity: 0.95,
  depthWrite: false, depthTest: false, side: THREE.DoubleSide,
}));
pfeil.renderOrder = 20;
// Ein dunkler Zwilling darunter gibt ihm eine Kante gegen jeden Untergrund
const pfeilRand = new THREE.Mesh(pfeilGeo, new THREE.MeshBasicMaterial({
  color: '#7d5227', transparent: true, opacity: 0.85,
  depthWrite: false, depthTest: false, side: THREE.DoubleSide,
}));
pfeilRand.renderOrder = 19;
pfeilRand.visible = false;
scene.add(pfeilRand);
pfeil.visible = false;
scene.add(pfeil);

/** Wohin der Pfeil zeigt: Ziel des verfolgten Auftrags oder der Geschichte. */
function zielPunkt() {
  const st = state.geschichte;
  const k = st.gestartet ? story.aktuell(st) : null;

  if (k) {
    if (story.kapitelFertig(st)) return heimatZiel('Chronist');
    if (k.art === 'glimm') {
      const g = naechsteGruft();
      return g ? { x: g.x, z: g.z, name: g.name } : null;
    }
    if (k.art === 'truhe') {
      const g = gruft.grueftUm(player.pos.x, player.pos.z, 2000).find((x) => x.id === st.gruftId);
      return g ? { x: g.x, z: g.z, name: g.name } : null;
    }
    if (k.art === 'doerfer') {
      const fremd = doerferUm(player.pos.x, player.pos.z, 900)
        .filter((d) => !state.heimat || d.i !== state.heimat.i || d.j !== state.heimat.j)
        .filter((d) => !st.doerfer.includes(ortsname(d)))
        .sort((a, b) => Math.hypot(a.x - player.pos.x, a.z - player.pos.z)
                      - Math.hypot(b.x - player.pos.x, b.z - player.pos.z))[0];
      return fremd ? { x: fremd.x, z: fremd.z, name: ortsname(fremd) } : null;
    }
    if (k.art === 'schlund' || k.art === 'waechter') {
      return state.schlund ? { x: state.schlund.x, z: state.schlund.z, name: 'Der Schlund' } : null;
    }
    return null;
  }

  const q = state.buch.verfolgt();
  if (!q) return null;
  if (q.fertig) {
    return q.geberOrt ? { x: q.geberOrt.x, z: q.geberOrt.z, name: q.geberName || 'zurück' } : null;
  }
  return q.zielOrt ? { x: q.zielOrt.x, z: q.zielOrt.z, name: q.ziel } : null;
}

function heimatZiel(name) {
  if (!state.heimat) return null;
  return { x: state.heimat.x, z: state.heimat.z, name };
}

function naechsteGruft() {
  return gruft.grueftUm(player.pos.x, player.pos.z, 700)
    .sort((a, b) => Math.hypot(a.x - player.pos.x, a.z - player.pos.z)
                  - Math.hypot(b.x - player.pos.x, b.z - player.pos.z))[0];
}

function pfeilPflegen(dt) {
  const ziel = zielPunkt();
  if (!ziel) {
    pfeil.visible = false; pfeilRand.visible = false;
    ui.weg.classList.add('hidden');
    return;
  }

  const dx = ziel.x - player.pos.x, dz = ziel.z - player.pos.z;
  const d = Math.hypot(dx, dz);

  // Steht man schon da, hilft kein Pfeil mehr
  if (d < 12) {
    pfeil.visible = false; pfeilRand.visible = false;
    ui.weg.classList.remove('hidden');
    ui.wegText.textContent = `${ziel.name} — du bist da`;
    return;
  }

  pfeil.visible = true;
  pfeilRand.visible = true;
  const w = Math.atan2(dx, dz);
  const puls = 1.5 + Math.sin(state.time * 2400) * 0.12;
  // Über dem Kopf, damit er auch im Gedränge sichtbar bleibt
  const px = player.pos.x + Math.sin(w) * 2.2;
  const pz = player.pos.z + Math.cos(w) * 2.2;
  const py = player.pos.y + 2.6;
  pfeil.rotation.y = w;
  pfeil.position.set(px, py, pz);
  pfeil.scale.setScalar(puls);
  pfeilRand.rotation.y = w;
  pfeilRand.position.set(px, py - 0.04, pz);
  pfeilRand.scale.setScalar(puls * 1.2);

  ui.weg.classList.remove('hidden');
  ui.wegText.textContent = `${ziel.name} — ${Math.round(d)} Schritt`;
}

/* ------------------------------ Die Geschichte ----------------------------- */
function kapitelGeschafft() {
  audio.gem(3);
  juice.shake(0.4);
  const k = story.aktuell(state.geschichte);
  if (k) meldung(`„${k.titel}" — zurück zum Chronisten`, '#e8a83c', 3.2);
  updateHUD();
}

/** Die Richtung zum Schlund, für den Text des Chronisten. */
function schlundRichtung() {
  if (!state.schlund) return 'weit draußen';
  const dx = state.schlund.x - player.pos.x, dz = state.schlund.z - player.pos.z;
  return Math.abs(dx) > Math.abs(dz)
    ? (dx > 0 ? 'Weit im Osten' : 'Weit im Westen')
    : (dz > 0 ? 'Weit im Süden' : 'Weit im Norden');
}

function chronistOeffnen(n) {
  const st = state.geschichte;
  state.gespraech = n;
  el('redeName').textContent = 'Der Chronist';
  el('redeBeruf').textContent = n.name;

  if (st.fertig) {
    redeZeigen(st.ende === 'wort'
      ? 'Die Laternen brennen wieder länger. Ich habe es aufgeschrieben — zum ersten Mal '
        + 'ein Strich, der länger wird.\n\nDanke, dass Ihr geredet habt statt zugeschlagen.'
      : 'Das Glimm kommt zurück. Die Gruften sind still geworden, stiller als vorher.\n\n'
        + 'Ich weiß nicht, ob das ein guter Handel war. Aber es ist getan.',
      [{ label: 'Lebt wohl.', tun: redeSchliessen }]);
    el('rede').classList.remove('hidden');
    return;
  }

  const k = story.aktuell(st);

  if (!st.gestartet) {
    redeZeigen(story.fuellen(k.rede, st, schlundRichtung()), [
      { label: 'Ich sehe mich um.', unten: k.ziel.replace('{gruft}', st.gruftName || ''),
        tun: () => {
          st.gestartet = true;
          audio.gem(1);
          redeZeigen('Gut. Ich bin hier, wenn Ihr etwas habt.',
            [{ label: 'Bis dann.', tun: redeSchliessen }]);
          updateHUD();
        } },
      { label: 'Nicht heute.', tun: redeSchliessen },
    ]);
  } else if (story.kapitelFertig(st)) {
    const abschluss = k.abschluss || 'Ihr habt es also gesehen.';
    redeZeigen(story.fuellen(abschluss, st, schlundRichtung()), [
      { label: 'Und weiter?', tun: () => {
          story.weiter(st);
          st.gestartet = false;
          const naechst = story.aktuell(st);
          if (!naechst || st.fertig) { redeSchliessen(); return; }
          chronistOeffnen(n);
        } },
    ]);
  } else {
    redeZeigen(story.fuellen(k.rede, st, schlundRichtung()), [
      { label: `Noch nicht. (${st.ziel}/${k.menge})`, aus: true },
      { label: 'Ich gehe weiter.', tun: redeSchliessen },
    ]);
  }
  el('rede').classList.remove('hidden');
}

/* ----------------------------- Der Wächter -------------------------------- */
function waechterInReichweite() {
  if (!state.imDungeon || !state.imDungeon.schlund) return null;
  for (const f of feinde.liste) {
    if (f.id !== 'waechter') continue;
    if (Math.hypot(f.pos.x - player.pos.x, f.pos.z - player.pos.z) < 5
        && Math.abs(f.pos.y - player.pos.y) < 3) return f;
  }
  return null;
}

function waechterAnsprechen(f) {
  const h = held();
  state.gespraech = { pos: f.pos };
  el('redeName').textContent = 'Der Wächter';
  el('redeBeruf').textContent = 'im Schlund';

  const darf = story.darfReden(h);
  const wahlen = [];
  if (darf) {
    wahlen.push({
      label: 'Sie erinnern sich noch.',
      unten: `${h.hilfen} Menschen haben dich um Hilfe gebeten — und du bist gekommen.`,
      tun: () => {
        redeZeigen('Ihr wart bei ihnen. Bei allen diesen.\n\n'
          + 'Ich habe das Licht genommen, weil niemand mehr danach gefragt hat. '
          + 'Ein Licht, um das niemand bittet, ist Verschwendung.\n\n'
          + 'Nehmt es mit. Und sagt ihnen, sie sollen fragen.',
          [{ label: 'Das werde ich.', tun: () => { redeSchliessen(); endeZeigen('wort'); } }]);
      },
    });
  } else {
    wahlen.push({
      label: 'Sie erinnern sich noch.',
      unten: `Er glaubt dir nicht. (${h.hilfen || 0} von ${story.NOETIGE_HILFE} Menschen geholfen)`,
      aus: true,
    });
  }
  wahlen.push({ label: 'Dann nehme ich es mir.', tun: redeSchliessen });

  redeZeigen('Ihr seid weit gelaufen für etwas, das niemand vermisst hat.\n\n'
    + 'Zehn Jahre sitze ich hier. In zehn Jahren ist niemand gekommen, um zu fragen, '
    + 'wo das Licht geblieben ist. Nur Ihr. Und Ihr fragt nicht — Ihr holt.',
    wahlen);
  el('rede').classList.remove('hidden');
}

function endeZeigen(art) {
  const st = state.geschichte;
  st.ende = art;
  st.fertig = true;
  state.running = false;
  const h = held();
  if (art === 'wort') {
    h.gold += 600;
    fert.xpGeben(h, 800);
  }
  el('endeTitel').textContent = art === 'wort' ? 'Das Licht kehrt zurück.' : 'Der Schlund ist still.';
  el('endeText').textContent = art === 'wort'
    ? 'Der Wächter gibt das Glimm heraus. In den Dörfern brennen die Laternen wieder '
      + 'länger — weil jemand danach gefragt hat.'
    : 'Der Wächter fällt, und mit ihm gibt der Fels sein Licht zurück. Es war zu holen. '
      + 'Ob es zu nehmen war, sagt niemand.';
  el('endeStats').textContent = `Stufe ${h.stufe} · ${h.getoetet} erlegt · `
    + `${h.hilfen || 0} Menschen geholfen`;
  el('ende').classList.remove('hidden');
  audio.gem(3);
  writeSave();
}

/* -------------------------------- Gespräch --------------------------------- */
function ortsname(dorf) {
  const silben1 = ['Tal', 'Eichen', 'Stein', 'Nebel', 'Ross', 'Hirsch', 'Birken', 'Rab'];
  const silben2 = ['kunde', 'furt', 'bach', 'hall', 'grund', 'au', 'heim', 'stadt'];
  const a = Math.abs(dorf.i * 7 + dorf.j * 3) % silben1.length;
  const b = Math.abs(dorf.i * 11 - dorf.j * 5) % silben2.length;
  return silben1[a] + silben2[b];
}

function kontextFuer(n) {
  const naheGruft = gruft.grueftUm(n.pos.x, n.pos.z, 520)
    .sort((a, b) => Math.hypot(a.x - n.pos.x, a.z - n.pos.z) - Math.hypot(b.x - n.pos.x, b.z - n.pos.z))[0];
  const nachbar = doerferUm(n.pos.x, n.pos.z, 700)
    .filter((d) => d.i !== n.dorf.i || d.j !== n.dorf.j)[0];
  return {
    dungeonName: naheGruft ? naheGruft.name : 'der alten Gruft',
    dungeonPos: naheGruft ? { x: naheGruft.x, z: naheGruft.z } : null,
    nachbarort: nachbar ? ortsname(nachbar) : 'Steinfurt',
    nachbarPos: nachbar ? { x: nachbar.x, z: nachbar.z } : null,
    geberPos: { x: n.heimX, z: n.heimZ },
    geberName: n.name,
  };
}

function redeOeffnen(n) {
  if (!n.auftrag) n.auftrag = auftragFuer(n.saat, kontextFuer(n));
  state.gespraech = n;
  el('redeName').textContent = n.name;
  el('redeBeruf').textContent = n.gewerbe.name;
  redeZeigen(n.gewerbe.gruss, wahlenFuer(n));
  el('rede').classList.remove('hidden');
}

function redeZeigen(text, wahlen) {
  el('redeText').textContent = text;
  const feld = el('redeWahl');
  feld.replaceChildren();
  for (const w of wahlen) {
    const b = document.createElement('button');
    b.className = 'wahl' + (w.aus ? ' aus' : '');
    b.innerHTML = `${w.label}${w.unten ? `<small>${w.unten}</small>` : ''}`;
    if (!w.aus) b.addEventListener('click', w.tun);
    feld.append(b);
  }
}

function wahlenFuer(n) {
  const q = n.auftrag;
  const laeuft = state.buch.offen.find((x) => x.nr === q.nr);
  const wahlen = [];

  if (laeuft && laeuft.fertig) {
    wahlen.push({
      label: 'Erledigt.', unten: `${q.lohn.gold} Gold · ${q.lohn.xp} EP`,
      tun: () => {
        const lohn = state.buch.abgeben(laeuft, held());
        if (lohn) {
          fert.xpGeben(held(), lohn.xp);
          held().hilfen = (held().hilfen || 0) + 1;
          audio.gem(3);
          n.auftrag = null;
          redeZeigen('Ihr habt Wort gehalten. Das vergisst man hier nicht.',
            [{ label: 'Lebt wohl.', tun: redeSchliessen }]);
          updateHUD();
        }
      },
    });
  } else if (laeuft) {
    wahlen.push({ label: `Noch nicht fertig. (${laeuft.stand}/${laeuft.menge})`, aus: true });
    wahlen.push({
      label: 'Wo war das noch?',
      tun: () => redeZeigen(q.text, [{ label: 'Ich gehe.', tun: redeSchliessen }]),
    });
  } else {
    wahlen.push({
      label: 'Habt Ihr Arbeit für mich?',
      tun: () => redeZeigen(q.text, [
        {
          label: 'Ich mache das.', unten: `${q.lohn.gold} Gold · ${q.lohn.xp} EP`,
          tun: () => {
            if (state.buch.annehmen(q)) {
              audio.gem(1);
              redeZeigen('Gut. Kommt zurück, wenn es getan ist.',
                [{ label: 'Bis dann.', tun: redeSchliessen }]);
              updateHUD();
            } else {
              redeZeigen('Ihr habt schon genug am Hals.',
                [{ label: 'Wohl wahr.', tun: redeSchliessen }]);
            }
          },
        },
        { label: 'Ein andermal.', tun: redeSchliessen },
      ]),
    });
  }

  if (n.handel || n.gewerbe.name === 'Händlerin') {
    wahlen.push({
      label: 'Zeigt mir Eure Waren.',
      tun: () => { redeSchliessen(); ladenOeffnen(n); },
    });
  }

  wahlen.push({
    label: 'Was gibt es hier?',
    tun: () => {
      const g = gruft.grueftUm(n.pos.x, n.pos.z, 520)
        .sort((a, b) => Math.hypot(a.x - n.pos.x, a.z - n.pos.z) - Math.hypot(b.x - n.pos.x, b.z - n.pos.z))[0];
      const richtung = g ? himmelsrichtung(n.pos.x, n.pos.z, g.x, g.z) : null;
      redeZeigen(g
        ? `${g.name} liegt ${richtung} von hier. Geht nicht allein hinein, wenn Ihr es vermeiden könnt.`
        : 'Hier gibt es Felder, Wald und wenig Aufregung. So soll es bleiben.',
        [{ label: 'Danke.', tun: () => redeZeigen(n.gewerbe.gruss, wahlenFuer(n)) }]);
    },
  });
  wahlen.push({ label: 'Nichts weiter.', tun: redeSchliessen });
  return wahlen;
}

function himmelsrichtung(x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0;
  const d = Math.round(Math.hypot(dx, dz));
  const wo = Math.abs(dx) > Math.abs(dz)
    ? (dx > 0 ? 'im Osten' : 'im Westen')
    : (dz > 0 ? 'im Süden' : 'im Norden');
  return `${wo}, gut ${d} Schritt`;
}

function redeSchliessen() {
  state.gespraech = null;
  el('rede').classList.add('hidden');
}

/* --------------------------------- Der Laden -------------------------------
 * Die Händlerin führt, was ihr Dorf hergibt, und wechselt ihr Angebot mit dem
 * Tag. Verkaufen geht immer — Krempel aus Gruften ist die halbe Einnahme.
 * -------------------------------------------------------------------------- */
let ladenSeite = 'kauf';
let ladenWirt = null;

function ladenOeffnen(n) {
  ladenWirt = n;
  ladenSeite = 'kauf';
  el('ladenName').textContent = `${n.name}s Waren`;
  ladenZeichnen();
  el('laden').classList.remove('hidden');
}

function ladenSchliessen() {
  ladenWirt = null;
  el('laden').classList.add('hidden');
}

function ladenZeichnen() {
  if (!ladenWirt) return;
  const h = held();
  el('ladenGold').textContent = h.gold;
  for (const b of document.querySelectorAll('.lreiter')) {
    b.classList.toggle('an', b.dataset.seite === ladenSeite);
  }
  const feld = el('ladenListe');
  feld.replaceChildren();

  if (ladenSeite === 'kauf') {
    const waren = dinge.warenFuer(ladenWirt.dorf.saat, state.tag, h.stufe);
    for (const id of waren) {
      const d = DINGE[id];
      const preis = d.wert;
      const kann = h.gold >= preis;
      const z = document.createElement('button');
      z.className = 'ding-zeile laden-zeile' + (kann ? '' : ' aus');
      z.innerHTML = sym(d.sym)
        + `<span class="txt"><b>${d.name}</b><small>${wirkungText(d)}</small></span>`
        + `<span class="preis">${preis}<i class="ic-muenze">${ICONS.muenze}</i></span>`;
      if (kann) {
        z.addEventListener('click', () => {
          h.gold -= preis;
          dinge.nehmen(h, id);
          audio.gem(2);
          ladenZeichnen();
          updateHUD();
        });
      }
      feld.append(z);
    }
  } else {
    const ids = Object.keys(h.beutel);
    if (!ids.length) {
      const p = document.createElement('p');
      p.className = 'punkte-hinweis';
      p.textContent = 'Du hast nichts, was sie haben will.';
      feld.append(p);
    }
    for (const id of ids.sort((a, b) => DINGE[b].wert - DINGE[a].wert)) {
      const d = DINGE[id];
      const preis = dinge.verkaufswert(id);
      const z = document.createElement('button');
      z.className = 'ding-zeile laden-zeile';
      z.innerHTML = sym(d.sym)
        + `<span class="txt"><b>${d.name}${h.beutel[id] > 1 ? ` ×${h.beutel[id]}` : ''}</b>`
        + `<small>${wirkungText(d)}</small></span>`
        + `<span class="preis">+${preis}<i class="ic-muenze">${ICONS.muenze}</i></span>`;
      z.addEventListener('click', () => {
        if (!dinge.ablegen(h, id)) return;
        h.gold += preis;
        audio.gem(1);
        ladenZeichnen();
        updateHUD();
      });
      feld.append(z);
    }
  }
}

function wirkungText(d) {
  const teile = [];
  if (d.schaden) teile.push(`+${d.schaden} Schaden`);
  if (d.panzer) teile.push(`+${Math.round(d.panzer * 100)}% Rüstung`);
  if (d.leben) teile.push(`+${d.leben} Leben`);
  if (d.magicka) teile.push(`+${d.magicka} Magicka`);
  if (d.tempo) teile.push(`+${Math.round(d.tempo * 100)}% Tempo`);
  if (d.heilt) teile.push(`heilt ${d.heilt}`);
  if (d.magie) teile.push(`+${d.magie} Magicka`);
  return teile.length ? teile.join(' · ') : d.text;
}

/* ------------------------------ Heldenblatt -------------------------------- */
function menuZeichnen(tab = 'fert') {
  for (const b of document.querySelectorAll('.reiter')) {
    b.classList.toggle('an', b.dataset.tab === tab);
  }
  for (const [id, name] of [['tabFert', 'fert'], ['tabBeutel', 'beutel'],
                            ['tabQuests', 'quests'], ['tabWelt', 'welt']]) {
    el(id).classList.toggle('hidden', tab !== name);
  }
  if (tab === 'fert') fertZeichnen();
  if (tab === 'beutel') beutelZeichnen();
  if (tab === 'quests') questsZeichnen();
  if (tab === 'welt') karteZeichnen();
}

/* --------------------------------- Beutel ---------------------------------- */
function beutelZeichnen() {
  const h = held();
  const feld = el('tabBeutel');
  feld.replaceChildren();

  // Was am Körper hängt
  const kopf = document.createElement('div');
  kopf.className = 'rue-reihe';
  for (const art of dinge.TRAGBAR) {
    const id = h.rue[art];
    const platz = document.createElement('button');
    platz.className = 'rue-platz' + (id ? ' voll' : ' leer');
    const sorte = art === 'waffe' ? 'schwert' : art === 'ruestung' ? 'schild' : 'ring';
    platz.innerHTML = id
      ? `${sym(DINGE[id].sym)}<small>${DINGE[id].name}</small>`
      : `${sym(sorte)}<small>${art === 'waffe' ? 'Waffe' : art === 'ruestung' ? 'Rüstung' : 'Schmuck'}</small>`;
    if (id) platz.addEventListener('click', () => { dinge.ausziehen(h, art); audio.step(); beutelZeichnen(); updateHUD(); });
    kopf.append(platz);
  }
  feld.append(kopf);

  const werte = document.createElement('p');
  werte.className = 'punkte-hinweis';
  werte.textContent = `Schaden ${Math.round(fert.werte.schaden(h))}`
    + ` · Rüstung ${Math.round(Math.min(0.6, fert.werte.ruestung(h)) * 100)}%`
    + ` · Leben ${fert.werte.lebenMax(h)}`;
  feld.append(werte);

  const ids = Object.keys(h.beutel).sort((a, b) => DINGE[b].wert - DINGE[a].wert);
  if (!ids.length) {
    const p = document.createElement('p');
    p.className = 'punkte-hinweis';
    p.textContent = 'Der Beutel ist leer. Gruften sind voll.';
    feld.append(p);
    return;
  }
  for (const id of ids) {
    const d = DINGE[id];
    const z = document.createElement('div');
    z.className = 'ding-zeile';
    z.innerHTML = sym(d.sym)
      + `<span class="txt"><b>${d.name}${h.beutel[id] > 1 ? ` ×${h.beutel[id]}` : ''}</b>`
      + `<small>${d.text}</small></span>`;
    const tun = document.createElement('button');
    tun.className = 'ding-tun';
    if (dinge.TRAGBAR.includes(d.art)) {
      tun.textContent = 'anlegen';
      tun.addEventListener('click', () => { dinge.anlegen(h, id); audio.gem(2); beutelZeichnen(); updateHUD(); });
    } else if (d.art === 'trank') {
      tun.textContent = 'trinken';
      tun.addEventListener('click', () => { trinkenGezielt(id); beutelZeichnen(); });
    } else {
      tun.innerHTML = `${dinge.verkaufswert(id)}<i class="ic-muenze">${ICONS.muenze}</i>`;
      tun.classList.add('still');
    }
    z.append(tun);
    feld.append(z);
  }
}

function trinkenGezielt(id) {
  const h = held();
  const d = DINGE[id];
  if (!dinge.ablegen(h, id)) return;
  if (d.heilt) h.hp = Math.min(fert.werte.lebenMax(h), h.hp + d.heilt);
  if (d.magie) h.magicka = Math.min(fert.werte.magickaMax(h), h.magicka + d.magie);
  audio.chomp();
  updateHUD();
}

function fertZeichnen() {
  const h = held();
  const feld = el('tabFert');
  feld.replaceChildren();

  const hinweis = document.createElement('p');
  hinweis.className = 'punkte-hinweis';
  hinweis.textContent = h.punkte > 0
    ? `${h.punkte} Punkt${h.punkte > 1 ? 'e' : ''} zu vergeben`
    : 'Fertigkeiten steigen dadurch, dass du sie benutzt.';
  feld.append(hinweis);

  for (const [id, f] of Object.entries(fert.FERTIGKEITEN)) {
    const z = document.createElement('div');
    z.className = 'fert-zeile';
    z.innerHTML = sym(f.sym)
      + `<span class="txt"><b>${f.name}</b><small>${f.hinweis}</small></span>`
      + `<span class="stufe-zahl">${h.fert[id]}</span>`;
    feld.append(z);

    for (const v of fert.VORTEILE.filter((x) => x.fert === id)) {
      const hat = h.vorteile.has(v.id);
      const kann = !hat && h.punkte > 0 && h.fert[id] >= v.stufe;
      const b = document.createElement('button');
      b.className = 'vorteil' + (hat ? ' hat' : kann ? '' : ' aus');
      b.innerHTML = `<b>${hat ? '✓ ' : ''}${v.name}</b><small>${v.text}`
        + `${hat ? '' : ` — ab ${f.name} ${v.stufe}`}</small>`;
      if (kann) {
        b.addEventListener('click', () => {
          if (fert.vorteilNehmen(h, v.id)) { audio.gem(3); fertZeichnen(); updateHUD(); }
        });
      }
      feld.append(b);
    }
  }
}

function questsZeichnen() {
  const feld = el('tabQuests');
  feld.replaceChildren();

  const st = state.geschichte;
  const k = story.aktuell(st);
  if (k && st.gestartet) {
    const z = document.createElement('div');
    z.className = 'q-zeile haupt' + (story.kapitelFertig(st) ? ' fertig' : '');
    z.innerHTML = `<b>✦ ${k.titel}</b>`
      + `<p>${story.fuellen(k.rede, st, schlundRichtung()).split('\n')[0]}</p>`
      + `<small>${story.kapitelFertig(st) ? 'zurück zum Chronisten'
          : `${story.fuellen(k.ziel, st)} · ${st.ziel}/${k.menge}`}</small>`;
    feld.append(z);
  } else if (!st.fertig) {
    const z = document.createElement('div');
    z.className = 'q-zeile haupt';
    z.innerHTML = '<b>✦ Der Chronist</b><p>Im Heimatdorf wohnt jemand, der aufschreibt, '
      + 'was aufhört. Sprich mit ihm.</p>';
    feld.append(z);
  }

  const hilfen = document.createElement('p');
  hilfen.className = 'punkte-hinweis';
  hilfen.textContent = `${held().hilfen || 0} Menschen geholfen`;
  feld.append(hilfen);

  const offen = state.buch.offen;
  if (!offen.length) {
    const p = document.createElement('p');
    p.className = 'punkte-hinweis';
    p.textContent = 'Kein Auftrag. Sprich mit den Leuten im Dorf.';
    feld.append(p);
  }
  const verfolgt = state.buch.verfolgt();
  for (const q of offen) {
    const dran = q === verfolgt && !(k && st.gestartet);
    const z = document.createElement('div');
    z.className = 'q-zeile' + (q.fertig ? ' fertig' : '') + (dran ? ' verfolgt' : '');
    z.innerHTML = `<b>${q.titel}</b><p>${q.text}</p>`;

    // Fortschritt und Knopf teilen sich eine Zeile — sonst läuft der Knopf
    // in den Text hinein.
    const fuss = document.createElement('div');
    fuss.className = 'q-fuss';
    const stand = document.createElement('small');
    stand.textContent = (q.fertig ? 'erledigt — zurück zum Geber' : `${q.stand} / ${q.menge}`)
      + ` · ${q.lohn.gold} Gold`;
    const knopf = document.createElement('button');
    knopf.className = 'q-verfolgen' + (dran ? ' an' : '');
    knopf.textContent = dran ? '◆ verfolgt' : '◇ verfolgen';
    knopf.addEventListener('click', () => {
      state.buch.verfolgen(dran ? null : q);
      audio.step();
      questsZeichnen();
      updateHUD();
    });
    fuss.append(stand, knopf);
    z.append(fuss);
    feld.append(z);
  }
  for (const q of state.buch.erledigt.slice(-3)) {
    const z = document.createElement('div');
    z.className = 'q-zeile';
    z.innerHTML = `<b style="opacity:.5">✓ ${q.titel}</b>`;
    feld.append(z);
  }
}

function karteZeichnen() {
  const feld = el('tabWelt');
  feld.replaceChildren();
  const box = document.createElement('div');
  box.className = 'karte-feld';
  const R = 420;
  const px = player.pos.x, pz = player.pos.z;
  const setz = (x, z, klasse) => {
    const l = (x - px) / (R * 2) + 0.5, t = (z - pz) / (R * 2) + 0.5;
    if (l < 0.02 || l > 0.98 || t < 0.02 || t > 0.98) return;
    const s = document.createElement('span');
    s.className = `punkt ${klasse}`;
    s.style.left = `${l * 100}%`;
    s.style.top = `${t * 100}%`;
    box.append(s);
  };
  for (const d of doerferUm(px, pz, R)) setz(d.x, d.z, 'dorf');
  for (const g of gruft.grueftUm(px, pz, R)) setz(g.x, g.z, 'gruft');
  const ziel = zielPunkt();
  if (ziel) setz(ziel.x, ziel.z, 'ziel');
  setz(px, pz, 'du');
  feld.append(box);
  const leg = document.createElement('p');
  leg.className = 'karte-legende';
  leg.innerHTML = '<span class="punkt dorf"></span> Dorf'
    + ' <span class="punkt gruft"></span> Gruft'
    + ' <span class="punkt ziel"></span> Ziel'
    + ' <span class="punkt du"></span> du'
    + `<span class="legende-weite">Umkreis ${R * 2} Schritt</span>`;
  feld.append(leg);
}

/* ------------------------------ Tag und Nacht ------------------------------ */
const underColor = new THREE.Color('#6e5440');
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
  tmpSky.lerp(underColor, state.under);

  // Die Nebelweiten zählen ab Kamera, nicht ab Spieler
  // Untertage darf der Dunst nicht früher einsetzen als über Tage, sonst
  // löst sich die Gruft in helles Nichts auf.
  scene.fog.near = camDist + 14 + state.under * 10;
  scene.fog.far = camDist + 62 + state.under * 26;
  scene.background.copy(tmpSky);
  scene.fog.color.copy(tmpSky);
  renderer.setClearColor(tmpSky);
  sun.color.copy(tmpSun);

  const night = t > 0.78 && t < 0.97;
  const under = state.under;
  sun.intensity = (night ? 0.55 : 1.15) * (1 - under * 0.4);
  hemi.intensity = (night ? 0.55 : 0.95) * (1 - under * 0.3) + under * 0.3;

  const ang = (t - 0.25) * Math.PI * 2;
  sun.position.set(
    player.pos.x + Math.cos(ang) * 50,
    player.pos.y + 26 + Math.max(8, Math.sin(ang) * 50),
    player.pos.z + 28
  );
  sun.target.position.copy(player.pos);
  sun.target.updateMatrixWorld();
}

/* ------------------------------- Draußen leben ----------------------------- */
let wildTimer = 4;
function wildnisPflegen(dt) {
  wildTimer -= dt;
  if (wildTimer > 0) return;
  wildTimer = 5 + Math.random() * 6;
  if (state.imDungeon) return;
  if (feinde.anzahl >= 9) return;

  // Nicht im Dorf: dort soll man verschnaufen können
  if (dorfBei(Math.floor(player.pos.x), Math.floor(player.pos.z))) return;

  const nacht = state.time > 0.76 || state.time < 0.12;
  const a = Math.random() * Math.PI * 2;
  const r = 32 + Math.random() * 22;
  const x = Math.round(player.pos.x + Math.cos(a) * r);
  const z = Math.round(player.pos.z + Math.sin(a) * r);
  const y = surfaceAt(x, z);
  if (y <= SEA) return;
  if (dorfBei(x, z)) return;

  const art = nacht && Math.random() < 0.45 ? 'raeuber' : 'wolf';
  const stufe = 1 + Math.min(4, Math.floor(Math.hypot(x, z) / 500));
  feinde.spawn(art, x + 0.5, y + 1, z + 0.5, stufe);
}

/* -------------------------------- Schleife --------------------------------- */
const clock = new THREE.Clock();
let saveTimer = 0;

function frame() {
  requestAnimationFrame(frame);
  const raw = Math.min(clock.getDelta(), 1 / 20);
  const dt = juice.update(raw);

  if (state.running && !state.gespraech && !ladenWirt) {
    const h = held();
    const move = input.read();
    player.tempo = fert.werte.tempo(h);
    player.update(dt, move, world);
    // Häuser sind Modelle, keine Blöcke — hier erst werden sie fest
    const raus = doerfer.wegSchieben(player.pos.x, player.pos.z);
    if (raus) { player.pos.x = raus.x; player.pos.z = raus.z; }
    world.update(player.pos.x, player.pos.z, 1);
    doerfer.update(player.pos.x, player.pos.z);
    leute.update(dt, world, doerfer, player.pos);
    gruftenPflegen(player.pos.x, player.pos.z);
    feinde.update(dt, world, player.pos, !state.dead);
    feinde.aufraeumen(player.pos.x, player.pos.z, 130);
    wildnisPflegen(dt);

    const vorher = state.time;
    state.time = (state.time + dt / DAY) % 1;
    if (state.time < vorher) state.tag++;    // ein Tag ist herum, die Läden füllen auf
    if (state.hieb > 0) state.hieb -= dt;
    if (state.zauber > 0) state.zauber -= dt;

    // Ausdauer und Magicka füllen sich von allein
    h.ausdauer = Math.min(h.ausdauerMax, h.ausdauer + 16 * dt);
    const magTempo = h.vorteile.has('magie4') ? 6 : 3.4;
    h.magicka = Math.min(fert.werte.magickaMax(h), h.magicka + magTempo * dt);
    // Nach dem Kampf heilt es langsam, wenn nichts in der Nähe ist
    const ruhe = !feinde.ziel(player.pos, player.facing, 14);
    const hpMaxJetzt = fert.werte.lebenMax(h);
    if (ruhe && h.hp < hpMaxJetzt) {
      h.hp = Math.min(hpMaxJetzt, h.hp + (h.vorteile.has('zaehe4') ? 3.2 : 1.4) * dt);
    }

    // Sturz kostet Leben
    if (player.onGround) {
      if (state.fallFrom !== null) {
        const sturz = state.fallFrom - player.pos.y;
        if (sturz > 5) spielerNimmtSchaden(Math.round((sturz - 5) * 6), null);
        state.fallFrom = null;
      }
    } else {
      state.fallFrom = state.fallFrom === null
        ? player.pos.y : Math.max(state.fallFrom, player.pos.y);
    }

    // Wo sind wir gerade?
    const dorf = doerfer.dorfUnter(player.pos.x, player.pos.z);
    const surface = surfaceAt(Math.floor(player.pos.x), Math.floor(player.pos.z));
    const tief = surface - player.pos.y;

    const jetztDrin = tief >= 2 ? gruftUnter(player.pos.x, player.pos.y, player.pos.z) : null;
    if (jetztDrin !== state.imDungeon) {
      if (state.imDungeon) {
        state.imDungeon.gefuellt = false;
        // Was in der alten Gruft steht, bleibt nicht draußen stehen
        for (const f of [...feinde.liste]) if (f.herkunft === state.imDungeon.id) feinde.entfernen(f);
        for (const t of [...truhen]) {
          if (t.gruft === state.imDungeon) { scene.remove(t.obj); truhen.splice(truhen.indexOf(t), 1); }
        }
      }
      state.imDungeon = jetztDrin;
      if (jetztDrin) {
        state.ort = jetztDrin.name;
        meldung(jetztDrin.name, '#4a3b30', 3.0);
        if (jetztDrin.schlund && story.melden(state.geschichte, 'schlund', {})) {
          story.weiter(state.geschichte);       // im Schlund beginnt sofort der Wächter
          state.geschichte.gestartet = true;
          state.geschichte.ziel = 0;
          meldung('Etwas wartet weiter unten.', '#c9543f', 3.4);
        }
      }
    }

    if (!state.imDungeon) {
      const neuerOrt = dorf ? ortsname(dorf) : 'Wildnis';
      if (neuerOrt !== state.ort) {
        state.ort = neuerOrt;
        if (dorf) {
          const fertigeQ = state.buch.melden('gehen', { ort: neuerOrt });
          for (const q of fertigeQ) meldung(`„${q.titel}" erledigt`, '#7fae5e', 3.0);
          // Fremde Dörfer zählen für die Geschichte, das Heimatdorf nicht
          const fremd = !state.heimat || dorf.i !== state.heimat.i || dorf.j !== state.heimat.j;
          if (fremd && story.melden(state.geschichte, 'doerfer', { ort: neuerOrt })) {
            kapitelGeschafft();
          }
        }
      }
    }

    // Die Welt über dem Kopf wegschneiden, sobald wir unter Tage sind
    const wantCut = player.pos.y + 3 < surface ? Math.floor(player.pos.y) + 5 : HEIGHT + 4;
    state.cut += (wantCut - state.cut) * Math.min(1, dt * 7);
    cutPlane.constant = Math.round(state.cut) - 0.03;

    state.under = Math.max(0, Math.min(1, tief / 4));
    applyDaytime();
    const night = state.time > 0.78 && state.time < 0.97 ? 1 : 0;
    peek.uPeek.value.set(player.pos.x, player.pos.y + 2.9, player.pos.z);
    fussring.position.set(player.pos.x, player.pos.y + 0.06, player.pos.z);
    lamp.position.set(player.pos.x, player.pos.y + 1.7, player.pos.z);
    lamp.intensity = Math.max(state.under, night * 0.55) * 14;
    lamp.distance = 26;

    const darkU = post.compositeMat.uniforms;
    darkU.uDark.value = Math.max(state.under * 0.3, night * 0.45);
    darkU.uDarkTint.value.set(0.72, 0.58, 0.46);

    // Zielleiste über dem Gegner, den wir gerade treffen würden
    const z = feinde.ziel(player.pos, player.facing, 3.4);
    ui.ziel.classList.toggle('hidden', !z);
    if (z) {
      ui.zielName.textContent = `${z.art.name}`;
      ui.zielHp.style.width = `${Math.max(0, z.hp / z.hpMax * 100)}%`;
    }
    // Der Reden-Knopf erscheint nur, wenn es etwas zu tun gibt
    const w = was();
    ui.rede.classList.toggle('hidden', !w);
    if (w && w.art !== ui.rede.dataset.art) {
      ui.rede.dataset.art = w.art;
      symbol(ui.rede, w.art === 'npc' ? 'rede' : w.art === 'truhe' ? 'truhe'
        : w.art === 'glimm' ? 'kristall' : w.art === 'waechter' ? 'kerze' : 'tor');
    }

    pfeilPflegen(dt);

    hudTimer -= dt;
    if (hudTimer <= 0) { hudTimer = 0.22; updateHUD(); }
    saveTimer -= dt;
    if (saveTimer <= 0) { saveTimer = 10; writeSave(); }
  }

  const want = state.camPos.copy(player.pos).addScaledVector(CAM_DIR, camDist);
  camera.position.lerp(want, 1 - Math.pow(0.002, raw));
  camera.lookAt(player.pos.x, player.pos.y + 1, player.pos.z);
  juice.applyToCamera();
  post.render(scene, camera);
}

/* --------------------------------- Knöpfe ---------------------------------- */
el('hauBtn').addEventListener('click', zuschlagen);
el('wirkBtn').addEventListener('click', zaubern);
el('redeBtn').addEventListener('click', handeln);
el('trinkBtn').addEventListener('click', trinken);
el('ladenZu').addEventListener('click', ladenSchliessen);
for (const b of document.querySelectorAll('.lreiter')) {
  b.addEventListener('click', () => { ladenSeite = b.dataset.seite; ladenZeichnen(); });
}
el('laden').addEventListener('click', (e) => { if (e.target === el('laden')) ladenSchliessen(); });

el('menuBtn').addEventListener('click', () => {
  menuZeichnen('fert');
  el('menu').classList.remove('hidden');
});
el('menuZu').addEventListener('click', () => el('menu').classList.add('hidden'));
for (const b of document.querySelectorAll('.reiter')) {
  b.addEventListener('click', () => menuZeichnen(b.dataset.tab));
}
el('rede').addEventListener('click', (e) => { if (e.target === el('rede')) redeSchliessen(); });

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === ' ' || k === 'j') { zuschlagen(); e.preventDefault(); }
  if (k === 'k') zaubern();
  if (k === 'e') handeln();
  if (k === 'h') trinken();
  if (k === 'i') { menuZeichnen('fert'); el('menu').classList.toggle('hidden'); }
  if (k === 'escape') { redeSchliessen(); ladenSchliessen(); el('menu').classList.add('hidden'); }
});

const soundBtn = el('soundBtn');
let muted = false;
try { muted = localStorage.getItem('talkunde-muted') === '1'; } catch (err) { /* egal */ }
audio.setMuted(muted);
symbol(soundBtn, muted ? 'tonAus' : 'tonAn');
soundBtn.addEventListener('click', () => {
  muted = !muted;
  audio.unlock();
  audio.setMuted(muted);
  symbol(soundBtn, muted ? 'tonAus' : 'tonAn');
  try { localStorage.setItem('talkunde-muted', muted ? '1' : '0'); } catch (err) { /* egal */ }
});

/* ------------------------------- Bildgröße --------------------------------- */
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, quality === 'high' ? 2 : 1.5);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  post.setSize(w, h, dpr);
  camera.aspect = w / h;
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
    c.left = -60; c.right = 60; c.top = 60; c.bottom = -60; c.near = 1; c.far = 220;
    c.updateProjectionMatrix();
  }
  post.iterations = high ? 2 : 1;
  el('qualityBtn').classList.toggle('off', !high);
  resize();
}
el('qualityBtn').addEventListener('click', () => {
  quality = quality === 'high' ? 'low' : 'high';
  applyQuality();
});

/* ------------------------------ Spielstand --------------------------------- */
function writeSave() {
  if (!state.running || state.dead) return;
  const h = held();
  save.save({
    seed: getSeed(),
    edits: save.packEdits(world.edits),
    pos: [player.pos.x, player.pos.y, player.pos.z],
    time: state.time,
    tag: state.tag,
    held: {
      stufe: h.stufe, xp: h.xp, xpZiel: h.xpZiel, punkte: h.punkte, gold: h.gold,
      hp: h.hp, hpMax: h.hpMax, ausdauer: h.ausdauer, ausdauerMax: h.ausdauerMax,
      magicka: h.magicka, magickaMax: h.magickaMax, fert: h.fert, fertXp: h.fertXp || {},
      vorteile: [...h.vorteile], getoetet: h.getoetet, hilfen: h.hilfen || 0,
      dungeons: [...h.dungeons],
      beutel: h.beutel, rue: h.rue,
    },
    quests: { offen: state.buch.offen, erledigt: state.buch.erledigt.slice(-8) },
    geschichte: state.geschichte,
  });
}

function weltLeeren() {
  for (const [k, chunk] of [...world.chunks]) {
    for (const key of ['mesh', 'water']) {
      if (chunk[key]) { scene.remove(chunk[key]); chunk[key].geometry.dispose(); }
    }
    world.chunks.delete(k);
  }
  world.queue.length = 0;
  doerfer.clear();
  leute.clear();
  feinde.clear();
  for (const t of truhen) scene.remove(t.obj);
  truhen.length = 0;
  for (const t of tore) scene.remove(t.obj);
  tore.length = 0;
}

function startplatz() {
  const nah = doerferUm(0, 0, 1200).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  if (nah.length) return { x: nah[0].x + 4, z: nah[0].z + 4, dorf: nah[0] };
  return { x: 0, z: 0, dorf: null };
}

/* Die Geschichte braucht feste Orte: ein Heimatdorf mit dem Chronisten, eine
   benannte Gruft für das Siegel und den Schlund ganz draußen. Alle drei stehen
   im Saatkorn, also findet sie jeder Neustart derselben Welt wieder. */
function welteinrichtung(heimat) {
  state.heimat = heimat;
  doerfer.heimatKey = heimat ? `${heimat.i},${heimat.j}` : null;

  const mitteX = heimat ? heimat.x : 0, mitteZ = heimat ? heimat.z : 0;
  const alle = gruft.grueftUm(mitteX, mitteZ, 1300);
  if (!alle.length) return;

  const nachEntfernung = [...alle].sort((a, b) =>
    Math.hypot(a.x - mitteX, a.z - mitteZ) - Math.hypot(b.x - mitteX, b.z - mitteZ));

  // Die Gruft aus Kapitel 1: nah genug, um sie früh zu schaffen
  const siegelGruft = nachEntfernung[Math.min(1, nachEntfernung.length - 1)];
  state.geschichte.gruftId = siegelGruft.id;
  state.geschichte.gruftName = siegelGruft.name;

  // Der Schlund: die entfernteste, und sie wird tiefer und härter als alles
  const fern = nachEntfernung[nachEntfernung.length - 1];
  fern.schlund = true;
  fern.name = 'Der Schlund';
  fern.stufe = 5;
  state.schlund = fern;
}

function aufstellen(x, z) {
  world.update(x, z, 95);
  doerfer.update(x, z);
  player.spawn(world, x, z);
  leute.update(0.016, world, doerfer, player.pos);
  gruftenPflegen(x, z);
  state.cut = HEIGHT + 4;
  cutPlane.constant = state.cut;
  state.camPos.copy(player.pos).addScaledVector(CAM_DIR, camDist);
  camera.position.copy(state.camPos);
  camera.lookAt(player.pos);
  applyDaytime();
  updateHUD();
  state.running = true;
}

function neuesSpiel() {
  save.clear();
  setSeed((Math.random() * 1e9) | 0);
  weltLeeren();
  world.edits.clear();
  state.held = fert.neuerHeld();
  state.buch = new Auftragsbuch();
  state.time = 0.3;
  state.dead = false;
  state.imDungeon = null;
  state.fallFrom = null;
  juice.reset();

  const s = startplatz();
  state.geschichte = story.neueGeschichte();
  welteinrichtung(s.dorf);
  state.ort = s.dorf ? ortsname(s.dorf) : 'Wildnis';
  aufstellen(s.x, s.z);
  writeSave();
}

function weiterSpielen(d) {
  setSeed(d.seed);
  weltLeeren();
  world.edits.clear();
  save.unpackEdits(d.edits, world.edits);

  const h = fert.neuerHeld();
  Object.assign(h, d.held);
  h.vorteile = new Set(d.held.vorteile || []);
  h.dungeons = new Set(d.held.dungeons || []);
  state.held = h;

  state.buch = new Auftragsbuch();
  state.buch.offen = (d.quests?.offen || []);
  state.buch.erledigt = (d.quests?.erledigt || []);
  state.time = d.time ?? 0.3;
  state.tag = d.tag ?? 0;
  state.dead = false;
  state.imDungeon = null;
  state.fallFrom = null;
  juice.reset();

  state.geschichte = Object.assign(story.neueGeschichte(), d.geschichte || {});
  welteinrichtung(startplatz().dorf);
  if (d.geschichte) {
    // Die Gruft aus dem Spielstand gewinnt — die Welt kann sich sonst
    // anders entscheiden als beim letzten Mal.
    state.geschichte.gruftId = d.geschichte.gruftId ?? state.geschichte.gruftId;
    state.geschichte.gruftName = d.geschichte.gruftName ?? state.geschichte.gruftName;
  }

  const [px, , pz] = d.pos;
  const dorf = dorfBei(Math.round(px), Math.round(pz));
  state.ort = dorf ? ortsname(dorf) : 'Wildnis';
  aufstellen(Math.round(px), Math.round(pz));
}

/* ------------------------------ Spiel starten ------------------------------ */
el('startBtn').addEventListener('click', () => {
  audio.unlock();
  el('start').classList.add('hidden');
  neuesSpiel();
});

el('endeWeiter').addEventListener('click', () => {
  // Nach dem Ende geht die Welt weiter — sie hört ja nicht auf
  el('ende').classList.add('hidden');
  feinde.clear();
  const s = startplatz();
  state.ort = s.dorf ? ortsname(s.dorf) : 'Wildnis';
  aufstellen(s.x, s.z);
});

el('againBtn').addEventListener('click', () => {
  el('dead').classList.add('hidden');
  // Man wacht im Dorf auf und behält alles bis auf etwas Gold
  const h = held();
  h.gold = Math.round(h.gold * 0.8);
  h.hp = fert.werte.lebenMax(h);
  h.ausdauer = h.ausdauerMax;
  h.magicka = fert.werte.magickaMax(h);
  state.dead = false;
  state.imDungeon = null;
  feinde.clear();
  const s = startplatz();
  state.ort = s.dorf ? ortsname(s.dorf) : 'Wildnis';
  aufstellen(s.x, s.z);
});

const gespeichert = save.load();
if (gespeichert && gespeichert.held) {
  const b = el('resumeBtn');
  b.classList.remove('hidden');
  b.addEventListener('click', () => {
    audio.unlock();
    el('start').classList.add('hidden');
    weiterSpielen(gespeichert);
  });
}

window.addEventListener('pagehide', writeSave);
document.addEventListener('visibilitychange', () => { if (document.hidden) writeSave(); });
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

window.__game = {
  state, player, world, scene, camera, renderer, juice, audio, post, B, BLOCKS,
  doerfer, leute, feinde, truhen, tore, gruft, fert, held,
  handeln, zuschlagen, zaubern, writeSave, save, ortsname, was,
  dinge, trinken, ladenOeffnen, ladenZeichnen, beutelZeichnen,
  story, chronistOeffnen, waechterAnsprechen, endeZeigen, kapitelGeschafft,
  pfeil, zielPunkt, questsZeichnen,
};

resize();
applyQuality();
setSeed(20260916);
world.update(0, 0, 95);
player.spawn(world, 0, 0);
camera.position.copy(player.pos).addScaledVector(CAM_DIR, camDist);
camera.lookAt(player.pos);
updateHUD();
frame();
