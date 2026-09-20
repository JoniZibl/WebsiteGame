import * as THREE from 'three';
import {
  VoxelWorld, B, BLOCKS, AIR, isSolid, setSeed, getSeed, biomeAt, surfaceAt, stratumAt,
  BIOMES,
  kartenBild,
  doerferUm, dorfBei, HEIGHT, SEA, CHUNK, dorfZellenPflegen,
} from './voxel.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { TiltShift } from './postfx.js';
import * as save from './save.js';
import { Doerfer, dorfArt, bauplan } from './village.js';
import { Flora } from './flora.js';
import { Leute } from './npc.js';
import { Feinde, ARTEN } from './combat.js';
import { Geschosse } from './geschoss.js';
import { wesenWaehlen, gefahrVon, GEFAHRWORT, BEWOHNER } from './wesen.js';
import * as gruft from './dungeon.js';
import * as orte from './orte.js';
import * as lager from './lager.js';
import * as fert from './skills.js';
import { Auftragsbuch, auftragFuer } from './quest.js';
import * as dinge from './items.js';
import * as story from './story.js';
import { ICONS, symbol } from './icons.js';
import { peek, anwenden } from './peek.js';
import { DINGE } from './items.js';
import {
  kisteBauen, torBauen, beutelBauen,
  turmBauen, ruineBauen, zeltBauen, feuerBauen, schreinBauen, felsBauen,
} from './props.js';
import { GameAudio } from './audio.js';
import { Juice } from './juice.js';
import { Wetter } from './wetter.js';
import { Ereignisse } from './ereignis.js';
import { ZAUBER, ZAUBER_IDS, ANFANGSZAUBER, gelernte, reichtDieUebung } from './zauber.js';
import { farbenVon, herkunftVon, neuesAussehen, GEWAENDER, HAUT, HAAR, LATERNEN,
  HERKUNFT, NAMEN } from './aussehen.js';

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
const camRoh = new THREE.Vector3(0, 24, 19);   // vor dem Normieren, zum Wandern
/* Die Kamera steht nicht starr. Draußen sieht man weit, im Dorf rückt sie
   heran, in einer Stube steht sie fast senkrecht über dem Raum, beim Rennen
   fällt sie zurück und im Kampf kommt sie näher. Alles wandert weich — ein
   Schnitt würde die Welt zerreißen.

   `hoehe` gegen `weite` ist der Winkel: viel Höhe = von oben, viel Weite =
   flacher über die Schulter. */
const SICHTEN = {
  land:   { dist: 47, hoehe: 24, weite: 19 },
  dorf:   { dist: 40, hoehe: 23, weite: 17 },
  stube:  { dist: 27, hoehe: 26, weite: 11 },
  rennen: { dist: 54, hoehe: 25, weite: 21 },
  kampf:  { dist: 42, hoehe: 22, weite: 18 },
  gruft:  { dist: 34, hoehe: 26, weite: 13 },
};
let camDist = SICHTEN.land.dist;
let camZiel = { ...SICHTEN.land };

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
const flora = new Flora(scene, 4);
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
  hack: 0,            // Pause zwischen zwei Axthieben
  abbau: null,        // woran gerade gearbeitet wird und wie weit
  lager: [],          // was man sich selbst hingestellt hat
  zauber: 0,
  schutz: 0,          // wie lange die Steinhaut noch trägt
  rausch: 0,          // Blutrausch nach einem Tötungsschlag
  hiebe: 0,           // gezählte Treffer — jeder fünfte ist der Meisterhieb
  ort: 'Wildnis',
  imDungeon: null,    // die Gruft, in der wir stecken
  gespraech: null,
  camPos: new THREE.Vector3(),
  fallFrom: null,
  rennt: false,       // Sprint: zieht am Atem
  gelaufen: 0,        // Schritte bis zur nächsten Übung im Wandern
  gegend: null,       // in welcher Gegend wir zuletzt standen
  beutel: null,       // was am Sterbeort liegen geblieben ist
  imHaus: null,       // in wessen vier Wänden wir gerade stehen
  erschoepft: false,  // nach leerer Puste erst bei halbem Balken wieder rennen
  gelesen: new Set(), // schon geöffnete Truhen
  geschichte: story.neueGeschichte(),
  schlund: null,
  heimat: null,
  tag: 0,
  portrait: false,   // steht die Kamera gerade vor der Figur?
  schau: false,      // langsamer Rundblick über dem Titel
};

const DAY = 420;
const held = () => state.held;

const feinde = new Feinde(scene, {
  onTreffer: (f) => spielerNimmtSchaden(f.schaden, f.art.name),
  onTod: (f) => feindGefallen(f),
  onSchuss: (f, rx, rz) => feindSchiesst(f, rx, rz),
  // Der Ring wächst genau so lange, wie das Ausholen dauert — wenn er voll
  // ist, schlägt es zu. Von oben ist das die einzige lesbare Warnung.
  onAusholen: (f, zeit) => {
    juice.ring({ x: f.pos.x, y: f.pos.y + 0.06, z: f.pos.z },
      (f.art.fern && !f.fernSchlag ? 3 : f.art.reichweite + 0.8) * 1.5,
      f.gezeichnet ? '#e8a83c' : '#c9543f', zeit);
    if (f.gezeichnet) audio.step();
  },
});
const geschosse = new Geschosse(scene);
const wetter = new Wetter(scene);

/* Was einem zustößt. Das Ereignis entscheidet wann und was — hier steht,
   wo genau die Gestalten herkommen und was es am Ende gibt. */
const ereignisse = new Ereignisse({
  spawn: (id, lage) => ereignisVolk(id, lage),
  banner: (titel, text, farbe) => bannerZeigen(titel, text, farbe),
  geschafft: (id, zahl) => ereignisGeschafft(id, zahl),
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
  ausBalken: document.querySelector('.balken.ausdauer'),
  mag: document.querySelector('.balken.magicka i'),
  ortName: el('ortName'), ortInfo: el('ortInfo'),
  stufe: el('stufeZahl'), xp: el('xpFill'), gold: el('goldZahl'),
  ziel: el('zielleiste'), zielName: el('zielName'), zielHp: el('zielHp'),
  rede: el('redeBtn'), wirk: el('wirkBtn'), abbau: el('abbauBtn'),
};

/* Die Symbole einmal hineinsetzen. Alles, was sich je nach Lage ändert,
   bekommt sein Symbol dort, wo es sich ändert. */
/** Ein Symbol als Markup — für Listen, die per innerHTML gebaut werden. */
const sym = (name) => `<span class="ic">${ICONS[name] || ''}</span>`;

symbol(el('hauBtn'), 'schwert');
symbol(el('wirkBtn'), 'funke');     // wird von zauberKnopfPflegen() ersetzt
symbol(el('menuBtn'), 'beutel');
symbol(el('qualityBtn'), 'glanz');
symbol(el('redeBtn'), 'rede');
symbol(el('abbauBtn'), 'axt');
for (const m of document.querySelectorAll('.ic-muenze')) m.innerHTML = ICONS.muenze;
// Jeder Reiter trägt sein Zeichen über dem Wort
for (const r of document.querySelectorAll('.reiter[data-sym]')) {
  const i = r.querySelector('i');
  if (i) i.innerHTML = ICONS[r.dataset.sym] || '';
}

let hudTimer = 0;
let letztesZiel = null;
let zielGezeigt = null;
let zielHalten = 0;
let letzteTat = null;
let tatHalten = 0;
function waffeZeigen() {
  const id = held().rue.waffe;
  const d = id ? DINGE[id] : null;
  player.setWaffe(d);
  // Der Knopf zeigt, was er tut: schlagen oder schießen
  const art = d && d.fern ? 'bogen' : 'schwert';
  if (el('hauBtn').dataset.waffe !== art) {
    el('hauBtn').dataset.waffe = art;
    symbol(el('hauBtn'), art);
  }
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
  ui.ausBalken.classList.toggle('wenig', h.ausdauer < 20);
  ui.mag.style.width = `${Math.max(0, h.magicka / magMax * 100)}%`;
  ui.stufe.textContent = h.stufe;
  ui.xp.style.setProperty('--xp', Math.min(100, h.xp / h.xpZiel * 100).toFixed(1));
  ui.gold.textContent = h.gold;
  zauberKnopfPflegen();
  ui.wirk.classList.toggle('leer', h.magicka < zauberkosten(aktiverZauber()));
  trinkKnopfPflegen();

  // Was im Beutel liegt, erledigt Lieferaufträge von selbst
  for (const q of state.buch.beutelPruefen(h)) {
    meldung(`„${q.titel}" — beisammen`, '#7fae5e', 3.0);
  }

  ui.ortName.textContent = state.ort;
  if (state.imDungeon) {
    const a = gruft.artVon(state.imDungeon);
    ui.ortInfo.textContent = `${a.name} · Stufe ${state.imDungeon.stufe}`;
  } else {
    const gegend = biomeAt(Math.floor(player.pos.x), Math.floor(player.pos.z));
    const g = gefahrVon(gegend.id);
    const wie = wetter.anzeige();
    ui.ortInfo.innerHTML = `${gegend.name} <span class="gefahr g${g}">${'◆'.repeat(g)}</span>`
      + (wie ? ` <span class="wetter-wort">· ${wie}</span>` : '');
    gegendWechsel(gegend, g);
  }
}

/* Wer in eine raue Gegend läuft, soll es merken, bevor ihn dort etwas merkt.
   Gewarnt wird nur, solange man dem Ort nicht gewachsen ist — später ist das
   Firnfeld einfach das Firnfeld. */
function gegendWechsel(gegend, g) {
  if (gegend.id === state.gegend) return;
  const vorher = state.gegend;
  state.gegend = gegend.id;
  if (!vorher || g < 3 || held().stufe >= g * 2 - 1) return;
  const wort = g >= 5 ? 'kehr um, solange du kannst'
    : g >= 4 ? 'hier jagt Größeres als du'
    : 'hier wird es rau';
  const farbe = g >= 5 ? '#c9543f' : g >= 4 ? '#d4703a' : '#e8a83c';
  meldung(`${gegend.name} — ${wort}`, farbe, 3.4);
  if (g >= 5) juice.shake(0.25);
}

/* ------------------------------ Was wird verfolgt? -------------------------
 * Pfeil und Auftragsliste müssen sich einig sein. Also entscheidet das
 * eine Funktion, und die andere fragt sie.
 * -------------------------------------------------------------------------- */
function verfolgtes() {
  const st = state.geschichte;
  const kapitel = st.fertig ? null : story.aktuell(st);
  const q = state.buch.verfolgt();

  // Eigene Wahl zuerst
  if (state.buch.verfolgtHaupt() && kapitel) return { art: 'haupt', kapitel };
  if (state.buch.verfolgtNr != null && q) return { art: 'quest', q };

  // Ohne Wahl: die Geschichte, sobald sie läuft
  if (st.gestartet && kapitel) return { art: 'haupt', kapitel };
  if (q) return { art: 'quest', q };
  if (kapitel) return { art: 'haupt', kapitel };
  return null;
}

function meldung(text, farbe = '#4a3b30', hoch = 2.4) {
  juice.popup({ x: player.pos.x, y: player.pos.y + hoch, z: player.pos.z }, text, farbe);
}

/* --------------------------------- Kampf ---------------------------------- */
function spielerNimmtSchaden(menge, von) {
  if (state.dead || !state.running) return;
  const h = held();
  const abgewehrt = menge * Math.min(fert.werte.panzerdeckel(h), fert.werte.ruestung(h));
  // Die Steinhaut kommt obendrauf — sie ist der Grund, warum man sie wirkt
  const echt = Math.max(1, Math.round((menge - abgewehrt) * (state.schutz > 0 ? 0.5 : 1)));
  h.hp -= echt;
  // Letzter Wille: einmal am Tag bleibt genau ein Funke Leben übrig
  if (h.hp <= 0 && h.vorteile.has('zaehe8') && h.willeTag !== state.tag) {
    h.willeTag = state.tag;
    h.hp = 1;
    juice.ring({ x: player.pos.x, y: player.pos.y + 0.8, z: player.pos.z }, 4, '#e8a83c', 0.8);
    juice.shake(0.7);
    meldung('Letzter Wille', '#e8a83c', 2.8);
  }
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
  if (h.vorteile.has('klinge6')) state.rausch = 5;
  h.erlegt = h.erlegt || {};
  h.erlegt[f.id] = (h.erlegt[f.id] || 0) + 1;
  h.gesehen = h.gesehen || new Set();
  h.gesehen.add(f.id);
  h.gold += f.art.gold;

  // Was ein Gegner hinterlässt: meist Krempel, selten etwas Brauchbares
  const stufe = state.imDungeon ? state.imDungeon.stufe : 1;
  const rand = Math.random;
  // Was ein Wesen an sich trägt, fällt nur bei ihm — daran sieht man später,
  // wo man überall gewesen ist.
  if (f.gezeichnet) {
    // Wer einen Gezeichneten legt, soll es auch im Beutel merken
    h.gold += 20 + stufe * 12;
    dinge.nehmen(h, dinge.beuteZiehen(rand, Math.min(4, (f.art.stufe || 1) + 1)));
    juice.ring({ x: f.pos.x, y: f.pos.y + 0.8, z: f.pos.z }, 4.2, '#e8a83c', 0.7);
  }
  if ((f.art.beute && rand() < 0.55) || (f.gezeichnet && f.art.beute)) {
    // Sammler nimmt manchmal beides mit
    dinge.nehmen(h, f.art.beute, h.vorteile.has('spuren3') && rand() < 0.25 ? 2 : 1);
    fert.uebung(h, 'spuren', 1);        // Ausnehmen ist auch Spürarbeit
    juice.popup({ x: f.pos.x, y: f.pos.y + 1.4, z: f.pos.z },
      DINGE[f.art.beute].name, '#7fae5e');
  }
  // Krempel und Tränke tragen nur die, die überhaupt etwas mit sich führen
  const traegt = f.art.boss || f.art.gold > 0;
  if (traegt && (f.art.boss || rand() < 0.28 * fert.werte.beute(h))) {
    const id = f.art.boss ? dinge.beuteZiehen(rand, stufe + 2) : dinge.beuteZiehen(rand, stufe, true);
    dinge.nehmen(h, id);
    juice.popup({ x: f.pos.x, y: f.pos.y + 1.1, z: f.pos.z },
      DINGE[id].name, '#7fae5e');
  }
  audio.kill();
  juice.shake(0.35);
  juice.ring({ x: f.pos.x, y: f.pos.y + 0.6, z: f.pos.z }, 2.4, '#e8a83c');
  const xp = Math.round(f.art.xp * (f.gezeichnet ? 2.2 : 1));
  const auf = fert.xpGeben(h, xp);
  juice.popup({ x: f.pos.x, y: f.pos.y + 1.8, z: f.pos.z }, `+${xp} EP`, '#e8a83c');
  if (auf) {
    audio.gem(3);
    meldung(`Stufe ${h.stufe}!`, '#e8a83c', 3.2);
  }
  const fertigeQ = [
    ...state.buch.melden('toeten',
      { imDungeon: !!state.imDungeon, friedlich: f.gesinnung === 'friedlich' }),
    // Ein erlegtes Wesen zählt gleich für mehrere Arten von Auftrag
    ...state.buch.melden('jagd', { wesen: f.id }),
    ...state.buch.melden('gezeichnet', { gezeichnet: !!f.gezeichnet }),
    ...state.buch.melden('ort', { ortId: f.herkunft }),
  ];
  for (const q of fertigeQ) meldung(`„${q.titel}" erledigt`, '#7fae5e', 3.0);
  if (f.gezeichnet && story.melden(state.geschichte, 'gezeichnet', {})) kapitelGeschafft();
  if (f.id === 'waechter' && story.melden(state.geschichte, 'waechter', {})) {
     endeZeigen('klinge');
  }
  updateHUD();
}

/* --------------------------------- Fernkampf -------------------------------
 * Derselbe Knopf, anderes Werkzeug: liegt ein Bogen in der Hand, schießt er.
 * Gezielt wird mit der Laufrichtung — am Handy hat man keine zweite Hand übrig.
 * Was im Blickkegel steht, zieht den Pfeil ein Stück zu sich; ohne diese Hilfe
 * trifft man von oben herab so gut wie nie.
 * -------------------------------------------------------------------------- */
function zielHilfe(weite = 22, kegel = 0.9) {
  let best = null, bestWert = Infinity;
  for (const f of feinde.liste) {
    if (f.gesinnung === 'friedlich') continue;
    const dx = f.pos.x - player.pos.x, dz = f.pos.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > weite || Math.abs(f.pos.y - player.pos.y) > 6) continue;
    const winkel = Math.abs(((Math.atan2(dx, dz) - player.facing + Math.PI * 3)
      % (Math.PI * 2)) - Math.PI);
    if (winkel > kegel) continue;
    const wert = d + winkel * 14;
    if (wert < bestWert) { bestWert = wert; best = { x: dx / d, z: dz / d, d }; }
  }
  return best;
}

function schiessen(waffe) {
  const h = held();
  if (state.hieb > 0 || h.ausdauer < 10) return;
  state.hieb = 0.62 * (h.vorteile.has('klinge3') ? 0.8 : 1);
  h.ausdauer -= 10;
  player.swing = 0.3;
  audio.shoot();

  const ziel = zielHilfe();
  const rx = ziel ? ziel.x : Math.sin(player.facing);
  const rz = ziel ? ziel.z : Math.cos(player.facing);
  const schaden = Math.round(fert.werte.schaden(h) * (0.85 + Math.random() * 0.3) * kampfgeist());
  geschosse.schiessen(waffe.fern, player.pos.x + rx * 0.7, player.pos.y + 1.1,
    player.pos.z + rz * 0.7, rx, rz, schaden, 'spieler', ziel ? ziel.d : 26);
  fert.uebung(h, 'klinge', 1);
  juice.shake(0.12);
  updateHUD();
}

function feindSchiesst(f, rx, rz) {
  geschosse.schiessen(f.art.fern, f.pos.x + rx * 0.8, f.pos.y + f.art.hoehe * 0.7,
    f.pos.z + rz * 0.8, rx, rz, f.schaden, 'feind',
    Math.hypot(player.pos.x - f.pos.x, player.pos.z - f.pos.z));
  audio.shoot();
}

/* --------------------------- Schritte und Staub ----------------------------
 * Die Figur lief lautlos über die Welt. Jetzt hört man jeden Fuß, und wo er
 * aufkommt, staubt es — auf Sand mehr, im Gras fast nichts, im Wasser
 * spritzt es. Das ist der halbe Unterschied zwischen Gleiten und Gehen.
 * -------------------------------------------------------------------------- */
const GRUND_ZU_TON = {
  [B.gras]: 'gras', [B.moor]: 'gras', [B.taiga]: 'gras', [B.heide]: 'gras',
  [B.sand]: 'sand', [B.trocken]: 'sand', [B.schnee]: 'sand',
  [B.stein]: 'stein', [B.kies]: 'stein', [B.rotfels]: 'stein', [B.grundstein]: 'stein',
  [B.planke]: 'holz', [B.weg]: 'sand',
};
const STAUB_FARBE = {
  gras: '#9fbf7a', sand: '#e6d9bd', stein: '#bdb6a6', holz: '#c9a06a', wasser: '#9fd0cf',
};

function grundUnter() {
  if (player.inWater) return 'wasser';
  const b = world.get(Math.floor(player.pos.x), Math.floor(player.pos.y - 0.4),
    Math.floor(player.pos.z));
  return GRUND_ZU_TON[b] || 'gras';
}

function schritteHoeren() {
  const f = player.fussAuf;
  if (!f) return;
  const grund = grundUnter();
  audio.step(f.stark, grund);
  // Im Gras staubt es kaum, auf Düne und Weg dafür ordentlich
  const menge = grund === 'gras' ? 0.35 : grund === 'wasser' ? 0.8 : 1;
  if (f.landung || Math.random() < menge) {
    juice.staub({ x: player.pos.x, y: player.pos.y, z: player.pos.z },
      f.stark * menge * (f.landung ? 1.6 : 1), STAUB_FARBE[grund]);
  }
}

/** Was der Blutrausch gerade obendrauf legt. */
function kampfgeist() {
  return state.rausch > 0 ? 1.3 : 1;
}

/** Die Richtung vom Spieler zu einem Ziel — für den Rückstoß. */
function richtungZu(f) {
  const dx = f.pos.x - player.pos.x, dz = f.pos.z - player.pos.z;
  const d = Math.hypot(dx, dz) || 1;
  return { x: dx / d, z: dz / d };
}

function zuschlagen() {
  const h = held();
  const waffe = h.rue.waffe ? DINGE[h.rue.waffe] : null;
  if (waffe && waffe.fern) { schiessen(waffe); return; }
  if (state.hieb > 0 || h.ausdauer < 12) return;
  state.hieb = 0.44 * (h.vorteile.has('klinge3') ? 0.8 : 1);
  h.ausdauer -= 12;
  player.swing = 0.28;
  audio.hit();

  const ziel = feinde.ziel(player.pos, player.facing, 2.7);
  if (!ziel) { juice.shake(0.1); return; }

  // Meisterhieb zählt mit statt zu würfeln — so weiß man, wann er kommt
  state.hiebe++;
  const meister = h.vorteile.has('klinge8') && state.hiebe % 5 === 0;
  let schaden = Math.round(fert.werte.schaden(h) * (0.85 + Math.random() * 0.3) * kampfgeist());
  if (meister) schaden *= 2;
  feinde.schlagen(ziel, schaden, richtungZu(ziel));
  fert.uebung(h, 'klinge', 1);
  juice.shake(meister ? 0.5 : 0.28);
  juice.freeze(meister ? 0.06 : 0.03);
  juice.popup({ x: ziel.pos.x, y: ziel.pos.y + 1.6, z: ziel.pos.z },
    meister ? `${schaden}!` : `${schaden}`, meister ? '#e8a83c' : '#fdf6e8');

  if (h.vorteile.has('klinge4')) {
    const zweit = feinde.ziel(player.pos, player.facing + 0.9, 2.7);
    if (zweit && zweit !== ziel) {
      feinde.schlagen(zweit, Math.round(schaden * 0.7), richtungZu(zweit));
    }
  }
  updateHUD();
}

