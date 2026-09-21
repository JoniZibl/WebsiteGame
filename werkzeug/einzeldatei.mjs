#!/usr/bin/env node
/* ==========================================================================
 *  Talkunde in einer einzigen Datei.
 *
 *  Das Spiel besteht aus einem Blatt, einem Stilbogen, dreißig Modulen und
 *  three.js. Ein Browser holt die alle einzeln — und über `file://` holt er
 *  gar nichts, weil ein Modul, das `./voxel.js` importiert, dort an der
 *  Herkunftsprüfung scheitert.
 *
 *  Der Ausweg braucht keinen Bündler: jedes Modul wird zu einer `data:`-URL,
 *  und eine Importkarte im Blatt verbindet sie. Dazu muss an den Modulen nur
 *  EINE Sache geändert werden — der Name hinter `from`. Der Quelltext selbst
 *  bleibt Zeichen für Zeichen, wie er ist, three.js eingeschlossen.
 *
 *      import { isSolid } from './voxel.js'   →   from 'tk:js/voxel.js'
 *
 *  Heraus kommt eine Datei von etwa anderthalb Megabyte, die man herunterlädt,
 *  auf dem Telefon antippt und spielt. Kein Server, kein Vorrat, der verfallen
 *  kann, keine Verbindung.
 *
 *  Aufruf:  node werkzeug/einzeldatei.mjs [ziel.html]
 * ========================================================================== */

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ZIEL = process.argv[2] || join(WURZEL, 'offline', 'talkunde.html');

const lies = (p) => readFileSync(join(WURZEL, p), 'utf8');

/* --------------------------- Module einsammeln ---------------------------- */
/* Der Name unter dem ein Modul in der Importkarte steht. `tk:` ist ein reiner
   Name, kein Schema mit Bedeutung — Hauptsache, er ist nicht relativ: relative
   Namen würden sich gegen die data:-URL auflösen, und die hat keine Herkunft. */
const name = (pfad) => 'tk:' + pfad;

const module = new Map();          // Name -> Quelltext
module.set(name('three'), lies('vendor/three/three.module.min.js'));
module.set(name('three/addons/utils/BufferGeometryUtils.js'),
  lies('vendor/three/addons/utils/BufferGeometryUtils.js'));
for (const datei of readdirSync(join(WURZEL, 'js')).filter((d) => d.endsWith('.js')).sort()) {
  module.set(name('js/' + datei), lies('js/' + datei));
}

/* ------------------------- Nur die Namen umschreiben ----------------------- */
/* Trifft `from '…'`, `import '…'` und `import('…')`. Alles andere am Modul
   bleibt unberührt — auch die Ausfuhren, weshalb hier nichts kaputtgehen kann,
   was ein echter Bündler kaputtmachen könnte. */
const UMSCHRIFT = /(\bfrom\s*|\bimport\s*\(?\s*)(['"])([^'"]+)\2/g;

function umschreiben(quelle, eigenerPfad) {
  return quelle.replace(UMSCHRIFT, (ganz, kopf, anf, spez) => {
    let neu = null;
    if (spez === 'three') neu = name('three');
    else if (spez.startsWith('three/addons/')) neu = name(spez);
    else if (spez.startsWith('./') || spez.startsWith('../')) {
      // Alle Module des Spiels liegen flach in js/ — mehr Auflösung braucht es nicht
      neu = name('js/' + spez.replace(/^\.\.?\//, ''));
    }
    if (!neu) return ganz;
    if (!module.has(neu)) throw new Error(`${eigenerPfad}: kenne '${spez}' nicht`);
    return kopf + anf + neu + anf;
  });
}

const datenUrl = (quelle) =>
  'data:text/javascript;base64,' + Buffer.from(quelle, 'utf8').toString('base64');

const karte = { imports: {} };
for (const [n, quelle] of module) karte.imports[n] = datenUrl(umschreiben(quelle, n));

/* ------------------------------ Das Blatt --------------------------------- */
let blatt = lies('index.html');

const ersetze = (alt, neu, was) => {
  if (typeof alt === 'string' ? !blatt.includes(alt) : !alt.test(blatt)) {
    throw new Error('nicht gefunden: ' + was);
  }
  blatt = blatt.replace(alt, () => neu);
};

// Stilbogen hinein
ersetze('<link rel="stylesheet" href="css/style.css" />',
  '<style>\n' + lies('css/style.css') + '\n</style>', 'Stilbogen');

// Zeichen als data:-URL, Manifest weg (es zeigt auf Dateien, die es hier nicht gibt)
const bild = (p) => 'data:image/png;base64,'
  + readFileSync(join(WURZEL, p)).toString('base64');
ersetze(/<link rel="manifest"[^>]*>\n/, '', 'Manifest');
ersetze(/<link rel="icon"[^>]*>/, `<link rel="icon" href="${bild('bild/zeichen-192.png')}" />`, 'Zeichen');
ersetze(/<link rel="apple-touch-icon"[^>]*>/,
  `<link rel="apple-touch-icon" href="${bild('bild/zeichen-apple.png')}" />`, 'Apple-Zeichen');

// Die Importkarte des Spiels durch die der Einzeldatei ersetzen
ersetze(/<script type="importmap">[\s\S]*?<\/script>/,
  '<script type="importmap">\n' + JSON.stringify(karte) + '\n</script>', 'Importkarte');

// Und der Anstoß: statt einer Datei ein Name aus der Karte
ersetze('<script type="module" src="js/main.js"></script>',
  `<script type="module">import '${name('js/main.js')}';</script>`, 'Anstoß');

/* Die Zeile unter dem Aufbrechen-Knopf meldet sonst den Vorrat des Service
   Workers. Den gibt es hier nicht — diese Datei IST der Vorrat. */
ersetze('<small id="vorratsWort" class="vorrats-wort hidden"></small>',
  '<small id="vorratsWort" class="vorrats-wort">Einzeldatei &mdash; '
  + 'l&auml;uft ohne Netz</small>', 'Vorratszeile');

mkdirSync(dirname(ZIEL), { recursive: true });
writeFileSync(ZIEL, blatt);

const mb = (blatt.length / 1048576).toFixed(2);
console.log(`${ZIEL}  ${mb} MB  ${module.size} Module`);
