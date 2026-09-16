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
let camDist = 62;

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
};

const DAY = 420;
const held = () => state.held;

const feinde = new Feinde(scene, {
  onTreffer: (f) => spielerNimmtSchaden(f.schaden, f.art.name),
  onTod: (f) => feindGefallen(f),
});

/* ------------------------------- Anzeige ---------------------------------- */
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
  rede: el('redeBtn'), wirk: el('wirkBtn'),
};

let hudTimer = 0;
function updateHUD() {
  const h = held();
  ui.hp.style.width = `${Math.max(0, h.hp / h.hpMax * 100)}%`;
  ui.hpText.textContent = Math.max(0, Math.round(h.hp));
  ui.hpBar.classList.toggle('wenig', h.hp < h.hpMax * 0.3);
  ui.aus.style.width = `${Math.max(0, h.ausdauer / h.ausdauerMax * 100)}%`;
  ui.mag.style.width = `${Math.max(0, h.magicka / h.magickaMax * 100)}%`;
  ui.stufe.textContent = h.stufe;
  ui.xp.style.width = `${Math.min(100, h.xp / h.xpZiel * 100)}%`;
  ui.gold.textContent = h.gold;
  ui.wirk.classList.toggle('leer', h.magicka < 18);

  ui.ortName.textContent = state.ort;
  ui.ortInfo.textContent = state.imDungeon
    ? `Gruft · Stufe ${state.imDungeon.stufe}`
    : biomeAt(Math.floor(player.pos.x), Math.floor(player.pos.z)).name;

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
  const gold = Math.round((t.gross ? 120 : 45) * (1 + t.gruft.stufe * 0.3) * fert.werte.beute(h));
  h.gold += gold;
  h.dungeons.add(t.id);
  fert.uebung(h, 'spuren', 2);
  fert.xpGeben(h, t.gross ? 80 : 35);
  scene.remove(t.obj);
  truhen.splice(truhen.indexOf(t), 1);
  audio.gem(2);
  juice.ring({ x: t.pos.x, y: t.pos.y + 0.5, z: t.pos.z }, 2.6, '#e8a83c');
  meldung(`+${gold} Gold`, '#e8a83c');
  const fertigeQ = state.buch.melden('truhe', {});
  for (const q of fertigeQ) meldung(`„${q.titel}" erledigt`, '#7fae5e', 3.0);
  updateHUD();
}

/* -------------------------- Womit kann man reden? -------------------------- */
function was() {
  const p = player.pos;
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
  return null;
}

function handeln() {
  const w = was();
  if (!w) return;
  if (w.art === 'truhe') { truheOeffnen(w.ziel); return; }
  if (w.art === 'tor') { gruftBetreten(w.ziel.gruft); return; }
  if (w.art === 'npc') redeOeffnen(w.ziel);
}