/* --------------------------------- Zauber ----------------------------------
 * Magie war lange ein Knopf. Jetzt ist sie ein Regal: was der Held gelernt
 * hat, steht in `held.zauber`, einer davon liegt auf dem Knopf. Kurz tippen
 * wirkt ihn, lang drücken blättert weiter — auf dem Handy will man dafür
 * nicht ins Menü.
 * -------------------------------------------------------------------------- */
function aktiverZauber() {
  const h = held();
  const kann = gelernte(h);
  if (!kann.includes(h.aktiverZauber)) h.aktiverZauber = ANFANGSZAUBER;
  return ZAUBER[h.aktiverZauber];
}

/** Was ein Spruch diesen Helden kostet — Sparsam schlägt hier durch. */
function zauberkosten(z) {
  return Math.round(z.kosten * (held().vorteile.has('magie3') ? 0.8 : 1));
}

function zauberKnopfPflegen() {
  const z = aktiverZauber();
  const b = el('wirkBtn');
  if (b.dataset.zauber !== z.sym) {
    b.dataset.zauber = z.sym;
    symbol(b, z.sym);
  }
  b.title = `${z.name} — ${zauberkosten(z)} Magicka`;
}

function zauberWaehlen(id, still = false) {
  const h = held();
  if (!gelernte(h).includes(id)) return false;
  h.aktiverZauber = id;
  zauberKnopfPflegen();
  if (!still) {
    meldung(ZAUBER[id].name, ZAUBER[id].farbe, 2.6);
    audio.gem(2);
  }
  updateHUD();
  return true;
}

/** Lang auf den Zauberknopf: der nächste Spruch kommt nach vorn. */
function zauberBlaettern() {
  const h = held();
  const kann = gelernte(h);
  if (kann.length < 2) {
    meldung('Du kennst nur den einen Spruch.', '#8a7f70', 2.6);
    return;
  }
  aktiverZauber();                       // richtet h.aktiverZauber gerade
  const i = Math.max(0, kann.indexOf(h.aktiverZauber));
  zauberWaehlen(kann[(i + 1) % kann.length]);
}

/** Ein Buch lesen. Wer zu wenig Magie hat, legt es wieder weg. */
function zauberLernen(id) {
  const h = held();
  const d = DINGE[id];
  const z = ZAUBER[d.lehrt];
  if (!z) return;
  h.zauber = h.zauber instanceof Set ? h.zauber : new Set(h.zauber || []);
  if (h.zauber.has(d.lehrt)) {
    meldung('Den kannst du schon.', '#8a7f70', 2.6);
    return;
  }
  if (!reichtDieUebung(h, d.lehrt)) {
    meldung(`Dafür braucht es Magie ${z.braucht}.`, '#c9543f', 2.6);
    return;
  }
  if (!dinge.ablegen(h, id)) return;
  h.zauber.add(d.lehrt);
  h.aktiverZauber = d.lehrt;
  zauberKnopfPflegen();
  audio.gem(4);
  juice.ring({ x: player.pos.x, y: player.pos.y + 1.2, z: player.pos.z }, 3, z.farbe, 0.7);
  meldung(`Gelernt: ${z.name}`, z.farbe, 2.8);
  fert.uebung(h, 'magie', 2);
  updateHUD();
}

function zaubern() {
  const h = held();
  const z = aktiverZauber();
  if (state.zauber > 0) return;
  const kosten = zauberkosten(z);
  if (h.magicka < kosten) { juice.shake(0.08); return; }
  state.zauber = (z.wirkung === 'geschoss' ? 0.5 : 0.75)
    * (h.vorteile.has('magie6') ? 0.6 : 1);
  h.magicka -= kosten;
  player.swing = 0.3;
  audio.spit();

  const kraft = fert.werte.zauber(h);
  const mitte = { x: player.pos.x, y: player.pos.y + 0.6, z: player.pos.z };
  let getroffen = 0;

  switch (z.wirkung) {
    /* Alles ringsum — der alte Funkenschlag und sein großer Bruder */
    case 'welle': {
      for (const f of [...feinde.liste]) {
        const d = Math.hypot(f.pos.x - player.pos.x, f.pos.z - player.pos.z);
        if (d > z.weite || Math.abs(f.pos.y - player.pos.y) > 3.5) continue;
        feinde.schlagen(f, Math.round(kraft * z.kraft), z.stoss ? richtungZu(f) : null);
        getroffen++;
      }
      juice.ring(mitte, z.weite, z.farbe, z.stoss ? 0.8 : 0.55);
      if (z.stoss) juice.ring(mitte, z.weite * 0.6, '#fdf6e8', 0.5);
      juice.shake(z.stoss ? 0.65 : 0.3);
      break;
    }

    /* Ein Ding fliegt los. Die Wirkung beim Treffer hängt am Geschoss. */
    case 'geschoss': {
      const ziel = zielHilfe();
      const rx = ziel ? ziel.x : Math.sin(player.facing);
      const rz = ziel ? ziel.z : Math.cos(player.facing);
      const g = geschosse.schiessen(z.geschoss, player.pos.x + rx * 0.7,
        player.pos.y + 1.1, player.pos.z + rz * 0.7, rx, rz,
        Math.round(kraft * z.kraft), 'spieler', ziel ? ziel.d : 26);
      if (z.lahm) g.lahm = z.lahm;
      g.farbe = z.farbe;
      juice.shake(0.12);
      getroffen = 1;
      break;
    }

    /* Ein Kegel nach vorn — breit genug für drei, im Rücken nutzlos */
    case 'strahl': {
      const bx = Math.sin(player.facing), bz = Math.cos(player.facing);
      for (const f of [...feinde.liste]) {
        const dx = f.pos.x - player.pos.x, dz = f.pos.z - player.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > z.weite || Math.abs(f.pos.y - player.pos.y) > 3) continue;
        if (d > 0.001 && (dx / d) * bx + (dz / d) * bz < Math.cos(z.breite)) continue;
        feinde.schlagen(f, Math.round(kraft * z.kraft), richtungZu(f));
        getroffen++;
      }
      // Die Zunge Feuer: drei Ringe, die nach vorn kleiner werden
      for (let i = 1; i <= 3; i++) {
        juice.ring({ x: player.pos.x + bx * i * z.weite * 0.28, y: player.pos.y + 0.7,
          z: player.pos.z + bz * i * z.weite * 0.28 }, 1.1 + i * 0.9, z.farbe, 0.4 + i * 0.08);
      }
      juice.shake(0.28);
      break;
    }

    /* Springt vom Nächsten zum Nächsten und wird dabei müder */
    case 'kette': {
      let von = { x: player.pos.x, y: player.pos.y + 1.1, z: player.pos.z };
      const schon = new Set();
      let schaden = kraft * z.kraft;
      for (let i = 0; i < z.spruenge; i++) {
        let best = null, bestD = z.weite;
        for (const f of feinde.liste) {
          if (schon.has(f)) continue;
          const d = Math.hypot(f.pos.x - von.x, f.pos.z - von.z);
          if (d < bestD) { bestD = d; best = f; }
        }
        if (!best) break;
        schon.add(best);
        juice.ring({ x: best.pos.x, y: best.pos.y + 0.8, z: best.pos.z }, 1.6, z.farbe, 0.35);
        feinde.schlagen(best, Math.round(schaden));
        getroffen++;
        schaden *= 0.78;
        von = { x: best.pos.x, y: best.pos.y + 0.8, z: best.pos.z };
      }
      juice.shake(0.3);
      break;
    }

    /* Ein Fächer glühender Brocken — trifft nicht genau, dafür viel */
    case 'regen': {
      const ziel = zielHilfe();
      const grund = ziel ? Math.atan2(ziel.x, ziel.z) : player.facing;
      for (let i = 0; i < z.zahl; i++) {
        const w = grund + (i - (z.zahl - 1) / 2) * 0.16;
        geschosse.schiessen(z.geschoss, player.pos.x + Math.sin(w) * 0.7,
          player.pos.y + 1.4, player.pos.z + Math.cos(w) * 0.7,
          Math.sin(w), Math.cos(w), Math.round(kraft * z.kraft), 'spieler',
          14 + i * 2.2);
      }
      juice.shake(0.4);
      getroffen = 2;
      break;
    }

    /* Zurück auf die Beine */
    case 'heilen': {
      const hpMax = fert.werte.lebenMax(h);
      const gut = Math.min(hpMax - h.hp, Math.round(kraft * z.kraft));
      h.hp += gut;
      juice.ring(mitte, 2.6, z.farbe, 0.6);
      juice.popup({ x: player.pos.x, y: player.pos.y + 2.2, z: player.pos.z },
        `+${gut}`, z.farbe);
      getroffen = 1;
      break;
    }

    /* Die Haut wird grau und schwer */
    case 'schutz': {
      state.schutz = z.dauer;
      juice.ring(mitte, 2.2, z.farbe, 0.6);
      meldung('Steinhaut', z.farbe, 2.6);
      getroffen = 1;
      break;
    }

    /* Kein Schaden — sie laufen einfach weg */
    case 'bann': {
      for (const f of feinde.liste) {
        const d = Math.hypot(f.pos.x - player.pos.x, f.pos.z - player.pos.z);
        if (d > z.weite || Math.abs(f.pos.y - player.pos.y) > 4) continue;
        feinde.belegen(f, 'schreck', z.dauer);
        juice.popup({ x: f.pos.x, y: f.pos.y + 1.8, z: f.pos.z }, 'flieht', z.farbe);
        getroffen++;
      }
      juice.ring(mitte, z.weite, z.farbe, 0.55);
      juice.shake(0.2);
      break;
    }
  }

  fert.uebung(h, 'magie', Math.max(1, getroffen));
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
  const h = held();
  state.dead = true;
  state.running = false;

  /* Sterben muss etwas kosten, sonst ist jede Gefahr nur eine Anzeige. Die
     Hälfte des Goldes bleibt liegen, wo man gefallen ist — man kann es holen,
     aber man muss noch einmal dorthin. Und man wacht erst am Morgen auf: die
     Nacht, die einen umgebracht hat, ist dann vorbei. */
  const verlust = Math.floor(h.gold * 0.5);
  h.gold -= verlust;
  if (verlust > 0) {
    beutelFallenLassen(player.pos.x, player.pos.y, player.pos.z, verlust);
  }

  el('deadWer').textContent = von ? `${von} war stärker als du.` : 'Etwas war stärker als du.';
  el('deadStats').textContent = verlust > 0
    ? `${verlust} Gold blieb liegen, wo du gefallen bist.`
    : `Stufe ${h.stufe} · ${h.getoetet} erlegt`;
  el('dead').classList.remove('hidden');
  writeTod();
}

/* ------------------------------ Der Beutel ---------------------------------
 * Es liegt immer nur einer da. Wer stirbt, bevor er den alten geholt hat,
 * verliert ihn — das ist hart, aber es hält einen ehrlich.
 * -------------------------------------------------------------------------- */
const beutelMuster = beutelBauen();
let beutelObj = null;

function beutelFallenLassen(x, y, z, gold) {
  beutelAufloesen();
  state.beutel = { x, y, z, gold };
  beutelZeigen();
}

function beutelZeigen() {
  if (!state.beutel || beutelObj) return;
  beutelObj = beutelMuster.clone();
  beutelObj.position.set(state.beutel.x, state.beutel.y + 0.1, state.beutel.z);
  scene.add(beutelObj);
}

function beutelAufloesen() {
  if (beutelObj) { scene.remove(beutelObj); beutelObj = null; }
  rauteKern.visible = false;
  rauteRand.visible = false;
  state.beutel = null;
}

function beutelPflegen(dt) {
  // Im Bild des Todes läuft die Schleife noch zu Ende — ohne diese Sperre
  // hätte man den Beutel eingesammelt, bevor er den Boden berührt.
  if (!state.beutel || state.dead) return;
  if (!beutelObj) beutelZeigen();
  beutelObj.rotation.y += dt * 0.7;
  beutelObj.position.y = state.beutel.y + 0.1 + Math.sin(state.time * 900) * 0.06;
  const d = Math.hypot(player.pos.x - state.beutel.x, player.pos.z - state.beutel.z);
  if (d < 1.6 && Math.abs(player.pos.y - state.beutel.y) < 3) {
    const gold = state.beutel.gold;
    held().gold += gold;
    audio.gem(3);
    juice.ring({ x: state.beutel.x, y: state.beutel.y + 0.5, z: state.beutel.z }, 2.4, '#f5c451');
    meldung(`${gold} Gold zurück`, '#e8a83c', 2.6);
    beutelAufloesen();
    updateHUD();
    writeSave();
  }
}

/* ------------------------------- Landmarken --------------------------------
 * Dasselbe Spiel wie mit den Gruften: was in Reichweite liegt, hängt in der
 * Szene, alles andere nicht. Bewohner und Truhen kommen erst, wenn man nah
 * genug ist — sonst kämpfte die halbe Karte gegen sich selbst.
 * -------------------------------------------------------------------------- */
function saatSetzen(s) {
  setSeed(s);
  orte.verbinden(getSeed);   // setzt das Saatkorn und wirft die alten Zellen weg
}

const ortMuster = {};
function ortMusterVon(art) {
  if (!ortMuster[art]) {
    ortMuster[art] = art === 'turm' ? turmBauen()
      : art === 'ruine' ? ruineBauen()
      : art === 'zelt' ? zeltBauen()
      : art === 'feuer' ? feuerBauen()
      : art === 'schrein' ? schreinBauen()
      : art === 'kiste' ? kisteBauen()
      : felsBauen();
  }
  return ortMuster[art];
}

const orteAktiv = new Map();     // id -> { gruppe, ort, gefuellt }

function ortePflegen(px, pz) {
  const nah = orte.orteUm(px, pz, 260);
  const gewollt = new Set(nah.map((o) => o.id));

  for (const [id, e] of [...orteAktiv]) {
    if (gewollt.has(id)) continue;
    scene.remove(e.gruppe);
    // Die Truhen des Orts gehören zu ihm — sie dürfen nicht allein stehen bleiben
    for (let i = truhen.length - 1; i >= 0; i--) {
      if (truhen[i].gruft === e.ort) { scene.remove(truhen[i].obj); truhen.splice(i, 1); }
    }
    orteAktiv.delete(id);
  }

  for (const o of nah) {
    if (orteAktiv.has(o.id)) continue;
    const plan = orte.inhalt(o);
    const gruppe = new THREE.Group();
    for (const t of plan.teile) {
      const obj = ortMusterVon(t.art).clone();
      const bx = Math.round(o.x + t.x), bz = Math.round(o.z + t.z);
      obj.position.set(o.x + t.x, surfaceAt(bx, bz) + 1, o.z + t.z);
      obj.rotation.y = t.dreh || 0;
      gruppe.add(obj);
    }
    scene.add(gruppe);
    orteAktiv.set(o.id, { gruppe, ort: o, plan, gefuellt: false });
  }

  // Leben und Beute erst aus der Nähe
  for (const e of orteAktiv.values()) {
    if (e.gefuellt) continue;
    if (Math.hypot(px - e.ort.x, pz - e.ort.z) > 60) continue;
    e.gefuellt = true;
    for (const f of e.plan.feinde) {
      feinde.spawn(f.art, e.ort.x + f.x, f.y + 1, e.ort.z + f.z, e.ort.stufe, e.ort.id);
    }
    for (const [i, t] of e.plan.truhen.entries()) {
      const id = `${e.ort.id}#${i}`;
      if (held().dungeons.has(id)) continue;
      const bx = Math.round(e.ort.x + t.x), bz = Math.round(e.ort.z + t.z);
      const obj = truhenMuster.clone();
      obj.position.set(e.ort.x + t.x, surfaceAt(bx, bz) + 1, e.ort.z + t.z);
      scene.add(obj);
      truhen.push({ obj, pos: obj.position.clone(), id, gross: t.gross, gruft: e.ort });
    }
  }
}

/** Turm und Mauern sind Modelle — hier erst werden sie fest. */
function orteSchieben(x, z, rand = 0.34) {
  for (const e of orteAktiv.values()) {
    const art = orte.ORTSARTEN[e.ort.art];
    if (!art || !art.fest.length) continue;
    if (Math.abs(x - e.ort.x) > 14 || Math.abs(z - e.ort.z) > 14) continue;
    for (const [fx, fz, fr] of art.fest) {
      const cx = e.ort.x + fx, cz = e.ort.z + fz;
      const dx = x - cx, dz = z - cz;
      const d = Math.hypot(dx, dz);
      const r = fr + rand;
      if (d >= r) continue;
      if (d < 1e-6) return { x: cx + r + 0.02, z: cz };
      return { x: cx + (dx / d) * (r + 0.02), z: cz + (dz / d) * (r + 0.02) };
    }
  }
  return null;
}


/* ================================ Das Lager =================================
 * Bisher gehörte einem in dieser Welt nichts: die Dörfer standen schon, die
 * Gruften waren schon gefüllt. Ein Lager ist das erste Stück Welt, das man
 * selbst hinstellt — und der Grund, unterwegs an einem Baum stehen zu bleiben,
 * statt nur vorbeizulaufen.
 *
 * Gebaut wird zwei Schritte vor einem, abgebaut mit demselben Knopf, mit dem
 * man den Baum gefällt hat. Was steht, steht im Spielstand; in der Szene hängt
 * immer nur, was in der Nähe liegt.
 * ========================================================================== */
const lagerMuster = {};
const lagerAktiv = new Map();      // Schlüssel -> { obj, teil }

function lagerMusterVon(art) {
  if (!lagerMuster[art]) lagerMuster[art] = lager.BAUTEILE[art].bauer();
  return lagerMuster[art];
}

function lagerPflegen(px, pz) {
  const gewollt = new Set();
  for (const t of state.lager) {
    if (Math.abs(t.x - px) > 150 || Math.abs(t.z - pz) > 150) continue;
    gewollt.add(t.id);
    if (lagerAktiv.has(t.id)) continue;
    const obj = lagerMusterVon(t.art).clone();
    obj.position.set(t.x, t.y, t.z);
    obj.rotation.y = t.dreh || 0;
    scene.add(obj);
    lagerAktiv.set(t.id, { obj, teil: t });
  }
  for (const [id, e] of [...lagerAktiv]) {
    if (gewollt.has(id)) continue;
    scene.remove(e.obj);
    lagerAktiv.delete(id);
  }
}

/** Was vom eigenen Lager gerade in Reichweite steht — oder nichts. */
function lagerInReichweite() {
  let best = null, bestD = 1e9;
  for (const t of state.lager) {
    if (Math.abs(t.x - player.pos.x) > 6 || Math.abs(t.z - player.pos.z) > 6) continue;
    const a = lager.artVon(t.art);
    if (!a) continue;
    const d = Math.hypot(player.pos.x - t.x, player.pos.z - t.z);
    if (d > a.nah || Math.abs(player.pos.y - t.y) > 3) continue;
    if (d < bestD) { bestD = d; best = t; }
  }
  return best;
}

/** Zelt, Feuer und Zaun sind Modelle — hier erst werden sie fest. */
function lagerSchieben(x, z, rand = 0.3) {
  for (const t of state.lager) {
    if (Math.abs(x - t.x) > 4 || Math.abs(z - t.z) > 4) continue;
    const a = lager.artVon(t.art);
    if (!a || !a.fest) continue;
    const dx = x - t.x, dz = z - t.z;
    const d = Math.hypot(dx, dz);
    const r = a.fest + rand;
    if (d >= r) continue;
    if (d < 1e-6) return { x: t.x + r + 0.02, z: t.z };
    return { x: t.x + (dx / d) * (r + 0.02), z: t.z + (dz / d) * (r + 0.02) };
  }
  return null;
}

/* Vor die Füße, nicht auf die Füße: sonst steht man im eigenen Zelt. */
function bauplatz() {
  const x = player.pos.x + Math.sin(player.facing) * 2.3;
  const z = player.pos.z + Math.cos(player.facing) * 2.3;
  return { x, z, y: surfaceAt(Math.round(x), Math.round(z)) + 1 };
}

function lagerBauen(art) {
  const a = lager.artVon(art);
  const h = held();
  if (!a || !state.running || state.dead) return false;
  if (!lager.reicht(h.beutel, art)) {
    meldung('Dafür fehlt dir noch Stoff', '#c9543f', 2.6);
    return false;
  }
  const platz = bauplatz();
  const absage = (wort) => { meldung(wort, '#c9543f', 2.6); audio.step(); return false; };
  if (platz.y <= SEA + 1) return absage('Im Wasser steht nichts');
  if (Math.abs(platz.y - player.pos.y) > 2.5) return absage('Der Hang ist zu steil');
  if (state.imDungeon) return absage('Nicht hier unten');
  if (dorfBei(Math.round(platz.x), Math.round(platz.z))) return absage('Im Dorf steht schon genug');
  for (const t of state.lager) {
    if (Math.hypot(t.x - platz.x, t.z - platz.z) < 1.7) return absage('Da steht schon etwas');
  }

  for (const [stoff, n] of Object.entries(a.kosten)) dinge.ablegen(h, stoff, n);
  state.lager.push({
    id: lager.schluessel(platz.x, platz.z), art,
    x: platz.x, y: platz.y, z: platz.z,
    dreh: player.facing + Math.PI,       // die Front schaut einen an
  });
  lagerPflegen(player.pos.x, player.pos.z);
  audio.gem(2);
  juice.ring({ x: platz.x, y: platz.y + 0.3, z: platz.z }, 2.6, '#e8a83c');
  juice.staub({ x: platz.x, y: platz.y, z: platz.z }, 1.1, '#cbb896');
  meldung(`${a.name} steht`, '#7fae5e', 3.0);
  fert.uebung(h, 'spuren', 2);
  fert.xpGeben(h, 20);
  updateHUD();
  writeSave();
  return true;
}

