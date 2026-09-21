import * as THREE from 'three';
import { CHUNK, gewaechsBei, surfaceAt, SEA, dorfBei, isSolid } from './voxel.js';
import * as props from './props.js';

/* ==========================================================================
 *  Was auf dem Gelände wächst.
 *
 *  Draußen standen Bäume aus Stamm- und Laubwürfeln — neben den Dorftannen
 *  sah das aus wie zwei verschiedene Spiele. Jetzt sind es überall dieselben
 *  Modelle.
 *
 *  Damit das bezahlbar bleibt, wird je Sorte ein einziges InstancedMesh
 *  gezeichnet: hundert Bäume kosten einen Zeichenaufruf statt hundert. Die
 *  Standorte werden je Chunk einmal ausgerechnet und gemerkt.
 * ========================================================================== */

/* Reichlich bemessen: ein dichter Nadelwald bringt im Umkreis leicht über
   achthundert Stämme, und was darüber liegt, fällt weg. Lieber ein paar
   Instanzen mehr zeichnen als Löcher im Wald. */
const HOECHSTZAHL = { tanne: 900, nadelbaum: 900, schneetanne: 520, birke: 620,
  laubbaum: 620, palme: 260, totholz: 400, kaktus: 300, busch: 900, halm: 1200,
  blume: 700, fels: 380 };

const BAUER = {
  tanne:       () => props.tanneBauen({ hoehe: 5 }),
  nadelbaum:   () => props.nadelbaumBauen({ hoehe: 6.5 }),
  schneetanne: () => props.schneetanneBauen({ hoehe: 5.4 }),
  birke:       () => props.birkeBauen({ hoehe: 5 }),
  laubbaum:    () => props.laubbaumBauen({ hoehe: 4.2 }),
  palme:       () => props.palmeBauen({ hoehe: 5 }),
  totholz:     () => props.totholzBauen({ hoehe: 4 }),
  kaktus:      () => props.kaktusBauen(),
  busch:       () => props.buschBauen(),
  halm:        () => props.halmBauen({ farbe: '#6da34e' }),
  blume:       () => props.halmBauen({ farbe: '#6da34e', bluete: '#e8a83c' }),
  fels:        () => props.felsBauen(),
};

/** Was einen aufhält: nur die dicken Stämme, nicht jeder Grashalm. */
const STAMMDICK = { tanne: 0.5, nadelbaum: 0.5, schneetanne: 0.5, birke: 0.42,
  laubbaum: 0.45, palme: 0.4, totholz: 0.42, fels: 0.6 };

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _pos = new THREE.Vector3();
const _skal = new THREE.Vector3();
const _achse = new THREE.Vector3(0, 1, 0);
const _kipp = new THREE.Quaternion();
const _kippachse = new THREE.Vector3();

/* Ein Hieb soll sich wie ein Hieb anfühlen: der Baum gibt kurz nach und
   schwingt aus. Lange genug, um es zu sehen, kurz genug, um beim nächsten
   Schlag schon wieder still zu stehen. */
const WACKELZEIT = 0.34;
const WACKELWEIT = 0.085;      // Ausschlag im Bogenmaß, etwa fünf Grad
const WACKELSCHNELL = 30;      // wie hastig es hin und her geht

/* Ein Gewächs wird über das Feld benannt, auf dem es steht — die halben
   Schritte in g.x und g.z sind nur die Mitte des Blocks. */
const schluessel = (g) => Math.floor(g.x) + ',' + Math.floor(g.z);

export class Flora {
  constructor(scene, radius = 4) {
    this.scene = scene;
    this.radius = radius;
    this.chunks = new Map();      // "cx,cz" -> Liste von Gewächsen
    this.netze = {};
    this.letzterChunk = null;
    /* Was der Spieler umgelegt hat. Der Bewuchs selbst steht in der
       Rechenvorschrift und käme beim nächsten Vorbeikommen einfach wieder —
       also merkt sich das Spiel die Stümpfe und lässt genau die weg. Es sind
       nur die Felder, an denen wirklich jemand gestanden und gehackt hat. */
    this.gefaellt = new Set();
    /* Wie voll es stehen darf. Eins heißt: so dicht wie gedacht. Der
       Leistungswächter zieht das herunter, wenn ein Gerät nicht mehr
       mitkommt — lieber ein lichterer Wald als ein hakendes Bild. */
    this.duenn = 1;
    /* Wer gerade schwingt. Die Nummer einer Instanz gilt nur für einen
       Aufbau — wird der Bewuchs neu gestellt, sitzt unter derselben Nummer
       ein anderer Baum. Darum trägt jeder Wackler den Zählerstand mit und
       wird ungültig, sobald der sich ändert. */
    this.wackler = [];
    this.stand = 0;

    for (const [art, bauer] of Object.entries(BAUER)) {
      const { geometry, material } = props.bauteil(bauer);
      const netz = new THREE.InstancedMesh(geometry, material, HOECHSTZAHL[art]);
      netz.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      netz.castShadow = true;
      netz.receiveShadow = true;
      netz.count = 0;
      netz.frustumCulled = false;
      scene.add(netz);
      this.netze[art] = netz;
    }
  }