function gruftBetreten(g) {
  const p = gruft.plan(g);
  state.imDungeon = g;
  state.ort = g.name;
  // In den Schacht hinein und auf dessen Boden absetzen
  player.pos.set(g.x + 0.5, p.bodenY + 1, g.z + 0.5);
  player.vel.set(0, 0, 0);
  world.update(player.pos.x, player.pos.z, 30);
  gruftenPflegen(player.pos.x, player.pos.z);
  audio.gem(0);
  meldung(g.name, '#4a3b30', 3.0);
  updateHUD();
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

/* ------------------------------ Heldenblatt -------------------------------- */
function menuZeichnen(tab = 'fert') {
  for (const b of document.querySelectorAll('.reiter')) {
    b.classList.toggle('an', b.dataset.tab === tab);
  }
  el('tabFert').classList.toggle('hidden', tab !== 'fert');
  el('tabQuests').classList.toggle('hidden', tab !== 'quests');
  el('tabWelt').classList.toggle('hidden', tab !== 'welt');
  if (tab === 'fert') fertZeichnen();
  if (tab === 'quests') questsZeichnen();
  if (tab === 'welt') karteZeichnen();
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
    z.innerHTML = `<span class="ic">${f.icon}</span>`
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
  const offen = state.buch.offen;
  if (!offen.length) {
    const p = document.createElement('p');
    p.className = 'punkte-hinweis';
    p.textContent = 'Kein Auftrag. Sprich mit den Leuten im Dorf.';
    feld.append(p);
  }
  for (const q of offen) {
    const z = document.createElement('div');
    z.className = 'q-zeile' + (q.fertig ? ' fertig' : '');
    z.innerHTML = `<b>${q.titel}</b><p>${q.text}</p>`
      + `<small>${q.fertig ? 'erledigt — zurück zum Auftraggeber' : `${q.stand} / ${q.menge}`}`
      + ` · ${q.lohn.gold} Gold</small>`;
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
  const setz = (x, z, zeichen, klasse = '') => {
    const l = (x - px) / (R * 2) + 0.5, t = (z - pz) / (R * 2) + 0.5;
    if (l < 0.02 || l > 0.98 || t < 0.02 || t > 0.98) return;
    const s = document.createElement('span');
    s.className = `punkt ${klasse}`;
    s.style.left = `${l * 100}%`;
    s.style.top = `${t * 100}%`;
    s.textContent = zeichen;
    box.append(s);
  };
  for (const d of doerferUm(px, pz, R)) setz(d.x, d.z, '🏠');
  for (const g of gruft.grueftUm(px, pz, R)) setz(g.x, g.z, '🕳️');
  const q = state.buch.verfolgt();
  if (q && q.zielOrt) setz(q.zielOrt.x, q.zielOrt.z, '❗');
  setz(px, pz, '🔺', 'du');
  feld.append(box);
  const leg = document.createElement('p');
  leg.className = 'karte-legende';
  leg.textContent = `🏠 Dorf · 🕳️ Gruft · ❗ Auftrag · 🔺 du — Umkreis ${R * 2} Schritt`;
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

  if (state.running && !state.gespraech) {
    const h = held();
    const move = input.read();
    player.tempo = fert.werte.tempo(h);
    player.update(dt, move, world);
    world.update(player.pos.x, player.pos.z, 1);
    doerfer.update(player.pos.x, player.pos.z);
    leute.update(dt, world, doerfer, player.pos);
    gruftenPflegen(player.pos.x, player.pos.z);
    feinde.update(dt, world, player.pos, !state.dead);
    feinde.aufraeumen(player.pos.x, player.pos.z, 130);
    wildnisPflegen(dt);

    state.time = (state.time + dt / DAY) % 1;
    if (state.hieb > 0) state.hieb -= dt;
    if (state.zauber > 0) state.zauber -= dt;

    // Ausdauer und Magicka füllen sich von allein
    h.ausdauer = Math.min(h.ausdauerMax, h.ausdauer + 16 * dt);
    const magTempo = h.vorteile.has('magie4') ? 6 : 3.4;
    h.magicka = Math.min(h.magickaMax, h.magicka + magTempo * dt);
    // Nach dem Kampf heilt es langsam, wenn nichts in der Nähe ist
    const ruhe = !feinde.ziel(player.pos, player.facing, 14);
    if (ruhe && h.hp < h.hpMax) {
      h.hp = Math.min(h.hpMax, h.hp + (h.vorteile.has('zaehe4') ? 3.2 : 1.4) * dt);
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
    if (tief < 3 && state.imDungeon) { state.imDungeon.gefuellt = false; state.imDungeon = null; }
    if (!state.imDungeon) {
      const neuerOrt = dorf ? ortsname(dorf) : 'Wildnis';
      if (neuerOrt !== state.ort) {
        state.ort = neuerOrt;
        if (dorf) {
          const fertigeQ = state.buch.melden('gehen', { ort: neuerOrt });
          for (const q of fertigeQ) meldung(`„${q.titel}" erledigt`, '#7fae5e', 3.0);
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
    if (w) ui.rede.textContent = w.art === 'npc' ? '💬' : w.art === 'truhe' ? '🧰' : '🚪';

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
  if (k === 'i') { menuZeichnen('fert'); el('menu').classList.toggle('hidden'); }
  if (k === 'escape') { redeSchliessen(); el('menu').classList.add('hidden'); }
});

const soundBtn = el('soundBtn');
let muted = false;
try { muted = localStorage.getItem('talkunde-muted') === '1'; } catch (err) { /* egal */ }
audio.setMuted(muted);
soundBtn.textContent = muted ? '🔇' : '🔊';
soundBtn.addEventListener('click', () => {
  muted = !muted;
  audio.unlock();
  audio.setMuted(muted);
  soundBtn.textContent = muted ? '🔇' : '🔊';
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
    held: {
      stufe: h.stufe, xp: h.xp, xpZiel: h.xpZiel, punkte: h.punkte, gold: h.gold,
      hp: h.hp, hpMax: h.hpMax, ausdauer: h.ausdauer, ausdauerMax: h.ausdauerMax,
      magicka: h.magicka, magickaMax: h.magickaMax, fert: h.fert, fertXp: h.fertXp || {},
      vorteile: [...h.vorteile], getoetet: h.getoetet, dungeons: [...h.dungeons],
    },
    quests: { offen: state.buch.offen, erledigt: state.buch.erledigt.slice(-8) },
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
  state.dead = false;
  state.imDungeon = null;
  state.fallFrom = null;
  juice.reset();

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

el('againBtn').addEventListener('click', () => {
  el('dead').classList.add('hidden');
  // Man wacht im Dorf auf und behält alles bis auf etwas Gold
  const h = held();
  h.gold = Math.round(h.gold * 0.8);
  h.hp = h.hpMax;
  h.ausdauer = h.ausdauerMax;
  h.magicka = h.magickaMax;
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