function lagerAbreissen(t) {
  const a = lager.artVon(t.art);
  const h = held();
  const i = state.lager.indexOf(t);
  if (i < 0) return;
  state.lager.splice(i, 1);
  const e = lagerAktiv.get(t.id);
  if (e) { scene.remove(e.obj); lagerAktiv.delete(t.id); }
  const raus = lager.rueckgabe(t.art);
  for (const [stoff, n] of Object.entries(raus)) dinge.nehmen(h, stoff, n);
  audio.step(1, 'holz');
  juice.staub({ x: t.x, y: t.y + 0.3, z: t.z }, 1.3, '#cbb896');
  const wort = Object.entries(raus)
    .map(([stoff, n]) => `${n} ${DINGE[stoff].name}`).join(', ');
  meldung(`${a.name} abgebaut — ${wort} zurück`, '#7d5227', 3.0);
  updateHUD();
  writeSave();
}

/* ================================= Abbauen ==================================
 * Ein Knopf für alles, was man aus der Welt herausholt: Bäume, Findlinge,
 * Felswände, Glimmadern — und das eigene Lager, wenn es am falschen Fleck
 * steht. Jeder Druck ist ein Hieb; nach ein paar Hieben fällt es.
 * ========================================================================== */
const ABBAUARTEN = {
  baum:  { hiebe: 4, stoff: 'holz',  menge: [2, 4], farbe: '#b5794a', ton: 'holz',  xp: 8 },
  fels:  { hiebe: 4, stoff: 'stein', menge: [2, 3], farbe: '#b9aa98', ton: 'stein', xp: 8 },
  block: { hiebe: 3, stoff: 'stein', menge: [1, 2], farbe: '#b9aa98', ton: 'stein', xp: 6 },
  glimm: { hiebe: 3, farbe: '#f5c451', ton: 'stein' },
  lager: { hiebe: 2, farbe: '#cbb896', ton: 'holz' },
};

const STEINIG = new Set([B.stein, B.kies, B.rotfels]);

/* Gestein bricht man aus einer Wand, nicht unter den eigenen Füßen. Sonst
   stünde man auf der Wiese und könnte die halbe Welt abtragen, ohne je einen
   Berg gesehen zu haben. */
function steinInReichweite() {
  const px = Math.floor(player.pos.x), py = Math.floor(player.pos.y),
        pz = Math.floor(player.pos.z);
  for (let dy = 0; dy <= 1; dy++) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        if (STEINIG.has(world.get(px + dx, py + dy, pz + dz))) {
          return { x: px + dx, y: py + dy, z: pz + dz };
        }
      }
    }
  }
  return null;
}

/** Woran man hier arbeiten könnte. Das eigene Lager hat Vorrang. */
function abbauZiel() {
  if (!state.running || state.dead || state.gespraech) return null;
  const eigen = lagerInReichweite();
  if (eigen) {
    return { art: 'lager', schl: 'L' + eigen.id, teil: eigen,
             x: eigen.x, y: eigen.y, z: eigen.z, name: lager.artVon(eigen.art).name };
  }
  const ader = glimmInReichweite();
  if (ader) {
    return { art: 'glimm', schl: `G${ader.x},${ader.y},${ader.z}`, ort: ader,
             x: ader.x + 0.5, y: ader.y + 0.5, z: ader.z + 0.5, name: 'Glimmader' };
  }
  const g = flora.naechstes(player.pos.x, player.pos.z, 2.7);
  if (g && Math.abs(player.pos.y - g.y) < 4) {
    const art = g.art === 'fels' ? 'fels' : 'baum';
    return { art, schl: `P${Math.floor(g.x)},${Math.floor(g.z)}`, pflanze: g,
             x: g.x, y: g.y, z: g.z, name: art === 'fels' ? 'Findling' : 'Baum' };
  }
  const st = steinInReichweite();
  if (st) {
    return { art: 'block', schl: `B${st.x},${st.y},${st.z}`, ort: st,
             x: st.x + 0.5, y: st.y + 0.5, z: st.z + 0.5, name: 'Fels' };
  }
  return null;
}

let abbauJetzt = null;      // was der Knopf gerade meint

function abbauen() {
  const h = held();
  /* Frisch nachgesehen, nicht aus dem letzten Bild geholt: zwischen zwei
     Bildern kann man einen Schritt weiter stehen, und der Hieb soll das
     treffen, wovor man jetzt steht. Teuer ist es nicht — zwischen zwei Hieben
     liegt eine Drittelsekunde. */
  if (state.hack > 0) return;
  const ziel = abbauZiel();
  if (!ziel) return;
  /* Ein Hieb kostet wenig — weniger, als in derselben Zeit zurückkommt. Holz
     holen soll eine ruhige Beschäftigung sein und nicht mit dem Kampf um
     denselben Atem streiten. Wer schon außer Puste ist, merkt es trotzdem. */
  if (h.ausdauer < 3) { meldung('Keine Puste mehr', '#7d5227', 2.4); return; }

  const k = ABBAUARTEN[ziel.art];
  state.hack = 0.3;
  h.ausdauer -= 3;
  player.swing = 0.28;
  player.facing = Math.atan2(ziel.x - player.pos.x, ziel.z - player.pos.z);
  if (!state.abbau || state.abbau.schl !== ziel.schl) {
    state.abbau = { schl: ziel.schl, hiebe: 0 };
  }
  state.abbau.hiebe++;
  audio.step(1.2, k.ton);
  juice.staub({ x: ziel.x, y: ziel.y + 0.5, z: ziel.z }, 0.7, k.farbe);
  juice.shake(0.1);
  if (state.abbau.hiebe < k.hiebe) { updateHUD(); return; }

  state.abbau = null;
  if (ziel.art === 'lager') { lagerAbreissen(ziel.teil); return; }
  if (ziel.art === 'glimm') { glimmBrechen(ziel.ort); return; }

  let menge = k.menge[0] + Math.floor(Math.random() * (k.menge[1] - k.menge[0] + 1));
  // „Sammler" gilt auch für das, was man sich selbst schlägt
  if (h.vorteile.has('spuren3') && Math.random() < 0.25) menge *= 2;
  dinge.nehmen(h, k.stoff, menge);
  if (ziel.pflanze) flora.faellen(ziel.pflanze);
  else world.set(ziel.ort.x, ziel.ort.y, ziel.ort.z, AIR);

  fert.uebung(h, 'spuren', 2);
  fert.xpGeben(h, k.xp);
  audio.gem(1);
  juice.ring({ x: ziel.x, y: ziel.y + 0.2, z: ziel.z }, 2.0, k.farbe);
  juice.popup({ x: ziel.x, y: ziel.y + 1.4, z: ziel.z },
    `+${menge} ${DINGE[k.stoff].name}`, '#7fae5e');
  updateHUD();
  writeSave();
}

/* Der Knopf zeigt, woran man arbeitet, und füllt sich mit jedem Hieb. Er
   bleibt nach dem letzten Ja noch einen Moment stehen — sonst flackerte er an
   der Reichweitengrenze, genau wie der Reden-Knopf es früher tat. */
let abbauHalten = 0;
let letzterAbbau = null;

function abbauKnopfPflegen(dt) {
  const z = abbauJetzt;
  if (z) { letzterAbbau = z; abbauHalten = 0.4; } else if (abbauHalten > 0) abbauHalten -= dt;
  const zeigen = z || (abbauHalten > 0 ? letzterAbbau : null);
  ui.abbau.classList.toggle('hidden', !zeigen);
  if (!zeigen) { letzterAbbau = null; return; }
  if (zeigen.name !== ui.abbau.dataset.was) {
    ui.abbau.dataset.was = zeigen.name;
    ui.abbau.title = zeigen.name;
  }
  const k = ABBAUARTEN[zeigen.art];
  const hiebe = state.abbau && state.abbau.schl === zeigen.schl ? state.abbau.hiebe : 0;
  ui.abbau.style.setProperty('--ab', Math.round((hiebe / k.hiebe) * 100));
}

/** Wie weit ist das nächste Feuer? Für das Knistern. */
function feuerNaehe() {
  let best = null;
  const messen = (x, z) => {
    const d = Math.hypot(player.pos.x - x, player.pos.z - z);
    if (best === null || d < best) best = d;
  };
  for (const e of orteAktiv.values()) {
    if (e.ort.art === 'lager') messen(e.ort.x, e.ort.z);
  }
  // Das eigene Feuer knistert genauso wie ein fremdes
  for (const t of state.lager) {
    const a = lager.artVon(t.art);
    if (a && a.feuer) messen(t.x, t.z);
  }
  return best;
}

/** Steht man vor einem Schrein? */
function schreinInReichweite() {
  for (const e of orteAktiv.values()) {
    if (e.ort.art !== 'schrein') continue;
    if (Math.hypot(player.pos.x - e.ort.x, player.pos.z - e.ort.z) < 3.2) return e.ort;
  }
  return null;
}

/* Ein Schrein gibt einmal etwas und danach nie wieder — sonst stünde man
   davor und drückte. Dafür ist es dauerhaft. */
function schreinAnrufen(ort) {
  const h = held();
  h.orte = h.orte || new Set();
  if (h.orte.has(ort.id)) {
    meldung('Der Schrein schweigt', '#7d5227', 2.6);
    return;
  }
  h.orte.add(ort.id);
  h.hpMax += 4;
  h.hp = fert.werte.lebenMax(h);
  h.magicka = fert.werte.magickaMax(h);
  fert.xpGeben(h, 40);
  audio.gem(3);
  juice.ring({ x: ort.x, y: player.pos.y + 0.5, z: ort.z }, 3.4, '#f5c451');
  meldung('Der Schrein nimmt dich an — +4 Leben', '#e8a83c', 3.4);
  for (const q of state.buch.melden('schrein', { ortId: ort.id })) {
    meldung(`„${q.titel}" erledigt`, '#7fae5e', 3.0);
  }
  if (story.melden(state.geschichte, 'schrein', { id: ort.id })) kapitelGeschafft();
  updateHUD();
  writeSave();
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
  const inhalt = dinge.truhenInhalt(saat,
    t.gruft.stufe + (h.vorteile.has('spuren8') ? 1 : 0), t.gross);
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
    meldung('Altes Siegel', '#e8a83c', 3.2);
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
  juice.popup({ x: ort.x + 0.5, y: ort.y + 1.2, z: ort.z + 0.5 }, 'Glimmstein', '#e8a83c');
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
  // Wer direkt auf der Bettstelle steht, will schlafen — auch wenn der
  // Hausherr danebensteht. Einen Schritt zurück redet man wieder mit ihm.
  const bett = bettInReichweite(1.4);
  if (bett) return { art: 'bett', ziel: bett };
  const n = leute.naechster(p, 3.4);
  if (n) return { art: 'npc', ziel: n };
  /* Das eigene Lager: am Feuer und im Zelt rastet man, am Schleifstein
     arbeitet man. Abgebaut wird es mit dem Abbauknopf, nicht hier. */
  const meins = lagerInReichweite();
  if (meins) {
    const a = lager.artVon(meins.art);
    if (a && a.rast) return { art: 'rast', ziel: meins };
    if (a && a.esse) return { art: 'esse', ziel: meins };
  }
  for (const t of truhen) {
    if (Math.hypot(t.pos.x - p.x, t.pos.z - p.z) < 2.4 && Math.abs(t.pos.y - p.y) < 2.5) {
      return { art: 'truhe', ziel: t };
    }
  }
  for (const t of tore) {
    if (Math.hypot(t.pos.x - p.x, t.pos.z - p.z) < 4.5) return { art: 'tor', ziel: t };
  }
  const schrein = schreinInReichweite();
  if (schrein) return { art: 'schrein', ziel: schrein };
  const weiter = bettInReichweite(2.2);
  if (weiter) return { art: 'bett', ziel: weiter };
  return null;
}

/** Steht man in einem Haus dicht genug an der Bettstelle? */
function bettInReichweite(weite = 2.2) {
  const drin = state.imHaus;
  if (!drin) return null;
  const b = doerfer.bettVon(drin.t);
  return Math.hypot(player.pos.x - b.x, player.pos.z - b.z) < weite ? b : null;
}

/* Schlafen ist der Ausweg aus der Nacht: wer es vor Einbruch der Dunkelheit
   in ein Dorf schafft, kann sie überspringen. Tagsüber ist es nur eine Rast. */
function schlafen() {
  const h = held();
  const nachts = istNacht();
  h.hp = fert.werte.lebenMax(h);
  h.ausdauer = h.ausdauerMax;
  h.magicka = fert.werte.magickaMax(h);
  if (nachts) {
    state.time = 0.3;
    state.tag++;
    for (const f of [...feinde.liste]) if (f.art.nurNachts) feinde.entfernen(f);
    meldung('Ausgeschlafen — es ist Morgen', '#e8a83c', 3.0);
  } else {
    meldung('Ausgeruht', '#7fae5e', 2.6);
  }
  audio.gem(1);
  juice.ring({ x: player.pos.x, y: player.pos.y + 0.4, z: player.pos.z }, 2.6, '#f5c451');
  applyDaytime();
  updateHUD();
  writeSave();
}