  /** Die Gewächse eines Chunks — einmal gerechnet, dann gemerkt. */
  chunkGewaechse(cx, cz) {
    const key = `${cx},${cz}`;
    if (this.chunks.has(key)) return this.chunks.get(key);

    const liste = [];
    const ox = cx * CHUNK, oz = cz * CHUNK;
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const x = ox + lx, z = oz + lz;
        const g = gewaechsBei(x, z);
        if (!g || !BAUER[g.art]) continue;

        const y = surfaceAt(x, z);
        if (y <= SEA) continue;                       // nichts wächst im Wasser
        const dorf = dorfBei(x, z);
        if (dorf && Math.hypot(x - dorf.x, z - dorf.z) < dorf.r * 0.95) continue;

        const r = g.wuerfel;
        liste.push({
          art: g.art,
          x: x + 0.5, y: y + 1, z: z + 0.5,
          dreh: r() * Math.PI * 2,
          skal: 0.78 + r() * 0.5,
        });
      }
    }
    this.chunks.set(key, liste);
    return liste;
  }

  /* Wer eine Stunde lang geradeaus läuft, hat sonst jedes Feld, das er je
     gesehen hat, noch im Kopf — und der Speicher wächst, bis das Aufräumen
     des Browsers jedes Bild unterbricht. Gemerkt bleibt nur, was in
     Sichtweite liegt; der Rest ist in einem Wimpernschlag neu gerechnet. */
  vergessen(ccx, ccz) {
    const weit = this.radius + 3;
    if (this.chunks.size <= (weit * 2 + 1) * (weit * 2 + 1)) return;
    for (const key of this.chunks.keys()) {
      const k = key.indexOf(',');
      const cx = +key.slice(0, k), cz = +key.slice(k + 1);
      if (Math.abs(cx - ccx) > weit || Math.abs(cz - ccz) > weit) this.chunks.delete(key);
    }
  }

  /** Nur bei Chunkwechsel neu zusammenstellen — das reicht völlig. */
  update(px, pz, erzwingen = false) {
    const ccx = Math.floor(px / CHUNK), ccz = Math.floor(pz / CHUNK);
    const key = `${ccx},${ccz}`;
    if (!erzwingen && key === this.letzterChunk) return;
    this.letzterChunk = key;
    this.vergessen(ccx, ccz);
    this.stand++;
    if (this.wackler.length) this.wackler.length = 0;

    const zaehler = {};
    for (const art of Object.keys(this.netze)) zaehler[art] = 0;
    this.nah = [];

    /* Die Obergrenze je Sorte schneidet ab, sobald ein dichter Wald mehr
       hergibt. Entscheidend ist, WAS sie abschneidet: lief man die Chunks
       stur von -x nach +x ab, fiel immer dieselbe Ecke weg — und bei jedem
       Chunkwechsel eine andere. Genau das ließ ganze Baumgruppen
       verschwinden und wieder auftauchen. Jetzt kommen die nahen Chunks
       zuerst, also fällt nur weg, was ohnehin im Dunst steht. */
    const felder = [];
    for (let dz = -this.radius; dz <= this.radius; dz++) {
      for (let dx = -this.radius; dx <= this.radius; dx++) {
        felder.push({ dx, dz, d: dx * dx + dz * dz });
      }
    }
    felder.sort((a, b) => a.d - b.d);

    for (const { dx, dz } of felder) {
      for (const g of this.chunkGewaechse(ccx + dx, ccz + dz)) {
        if (this.gefaellt.size && this.gefaellt.has(schluessel(g))) continue;
        const netz = this.netze[g.art];
        const i = zaehler[g.art];
        if (i >= HOECHSTZAHL[g.art] * this.duenn) continue;
        _pos.set(g.x, g.y, g.z);
        _q.setFromAxisAngle(_achse, g.dreh);
        _skal.setScalar(g.skal);
        _m.compose(_pos, _q, _skal);
        netz.setMatrixAt(i, _m);
        g._i = i;                                   // Platz im Instanzfeld
        zaehler[g.art] = i + 1;
        if (STAMMDICK[g.art]) this.nah.push(g);
      }
    }

    for (const [art, netz] of Object.entries(this.netze)) {
      netz.count = zaehler[art];
      netz.instanceMatrix.needsUpdate = true;
      netz.computeBoundingSphere?.();
    }
  }

  /** Was hier wächst und dick genug ist, um es zu fällen — oder null. */
  naechstes(x, z, weite = 2.6) {
    if (!this.nah) return null;
    let best = null, bestD = weite * weite;
    for (const g of this.nah) {
      const dx = x - g.x, dz = z - g.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD) { bestD = d2; best = g; }
    }
    return best;
  }

  /* Ein angeschlagener Baum neigt sich vom Schlag weg und pendelt zurück.
     Gedreht wird um den Fuß — der Ursprung eines Gewächses liegt ohnehin
     unten am Boden, also genügt es, die Kippung vor die Standdrehung zu
     setzen. */
  wackeln(g, richtungX = 0, richtungZ = 1, stark = 1) {
    if (!g || g._i === undefined) return;
    const netz = this.netze[g.art];
    if (!netz || g._i >= netz.count) return;
    const l = Math.hypot(richtungX, richtungZ) || 1;
    const vorhanden = this.wackler.find((w) => w.g === g);
    const w = vorhanden || { g, art: g.art, i: g._i, zeit: 0, stand: 0, ax: 0, az: 0, stark: 1 };
    w.i = g._i;
    w.stand = this.stand;
    w.zeit = 0;
    w.ax = richtungZ / l;          // Achse steht quer zur Schlagrichtung
    w.az = -richtungX / l;
    w.stark = stark;
    if (!vorhanden) this.wackler.push(w);
  }

  /** Lässt die angeschlagenen Gewächse ausschwingen. Jedes Bild ein Aufruf. */
  beleben(dt) {
    if (!this.wackler.length) return;
    const fertig = [];
    for (const w of this.wackler) {
      const netz = this.netze[w.art];
      /* Neu aufgestellt oder weggefallen: die Nummer zeigt jetzt woanders
         hin, also lieber gar nichts anfassen. */
      if (w.stand !== this.stand || !netz || w.i >= netz.count) { fertig.push(w); continue; }
      w.zeit += dt;
      const k = w.zeit / WACKELZEIT;
      const g = w.g;
      _pos.set(g.x, g.y, g.z);
      _skal.setScalar(g.skal);
      _q.setFromAxisAngle(_achse, g.dreh);
      if (k < 1) {
        /* Abklingen mal Schwingung: der erste Ausschlag ist der größte,
           danach wird es schnell ruhig. */
        const winkel = WACKELWEIT * w.stark * (1 - k) * (1 - k)
          * Math.cos(w.zeit * WACKELSCHNELL);
        _kippachse.set(w.ax, 0, w.az);
        _kipp.setFromAxisAngle(_kippachse, winkel);
        _q.premultiply(_kipp);
      } else {
        fertig.push(w);                     // gerade steht es wieder von selbst
      }
      _m.compose(_pos, _q, _skal);
      netz.setMatrixAt(w.i, _m);
      netz.instanceMatrix.needsUpdate = true;
    }
    for (const w of fertig) {
      const i = this.wackler.indexOf(w);
      if (i >= 0) this.wackler.splice(i, 1);
    }
  }

  /** Legt ein Gewächs um. Es bleibt weg, bis ein neues Spiel beginnt. */
  faellen(g) {
    this.gefaellt.add(schluessel(g));
    this.letzterChunk = null;          // im nächsten Bild steht es nicht mehr da
  }

  /** Für den Spielstand: die Stümpfe hinein und wieder heraus. */
  stuempfe() { return [...this.gefaellt]; }
  stuempfeSetzen(liste) {
    this.gefaellt = new Set(liste || []);
    this.letzterChunk = null;
  }

  /** Lichtet den Bewuchs aus und stellt ihn im nächsten Bild neu auf. */
  duennen(faktor) {
    this.duenn = Math.max(0.35, Math.min(1, faktor));
    this.letzterChunk = null;
  }

  /** Schiebt einen Punkt aus dem nächsten Stamm heraus. */
  wegSchieben(x, z, rand = 0.3) {
    if (!this.nah) return null;
    for (const g of this.nah) {
      const r = STAMMDICK[g.art] * g.skal + rand;
      const dx = x - g.x, dz = z - g.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      // Genau in der Mitte gibt es keine Richtung — dann irgendeine nehmen,
      // sonst klebt man im Stamm fest.
      if (d2 < 1e-6) return { x: g.x + r + 0.02, z: g.z };
      const d = Math.sqrt(d2);
      return { x: g.x + (dx / d) * (r + 0.02), z: g.z + (dz / d) * (r + 0.02) };
    }
    return null;
  }

  clear() {
    this.wackler.length = 0;
    this.chunks.clear();
    this.gefaellt.clear();
    this.letzterChunk = null;
    for (const netz of Object.values(this.netze)) netz.count = 0;
  }
}