function handeln() {
  // Der Knopf bleibt nach dem letzten Ja kurz stehen — dann muss er auch
  // noch tun, was er anbietet.
  const w = was() || (tatHalten > 0 ? letzteTat : null);
  if (!w) return;
  if (w.art === 'truhe') { truheOeffnen(w.ziel); return; }
  if (w.art === 'tor') { gruftBetreten(w.ziel.gruft); return; }
  if (w.art === 'bett' || w.art === 'rast') { schlafen(); return; }
  if (w.art === 'esse') { esseOeffnen(); return; }
  if (w.art === 'schrein') { schreinAnrufen(w.ziel); return; }
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

/** Wohin der Pfeil zeigt: Ziel dessen, was gerade verfolgt wird. */
function zielPunkt() {
  const v = verfolgtes();
  if (!v) return null;
  if (v.art === 'quest') {
    const q = v.q;
    if (q.fertig) {
      return q.geberOrt ? { x: q.geberOrt.x, z: q.geberOrt.z, name: q.geberName || 'zurück' } : null;
    }
    return q.zielOrt ? { x: q.zielOrt.x, z: q.zielOrt.z, name: q.ziel } : null;
  }

  const st = state.geschichte;
  const k = v.kapitel;
  // Noch nicht angefangen oder Kapitel voll: zurück zum Chronisten
  if (!st.gestartet || story.kapitelFertig(st)) return heimatZiel('Chronist');

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
  if (k.art === 'schrein') {
    const h = held();
    const offen = orte.orteUm(player.pos.x, player.pos.z, 900)
      .filter((o) => o.art === 'schrein' && !(h.orte && h.orte.has(o.id)))
      .sort((a, b) => Math.hypot(a.x - player.pos.x, a.z - player.pos.z)
                    - Math.hypot(b.x - player.pos.x, b.z - player.pos.z))[0];
    return offen ? { x: offen.x, z: offen.z, name: offen.name || 'Schrein' } : null;
  }
  if (k.art === 'schlund' || k.art === 'waechter') {
    return state.schlund ? { x: state.schlund.x, z: state.schlund.z, name: 'Der Schlund' } : null;
  }
  return null;
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

/* ---------------------------- Wer gemeint ist ------------------------------
 * Der Pfeil zeigt eine Richtung, aber im Dorf stehen fünfzehn Leute, und
 * einer davon wartet. Über dem wartet deshalb eine Raute: sie schwebt, dreht
 * sich langsam und liegt über allem — auch über Dächern, sonst müsste man
 * jedes Haus einzeln betreten, um sie zu finden.
 * -------------------------------------------------------------------------- */
const rauteGeo = new THREE.OctahedronGeometry(0.58, 0);
const rauteKern = new THREE.Mesh(rauteGeo, new THREE.MeshBasicMaterial({
  color: '#f5c451', transparent: true, opacity: 0.98,
  depthWrite: false, depthTest: false,
}));
rauteKern.renderOrder = 22;
const rauteRand = new THREE.Mesh(rauteGeo, new THREE.MeshBasicMaterial({
  color: '#7d5227', transparent: true, opacity: 0.9,
  depthWrite: false, depthTest: false,
}));
rauteRand.renderOrder = 21;
rauteRand.scale.setScalar(1.32);
rauteKern.visible = false;
rauteRand.visible = false;
scene.add(rauteKern, rauteRand);

/** Wen soll man gerade ansprechen? Gibt den Dorfbewohner zurück oder nichts. */
function gemeinterMensch() {
  const v = verfolgtes();
  if (!v) return null;

  if (v.art === 'haupt') {
    // Zum Chronisten muss man, solange kein Kapitel läuft oder eines voll ist
    const st = state.geschichte;
    if (st.gestartet && !story.kapitelFertig(st)) return null;
    return leute.liste.find((n) => n.chronist) || null;
  }

  // Ein erledigter Auftrag will zurückgebracht werden — zu genau dem einen
  const q = v.q;
  if (!q || !q.fertig) return null;
  return leute.liste.find((n) => (q.geberSaat != null && n.saat === q.geberSaat))
    || leute.liste.find((n) => n.name === q.geberName) || null;
}

let rautenDreh = 0;
function rautePflegen(dt) {
  const wer = gemeinterMensch();
  if (!wer) { rauteKern.visible = false; rauteRand.visible = false; return; }

  const hoch = wer.obj && wer.obj.visible !== false;
  const d = Math.hypot(wer.pos.x - player.pos.x, wer.pos.z - player.pos.z);
  if (!hoch || d > 90) { rauteKern.visible = false; rauteRand.visible = false; return; }

  rautenDreh += dt * 1.6;
  const schweben = Math.sin(rautenDreh * 1.1) * 0.16;
  const y = wer.pos.y + 2.7 + schweben;
  rauteKern.position.set(wer.pos.x, y, wer.pos.z);
  rauteRand.position.set(wer.pos.x, y, wer.pos.z);
  rauteKern.rotation.y = rautenDreh;
  rauteRand.rotation.y = rautenDreh;
  // Ganz nah wird sie kleiner: dann sieht man ja, vor wem man steht
  const gross = (d < 4 ? 0.65 : 1) * (1 + Math.sin(rautenDreh * 2.2) * 0.06);
  rauteKern.scale.setScalar(gross);
  rauteRand.scale.setScalar(gross * 1.32);
  rauteKern.visible = true;
  rauteRand.visible = true;
}

function pfeilPflegen(dt) {
  const ziel = zielPunkt();
  if (!ziel) { pfeil.visible = false; pfeilRand.visible = false; return; }

  const dx = ziel.x - player.pos.x, dz = ziel.z - player.pos.z;
  const d = Math.hypot(dx, dz);

  // Steht man schon da, hilft kein Pfeil mehr
  if (d < 12) { pfeil.visible = false; pfeilRand.visible = false; return; }

  pfeil.visible = true;
  pfeilRand.visible = true;
  const w = Math.atan2(dx, dz);
  // Klein genug, um ein Hinweis zu bleiben statt ein Wegweiser mitten im Bild
  const puls = 0.5 + Math.sin(state.time * 2400) * 0.04;
  // Über dem Kopf, damit er auch im Gedränge sichtbar bleibt
  const px = player.pos.x + Math.sin(w) * 1.5;
  const pz = player.pos.z + Math.cos(w) * 1.5;
  const py = player.pos.y + 2.2;
  pfeil.rotation.y = w;
  pfeil.position.set(px, py, pz);
  pfeil.scale.setScalar(puls);
  pfeilRand.rotation.y = w;
  pfeilRand.position.set(px, py - 0.04, pz);
  pfeilRand.scale.setScalar(puls * 1.26);
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
  const h = held();
  state.gespraech = n;
  el('redeName').textContent = 'Der Chronist';
  el('redeBeruf').textContent = n.name;
  el('rede').classList.remove('hidden');

  if (st.fertig) { chronistNachher(st); return; }

  const k = story.aktuell(st);
  if (!k) { redeSchliessen(); return; }

  /* Der erste Besuch ist kein Auftrag, sondern eine Vorstellung. Wer man ist,
     steht in der Herkunft — und er antwortet darauf. Das ist die einzige
     Stelle, an der der Anfang für jeden Helden anders klingt. */
  if (!st.vorgestellt && k.id === 0) {
    const herk = herkunftVon(h.herkunft);
    redeZeigen(story.fuellen(k.rede, st, schlundRichtung()), [
      { label: `„${herk.wort}"`, unten: herk.woher,
        tun: () => {
          st.vorgestellt = true;
          redeZeigen(`${herk.antwort}\n\n${k.aufgabe}`, [
            { label: 'Fünf Steine. Gut.', unten: k.wo,
              tun: () => { kapitelAnnehmen(st, n); } },
            { label: 'Ein andermal.', tun: redeSchliessen },
          ]);
        } },
      { label: 'Ich habe es eilig.', tun: redeSchliessen },
    ]);
    return;
  }

  if (!st.gestartet) {
    const text = k.id === 0 ? k.aufgabe : story.fuellen(k.rede, st, schlundRichtung());
    redeZeigen(text, [
      { label: 'Ich sehe mich um.', unten: story.fuellen(k.wo || k.ziel, st, schlundRichtung()),
        tun: () => kapitelAnnehmen(st, n) },
      { label: 'Nicht heute.', tun: redeSchliessen },
    ]);
  } else if (story.kapitelFertig(st)) {
    const abschluss = k.abschluss || 'Ihr habt es also gesehen.';
    redeZeigen(story.fuellen(abschluss, st, schlundRichtung()), [
      { label: 'Und weiter?', tun: () => {
          // Erst die Frage dieses Kapitels, dann das nächste
          if (k.frage && k.wahlen && !story.wahlVon(st, k.id)) {
            frageStellen(st, k, n);
            return;
          }
          kapitelWeiter(st, n);
        } },
    ]);
  } else {
    redeZeigen(story.fuellen(k.rede, st, schlundRichtung()), [
      { label: `Noch nicht. (${st.ziel}/${k.menge})`, aus: true },
      { label: 'Ich gehe weiter.', tun: redeSchliessen },
    ]);
  }
}

/** Kapitel annehmen: er sagt einen Satz, das Ziel steht im Buch. */
function kapitelAnnehmen(st, n) {
  st.gestartet = true;
  audio.gem(1);
  const k = story.aktuell(st);
  redeZeigen('Gut. Ich bin hier, wenn Ihr etwas habt. Ich gehe nirgendwohin.',
    [{ label: 'Bis dann.', tun: redeSchliessen }]);
  if (k) meldung(`„${k.titel}"`, '#e8a83c', 3.0);
  updateHUD();
  writeSave();
}

/** Eine Frage, deren Antwort stehen bleibt. */
function frageStellen(st, k, n) {
  const wahlen = k.wahlen.map((w) => ({
    label: w.label, unten: w.unten,
    tun: () => {
      story.antworten(st, k.id, w.id);
      audio.gem(2);
      redeZeigen(w.antwort, [
        { label: 'Und weiter?', tun: () => kapitelWeiter(st, n) },
      ]);
      writeSave();
    },
  }));
  redeZeigen(k.frage, wahlen);
}

function kapitelWeiter(st, n) {
  story.weiter(st);
  st.gestartet = false;
  const naechst = story.aktuell(st);
  if (!naechst || st.fertig) { redeSchliessen(); return; }
  chronistOeffnen(n);
}

/** Was er sagt, wenn alles vorbei ist — je nachdem, wie es ausging. */
function chronistNachher(st) {
  const gewarnt = story.wahlVon(st, 2) === 'warnen';
  redeZeigen(st.ende === 'wort'
    ? 'Die Laternen brennen wieder länger. Ich habe es aufgeschrieben — zum ersten '
      + 'Mal ein Strich, der länger wird.\n\n'
      + (gewarnt
        ? 'Und in den anderen Dörfern haben sie es gewusst. Sie haben nicht '
          + 'gefeiert, sie haben genickt. Das ist mehr wert.'
        : 'In den anderen Dörfern wird man sich wundern, warum es plötzlich '
          + 'heller ist. Sollen sie. Nicht jeder muss alles wissen.')
    : 'Das Glimm kommt zurück. Die Gruften sind still geworden, stiller als vorher.\n\n'
      + 'Ich weiß nicht, ob das ein guter Handel war. Aber es ist getan, und '
      + 'ich schreibe es auf, wie es war.',
    [{ label: 'Lebt wohl.', tun: redeSchliessen }]);
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
  const st = state.geschichte;
  state.gespraech = { pos: f.pos };
  el('redeName').textContent = 'Der Wächter';
  el('redeBeruf').textContent = 'im Schlund';

  /* Er weiß, wer da vor ihm steht. Herkunft und die beiden Antworten von
     unterwegs stehen in seinem ersten Satz — sonst wäre alles davor nur
     ein Zähler gewesen. */
  const herk = herkunftVon(h.herkunft);
  const erkennt = {
    koehler:  'Ihr riecht nach Rauch. Ein Köhlerkind, das Feuer hütet.',
    kraemer:  'Ihr rechnet, während Ihr mich anseht. Ein Krämerskind.',
    kloster:  'Ihr habt gelesen. Man sieht es an den Augen, die nach Zeilen suchen.',
    wildwald: 'Ihr seid leise hereingekommen. Das schafft niemand, der in Dörfern groß wird.',
  }[herk.id] || '';

  const gewarnt = story.wahlVon(st, 2) === 'warnen';
  const begraben = story.wahlVon(st, 4) === 'begraben';
  const erinnerung = gewarnt
    ? 'Sie reden oben von mir. Ihr habt es ihnen gesagt — ich habe es gehört, '
      + 'so wie ich alles höre, was zu wenig Licht hat.'
    : 'Oben weiß es niemand. Ihr habt geschwiegen. Ob das freundlich war, '
      + 'weiß ich nicht.';
  const zweites = begraben
    ? '\n\nUnd Ihr habt eines von ihnen begraben. Das hat seit zehn Jahren niemand getan.'
    : '';

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
          + (begraben
            ? 'Ihr habt eines von ihnen in die Erde gelegt, statt es aufzuschneiden. '
              + 'Dann nehmt es mit. Und sagt ihnen, sie sollen fragen.'
            : 'Nehmt es mit. Und sagt ihnen, sie sollen fragen.'),
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

  redeZeigen(`${erkennt}\n\n`
    + 'Zehn Jahre sitze ich hier. In zehn Jahren ist niemand gekommen, um zu fragen, '
    + `wo das Licht geblieben ist. Nur Ihr, ${h.name || 'Fremder'}.\n\n`
    + `${erinnerung}${zweites}`,
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
  const gewarnt = story.wahlVon(st, 2) === 'warnen';
  el('endeTitel').textContent = art === 'wort' ? 'Das Licht kehrt zurück.' : 'Der Schlund ist still.';
  el('endeText').textContent = (art === 'wort'
    ? 'Der Wächter gibt das Glimm heraus. In den Dörfern brennen die Laternen '
      + 'wieder länger — weil jemand danach gefragt hat. '
      + (gewarnt
        ? 'In zwei Dörfern haben sie darauf gewartet: Ihr hattet es ihnen gesagt.'
        : 'In zwei Dörfern wundert man sich, woher das kommt. Ihr habt geschwiegen.')
    : 'Der Wächter fällt, und mit ihm gibt der Fels sein Licht zurück. Es war zu '
      + 'holen. Ob es zu nehmen war, sagt niemand. ')
    + `\n\nDer Chronist schreibt einen Namen in sein Buch: ${h.name || 'Niemand'}.`;
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

/* Was ein Auftraggeber über seine Umgebung weiß: die nächste Gruft, das
   Nachbardorf, und — neu — welche Landmarken in seiner Reichweite liegen,
   was in seiner Gegend herumläuft und welcher Stoff ihm gerade fehlt.
   Dadurch schickt er einen an einen Ort, den es wirklich gibt. */
function kontextFuer(n) {
  const naheGruft = gruft.grueftUm(n.pos.x, n.pos.z, 520)
    .sort((a, b) => Math.hypot(a.x - n.pos.x, a.z - n.pos.z) - Math.hypot(b.x - n.pos.x, b.z - n.pos.z))[0];
  const nachbar = doerferUm(n.pos.x, n.pos.z, 700)
    .filter((d) => d.i !== n.dorf.i || d.j !== n.dorf.j)[0];

  // Die nächste Landmarke je Sorte — nur was in Laufweite liegt
  const nah = {};
  for (const o of orte.orteUm(n.pos.x, n.pos.z, 480)) {
    const d = Math.hypot(o.x - n.pos.x, o.z - n.pos.z);
    if (!nah[o.art] || d < nah[o.art].d) {
      nah[o.art] = { id: o.id, name: o.name, x: o.x, z: o.z, d,
                     zahl: orte.inhalt(o).feinde.length };
    }
  }

  // Ein Wesen aus der Gegend, das einem auch etwas tut
  const gegend = biomeAt(Math.floor(n.pos.x), Math.floor(n.pos.z));
  let wesen = null;
  for (let i = 0; i < 8 && !wesen; i++) {
    const id = wesenWaehlen(gegend.id, i > 4);
    const a = ARTEN[id];
    if (a && a.gesinnung !== 'friedlich' && !a.boss) wesen = { id, name: a.name };
  }

  // Und ein Stoff, den es in dieser Gegend zu holen gibt
  const stoffe = [];
  const bew = BEWOHNER[gegend.id];
  if (bew) {
    for (const [w] of [...bew.tag, ...bew.nacht]) {
      const beute = ARTEN[w] && ARTEN[w].beute;
      if (beute && DINGE[beute] && !stoffe.includes(beute)) stoffe.push(beute);
    }
  }
  const wareId = stoffe.length ? stoffe[Math.abs(n.saat) % stoffe.length] : null;

  return {
    orte: nah,
    wesen,
    ware: wareId ? { id: wareId, name: DINGE[wareId].name } : null,
    dungeonName: naheGruft ? naheGruft.name : 'der alten Gruft',
    dungeonPos: naheGruft ? { x: naheGruft.x, z: naheGruft.z } : null,
    nachbarort: nachbar ? ortsname(nachbar) : 'Steinfurt',
    nachbarPos: nachbar ? { x: nachbar.x, z: nachbar.z } : null,
    geberPos: { x: n.heimX, z: n.heimZ },
    geberName: n.name,
  };
}

function redeOeffnen(n) {
  if (!n.auftrag) n.auftrag = auftragFuer(n.saat, kontextFuer(n), n.gewerbe.name);
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

  if (n.gewerbe.name === 'Schmiedin') {
    wahlen.push({
      label: 'Schärft mir das Eisen.',
      unten: 'Beute wird zu besserer Ausrüstung',
      tun: () => { redeSchliessen(); esseOeffnen(); },
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
        + `<span class="txt">${dingName(d)}<small>${wirkungText(d)}</small></span>`
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
      const preis = verkaufFuer(id);
      const z = document.createElement('button');
      z.className = 'ding-zeile laden-zeile';
      z.innerHTML = sym(d.sym)
        + `<span class="txt">${dingName(d, h.beutel[id] > 1 ? ` ×${h.beutel[id]}` : '')}`
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

/** Was ein Händler zahlt — der Feilscher holt mehr heraus. */
function verkaufFuer(id) {
  const grund = dinge.verkaufswert(id);
  return held().vorteile.has('spuren6')
    ? Math.max(1, Math.round(grund / 0.45 * 0.65)) : grund;
}

/** Der Name eines Stücks in der Farbe seiner Güte — im Beutel wie im Laden. */
function dingName(d, zusatz = '') {
  const f = gueteFarbe(d);
  return `<b${f ? ` style="color:${f}"` : ''}>${d.name}${zusatz}</b>`;
}

/** Nur das, was ein Stück tut — ohne Güte, ohne Spruch. */
function wirkungsliste(d) {
  const teile = [];
  if (d.lehrt && ZAUBER[d.lehrt]) {
    teile.push(`lehrt ${ZAUBER[d.lehrt].name}`, `ab Magie ${ZAUBER[d.lehrt].braucht}`);
  }
  if (d.schaden) teile.push(`+${d.schaden} Schaden`);
  if (d.panzer) teile.push(`+${Math.round(d.panzer * 100)}% Rüstung`);
  if (d.leben) teile.push(`+${d.leben} Leben`);
  if (d.magicka) teile.push(`+${d.magicka} Magicka`);
  if (d.tempo) teile.push(`+${Math.round(d.tempo * 100)}% Tempo`);
  if (d.heilt) teile.push(`heilt ${d.heilt}`);
  if (d.magie) teile.push(`+${d.magie} Magicka`);
  if (d.reichweite) teile.push('größere Reichweite');
  return teile.join(' · ');
}

/** Dasselbe für die Listen im Laden: Güte voran, sonst der Spruch. */
function wirkungText(d) {
  const w = wirkungsliste(d);
  const guete = d.guete ? dinge.SELTENHEIT[d.guete].name : '';
  if (!w) return guete ? `${guete} · ${d.text}` : d.text;
  return guete ? `${guete} · ${w}` : w;
}

/* --------------------------------- Die Esse --------------------------------
 * Bei der Schmiedin wird aus Getierbeute eine bessere Klinge. Angezeigt wird
 * immer, was fehlt — und weil jede Stufe Stoff aus einer anderen Gegend
 * verlangt, ist die Liste zugleich eine Landkarte.
 * -------------------------------------------------------------------------- */
function esseOeffnen() {
  esseZeichnen();
  el('esse').classList.remove('hidden');
}

function esseSchliessen() { el('esse').classList.add('hidden'); }

function esseZeichnen() {
  const h = held();
  el('esseGold').textContent = h.gold;
  const feld = el('esseListe');
  feld.replaceChildren();

  const stuecke = ['waffe', 'ruestung'].map((art) => h.rue[art]).filter(Boolean);
  if (!stuecke.length) {
    const p = document.createElement('p');
    p.className = 'punkte-hinweis';
    p.textContent = 'Du trägst nichts, woran sich Arbeit lohnte.';
    feld.append(p);
    return;
  }

  for (const id of stuecke) {
    const d = DINGE[id];
    const pr = dinge.schliffPruefen(h, id);
    const stufe = (h.schliff && h.schliff[id]) || 0;
    const knopf = document.createElement('button');
    const geht = !pr.fertig && !pr.fehlt.length && pr.gold;
    knopf.className = 'esse-zeile' + (geht ? '' : ' aus');

    const zeichen = `<span class="esse-stufen">${'✦'.repeat(stufe)}`
      + `${'✧'.repeat(dinge.SCHLIFF_MAX - stufe)}</span>`;
    if (pr.fertig) {
      knopf.innerHTML = `${dingName(d, ` ${zeichen}`)}<small>Besser wird das nicht.</small>`;
    } else {
      const wirkung = dinge.schliffWirkung(id, stufe + 1);
      const gewinn = d.art === 'waffe'
        ? `+${wirkung.schaden} Schaden`
        : `+${Math.round(wirkung.panzer * 100)}% Rüstung`;
      const stoff = Object.entries(pr.rezept.stoff).map(([sid, n]) => {
        const da = h.beutel[sid] || 0;
        return `<span class="${da >= n ? 'hat' : 'fehlt'}">${DINGE[sid].name} ${da}/${n}</span>`;
      }).join(' · ');
      knopf.innerHTML = `${dingName(d, ` ${zeichen}`)}`
        + `<small>Stufe ${stufe + 1}: ${gewinn}</small>`
        + `<small><span class="${pr.gold ? 'hat' : 'fehlt'}">${pr.rezept.gold} Gold</span>`
        + ` · ${stoff}</small>`;
    }
    if (geht) {
      knopf.addEventListener('click', () => {
        if (!dinge.schleifen(h, id)) return;
        audio.gem(3);
        juice.shake(0.3);
        el('esseWort').textContent = dinge.SCHLIFF[(h.schliff[id] || 1) - 1].wort;
        waffeZeigen();
        esseZeichnen();
        updateHUD();
        writeSave();
      });
    }
    feld.append(knopf);
  }
}

/* ------------------------------ Heldenblatt -------------------------------- */
const MENU_KOPF = {
  fert:   ['Können', 'Fertigkeiten und Vorteile'],
  beutel: ['Beutel', 'was du trägst und was du dabei hast'],
  quests: ['Aufträge', 'was noch offen ist'],
  lager:  ['Lager', 'was du dir selbst hinstellst'],
  welt:   ['Karte', 'wo du bist und was ringsum liegt'],
  wesen:  ['Wesen', 'was dir schon begegnet ist'],
};

function menuZeichnen(tab = 'fert') {
  const h = held();
  for (const b of document.querySelectorAll('.reiter')) {
    b.classList.toggle('an', b.dataset.tab === tab);
  }
  const [titel, unter] = MENU_KOPF[tab] || MENU_KOPF.fert;
  el('menuTitel').textContent = titel;
  el('menuUnter').textContent = tab === 'fert'
    ? `${h.name || 'Namenlos'} ${herkunftVon(h.herkunft).woher} · Stufe ${h.stufe}`
      + `${h.punkte > 0 ? ` · ${h.punkte} Punkt${h.punkte > 1 ? 'e' : ''} frei` : ''}`
    : unter;
  el('menuGold').textContent = h.gold;
  for (const [id, name] of [['tabFert', 'fert'], ['tabBeutel', 'beutel'],
                            ['tabQuests', 'quests'], ['tabLager', 'lager'],
                            ['tabWelt', 'welt'], ['tabWesen', 'wesen']]) {
    el(id).classList.toggle('hidden', tab !== name);
  }
  if (tab === 'fert') fertZeichnen();
  if (tab === 'beutel') beutelZeichnen();
  if (tab === 'quests') questsZeichnen();
  if (tab === 'lager') lagerZeichnen();
  if (tab === 'welt') karteZeichnen();
  if (tab === 'wesen') bestiariumZeichnen();
}

/* --------------------------------- Beutel ---------------------------------- */
/* --------------------------------- Beutel ----------------------------------
 * Ein Inventar, wie man es kennt: oben drei Plätze für das, was am Körper
 * hängt, darunter die Werte, dann ein Gitter aus Fächern. Angetipptes steht
 * im Blatt darüber — mit Güte, Wirkung, Spruch und genau einem Knopf. So
 * bleibt die Liste kurz und die Entscheidung groß.
 * -------------------------------------------------------------------------- */
const BEUTEL_FILTER = [
  { id: 'alles',  name: 'Alles',      passt: () => true },
  { id: 'ruest',  name: 'Ausrüstung', passt: (d) => dinge.TRAGBAR.includes(d.art) },
  { id: 'nutz',   name: 'Tränke',     passt: (d) => d.art === 'trank' || d.art === 'lehre' },
  { id: 'beute',  name: 'Beute',      passt: (d) => d.art === 'beute' },
  { id: 'stoff',  name: 'Baustoff',   passt: (d) => d.art === 'stoff' },
];
let beutelFilter = 'alles';
let beutelWahl = null;

/* Gemeines bekommt keine Farbe — sonst sähe die Hälfte des Beutels aus wie
   ausgegraut. Erst ab „selten" lohnt sich ein Rand. */
const gueteFarbe = (d) =>
  (d && d.guete && d.guete !== 'gemein' ? dinge.SELTENHEIT[d.guete].farbe : null);

const ARTWORT = {
  waffe: 'Waffe', ruestung: 'Rüstung', schmuck: 'Schmuck',
  trank: 'Trank', lehre: 'Zauberbuch', beute: 'Beute', stoff: 'Baustoff',
};

function beutelZeichnen() {
  const h = held();
  const feld = el('tabBeutel');
  feld.replaceChildren();

  /* ---- Was am Körper hängt ---- */
  const kopf = document.createElement('div');
  kopf.className = 'rue-reihe';
  for (const art of dinge.TRAGBAR) {
    const id = h.rue[art];
    const d = id ? DINGE[id] : null;
    const platz = document.createElement('button');
    platz.className = 'rue-platz' + (id ? ' voll' : ' leer');
    const farbe = gueteFarbe(d);
    if (farbe) platz.style.setProperty('--rand', farbe);
    const sorte = art === 'waffe' ? 'schwert' : art === 'ruestung' ? 'schild' : 'ring';
    platz.innerHTML = d
      ? `${sym(d.sym)}<small style="color:${farbe || 'inherit'}">${d.name}</small>`
      : `${sym(sorte)}<small>${ARTWORT[art]}</small>`;
    platz.addEventListener('click', () => {
      if (id) { beutelWahl = id; beutelZeichnen(); }
    });
    kopf.append(platz);
  }
  feld.append(kopf);

  /* ---- Die drei Zahlen, die zählen ---- */
  const werte = document.createElement('div');
  werte.className = 'werte-reihe';
  const deckel = Math.round(Math.min(fert.werte.panzerdeckel(h), fert.werte.ruestung(h)) * 100);
  for (const [zahl, wort] of [
    [Math.round(fert.werte.schaden(h)), 'Schaden'],
    [`${deckel}%`, 'Rüstung'],
    [fert.werte.lebenMax(h), 'Leben'],
  ]) {
    const k = document.createElement('div');
    k.className = 'wert-kachel';
    k.innerHTML = `<b>${zahl}</b><small>${wort}</small>`;
    werte.append(k);
  }
  feld.append(werte);

  /* ---- Das Blatt: was gerade angetippt ist ---- */
  const ids = Object.keys(h.beutel).sort((a, b) => {
    const A = DINGE[a], B = DINGE[b];
    const g = (x) => ['sagenhaft', 'episch', 'selten', 'gemein'].indexOf(x.guete ?? 'zz');
    if (A.art !== B.art) return ARTFOLGE.indexOf(A.art) - ARTFOLGE.indexOf(B.art);
    if (g(A) !== g(B)) return g(A) - g(B);
    return B.wert - A.wert;
  });
  if (beutelWahl && !h.beutel[beutelWahl] && h.rue.waffe !== beutelWahl
      && h.rue.ruestung !== beutelWahl && h.rue.schmuck !== beutelWahl) beutelWahl = null;
  feld.append(dingBlatt(beutelWahl));

  /* ---- Die Auswahl ---- */
  const filter = document.createElement('div');
  filter.className = 'beutel-filter';
  for (const f of BEUTEL_FILTER) {
    const c = document.createElement('button');
    c.className = 'filter-chip' + (beutelFilter === f.id ? ' an' : '');
    c.textContent = f.name;
    c.addEventListener('click', () => { beutelFilter = f.id; beutelZeichnen(); });
    filter.append(c);
  }
  feld.append(filter);

  /* ---- Das Gitter ---- */
  const regel = BEUTEL_FILTER.find((f) => f.id === beutelFilter) || BEUTEL_FILTER[0];
  const zeigen = ids.filter((id) => regel.passt(DINGE[id]));
  const gitter = document.createElement('div');
  gitter.className = 'beutel-gitter';
  for (const id of zeigen) {
    const d = DINGE[id];
    const fach = document.createElement('button');
    fach.className = 'fach' + (beutelWahl === id ? ' an' : '');
    const farbe = gueteFarbe(d);
    if (farbe) fach.style.setProperty('--rand', farbe);
    fach.innerHTML = sym(d.sym)
      + (h.beutel[id] > 1 ? `<span class="zahl">${h.beutel[id]}</span>` : '');
    fach.title = d.name;
    fach.addEventListener('click', () => {
      beutelWahl = beutelWahl === id ? null : id;
      audio.step();
      beutelZeichnen();
    });
    gitter.append(fach);
  }
  // Der Beutel sieht auch leer wie ein Beutel aus: mindestens zwei Reihen
  for (let i = zeigen.length; i < Math.max(10, Math.ceil((zeigen.length + 1) / 5) * 5); i++) {
    const leer = document.createElement('div');
    leer.className = 'fach leer';
    gitter.append(leer);
  }
  feld.append(gitter);

  if (!ids.length) {
    const p = document.createElement('p');
    p.className = 'punkte-hinweis';
    p.style.marginTop = '10px';
    p.textContent = 'Der Beutel ist leer. Gruften sind voll.';
    feld.append(p);
  }
}

const ARTFOLGE = ['waffe', 'ruestung', 'schmuck', 'trank', 'lehre', 'stoff', 'beute'];

/** Das Blatt über dem Gitter — alles über ein Stück und ein Knopf dazu. */
function dingBlatt(id) {
  const h = held();
  const blatt = document.createElement('div');
  blatt.className = 'ding-blatt';
  if (!id || !DINGE[id]) {
    blatt.classList.add('leer');
    blatt.innerHTML = '<small>Tippe ein Fach an, dann steht hier, was es ist.</small>';
    return blatt;
  }
  const d = DINGE[id];
  const farbe = gueteFarbe(d);
  if (farbe) blatt.style.setProperty('--rand', farbe);
  const getragen = Object.values(h.rue).includes(id);

  const txt = document.createElement('span');
  txt.className = 'txt';
  const kopfzeile = `<b style="color:${farbe || 'inherit'}">${d.name}</b>`
    + `<span class="guete" style="color:${farbe || 'var(--tinte-hell)'}">`
    + `${d.guete ? dinge.SELTENHEIT[d.guete].name : ''}`
    + `${d.guete ? ' · ' : ''}${ARTWORT[d.art] || ''}${getragen ? ' · getragen' : ''}</span>`;
  const wirkt = wirkungsliste(d);
  txt.innerHTML = kopfzeile
    + (wirkt ? `<span class="wirkt">${wirkt}</span>` : '')
    + `<span class="wort">${d.text}</span>`;

  const fuss = document.createElement('div');
  fuss.className = 'blatt-fuss';
  const tun = document.createElement('button');
  tun.className = 'ding-tun';
  if (getragen) {
    tun.textContent = 'ablegen';
    const art = Object.keys(h.rue).find((a) => h.rue[a] === id);
    tun.addEventListener('click', () => {
      dinge.ausziehen(h, art); audio.step(); beutelZeichnen(); updateHUD();
    });
  } else if (dinge.TRAGBAR.includes(d.art)) {
    tun.textContent = 'anlegen';
    tun.addEventListener('click', () => {
      dinge.anlegen(h, id); audio.gem(2); beutelZeichnen(); updateHUD();
    });
  } else if (d.art === 'lehre') {
    tun.textContent = 'lesen';
    tun.addEventListener('click', () => { zauberLernen(id); beutelZeichnen(); });
  } else if (d.art === 'trank') {
    tun.textContent = 'trinken';
    tun.addEventListener('click', () => { trinkenGezielt(id); beutelZeichnen(); });
  } else if (d.baustoff) {
    tun.textContent = 'fürs Lager';
    tun.classList.add('still');
  } else {
    tun.textContent = 'zum Verkauf';
    tun.classList.add('still');
  }
  fuss.append(tun);
  const preis = document.createElement('span');
  preis.className = 'preis-chip';
  preis.innerHTML = `${verkaufFuer(id)}<i class="ic-muenze">${ICONS.muenze}</i> beim Händler`;
  fuss.append(preis);
  txt.append(fuss);

  blatt.innerHTML = sym(d.sym);
  blatt.append(txt);
  return blatt;
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

/* --------------------------------- Können ----------------------------------
 * Fünf Fertigkeiten, jede eine Lade: der Kopf zeigt Stufe und Fortschritt,
 * aufgeklappt hängt die Perlenschnur ihrer Vorteile darin. Nur eine Lade ist
 * offen — so bleibt die Seite kurz, auch wenn fünfundzwanzig Vorteile darin
 * stecken. Was man sich gerade nehmen kann, leuchtet golden.
 * -------------------------------------------------------------------------- */
let fertOffen = null;

function fertZeichnen() {
  const h = held();
  const feld = el('tabFert');
  feld.replaceChildren();

  // Wo etwas zu holen ist, geht die Lade von selbst auf
  const frei = (id) => fert.vorteileVon(id).some(
    (v) => !h.vorteile.has(v.id) && h.punkte > 0 && h.fert[id] >= v.stufe);
  if (fertOffen === null) {
    fertOffen = Object.keys(fert.FERTIGKEITEN).find(frei) || '';
  }

  const hinweis = document.createElement('p');
  hinweis.className = 'punkte-hinweis' + (h.punkte > 0 ? ' wichtig' : '');
  hinweis.textContent = h.punkte > 0
    ? `${h.punkte} Punkt${h.punkte > 1 ? 'e' : ''} zu vergeben — jede Stufe bringt einen.`
    : 'Fertigkeiten steigen dadurch, dass du sie benutzt. Jede Stufe gibt einen Punkt.';
  feld.append(hinweis);

  zauberliste(feld);

  for (const [id, f] of Object.entries(fert.FERTIGKEITEN)) {
    const offen = fertOffen === id;
    const karte = document.createElement('div');
    karte.className = 'fert-karte' + (offen ? ' offen' : '');

    const kopf = document.createElement('button');
    kopf.className = 'fert-kopf';
    const alle = fert.vorteileVon(id);
    const wieviel = alle.filter((v) => h.vorteile.has(v.id)).length;
    kopf.innerHTML = sym(f.sym)
      + `<span class="txt"><b>${f.name}</b>`
      + `<small>${f.hinweis} · ${wieviel}/${alle.length} Vorteile</small></span>`
      + (frei(id) ? '<span class="fert-punkt"></span>' : '')
      + `<span class="stufe-zahl">${h.fert[id]}</span>`;
    kopf.addEventListener('click', () => {
      fertOffen = offen ? '' : id;
      audio.step();
      fertZeichnen();
    });
    karte.append(kopf);

    // Wie weit die nächste Stufe noch weg ist
    const ziel = fert.stufenziel(h.fert[id]);
    const stand = Math.min(1, ((h.fertXp && h.fertXp[id]) || 0) / ziel);
    const bal = document.createElement('div');
    bal.className = 'fert-balken';
    bal.innerHTML = `<i style="width:${(stand * 100).toFixed(0)}%"></i>`;
    karte.append(bal);

    const liste = document.createElement('div');
    liste.className = 'vorteil-liste';
    for (const v of alle) {
      const hat = h.vorteile.has(v.id);
      const reicht = h.fert[id] >= v.stufe;
      const kann = !hat && reicht && h.punkte > 0;
      const b = document.createElement('button');
      b.className = 'vorteil' + (hat ? ' hat' : kann ? ' frei' : ' aus');
      b.innerHTML = `<b>${v.name}</b><small>${v.text}`
        + (hat ? '' : ` <span class="sperre">— ab ${f.name} ${v.stufe}</span>`)
        + '</small>';
      if (kann) {
        b.addEventListener('click', () => {
          if (fert.vorteilNehmen(h, v.id)) {
            audio.gem(3);
            juice.ring({ x: player.pos.x, y: player.pos.y + 1, z: player.pos.z },
              2.6, '#e8a83c', 0.6);
            menuZeichnen('fert'); updateHUD();
          }
        });
      }
      liste.append(b);
    }
    karte.append(liste);
    feld.append(karte);
  }
}

/* Was er sprechen kann, steht über den Fertigkeiten — antippen legt den
   Spruch auf den Knopf. Was er noch nicht kann, steht blass daneben: so
   weiß man, wonach man in den Truhen sucht. */
function zauberliste(feld) {
  const h = held();
  const kann = gelernte(h);
  const offen = fertOffen === 'zauber';

  const karte = document.createElement('div');
  karte.className = 'fert-karte zauber-lade' + (offen ? ' offen' : '');
  const kopf = document.createElement('button');
  kopf.className = 'fert-kopf';
  kopf.innerHTML = sym(aktiverZauber().sym)
    + `<span class="txt"><b>Zauber</b>`
    + `<small>auf dem Knopf: ${aktiverZauber().name}</small></span>`
    + `<span class="stufe-zahl">${kann.length}/${ZAUBER_IDS.length}</span>`;
  kopf.addEventListener('click', () => {
    fertOffen = offen ? '' : 'zauber';
    audio.step();
    fertZeichnen();
  });
  karte.append(kopf);

  const liste = document.createElement('div');
  liste.className = 'vorteil-liste';
  const wort = document.createElement('p');
  wort.className = 'punkte-hinweis';
  wort.style.margin = '0 0 7px';
  wort.textContent = 'Antippen legt den Spruch auf den Knopf. Lang auf den Knopf gedrückt '
    + 'blättert mitten im Kampf weiter.';
  liste.append(wort);

  for (const id of ZAUBER_IDS) {
    const z = ZAUBER[id];
    const hat = kann.includes(id);
    const dran = hat && h.aktiverZauber === id;
    const b = document.createElement('button');
    b.className = 'vorteil zauber-zeile' + (dran ? ' hat' : hat ? '' : ' aus');
    const farbe = dinge.SELTENHEIT[z.guete].farbe;
    b.innerHTML = `${sym(z.sym)}<span class="txt">`
      + `<b style="color:${farbe}">${dran ? '✓ ' : ''}${z.name}</b>`
      + `<small>${hat ? z.kurz
        : `${dinge.SELTENHEIT[z.guete].name} · noch nicht gelernt — ab Magie ${z.braucht}`}`
      + '</small></span>'
      + (hat ? `<span class="kosten">${zauberkosten(z)}</span>` : '');
    if (hat && !dran) {
      b.addEventListener('click', () => { zauberWaehlen(id); fertZeichnen(); });
    }
    liste.append(b);
  }
  karte.append(liste);
  feld.append(karte);
}

function questsZeichnen() {
  const feld = el('tabQuests');
  feld.replaceChildren();

  const st = state.geschichte;
  const k = story.aktuell(st);
  const v = verfolgtes();

  const ueberschrift = (wort) => {
    const p = document.createElement('p');
    p.className = 'abschnitt';
    p.textContent = wort;
    feld.append(p);
  };

  if (k) {
    ueberschrift('Der lange Weg');
    const fertig = st.gestartet && story.kapitelFertig(st);
    const dran = v && v.art === 'haupt';
    const z = document.createElement('div');
    z.className = 'q-zeile haupt' + (fertig ? ' fertig' : '') + (dran ? ' verfolgt' : '');
    z.innerHTML = st.gestartet
      ? `<b>✦ ${k.titel}</b>`
        + `<p>${story.fuellen(k.rede, st, schlundRichtung()).split('\n')[0]}</p>`
      : '<b>✦ Der Chronist</b><p>Im Heimatdorf wohnt jemand, der aufschreibt, '
        + 'was aufhört. Sprich mit ihm.</p>';

    const fuss = document.createElement('div');
    fuss.className = 'q-fuss';
    const stand = document.createElement('small');
    stand.textContent = !st.gestartet ? 'noch nicht begonnen'
      : fertig ? 'zurück zum Chronisten'
      : `${story.fuellen(k.ziel, st)} · ${st.ziel}/${k.menge}`;
    // Wo man suchen muss, steht dabei — sonst läuft man ratlos im Kreis
    if (st.gestartet && !fertig && k.wo) {
      const wo = document.createElement('p');
      wo.style.cssText = 'margin:2px 0 0;font-size:11.5px;opacity:.62;font-weight:700';
      wo.textContent = story.fuellen(k.wo, st, schlundRichtung());
      z.append(wo);
    }
    const knopf = document.createElement('button');
    knopf.className = 'q-verfolgen' + (dran ? ' an' : '');
    knopf.textContent = dran ? '◆ verfolgt' : '◇ verfolgen';
    // Ein Klick wählt aus, immer. Ein Klick, der abwählt, sieht aus wie ein
    // Klick ohne Wirkung, sobald dieselbe Zeile ohnehin die Vorgabe war.
    knopf.addEventListener('click', () => {
      state.buch.verfolgen('haupt');
      audio.step();
      questsZeichnen();
      updateHUD();
    });
    fuss.append(stand, knopf);
    z.append(fuss);
    feld.append(z);
  }

  const offen = state.buch.offen;
  ueberschrift('Was die Leute wollen');
  if (!offen.length) {
    const p = document.createElement('p');
    p.className = 'punkte-hinweis';
    p.textContent = 'Kein Auftrag. Sprich mit den Leuten im Dorf.';
    feld.append(p);
  }
  for (const q of offen) {
    const dran = !!v && v.art === 'quest' && v.q === q;
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
      state.buch.verfolgen(q);
      audio.step();
      questsZeichnen();
      updateHUD();
    });
    fuss.append(stand, knopf);
    z.append(fuss);
    feld.append(z);
  }
  const alt3 = state.buch.erledigt.slice(-3);
  if (alt3.length) ueberschrift('Erledigt');
  for (const q of alt3) {
    const z = document.createElement('div');
    z.className = 'q-zeile';
    z.innerHTML = `<b style="opacity:.5">✓ ${q.titel}</b>`;
    feld.append(z);
  }

  // Zählt am Ende der Geschichte, also steht sie auch hier am Ende
  const hilfen = document.createElement('p');
  hilfen.className = 'punkte-hinweis';
  hilfen.textContent = `${held().hilfen || 0} Menschen geholfen`;
  feld.append(hilfen);
}

/* --------------------------------- Lager -----------------------------------
 * Eine Liste, kein Raster: fünf Teile, jedes mit Preis und einem Satz dazu.
 * Was man sich leisten kann, ist anklickbar — der Rest steht grau daneben und
 * sagt einem, was noch fehlt. Gebaut wird draußen, zwei Schritte vor einem.
 * -------------------------------------------------------------------------- */
const STOFFWORT = (id, n) => `${n} ${DINGE[id].name}`;

function lagerZeichnen() {
  const h = held();
  const feld = el('tabLager');
  feld.replaceChildren();

  // Oben der Vorrat — die drei Zahlen, um die es hier geht
  const vorrat = document.createElement('div');
  vorrat.className = 'vorrat';
  for (const id of ['holz', 'stein', 'glimmstein']) {
    const k = document.createElement('span');
    k.innerHTML = `${sym(DINGE[id].sym)}<b>${h.beutel[id] || 0}</b>`
      + `<small>${DINGE[id].name}</small>`;
    vorrat.append(k);
  }
  feld.append(vorrat);

  const hinweis = document.createElement('p');
  hinweis.className = 'punkte-hinweis';
  hinweis.textContent = state.lager.length
    ? `${state.lager.length} Teil${state.lager.length > 1 ? 'e' : ''} stehen draußen. `
      + 'Mit der Axt nimmst du sie wieder auseinander.'
    : 'Holz schlägst du an Bäumen, Stein an Findlingen und Felswänden — '
      + 'mit der Axt unten rechts.';
  feld.append(hinweis);

  for (const id of lager.LISTE) {
    const a = lager.BAUTEILE[id];
    const kann = lager.reicht(h.beutel, id);
    const zeile = document.createElement('button');
    zeile.className = 'bau-zeile' + (kann ? '' : ' fehlt');
    const preis = Object.entries(a.kosten)
      .map(([stoff, n]) => `<span class="${(h.beutel[stoff] || 0) >= n ? 'hat' : 'offen'}">`
        + `${STOFFWORT(stoff, n)}</span>`).join(' · ');
    zeile.innerHTML = `<span class="bau-bild">${sym(a.sym)}</span>`
      + `<span class="bau-text"><b>${a.name}</b><small>${a.kurz}</small>`
      + `<p>${a.text}</p><span class="bau-preis">${preis}</span></span>`;
    zeile.addEventListener('click', () => {
      if (!kann) { audio.step(); return; }
      if (lagerBauen(id)) {
        el('menu').classList.add('hidden');     // hinsehen, was da entstanden ist
      }
      lagerZeichnen();
    });
    feld.append(zeile);
  }

  const wo = document.createElement('p');
  wo.className = 'punkte-hinweis';
  wo.style.marginTop = '10px';
  wo.textContent = 'Gebaut wird zwei Schritte vor dir — nicht im Dorf, nicht im '
    + 'Wasser und nicht unter Tage.';
  feld.append(wo);
}

/* --------------------------------- Karte -----------------------------------
 * Ein gemaltes Blatt in einem Holzrahmen: die Gegenden als Farbflächen, die
 * Zeichen darauf als Punkte, oben rechts die Rose. Zwei Weiten — nah, um den
 * Weg ins nächste Dorf zu finden, fern, um zu sehen, was es sonst noch gibt.
 * -------------------------------------------------------------------------- */
const KARTENWEITEN = [{ name: 'nah', r: 300 }, { name: 'weit', r: 620 }];
let kartenWeite = 0;

function karteZeichnen() {
  const feld = el('tabWelt');
  feld.replaceChildren();

  const kopf = document.createElement('div');
  kopf.className = 'karten-kopfzeile';
  const wo = document.createElement('small');
  wo.className = 'punkte-hinweis';
  wo.style.margin = '0';
  wo.textContent = `${Math.round(player.pos.x)} · ${Math.round(player.pos.z)}`;
  const wahl = document.createElement('div');
  wahl.className = 'weite-wahl';
  KARTENWEITEN.forEach((w, i) => {
    const b = document.createElement('button');
    b.className = kartenWeite === i ? 'an' : '';
    b.textContent = w.name;
    b.addEventListener('click', () => { kartenWeite = i; karteZeichnen(); });
    wahl.append(b);
  });
  kopf.append(wo, wahl);
  feld.append(kopf);

  const box = document.createElement('div');
  box.className = 'karte-feld';
  const R = KARTENWEITEN[kartenWeite].r;
  const px = player.pos.x, pz = player.pos.z;
  box.append(kartenBlatt(px, pz, R));
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
  for (const g of gruft.grueftUm(px, pz, R)) setz(g.x, g.z, `gruft ${g.art || 'gruft'}`);
  for (const o of orte.orteUm(px, pz, R)) setz(o.x, o.z, `ort ${o.art}`);
  for (const t of state.lager) setz(t.x, t.z, 'mein');
  const ziel = zielPunkt();
  if (ziel) setz(ziel.x, ziel.z, 'ziel');
  setz(px, pz, 'du');

  const rose = document.createElement('span');
  rose.className = 'karte-rose';
  rose.innerHTML = ICONS.rose;
  box.append(rose);
  feld.append(box);

  const leg = document.createElement('p');
  leg.className = 'karte-legende';
  leg.innerHTML = '<span class="wort"><span class="punkt dorf"></span>Dorf</span>'
    + '<span class="wort"><span class="punkt gruft"></span>Gruft</span>'
    + '<span class="wort"><span class="punkt gruft frost"></span>Frost</span>'
    + '<span class="wort"><span class="punkt gruft moor"></span>Moor</span>'
    + '<span class="wort"><span class="punkt gruft glut"></span>Glut</span>'
    + '<span class="wort"><span class="punkt ort turm"></span>Landmarke</span>'
    + '<span class="wort"><span class="punkt mein"></span>dein Lager</span>'
    + '<span class="wort"><span class="punkt ziel"></span>Ziel</span>'
    + '<span class="wort"><span class="punkt du"></span>du</span>'
    + `<span class="legende-weite">Umkreis ${R * 2} Schritt</span>`;
  feld.append(leg);

  const heim = document.createElement('button');
  heim.className = 'karten-knopf';
  heim.innerHTML = `${sym('stiefel')}<span>Heimkehr — zum nächsten Dorf</span>`;
  heim.addEventListener('click', () => { el('menu').classList.add('hidden'); heimkehr(); });
  feld.append(heim);
  const wort = document.createElement('p');
  wort.className = 'punkte-hinweis';
  wort.textContent = 'Steckst du in einer Höhle fest, bringt dich die Heimkehr heraus.';
  feld.append(wort);

  feld.append(neuanfangKnopf());
}

/* ------------------------------ Bestiarium ---------------------------------
 * Zwanzig Wesen, und nirgends stand, welche man schon gesehen hat. Diese
 * Seite füllt sich beim Wandern: was einem einmal vor die Augen gekommen ist,
 * steht darin — mit seiner Gefahr, seiner Haltung, seiner Gegend und dem, was
 * es hinterlässt. Was man noch nie gesehen hat, bleibt ein Fragezeichen.
 * -------------------------------------------------------------------------- */
const HALTUNG = {
  friedlich: 'friedlich — läuft weg',
  wehrhaft: 'wehrhaft — nur wenn du anfängst',
  wild: 'wild — kommt von allein',
};

/** In welchen Gegenden ein Wesen vorkommt. */
function heimatVon(id) {
  const orte = [];
  for (const [biom, b] of Object.entries(BEWOHNER)) {
    const drin = [...b.tag, ...b.nacht].some(([w]) => w === id);
    if (drin && BIOMES[biom]) orte.push(BIOMES[biom].name);
  }
  return orte;
}

function wesenGesehen() {
  const h = held();
  h.gesehen = h.gesehen || new Set();
  for (const f of feinde.liste) {
    if (h.gesehen.has(f.id)) continue;
    if (Math.hypot(f.pos.x - player.pos.x, f.pos.z - player.pos.z) > 24) continue;
    h.gesehen.add(f.id);
  }
}

function bestiariumZeichnen() {
  const h = held();
  h.gesehen = h.gesehen || new Set();
  const feld = el('tabWesen');
  feld.replaceChildren();

  const alle = Object.keys(ARTEN);
  const sortiert = alle.slice().sort((a, b) =>
    (ARTEN[a].stufe || 1) - (ARTEN[b].stufe || 1) || ARTEN[a].name.localeCompare(ARTEN[b].name));
  const kennt = sortiert.filter((id) => h.gesehen.has(id));
  const fremd = sortiert.filter((id) => !h.gesehen.has(id));

  const kopf = document.createElement('p');
  kopf.className = 'punkte-hinweis';
  kopf.textContent = `${kennt.length} von ${alle.length} Wesen gesehen`;
  feld.append(kopf);

  if (!kennt.length) {
    const p = document.createElement('p');
    p.className = 'punkte-hinweis wichtig';
    p.textContent = 'Noch nichts gesehen. Was dir vor die Augen kommt, steht danach hier — '
      + 'mit Gefahr, Haltung, Heimat und dem, was es zurücklässt.';
    feld.append(p);
  }

  for (const id of kennt) {
    const art = ARTEN[id];
    const z = document.createElement('div');
    z.className = 'wesen-zeile';

    const bild = document.createElement('span');
    bild.className = 'wesen-fleck';
    bild.style.background = art.fell;
    bild.style.boxShadow = `0 0 0 2px ${art.dunkel}`;
    z.append(bild);

    const st = art.stufe || 1;
    const erlegt = (h.erlegt && h.erlegt[id]) || 0;
    const wo = heimatVon(id);
    const beute = art.beute && DINGE[art.beute] ? DINGE[art.beute].name : null;
    const txt = document.createElement('span');
    txt.className = 'wesen-text';
    txt.innerHTML = `<b>${art.name} <span class="gefahr g${st}">${'◆'.repeat(st)}</span></b>`
      + `<small>${HALTUNG[art.gesinnung] || 'wild'}`
      + (art.fern ? ' · schießt' : '')
      + (art.nurNachts ? ' · nur nachts' : '') + '</small>'
      + `<small>${wo.length ? wo.join(', ') : 'in den Gruften'}</small>`
      + `<small>${beute ? `lässt ${beute} zurück` : 'lässt nichts zurück'}`
      + (erlegt ? ` · ${erlegt} erlegt` : '') + '</small>';
    z.append(txt);
    feld.append(z);
  }

  /* Dreißig Zeilen „Unbekannt" wären dreißigmal dieselbe Auskunft. Was man
     noch nicht kennt, steht deshalb als Reihe stummer Fächer da — man sieht
     auf einen Blick, wie viel die Welt noch zurückhält. */
  if (fremd.length) {
    const ueber = document.createElement('p');
    ueber.className = 'abschnitt';
    ueber.textContent = `Noch nicht begegnet · ${fremd.length}`;
    feld.append(ueber);

    const gitter = document.createElement('div');
    gitter.className = 'beutel-gitter fremd-gitter';
    for (const id of fremd) {
      const f = document.createElement('div');
      f.className = 'fach leer fremd-fach';
      f.textContent = '?';
      f.title = `Gefahr ${ARTEN[id].stufe || 1}`;
      gitter.append(f);
    }
    feld.append(gitter);
  }
}


/* ---------------------------- Das Kartenblatt ------------------------------
 * Punkte allein sagen nichts darüber, wo man ist. Hier wird die Gegend selbst
 * gemalt: Wald grün, Düne sandfarben, Wasser blau, dazu eine Schummerung für
 * die Hänge. Das Bild kostet ein paar tausend Rauschabfragen, also wird es
 * gemerkt, solange man sich nicht weit bewegt hat.
 * -------------------------------------------------------------------------- */
const KARTE_N = 112;
let kartenCache = { key: null, canvas: null };

function kartenBlatt(px, pz, R) {
  const schritt = (R * 2) / KARTE_N;
  // Grob gerastert merken, sonst wird bei jedem Schritt neu gemalt
  const key = `${Math.round(px / 24)},${Math.round(pz / 24)},${getSeed()}`;
  if (kartenCache.key === key && kartenCache.canvas) return kartenCache.canvas;

  const c = document.createElement('canvas');
  c.width = KARTE_N;
  c.height = KARTE_N;
  c.className = 'karte-bild';
  const ctx = c.getContext('2d');
  const bild = new ImageData(kartenBild(px, pz, schritt, KARTE_N), KARTE_N, KARTE_N);
  ctx.putImageData(bild, 0, 0);
  kartenCache = { key, canvas: c };
  return c;
}

/* Ein neues Spiel wirft alles weg — das fragt man besser zweimal. */
function neuanfangKnopf() {
  const knopf = document.createElement('button');
  knopf.className = 'karten-knopf gefahr-knopf';
  let sicher = false;
  const beschriften = () => {
    knopf.innerHTML = sicher
      ? '<span>Wirklich? Alles geht verloren — noch einmal tippen</span>'
      : `${sym('funke')}<span>Neu anfangen — neue Welt, neuer Held</span>`;
  };
  beschriften();
  knopf.addEventListener('click', () => {
    if (!sicher) {
      sicher = true;
      beschriften();
      setTimeout(() => { sicher = false; beschriften(); }, 4000);
      return;
    }
    el('menu').classList.add('hidden');
    schoepfungOeffnen();
  });
  return knopf;
}

/* ------------------------------ Tag und Nacht ------------------------------ */
/* Die Maschenweite des Schattengitters: die Schattenkamera deckt 120 Einheiten
   auf 2048 Texeln ab, ein Texel ist also knapp 0,06 breit. Vier davon sind
   fein genug, dass niemand den Sprung sieht, und grob genug, dass zwischen
   den Sprüngen wirklich Ruhe herrscht. */
const SCHATTENRASTER = 0.235;
const underColor = new THREE.Color('#6e5440');
const skyDay = new THREE.Color('#ede2cd');
const skyDusk = new THREE.Color('#f2cba4');
const skyNight = new THREE.Color('#8e9bb5');
const sunDay = new THREE.Color('#fff6e4');
const sunDusk = new THREE.Color('#ffb27a');
const sunNight = new THREE.Color('#c3cfe6');
const tmpSky = new THREE.Color();
const wetterFarbe = new THREE.Color();
const tmpSun = new THREE.Color();

function applyDaytime() {
  const t = state.time;
  /* Der Himmel geht über drei Farben: Tag, Abendrot, Nacht. Das Abendrot
     sitzt in der Mitte der Dämmerung und verschwindet zu beiden Seiten — so
     wird es abends erst warm und dann dunkel, morgens umgekehrt. */
  const nacht = nachtGrad(t);
  const rot = Math.sin(Math.min(1, nacht) * Math.PI);   // 0 → 1 → 0
  tmpSky.copy(skyDay).lerp(skyNight, nacht).lerp(skyDusk, rot * 0.8);
  tmpSun.copy(sunDay).lerp(sunNight, nacht).lerp(sunDusk, rot * 0.85);
  const himmelTon = wetter.kind.himmel || wetter.kind.farbe;
  if (state.under < 0.5 && wetter.wirkung > 0.01 && himmelTon) {
    wetterFarbe.set(himmelTon);
    tmpSky.lerp(wetterFarbe, wetter.wirkung * 0.5);
    tmpSun.lerp(wetterFarbe, wetter.wirkung * 0.35);
  }
  tmpSky.lerp(underColor, state.under);

  // Die Nebelweiten zählen ab Kamera, nicht ab Spieler
  // Untertage darf der Dunst nicht früher einsetzen als über Tage, sonst
  // löst sich die Gruft in helles Nichts auf.
  // Regen und Nebel ziehen die Sicht zu; unter Tage gilt weiter der Berg
  const nf = state.under > 0.5 ? 1 : wetter.nebelFaktor();
  scene.fog.near = (camDist + 14 + state.under * 10) * (0.35 + nf * 0.65);
  scene.fog.far = (camDist + 62 + state.under * 26) * nf;
  scene.background.copy(tmpSky);
  scene.fog.color.copy(tmpSky);
  renderer.setClearColor(tmpSky);
  sun.color.copy(tmpSun);

  const night = nachtGrad(t);
  const under = state.under;
  const trueb = state.under > 0.5 ? 0 : wetter.dunkelheit();
  sun.intensity = (1.15 - night * 0.6) * (1 - under * 0.4) * (1 - trueb * 2.2);
  hemi.intensity = (0.95 - night * 0.4) * (1 - under * 0.3) + under * 0.3;

  /* Sonne und Schattenkamera rasten auf ein grobes Gitter ein. Liefen sie
     stetig mit — und das taten sie, weil der Tag weiterzieht und der Held
     sich bewegt —, verschob sich die Schattenkarte in jedem Bild um einen
     Bruchteil eines Texels. Jede Schattenkante rechnete sich dann sechzigmal
     in der Sekunde neu aus und flimmerte. Mit dem Gitter steht der Schatten
     mehrere Bilder lang still und springt dafür um ganze Texel weiter, was
     man nicht sieht. */
  const ang = (t - 0.25) * Math.PI * 2;
  const rast = (v) => Math.round(v / SCHATTENRASTER) * SCHATTENRASTER;
  sun.position.set(
    rast(player.pos.x + Math.cos(ang) * 50),
    rast(player.pos.y + 26 + Math.max(8, Math.sin(ang) * 50)),
    rast(player.pos.z + 28)
  );
  sun.target.position.set(rast(player.pos.x), rast(player.pos.y), rast(player.pos.z));
  sun.target.updateMatrixWorld();
}

/* ------------------------------- Draußen leben ----------------------------- */
let wildTimer = 4;
/* Jede Gegend klingt anders — welcher Grundton wo liegt, steht hier. */
const STIMMUNG = {
  wiese: 'warm', bluete: 'warm', heide: 'warm', steppe: 'warm',
  wald: 'wald', birken: 'wald',
  taiga: 'kalt', schnee: 'kalt',
  wueste: 'karg', mesa: 'karg',
  sumpf: 'dunkel', berg: 'fels',
};

/* Wie tief die Nacht ist: 0 am hellen Tag, 1 in der tiefsten Nacht, und
   dazwischen weich über je eine gute Minute. Vorher war das ein Schalter,
   und um 0.78 wurde es von einem Bild aufs nächste dunkel. */
function nachtGrad(t = state.time) {
  const weich = (x) => x * x * (3 - 2 * x);
  // Die Dämmerung dauert bei 420 Sekunden Tageslänge gut anderthalb Minuten —
  // kurz genug, dass man sie erlebt, lang genug, dass sie nicht umspringt.
  if (t >= 0.88 || t < 0.05) return 1;               // tiefe Nacht
  if (t >= 0.66) return weich((t - 0.66) / 0.22);    // Abend: es dämmert
  if (t < 0.24) return 1 - weich((t - 0.05) / 0.19); // Morgen: es wird hell
  return 0;
}

/* Fürs Spiel zählt die Nacht, sobald es spürbar dunkel ist — was draußen
   aufsteht, richtet sich danach. */
const istNacht = () => nachtGrad() > 0.55;

function wildnisPflegen(dt) {
  wildTimer -= dt;
  if (wildTimer > 0) return;
  wildTimer = 3 + Math.random() * 5;

  // Was nur die Nacht hervorbringt, hält das Licht nicht aus. Wer bis zum
  // Morgen durchhält, hat den Nachtmahr überstanden — wortwörtlich.
  if (!istNacht()) {
    for (const f of [...feinde.liste]) {
      if (!f.art.nurNachts) continue;
      juice.ring({ x: f.pos.x, y: f.pos.y + 0.8, z: f.pos.z }, 2.0, '#8fb8cf', 0.5);
      feinde.entfernen(f);
    }
  }

  if (state.imDungeon) return;
  if (feinde.anzahl >= 18) return;

  // Nicht im Dorf: dort soll man verschnaufen können
  if (dorfBei(Math.floor(player.pos.x), Math.floor(player.pos.z))) return;

  const nacht = istNacht();
  const a = Math.random() * Math.PI * 2;
  const r = 26 + Math.random() * 28;
  const x = Math.round(player.pos.x + Math.cos(a) * r);
  const z = Math.round(player.pos.z + Math.sin(a) * r);
  const y = surfaceAt(x, z);
  if (y <= SEA) return;
  if (dorfBei(x, z)) return;

  // Jede Gegend hat ihr eigenes Getier, und nachts ein anderes als am Tag
  const gegend = biomeAt(x, z);
  const gefahr = gefahrVon(gegend.id);

  /* Auf der Wiese stehen tagsüber vor allem Hasen und Schafe — schön, aber
     davon allein lebt kein Spiel. Steht schon genug Friedliches herum oder
     fehlt es an Gegnern, wird so lange neu gezogen, bis etwas kommt, das
     einen auch angeht. */
  const friedlich = feinde.liste.filter((f) => f.gesinnung === 'friedlich').length;
  const feindlich = feinde.anzahl - friedlich;
  const willKampf = friedlich >= 4 || feindlich < 2;
  let art = wesenWaehlen(gegend.id, nacht);
  for (let i = 0; willKampf && i < 4 && ARTEN[art]?.gesinnung === 'friedlich'; i++) {
    art = wesenWaehlen(gegend.id, nacht);
  }
  rudelSetzen(art, x, z, gegend, gefahr, nacht);
}

/* Ein einzelner Wolf ist kein Kampf, sondern eine Unterbrechung. Was von
   allein kommt, kommt im Rudel — wie viele, hängt an der Art, an der Gegend
   und daran, ob es Nacht ist. Und manchmal führt ein Gezeichneter das Rudel.
   Die Stärke bestimmt die Gegend, nicht die Entfernung vom Anfang: ein
   Firnfeld ist von der ersten Minute an ein Firnfeld. */
function rudelSetzen(art, x, z, gegend, gefahr, nacht, zwang = 0) {
  const w = ARTEN[art];
  if (!w) return [];
  const stufe = Math.min(5, Math.max(1,
    Math.round(gefahr * 0.7) + (nacht ? 1 : 0) + Math.min(2, Math.floor(Math.hypot(x, z) / 900))));

  // Friedliches Getier zieht in kleinen Gruppen, Wildes jährt im Rudel
  let zahl = zwang;
  if (!zahl) {
    const grund = w.gesinnung === 'friedlich' ? 2 : w.gesinnung === 'wehrhaft' ? 1 : 3;
    zahl = grund + (Math.random() < (nacht ? 0.8 : 0.5) ? 1 : 0)
      + (gefahr >= 3 && Math.random() < 0.6 ? 1 : 0)
      + (gefahr >= 5 ? 1 : 0);
    if (w.stufe >= 4) zahl = Math.max(1, zahl - 2);     // von den Großen reicht einer
    if (w.boss) zahl = 1;
  }
  zahl = Math.min(zahl, 18 - feinde.anzahl);
  if (zahl <= 0) return [];

  // Einer führt — aber nur, wenn es sich lohnt und der Zufall es will
  const fuehrer = w.gesinnung === 'wild' && !w.boss
    && Math.random() < 0.12 + gefahr * 0.03 + (nacht ? 0.06 : 0);

  const raus = [];
  for (let i = 0; i < zahl; i++) {
    const wx = Math.round(x + (Math.random() - 0.5) * 7);
    const wz = Math.round(z + (Math.random() - 0.5) * 7);
    const wy = surfaceAt(wx, wz);
    if (wy <= SEA) continue;
    const f = feinde.spawn(art, wx + 0.5, wy + 1, wz + 0.5, stufe, null, fuehrer && i === 0);
    if (f) raus.push(f);
  }
  return raus;
}

/* ------------------------------- Ereignisse --------------------------------
 * Wer die Gestalten setzt und was es dafür gibt. Alles, was hier entsteht,
 * gehört zum laufenden Ereignis und wird mitgezählt.
 * -------------------------------------------------------------------------- */
function ereignisVolk(id, lage) {
  const px = player.pos.x, pz = player.pos.z;
  const gegend = biomeAt(Math.floor(px), Math.floor(pz));
  const gefahr = gefahrVon(gegend.id);
  const nacht = istNacht();

  if (id === 'hinterhalt') {
    // Sie stehen im Kreis um einen herum, nicht alle auf einem Haufen
    const raus = [];
    const zahl = 3 + (gefahr >= 3 ? 1 : 0) + (nacht ? 1 : 0);
    const art = gefahr >= 4 ? 'schuetze' : (Math.random() < 0.5 ? 'raeuber' : 'schuetze');
    for (let i = 0; i < zahl; i++) {
      const w = (i / zahl) * Math.PI * 2 + Math.random() * 0.5;
      const r = 13 + Math.random() * 5;
      const x = Math.round(px + Math.cos(w) * r), z = Math.round(pz + Math.sin(w) * r);
      const y = surfaceAt(x, z);
      if (y <= SEA) continue;
      const f = feinde.spawn(i === 0 ? 'raeuber' : art, x + 0.5, y + 1, z + 0.5,
        Math.min(5, 1 + gefahr), null, i === 0);
      if (f) { f.wach = true; raus.push(f); }
    }
    audio.bossWake();
    return raus;
  }

  if (id === 'jagd') {
    // Ein Rudel kommt aus einer Richtung und ist sofort wach
    const art = wesenWaehlen(gegend.id, true);
    const w = Math.random() * Math.PI * 2;
    const x = Math.round(px + Math.cos(w) * 30), z = Math.round(pz + Math.sin(w) * 30);
    const raus = rudelSetzen(art, x, z, gegend, gefahr, true, 3 + (gefahr >= 3 ? 2 : 1));
    for (const f of raus) f.wach = true;
    audio.bossWake();
    return raus;
  }

  if (id === 'ueberfall' && lage.dorf) {
    // Sie kommen von einer Seite auf das Dorf zu
    const d = lage.dorf;
    const w = Math.random() * Math.PI * 2;
    const x = Math.round(d.x + Math.cos(w) * (d.r + 12));
    const z = Math.round(d.z + Math.sin(w) * (d.r + 12));
    const art = Math.random() < 0.5 ? 'raeuber' : wesenWaehlen(gegend.id, true);
    const raus = rudelSetzen(art, x, z, gegend, Math.max(2, gefahr), true, 4);
    for (const f of raus) { f.wach = true; f.heimX = d.x; f.heimZ = d.z; }
    audio.bossWake();
    return raus;
  }

  if (id === 'wanderer') {
    // Kein Kampf: ein paar Leute ziehen vorbei. Es soll nicht immer blutig sein.
    const w = Math.random() * Math.PI * 2;
    const x = Math.round(px + Math.cos(w) * 16), z = Math.round(pz + Math.sin(w) * 16);
    const y = surfaceAt(x, z);
    if (y <= SEA) return [];
    const art = wesenWaehlen(gegend.id, false);
    const w2 = ARTEN[art];
    if (!w2 || w2.gesinnung !== 'friedlich') return [];
    return rudelSetzen(art, x, z, gegend, gefahr, false, 4);
  }
  return [];
}

function ereignisGeschafft(id, zahl) {
  const h = held();
  const lohn = 25 + zahl * 18;
  h.gold += lohn;
  fert.xpGeben(h, 30 + zahl * 15);
  audio.gem(3);
  juice.ring({ x: player.pos.x, y: player.pos.y + 0.6, z: player.pos.z }, 4.5, '#7fae5e', 0.8);
  bannerZeigen('Überstanden', `+${lohn} Gold`, '#7fae5e');
  if (id === 'ueberfall') {
    h.hilfen = (h.hilfen || 0) + 1;
    meldung('Das Dorf steht noch', '#7fae5e', 3.2);
  }
  updateHUD();
  writeSave();
}

/* Das Band oben: nur für das, was gerade über einen hereinbricht. */
let bannerZeit = 0;
function bannerZeigen(titel, text, farbe) {
  const b = el('banner');
  el('bannerTitel').textContent = titel;
  el('bannerText').textContent = text;
  b.style.setProperty('--ton', farbe);
  b.classList.remove('hidden');
  b.classList.add('an');
  bannerZeit = 4.5;
  audio.gem(1);
}

function bannerPflegen(dt) {
  if (bannerZeit <= 0) return;
  bannerZeit -= dt;
  if (bannerZeit <= 0) {
    el('banner').classList.remove('an');
    setTimeout(() => el('banner').classList.add('hidden'), 400);
  }
}

/* Solange etwas läuft, steht rechts oben, wie viele noch stehen. */
function ereignisAnzeige() {
  const a = ereignisse.anzeige();
  const z = el('ereignis');
  if (!a || a.uebrig <= 0) { z.classList.add('hidden'); return; }
  z.classList.remove('hidden');
  z.style.setProperty('--ton', a.farbe);
  el('ereignisName').textContent = a.name;
  el('ereignisZahl').textContent = `noch ${a.uebrig}`;
}

/* Welche Sicht gerade gilt. Die Reihenfolge ist die Rangfolge: drinnen
   sticht alles, dann die Gruft, dann der Kampf, dann das Rennen. */
function sichtWaehlen() {
  if (state.imHaus) return SICHTEN.stube;
  if (state.imDungeon || state.under > 0.6) return SICHTEN.gruft;
  if (feinde.bedrohung(player.pos, 13)) return SICHTEN.kampf;
  if (state.rennt) return SICHTEN.rennen;
  if (doerfer.dorfUnter(player.pos.x, player.pos.z)) return SICHTEN.dorf;
  return SICHTEN.land;
}

function kameraPflegen(dt) {
  const ziel = sichtWaehlen();
  // Hin geht es gemächlich, zurück etwas schneller — so fühlt sich das
  // Herankommen wie ein Ankommen an und nicht wie ein Ruck.
  const tempo = Math.min(1, dt * (ziel === SICHTEN.land ? 1.1 : 1.6));
  camZiel.dist += (ziel.dist - camZiel.dist) * tempo;
  camZiel.hoehe += (ziel.hoehe - camZiel.hoehe) * tempo;
  camZiel.weite += (ziel.weite - camZiel.weite) * tempo;

  // Im Stehen wandert der Blick ganz leicht — die Welt atmet mit
  const ruht = Math.hypot(player.vel.x, player.vel.z) < 0.4 && !state.imHaus;
  const atmen = ruht ? Math.sin(state.time * 620) * 0.5 : 0;

  camDist = camZiel.dist;
  camRoh.set(atmen * 0.35, camZiel.hoehe + atmen * 0.2, camZiel.weite);
  CAM_DIR.copy(camRoh).normalize();
}

/* -------------------------------- Schleife --------------------------------- */
const clock = new THREE.Clock();
let saveTimer = 0;

function frame() {
  requestAnimationFrame(frame);
  const roh = clock.getDelta();
  leistungPruefen(roh);
  const raw = Math.min(roh, 1 / 20);
  const dt = juice.update(raw);

  if (state.running && !state.gespraech && !ladenWirt) {
    const h = held();
    const move = input.read();
    /* Rennen: nur mit weit ausgelenktem Knüppel (oder Shift), und nur solange
       der Atem reicht. Ist er leer, muss er sich erst wieder sammeln — sonst
       stottert der Sprint im Sekundentakt. */
    const willRennen = !!move.sprint && move.active && move.strength > 0.6;
    if (h.ausdauer <= 0 && !state.erschoepft) {
      state.erschoepft = true;
      if (state.rennt) meldung('außer Puste', '#7d5227', 2.2);
    } else if (state.erschoepft && h.ausdauer >= 45) {
      state.erschoepft = false;
    }
    if (state.rennt) {
      if (!willRennen || h.ausdauer <= 0) state.rennt = false;
    } else if (willRennen && !state.erschoepft && h.ausdauer > 20) {
      state.rennt = true;
    }
    player.tempo = fert.werte.tempo(h)
      * (state.rennt ? (h.vorteile.has('wandern6') ? 1.85 : 1.6) : 1);
    // Wandern lernt man beim Wandern. Rennen zählt doppelt.
    const weg = Math.hypot(player.vel.x, player.vel.z) * dt;
    state.gelaufen += weg * (state.rennt ? 2 : 1);
    if (state.gelaufen > 26) { state.gelaufen = 0; fert.uebung(h, 'wandern', 1); }
    player.rennt = state.rennt;
    player.update(dt, move, world);
    // Häuser und Stämme sind Modelle, keine Blöcke — hier erst werden sie fest
    schritteHoeren();
    const raus = doerfer.wegSchieben(player.pos.x, player.pos.z)
      || orteSchieben(player.pos.x, player.pos.z)
      || lagerSchieben(player.pos.x, player.pos.z)
      || flora.wegSchieben(player.pos.x, player.pos.z);
    if (raus) { player.pos.x = raus.x; player.pos.z = raus.z; }
    world.update(player.pos.x, player.pos.z, 1);
    doerfer.update(player.pos.x, player.pos.z);
    flora.update(player.pos.x, player.pos.z);
    /* Alles, was aus dem Saatkorn gerechnet und dann gemerkt wird, vergisst
       hier, was weit hinter einem liegt. Ohne das wächst der Speicher mit
       jeder Minute Laufen weiter, und irgendwann räumt der Browser mitten im
       Bild auf — das ist das Ruckeln, das nach einer Weile einsetzt. */
    gruft.vergessen(player.pos.x, player.pos.z);
    orte.vergessen(player.pos.x, player.pos.z);
    dorfZellenPflegen(player.pos.x, player.pos.z);
    leute.update(dt, world, doerfer, player.pos, istNacht());
    // Wer in ein Haus tritt, dem wird das Dach abgenommen
    state.imHaus = doerfer.daecherPflegen(player.pos.x, player.pos.z);
    gruftenPflegen(player.pos.x, player.pos.z);
    ortePflegen(player.pos.x, player.pos.z);
    lagerPflegen(player.pos.x, player.pos.z);
    feinde.update(dt, world, player.pos, !state.dead);
    geschosse.update(dt, world, feinde, player.pos, {
      trefferFeind: (f, schaden, g) => {
        juice.popup({ x: f.pos.x, y: f.pos.y + 1.6, z: f.pos.z }, `${schaden}`, '#fdf6e8');
        juice.ring({ x: g.pos.x, y: g.pos.y, z: g.pos.z }, 1.2, '#f0e7d2', 0.3);
        audio.hit();
        feinde.schlagen(f, schaden, { x: g.vx, z: g.vz });
        // Was die Eislanze trifft, kommt eine Weile nicht vom Fleck
        if (g.lahm) {
          feinde.belegen(f, 'lahm', g.lahm);
          juice.popup({ x: f.pos.x, y: f.pos.y + 2.1, z: f.pos.z }, 'lahm', '#9fd8e8');
        }
      },
      trefferSpieler: (schaden) => spielerNimmtSchaden(schaden, null),
      aufschlag: (g) => juice.ring({ x: g.pos.x, y: g.pos.y, z: g.pos.z }, 0.9, '#b9aa98', 0.25),
    });
    feinde.aufraeumen(player.pos.x, player.pos.z, 130);
    wildnisPflegen(dt);
    beutelPflegen(dt);
    wesenGesehen();
    bannerPflegen(dt);
    ereignisse.update(dt, {
      nacht: istNacht(),
      imDorf: !!doerfer.dorfUnter(player.pos.x, player.pos.z),
      dorf: doerfer.dorfUnter(player.pos.x, player.pos.z),
      imDungeon: !!state.imDungeon,
      gefahr: gefahrVon(biomeAt(Math.floor(player.pos.x), Math.floor(player.pos.z)).id),
    });
    ereignisAnzeige();
    // Das Wetter richtet sich nach der Gegend, in der man gerade steht
    wetter.update(dt, biomeAt(Math.floor(player.pos.x), Math.floor(player.pos.z)).id,
      player.pos, !!state.imHaus || state.under > 0.5, nachtGrad());
    audio.setWetter(wetter.art, wetter.wirkung);
    // Der Grundton der Gegend, und wie nah das nächste Feuer ist
    audio.ambient(dt, state.imDungeon ? 'dunkel'
      : STIMMUNG[biomeAt(Math.floor(player.pos.x), Math.floor(player.pos.z)).id] || 'warm',
      istNacht());
    audio.setFireDistance(feuerNaehe());

    const vorher = state.time;
    state.time = (state.time + dt / DAY) % 1;
    if (state.time < vorher) state.tag++;    // ein Tag ist herum, die Läden füllen auf
    if (state.hieb > 0) state.hieb -= dt;
    if (state.hack > 0) state.hack -= dt;
    if (state.zauber > 0) state.zauber -= dt;
    if (state.rausch > 0) state.rausch -= dt;
    if (state.schutz > 0) {
      state.schutz -= dt;
      // Solange sie traegt, staubt es grau um die Fuesse
      if (Math.random() < dt * 6) {
        juice.staub({ x: player.pos.x, y: player.pos.y + 0.4, z: player.pos.z }, 0.4, '#9aa3ab');
      }
      if (state.schutz <= 0) meldung('Die Steinhaut fällt ab.', '#9aa3ab', 2.6);
    }

    // Ausdauer und Magicka füllen sich von allein — das Rennen zehrt daran
    const zehrt = h.vorteile.has('wandern8') ? 8 : 14;
    const atem = 16 * (h.vorteile.has('wandern3') ? 1.5 : 1);
    h.ausdauer = state.rennt
      ? Math.max(0, h.ausdauer - zehrt * dt)
      : Math.min(h.ausdauerMax, h.ausdauer + atem * dt);
    const magTempo = h.vorteile.has('magie4') ? 6 : 3.4;
    h.magicka = Math.min(fert.werte.magickaMax(h), h.magicka + magTempo * dt);
    // Nach dem Kampf heilt es langsam, wenn nichts in der Nähe ist
    const ruhe = !feinde.bedrohung(player.pos, 14);
    const hpMaxJetzt = fert.werte.lebenMax(h);
    if (ruhe && h.hp < hpMaxJetzt) {
      h.hp = Math.min(hpMaxJetzt, h.hp + (h.vorteile.has('zaehe4') ? 3.2 : 1.4) * dt);
    }

    // Sturz kostet Leben
    if (player.onGround) {
      if (state.fallFrom !== null) {
        const sturz = state.fallFrom - player.pos.y;
        // „Fester Stand" nimmt dem Sturz die Hälfte — das ist jetzt sein Zweck
        const weich = h.vorteile.has('zaehe3') ? 0.5 : 1;
        if (sturz > 5) spielerNimmtSchaden(Math.round((sturz - 5) * 6 * weich), null);
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

    kameraPflegen(dt);
    steckenPruefen(dt, move, tief);

    state.under = Math.max(0, Math.min(1, tief / 4));
    applyDaytime();
    const night = nachtGrad();
    peek.uPeek.value.set(player.pos.x, player.pos.y + 2.9, player.pos.z);
    fussring.position.set(player.pos.x, player.pos.y + 0.06, player.pos.z);
    lamp.position.set(player.pos.x, player.pos.y + 1.7, player.pos.z);
    lamp.intensity = Math.max(state.under, night * 0.55) * 14;
    lamp.distance = 26;

    const darkU = post.compositeMat.uniforms;
    darkU.uDark.value = Math.max(state.under * 0.3, night * 0.45);
    darkU.uDarkTint.value.set(0.72, 0.58, 0.46);

    /* Zielleiste und Reden-Knopf hängen an Entfernungen, und genau an der
       Grenze flackerten sie: ein Schritt hin, ein Schritt her, an, aus, an.
       Deshalb bleiben beide nach dem letzten Ja noch einen Moment stehen —
       das Auge sieht dann eine Anzeige statt eines Flimmerns. */
    const z = feinde.ziel(player.pos, player.facing, 3.4);
    if (z) { letztesZiel = z; zielHalten = 0.35; } else if (zielHalten > 0) zielHalten -= dt;
    const zeigeZiel = z || (zielHalten > 0 && letztesZiel && letztesZiel.hp > 0
      ? letztesZiel : null);
    ui.ziel.classList.toggle('hidden', !zeigeZiel);
    if (zeigeZiel) {
      if (zeigeZiel !== zielGezeigt) {
        zielGezeigt = zeigeZiel;
        const st = zeigeZiel.art.stufe || 1;
        ui.zielName.innerHTML = `${zeigeZiel.name || zeigeZiel.art.name} `
          + `<span class="gefahr g${st}">${'◆'.repeat(st)}</span>`;
        ui.ziel.classList.toggle('gezeichnet', !!zeigeZiel.gezeichnet);
      }
      ui.zielHp.style.width = `${Math.max(0, zeigeZiel.hp / zeigeZiel.hpMax * 100)}%`;
    } else { letztesZiel = null; zielGezeigt = null; }

    // Der Reden-Knopf erscheint nur, wenn es etwas zu tun gibt
    const w = was();
    if (w) { letzteTat = w; tatHalten = 0.4; } else if (tatHalten > 0) tatHalten -= dt;
    const zeigeTat = w || (tatHalten > 0 ? letzteTat : null);
    ui.rede.classList.toggle('hidden', !zeigeTat);
    if (zeigeTat && zeigeTat.art !== ui.rede.dataset.art) {
      ui.rede.dataset.art = zeigeTat.art;
      symbol(ui.rede, zeigeTat.art === 'npc' ? 'rede' : zeigeTat.art === 'truhe' ? 'truhe'
        : zeigeTat.art === 'waechter' ? 'kerze' : zeigeTat.art === 'esse' ? 'schwert'
        : zeigeTat.art === 'bett' || zeigeTat.art === 'rast' ? 'kerze'
        : zeigeTat.art === 'schrein' ? 'glanz' : 'tor');
    }
    if (!zeigeTat) letzteTat = null;

    abbauJetzt = abbauZiel();
    abbauKnopfPflegen(dt);
    pfeilPflegen(dt);
    rautePflegen(dt);

    hudTimer -= dt;
    if (hudTimer <= 0) { hudTimer = 0.22; updateHUD(); }
    saveTimer -= dt;
    if (saveTimer <= 0) { saveTimer = 10; writeSave(); }
  }

  if (state.portrait) {
    portraitKamera(raw);
  } else if (state.schau) {
    schauKamera(raw);
  } else {
    const want = state.camPos.copy(player.pos).addScaledVector(CAM_DIR, camDist);
    camera.position.lerp(want, 1 - Math.pow(0.002, raw));
    camera.lookAt(player.pos.x, player.pos.y + 1, player.pos.z);
  }
  juice.applyToCamera();
  post.render(scene, camera);
}

/* Bei der Schöpfung steht die Kamera vorn und tief, und die Figur dreht sich
   langsam. Gezielt wird ein Stück unter die Füße — so sitzt der Held im
   oberen Drittel und das Blatt darunter verdeckt ihn nicht. */
/* Über dem Vorspann und dem Titel kreist die Kamera ganz langsam über dem
   Dorf. Ein stehendes Bild sieht aus wie ein Ladefehler; ein wanderndes sagt:
   hier läuft schon etwas, du bist nur noch nicht dabei. */
let schauDreh = 0.4;
function schauKamera(dt) {
  // Ohne laufendes Spiel rührt sich die Figur nicht von allein — hier steht,
  // wo ihr Körper hingehört, solange niemand sie bewegt.
  player.group.position.copy(player.pos);
  schauDreh += dt * 0.055;
  const ziel = state.camPos.set(
    player.pos.x + Math.sin(schauDreh) * 30,
    player.pos.y + 21,
    player.pos.z + Math.cos(schauDreh) * 30);
  camera.position.lerp(ziel, 1 - Math.pow(0.05, dt));
  camera.lookAt(player.pos.x, player.pos.y + 1.2, player.pos.z);
}

let portraitDreh = 0.6;
function portraitKamera(dt) {
  player.group.position.copy(player.pos);
  portraitDreh += dt * 0.5;
  player.facing = portraitDreh;
  player.group.rotation.y = portraitDreh;
  /* Neun Schritt Abstand, vier über dem Boden, und gezielt wird unter die
     Füße: dann steht die ganze Figur im oberen Drittel, und das Blatt
     darunter verdeckt sie nicht. */
  const kx = player.pos.x + 6.6, kz = player.pos.z + 8.8;
  // Nicht in den Hang: die Kamera bleibt über dem Boden, auf dem sie steht
  const boden = surfaceAt(Math.round(kx), Math.round(kz)) + 1.6;
  const ziel = state.camPos.set(kx, Math.max(player.pos.y + 5, boden), kz);
  camera.position.lerp(ziel, 1 - Math.pow(0.004, dt));
  camera.lookAt(player.pos.x, player.pos.y - 2.4, player.pos.z);
}

/* --------------------------------- Knöpfe ----------------------------------
 * Die Kampfknöpfe hören auf `pointerdown`, nicht auf `click`. Das ist kein
 * Geschmack, sondern der Grund, warum man jetzt laufen und gleichzeitig
 * zuschlagen kann: `click` entsteht erst beim Loslassen, und solange schon
 * ein Daumen auf dem Stick liegt, lässt ein Browser den zweiten Finger
 * gern ganz unter den Tisch fallen. `pointerdown` kommt immer — für jeden
 * Finger einzeln, auch wenn drei gleichzeitig unterwegs sind.
 * -------------------------------------------------------------------------- */
function tippen(knopf, tun, halten = false) {
  let zuletzt = -1e9;
  let takt = 0;
  const los = () => { clearInterval(takt); takt = 0; };
  knopf.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;               // rechte Maustaste zählt nicht
    zuletzt = performance.now();
    tun();
    // Gehaltene Knöpfe schlagen weiter, sobald sie wieder dürfen. Der Knopf
    // fragt nur nach; ob es geht, entscheidet die Tat selbst.
    if (halten) { los(); takt = setInterval(tun, 80); }
    e.preventDefault();
  });
  for (const art of ['pointerup', 'pointercancel', 'pointerleave']) {
    knopf.addEventListener(art, los);
  }
  window.addEventListener('blur', los);
  // Maus und Tastatur landen hier; ein Zeiger hat es dann schon erledigt
  knopf.addEventListener('click', () => {
    if (performance.now() - zuletzt < 800) return;
    tun();
  });
}

// Auf dem Hieb darf der Daumen liegen bleiben — er schlägt dann weiter
tippen(el('hauBtn'), zuschlagen, true);
tippen(el('abbauBtn'), abbauen, true);
tippen(el('redeBtn'), handeln);
tippen(el('trinkBtn'), trinken);

/* Der Zauberknopf hat zwei Bedeutungen: kurz tippen wirkt, lang drücken
   blättert zum nächsten Spruch. Gewirkt wird deshalb beim Loslassen — aber
   nur, wenn das Blättern nicht schon zugeschlagen hat. */
(() => {
  const b = el('wirkBtn');
  let halt = 0, geblaettert = false, unten = false, zuletzt = -1e9;
  b.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    unten = true;
    geblaettert = false;
    clearTimeout(halt);
    halt = setTimeout(() => { geblaettert = true; zauberBlaettern(); }, 420);
    e.preventDefault();
  });
  const auf = (wirken) => () => {
    clearTimeout(halt);
    if (!unten) return;
    unten = false;
    if (wirken && !geblaettert) { zuletzt = performance.now(); zaubern(); }
  };
  b.addEventListener('pointerup', auf(true));
  b.addEventListener('pointercancel', auf(false));
  b.addEventListener('pointerleave', auf(false));
  b.addEventListener('click', () => {
    if (geblaettert || performance.now() - zuletzt < 800) return;
    zaubern();
  });
})();
el('ladenZu').addEventListener('click', ladenSchliessen);
el('esseZu').addEventListener('click', esseSchliessen);
el('esse').addEventListener('click', (e) => { if (e.target === el('esse')) esseSchliessen(); });
for (const b of document.querySelectorAll('.lreiter')) {
  b.addEventListener('click', () => { ladenSeite = b.dataset.seite; ladenZeichnen(); });
}
el('laden').addEventListener('click', (e) => { if (e.target === el('laden')) ladenSchliessen(); });

tippen(el('menuBtn'), () => {
  menuZeichnen('fert');
  el('menu').classList.remove('hidden');
});
el('menuZu').addEventListener('click', () => el('menu').classList.add('hidden'));
el('festKnopf').addEventListener('click', heimkehr);
for (const b of document.querySelectorAll('.reiter')) {
  b.addEventListener('click', () => menuZeichnen(b.dataset.tab));
}
el('rede').addEventListener('click', (e) => { if (e.target === el('rede')) redeSchliessen(); });
el('redeZu').addEventListener('click', redeSchliessen);

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === ' ' || k === 'j') { zuschlagen(); e.preventDefault(); }
  if (k === 'k') zaubern();
  if (k === 'l') zauberBlaettern();
  if (k === 'e') handeln();
  if (k === 'f') abbauen();
  if (k === 'h') trinken();
  if (k === 'i') { menuZeichnen('fert'); el('menu').classList.toggle('hidden'); }
  if (k === 'r') heimkehr();
  if (k === 'escape') { esseSchliessen(); redeSchliessen(); ladenSchliessen(); el('menu').classList.add('hidden'); }
});

const soundBtn = el('soundBtn');
let muted = false;
try { muted = localStorage.getItem('talkunde-muted') === '1'; } catch (err) { /* egal */ }
audio.setMuted(muted);
symbol(soundBtn, muted ? 'tonAus' : 'tonAn');
tippen(soundBtn, () => {
  muted = !muted;
  audio.unlock();
  audio.setMuted(muted);
  symbol(soundBtn, muted ? 'tonAus' : 'tonAn');
  try { localStorage.setItem('talkunde-muted', muted ? '1' : '0'); } catch (err) { /* egal */ }
});

/* ------------------------------- Bildgröße --------------------------------- */
/* Obergrenze für die Pixeldichte. Null heißt: keine. Der Wächter weiter
   unten zieht sie herunter, wenn das Gerät nicht mehr mitkommt. */
let dprDeckel = 0;

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, quality === 'high' ? 2 : 1.5,
    dprDeckel || 99);
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
tippen(el('qualityBtn'), () => {
  quality = quality === 'high' ? 'low' : 'high';
  /* Wer selbst schaltet, hat das letzte Wort: der Wächter fängt von vorn an,
     und das Bild bekommt wieder volle Auflösung und vollen Bewuchs. */
  wunschGrafik = quality;
  sparstufe = 0;
  dprDeckel = 0;
  hakenFolge = 0;
  glattFolge = 0;
  flora.duennen(1);
  applyQuality();
});

/* ------------------------------ Wenn es hakt -------------------------------
 * Ein Telefon wird warm, und irgendwann drosselt es sich selbst. Dagegen hilft
 * kein Aufräumen im Spiel — dann muss das Bild billiger werden. Gemessen wird
 * alle vier Sekunden die mittlere Bildzeit.
 *
 * Herunter geht es erst, wenn sie zweimal hintereinander über vierzig
 * Millisekunden liegt — ein Gerät, das sauber mit dreißig Bildern läuft, ist
 * damit sicher: dreiunddreißig Millisekunden sind kein Hakeln. Herauf geht es
 * wieder, wenn eine halbe Minute lang alles glatt lief. Die Lücke zwischen
 * beiden Schwellen ist Absicht: ein Bild, das zwischen zwei Stufen hin und her
 * springt, ist unangenehmer als eines, das dauerhaft etwas einfacher aussieht.
 * -------------------------------------------------------------------------- */
const HAKT = 0.040;             // darüber ist es zu langsam (unter 25 Bilder)
const GLATT = 0.022;            // darunter läuft es sicher rund (über 45)
let sparstufe = 0;              // 0 = alles an, 3 = so sparsam wie möglich
let hakenFolge = 0;
let glattFolge = 0;
const bildzeiten = [];
let hakenTimer = 4;

/* Was der Spieler haben will. Der Wächter darf darunter bleiben, aber nie
   darüber hinausgehen — und wenn es wieder rund läuft, kommt genau das
   zurück, was hier steht. */
let wunschGrafik = quality;

function sparstufeSetzen(stufe) {
  sparstufe = Math.max(0, Math.min(3, stufe));
  // Stufe 1 nimmt den Schattenwurf, 2 die Pixeldichte, 3 den halben Bewuchs
  const soll = sparstufe >= 1 ? 'low' : wunschGrafik;
  dprDeckel = sparstufe >= 2 ? 1 : 0;
  flora.duennen(sparstufe >= 3 ? 0.6 : 1);
  if (soll !== quality) { quality = soll; applyQuality(); }   // ruft resize mit
  else resize();
}

function leistungPruefen(roh) {
  // Im Menü und nach dem Wegklicken wird nicht gemessen
  if (!state.running || roh > 0.5) return;
  bildzeiten.push(roh);
  hakenTimer -= roh;
  if (hakenTimer > 0) return;
  hakenTimer = 4;
  /* Wenige Messwerte heißt nicht „nichts gemessen", sondern: es lief so
     zäh, dass in vier Sekunden kaum ein Bild zustande kam. Genau dann muss
     der Wächter zuschlagen — eine hohe Mindestzahl hat ihn vorher gerade in
     diesem Fall ausgeschaltet. */
  if (bildzeiten.length < 5) { bildzeiten.length = 0; return; }
  bildzeiten.sort((a, b) => a - b);
  const mitte = bildzeiten[bildzeiten.length >> 1];
  bildzeiten.length = 0;

  if (mitte > HAKT) {
    glattFolge = 0;
    if (++hakenFolge < 2 || sparstufe >= 3) return;
    hakenFolge = 0;
    sparstufeSetzen(sparstufe + 1);
    meldung(sparstufe >= 3 ? 'Weniger Gewächs — damit es läuft'
      : sparstufe === 2 ? 'Bild etwas gröber — dafür flüssiger'
      : 'Grafik: einfacher — für ruhigere Bilder', '#7d5227', 2.8);
    return;
  }

  hakenFolge = 0;
  if (mitte > GLATT || sparstufe === 0) { glattFolge = 0; return; }
  // Eine halbe Minute ohne Hakeln: eine Stufe zurück nach oben
  if (++glattFolge < 8) return;
  glattFolge = 0;
  sparstufeSetzen(sparstufe - 1);
}

/* ------------------------------ Spielstand --------------------------------- */
function writeSave(auchTot = false) {
  // Beim Sterben muss trotzdem geschrieben werden, sonst wäre der verlorene
  // Beutel nach einem Neuladen einfach weg.
  if (!auchTot && (!state.running || state.dead)) return;
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
      dungeons: [...h.dungeons], orte: [...(h.orte || [])],
      gesehen: [...(h.gesehen || [])], erlegt: h.erlegt || {},
      schliff: h.schliff || {},
      zauber: [...(h.zauber || [])], aktiverZauber: h.aktiverZauber || 'funkenschlag',
      aussehen: h.aussehen || null, name: h.name || null, herkunft: h.herkunft || null,
      beutel: h.beutel, rue: h.rue,
    },
    quests: { offen: state.buch.offen, erledigt: state.buch.erledigt.slice(-8),
              verfolgtNr: state.buch.verfolgtNr },
    geschichte: state.geschichte,
    beutel: state.beutel,
    lager: state.lager,
    // Die Stümpfe: sonst stünde jeder gefällte Baum beim Zurückkommen wieder da
    stuempfe: flora.stuempfe(),
  });
}

const writeTod = () => writeSave(true);

function weltLeeren() {
  for (const [k, chunk] of [...world.chunks]) {
    for (const key of ['mesh', 'water']) {
      if (chunk[key]) { scene.remove(chunk[key]); chunk[key].geometry.dispose(); }
    }
    world.chunks.delete(k);
  }
  world.queue.length = 0;
  doerfer.clear();
  flora.clear();
  leute.clear();
  feinde.clear();
  geschosse.clear();
  for (const t of truhen) scene.remove(t.obj);
  truhen.length = 0;
  for (const t of tore) scene.remove(t.obj);
  tore.length = 0;
  if (beutelObj) { scene.remove(beutelObj); beutelObj = null; }
  for (const e of orteAktiv.values()) scene.remove(e.gruppe);
  orteAktiv.clear();
  for (const e of lagerAktiv.values()) scene.remove(e.obj);
  lagerAktiv.clear();
}

function startplatz() {
  const nah = doerferUm(0, 0, 1200).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  // Angefangen wird in einer ruhigen Gegend. Wer im Bruch aufwacht, hat mit
  // Stufe 1 nichts zu lachen — das Grauen soll man suchen, nicht erben.
  const ruhig = nah.find((d) => gefahrVon(biomeAt(d.x, d.z).id) <= 2);
  const wahl = ruhig || nah[0];
  if (wahl) return { x: wahl.x + 4, z: wahl.z + 4, dorf: wahl };
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
  state.schau = false;
  state.portrait = false;
  document.body.classList.add('spielt');
  world.update(x, z, 95);
  doerfer.update(x, z);
  flora.update(x, z, true);
  player.spawn(world, x, z);
  leute.update(0.016, world, doerfer, player.pos, istNacht());
  state.imHaus = doerfer.daecherPflegen(x, z);
  gruftenPflegen(x, z);
  ortePflegen(x, z);
  state.cut = HEIGHT + 4;
  cutPlane.constant = state.cut;
  state.camPos.copy(player.pos).addScaledVector(CAM_DIR, camDist);
  camera.position.copy(state.camPos);
  camera.lookAt(player.pos);
  applyDaytime();
  updateHUD();
  state.running = true;
}

/* Naturhoehlen haben keinen gegrabenen Ausgang mehr, seit das Graben raus ist:
   wer durch eine Kluft faellt, saesse sonst fuer immer fest. Die Heimkehr setzt
   uns am naechsten Dorf wieder ab — sie kostet nichts als den Weg zurueck. */
function heimkehr() {
  if (!state.running || state.dead) return;
  const px = player.pos.x, pz = player.pos.z;
  const nah = doerferUm(px, pz, 900)
    .sort((a, b) => Math.hypot(a.x - px, a.z - pz) - Math.hypot(b.x - px, b.z - pz));
  const ziel = nah.length ? { x: nah[0].x + 4, z: nah[0].z + 4, dorf: nah[0] } : startplatz();

  juice.ring({ x: px, y: player.pos.y + 0.6, z: pz }, 3.4, '#8fb8cf', 0.6);
  audio.gem(1);

  // Was in der Gruft stand, bleibt in der Gruft
  if (state.imDungeon) {
    state.imDungeon.gefuellt = false;
    for (const t of [...truhen]) {
      if (t.gruft === state.imDungeon) { scene.remove(t.obj); truhen.splice(truhen.indexOf(t), 1); }
    }
  }
  feinde.clear();
  state.imDungeon = null;
  state.fallFrom = null;
  festTimer = 0;
  festOrt = null;
  festAn = false;
  hinweisZeigen(false);

  aufstellen(ziel.x, ziel.z);
  state.ort = ziel.dorf ? ortsname(ziel.dorf) : 'Wildnis';
  meldung('Heimgekehrt', '#7fae5e', 3.0);
  updateHUD();
  writeSave();
}

/* Steckt der Spieler unter Tage laenger als ein paar Sekunden auf der Stelle,
   obwohl er laeuft, blenden wir den Rueckweg von selbst ein. */
let festTimer = 0;
let festOrt = null;
let festAn = false;
const hier = () => ({ x: player.pos.x, y: player.pos.y, z: player.pos.z });
const abstand = (o) => Math.hypot(player.pos.x - o.x, player.pos.z - o.z)
  + Math.abs(player.pos.y - o.y);

function steckenPruefen(dt, move, tief) {
  // Steht das Angebot einmal da, bleibt es stehen — sonst verschwindet es
  // genau in dem Moment, in dem man den Daumen vom Stick nimmt, um es zu tippen.
  if (festAn) {
    if (!festOrt || tief < 3 || abstand(festOrt) > 4) {
      festAn = false; festOrt = null; festTimer = 0; hinweisZeigen(false);
    }
    return;
  }
  const laeuft = !!move && move.active && move.strength > 0.25;
  if (tief < 3 || !laeuft) { festTimer = 0; festOrt = null; return; }
  if (!festOrt) { festOrt = hier(); festTimer = 0; return; }
  if (abstand(festOrt) > 1.6) { festOrt = hier(); festTimer = 0; return; }
  festTimer += dt;
  if (festTimer > 5) { festAn = true; hinweisZeigen(true); }
}

function hinweisZeigen(an) {
  const k = el('festHinweis');
  if (!k) return;
  k.classList.toggle('hidden', !an);
}

function neuesSpiel(wahl = null) {
  save.clear();
  saatSetzen((Math.random() * 1e9) | 0);
  weltLeeren();
  world.edits.clear();
  state.held = fert.neuerHeld();
  heldEinkleiden(state.held, wahl || neuesAussehen());
  state.buch = new Auftragsbuch();
  state.time = 0.3;
  state.dead = false;
  state.schutz = 0;
  state.rausch = 0;
  state.imDungeon = null;
  state.fallFrom = null;
  state.lager = [];
  state.abbau = null;
  beutelAufloesen();
  juice.reset();

  const s = startplatz();
  state.geschichte = story.neueGeschichte();
  welteinrichtung(s.dorf);
  state.ort = s.dorf ? ortsname(s.dorf) : 'Wildnis';
  aufstellen(s.x, s.z);
  /* Der erste Moment im Spiel darf nicht leer sein: der Pfeil zeigt schon auf
     den Chronisten, und ein Band sagt, warum. */
  bannerZeigen(state.ort, 'Im Dorf wartet jemand, der mitschreibt.', '#e8a83c');
  writeSave();
}

/* Was die Schöpfung am Helden ändert: Aussehen, Name, Herkunft — und die
   Gabe, die zu ihr gehört. Sie ist absichtlich klein: sie soll die ersten
   zwei Stunden färben, nicht das ganze Spiel entscheiden. */
function heldEinkleiden(h, wahl) {
  h.aussehen = { ...wahl };
  h.name = wahl.name || 'Niemand';
  h.herkunft = wahl.herkunft;
  const hk = herkunftVon(h.herkunft);
  h.fert[hk.fert] = Math.max(h.fert[hk.fert], 2);
  h.gold += hk.gold || 0;
  for (const [id, n] of Object.entries(hk.sachen || {})) dinge.nehmen(h, id, n);
  if (hk.zauber) {
    h.zauber = h.zauber instanceof Set ? h.zauber : new Set(h.zauber || []);
    h.zauber.add(hk.zauber);
    h.aktiverZauber = hk.zauber;
  }
  // Was man anziehen kann, zieht man auch an
  for (const id of Object.keys(hk.sachen || {})) {
    const d = DINGE[id];
    if (d && dinge.TRAGBAR.includes(d.art) && !h.rue[d.art]) dinge.anlegen(h, id);
  }
  aussehenAnlegen(h);
}

/** Farben aus dem Helden auf Figur und Grubenlampe legen. */
function aussehenAnlegen(h) {
  const f = farbenVon(h.aussehen || {});
  player.setAussehen(f);
  lamp.color.set(f.licht);
}

function weiterSpielen(d) {
  saatSetzen(d.seed);
  weltLeeren();
  world.edits.clear();
  save.unpackEdits(d.edits, world.edits);

  const h = fert.neuerHeld();
  Object.assign(h, d.held);
  h.vorteile = new Set(d.held.vorteile || []);
  h.dungeons = new Set(d.held.dungeons || []);
  h.orte = new Set(d.held.orte || []);
  h.gesehen = new Set(d.held.gesehen || []);
  h.erlegt = d.held.erlegt || {};
  h.schliff = d.held.schliff || {};
  h.zauber = new Set(d.held.zauber || []);
  h.aktiverZauber = d.held.aktiverZauber || 'funkenschlag';
  h.aussehen = d.held.aussehen || neuesAussehen();
  h.name = d.held.name || 'Niemand';
  h.herkunft = d.held.herkunft || HERKUNFT[0].id;
  state.held = h;
  aussehenAnlegen(h);

  state.buch = new Auftragsbuch();
  state.buch.offen = (d.quests?.offen || []);
  state.buch.erledigt = (d.quests?.erledigt || []);
  state.buch.verfolgtNr = d.quests?.verfolgtNr ?? null;
  state.time = d.time ?? 0.3;
  state.tag = d.tag ?? 0;
  state.dead = false;
  state.schutz = 0;
  state.rausch = 0;
  state.imDungeon = null;
  state.fallFrom = null;
  juice.reset();

  state.beutel = d.beutel || null;
  state.lager = Array.isArray(d.lager) ? d.lager : [];
  state.abbau = null;
  flora.stuempfeSetzen(d.stuempfe);
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
/* =========================== Vorspann & Schöpfung ==========================
 * Das Erste, was man sieht, entscheidet, ob man bleibt. Also kein Regelblatt,
 * sondern: dunkles Land, drei Sätze, Titel. Danach steht die eigene Figur im
 * Bild und dreht sich, während man sie zusammenstellt — und erst dann geht
 * es los.
 * ========================================================================== */
let schoepfung = neuesAussehen();

function vorspannSpielen(fertig) {
  const kasten = el('vorspann');
  const zeile = el('vorspannText');
  kasten.classList.remove('hidden', 'weg');
  let i = -1;
  let timer = 0;
  const weiter = () => {
    i++;
    if (i >= story.VORSPANN.length) { schluss(); return; }
    zeile.classList.remove('an');
    setTimeout(() => {
      zeile.textContent = story.VORSPANN[i];
      zeile.classList.add('an');
    }, i === 0 ? 40 : 520);
    clearTimeout(timer);
    timer = setTimeout(weiter, i === 0 ? 3000 : 3400);
  };
  const schluss = () => {
    clearTimeout(timer);
    kasten.removeEventListener('pointerdown', tippe);
    kasten.classList.add('weg');
    setTimeout(() => { kasten.classList.add('hidden'); fertig(); }, 600);
  };
  // Tippen springt weiter, zweimal tippen überspringt alles
  const tippe = (e) => {
    e.preventDefault();
    audio.unlock();                  // die erste Berührung schaltet den Ton frei
    if (i >= story.VORSPANN.length - 1) schluss(); else weiter();
  };
  kasten.addEventListener('pointerdown', tippe);
  weiter();
}

/* --------------------------- Die Figur bauen ------------------------------ */
function schoepfungZeichnen() {
  const f = farbenVon(schoepfung);
  player.setAussehen(f);
  lamp.color.set(f.licht);
  el('heldName').value = schoepfung.name;

  const reihe = (feldId, liste, istAn, waehle, bauen) => {
    const feld = el(feldId);
    feld.replaceChildren();
    for (const e of liste) {
      const b = document.createElement('button');
      b.className = 'farbe' + (istAn(e) ? ' an' : '');
      bauen(b, e);
      b.addEventListener('click', () => { waehle(e); schoepfungZeichnen(); audio.step(); });
      feld.append(b);
    }
    return feld;
  };

  reihe('wahlGewand', GEWAENDER, (e) => e.id === schoepfung.gewand,
    (e) => { schoepfung.gewand = e.id; },
    (b, e) => {
      b.title = e.name;
      b.style.background = e.kutte;
      b.innerHTML = `<i class="unten" style="background:${e.saum}"></i>`;
    });

  reihe('wahlHaut', HAUT, (e) => e.id === schoepfung.haut,
    (e) => { schoepfung.haut = e.id; },
    (b, e) => { b.style.background = e.farbe; });

  const haarFeld = reihe('wahlHaar', HAAR, (e) => e.id === schoepfung.haar && !schoepfung.kapuze,
    (e) => { schoepfung.haar = e.id; schoepfung.kapuze = false; },
    (b, e) => { b.style.background = e.farbe; });
  // Die Kapuze gehört in dieselbe Reihe: sie entscheidet, ob man Haar sieht
  const kap = document.createElement('button');
  kap.className = 'farbe knopf' + (schoepfung.kapuze ? ' an' : '');
  kap.textContent = 'Kapuze';
  kap.addEventListener('click', () => {
    schoepfung.kapuze = !schoepfung.kapuze;
    schoepfungZeichnen();
    audio.step();
  });
  haarFeld.append(kap);

  reihe('wahlLaterne', LATERNEN, (e) => e.id === schoepfung.laterne,
    (e) => { schoepfung.laterne = e.id; },
    (b, e) => {
      b.title = e.name;
      b.style.background = e.glas;
      b.innerHTML = `<i class="unten" style="background:${e.licht}"></i>`;
    });

  const hFeld = el('wahlHerkunft');
  hFeld.replaceChildren();
  for (const hk of HERKUNFT) {
    const b = document.createElement('button');
    b.className = 'herkunft-wahl' + (hk.id === schoepfung.herkunft ? ' an' : '');
    b.innerHTML = `<b>${hk.name}</b><small>${hk.text}</small>`
      + `<span class="gabe">${hk.gabe}</span>`;
    b.addEventListener('click', () => {
      schoepfung.herkunft = hk.id;
      schoepfungZeichnen();
      audio.gem(1);
    });
    hFeld.append(b);
  }
}

function schoepfungOeffnen() {
  schoepfung = neuesAussehen();
  state.running = false;             // während der Schöpfung läuft die Welt nicht
  document.body.classList.remove('spielt');
  state.time = 0.26;                 // früher Morgen: gutes Licht für ein Bild
  /* Für das Bild muss die Figur frei stehen. Im Dorf steckt die Kamera sonst
     in einer Wand — also ein Stück hinaus, mit dem Dorf im Rücken. */
  const s = startplatz();
  /* Ein flacher Platz sieht besser aus als ein Hang: ein paar Stellen rings
     um das Dorf prüfen und die nehmen, die am wenigsten kippt. */
  /* Und zwar südöstlich: die Kamera steht bei +x/+z vor der Figur und blickt
     zurück — so liegt das Dorf hinter ihr im Bild statt leerer Wiese. */
  let px = Math.round(s.x + 20), pz = Math.round(s.z + 20), besteEbene = 1e9;
  for (let a = 0; a < 7; a++) {
    const w = Math.PI * (0.17 + a * 0.028);        // grob Südost
    const tx = Math.round(s.x + Math.sin(w) * 26), tz = Math.round(s.z + Math.cos(w) * 26);
    const mitte = surfaceAt(tx, tz);
    const kippe = Math.abs(surfaceAt(tx + 4, tz + 5) - mitte)
      + Math.abs(surfaceAt(tx - 3, tz - 3) - mitte)
      + Math.abs(surfaceAt(tx + 3, tz - 4) - mitte);
    if (mitte > SEA + 1 && kippe < besteEbene) { besteEbene = kippe; px = tx; pz = tz; }
  }
  world.update(px, pz, 95);
  doerfer.update(px, pz);
  flora.update(px, pz, true);
  player.spawn(world, px, pz);
  leute.update(0.016, world, doerfer, player.pos, false);
  state.cut = HEIGHT + 4;
  cutPlane.constant = state.cut;
  state.portrait = true;
  state.schau = false;
  camera.position.set(player.pos.x + 6.6, player.pos.y + 5, player.pos.z + 8.8);
  applyDaytime();
  schoepfungZeichnen();
  el('schoepfung').classList.remove('hidden');
}

el('wuerfelBtn').addEventListener('click', () => {
  const name = el('heldName').value.trim();
  schoepfung = neuesAussehen();
  if (name) schoepfung.name = name;   // der Name bleibt, wenn man ihn selbst gesetzt hat
  schoepfungZeichnen();
  audio.gem(2);
});
el('heldName').addEventListener('input', () => {
  schoepfung.name = el('heldName').value.slice(0, 14);
});

el('schoepfFertig').addEventListener('click', () => {
  audio.unlock();
  schoepfung.name = (el('heldName').value.trim() || schoepfung.name || 'Niemand').slice(0, 14);
  el('schoepfung').classList.add('hidden');
  state.portrait = false;
  neuesSpiel(schoepfung);
});

/* Die Regeln stehen zusammengeklappt da: der erste Blick soll Titel und Bild
   sein, nicht ein Merkblatt. Wer sie will, tippt einmal. */
el('howBtn').addEventListener('click', () => {
  const liste = document.querySelector('#start .how');
  const zu = liste.classList.toggle('hidden');
  el('howBtn').textContent = zu ? 'Wie es geht' : 'Wie es geht ✕';
});

el('startBtn').addEventListener('click', () => {
  audio.unlock();
  el('start').classList.add('hidden');
  schoepfungOeffnen();
});

/** Einstieg ohne Vorspann und ohne Schöpfung — für Prüfläufe. */
function schnellStart(wahl = null) {
  for (const id of ['vorspann', 'start', 'schoepfung']) el(id).classList.add('hidden');
  neuesSpiel(wahl || neuesAussehen());
}

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
  // Man wacht am Morgen im Dorf auf — angeschlagen, und das Gold liegt draußen
  const h = held();
  h.hp = Math.round(fert.werte.lebenMax(h) * 0.5);
  state.time = 0.28;
  h.ausdauer = h.ausdauerMax;
  h.magicka = fert.werte.magickaMax(h);
  state.dead = false;
  state.schutz = 0;
  state.rausch = 0;
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

// Ohne die Klammern bekäme writeSave das Event als ersten Parameter — und
// das hieße „auch wenn tot“, also auch, wenn noch gar nicht gespielt wurde.
window.addEventListener('pagehide', () => writeSave());
document.addEventListener('visibilitychange', () => { if (document.hidden) writeSave(); });
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

window.__game = {
  state, player, world, scene, camera, renderer, juice, audio, post, B, BLOCKS,
  doerfer, leute, feinde, truhen, tore, gruft, fert, held,
  handeln, zuschlagen, zaubern, writeSave, save, ortsname, was,
  flora, biomeAt, surfaceAt,
  dinge, trinken, ladenOeffnen, ladenZeichnen, beutelZeichnen,
  story, chronistOeffnen, waechterAnsprechen, endeZeigen, kapitelGeschafft,
  pfeil, zielPunkt, questsZeichnen, gemeinterMensch, rauteKern,
  heimkehr, karteZeichnen, menuZeichnen,
  ARTEN, wesenWaehlen, gefahrVon, doerferUm, dorfArt, bauplan,
  orte, orteAktiv, truhen, was, handeln, kartenBild, neuesSpiel, wetter,
  ereignisse, rudelSetzen, spielerNimmtSchaden, geschosse,
  applyDaytime, sun, hemi, nachtGrad,
  camDistWert: () => camDist, camRohWert: () => camRoh,
  sparstufeWert: () => sparstufe,
  esseOeffnen, esseZeichnen, dinge, fert, auftragFuer, kontextFuer, leute,
  updateHUD, dingBlatt, fertZeichnen, verkaufFuer,
  ZAUBER, ZAUBER_IDS, gelernte, aktiverZauber, zauberWaehlen, zauberBlaettern,
  schnellStart, schoepfungOeffnen, herkunftVon, farbenVon,
  zauberLernen,
  lager, lagerBauen, lagerAbreissen, lagerZeichnen, lagerInReichweite,
  abbauen, abbauZiel: () => abbauJetzt, abbauStand: () => state.abbau,
};

/* ------------------------------ Hochfahren --------------------------------
 * Beim Aufschlagen steht schon eine Welt da — ein Dorf bei Nacht, über dem
 * die Kamera kreist. Darüber läuft der Vorspann, danach der Titel. Wer einen
 * Spielstand hat, bekommt den Titel sofort; den Vorspann hat er gesehen.
 * -------------------------------------------------------------------------- */
resize();
applyQuality();
saatSetzen(20260916);
{
  const s = startplatz();
  state.time = 0.88;                 // Nacht, damit die Laternen etwas zu tun haben
  world.update(s.x, s.z, 95);
  doerfer.update(s.x, s.z);
  flora.update(s.x, s.z, true);
  player.spawn(world, s.x, s.z);
  leute.update(0.016, world, doerfer, player.pos, true);
  gruftenPflegen(s.x, s.z);
  ortePflegen(s.x, s.z);
  aussehenAnlegen({ aussehen: schoepfung });
  state.schau = true;
  camera.position.copy(player.pos).addScaledVector(CAM_DIR, camDist);
  camera.lookAt(player.pos);
  applyDaytime();
}
updateHUD();
frame();

const titelZeigen = () => {
  // Läuft längst ein Spiel (Schnellstart), hat der Titel nichts mehr zu suchen
  if (state.running) return;
  el('start').classList.remove('hidden');
};
if (gespeichert && gespeichert.held) titelZeigen();
else vorspannSpielen(titelZeigen);
