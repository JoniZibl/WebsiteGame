/* ==========================================================================
 *  Der Vorrat — damit das Spiel auch ohne Netz läuft.
 *
 *  Beim ersten Besuch legt dieser Arbeiter jede Datei des Spiels in einen
 *  Vorratsschrank. Danach braucht Talkunde keine Verbindung mehr: Welt,
 *  Gruften und Getier stehen ohnehin in der Rechenvorschrift, nicht auf
 *  einem Server.
 *
 *  Geholt wird trotzdem immer zuerst aus dem Netz. Das ist Absicht: an
 *  diesem Spiel wird noch gebaut, und nichts ist ärgerlicher als eine
 *  Fassung von gestern, die sich nicht wegräumen lässt. Erst wenn das Netz
 *  nicht antwortet, kommt der Vorrat zum Zug.
 * ========================================================================== */

/* Bei jeder Änderung hochzählen: unter dem alten Namen bleibt nichts liegen.
   Der Netz-zuerst-Griff macht das zwar gutmütig, aber ein alter Schrank
   belegt sonst ewig Platz. */
const STAND = 'talkunde-v1';

/* Alles, was das Spiel ausmacht. Es sind anderthalb Megabyte — davon zwei
   Drittel three.js. */
const VORRAT = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './bild/zeichen-192.png',
  './bild/zeichen-512.png',
  './bild/zeichen-apple.png',
  './vendor/three/three.module.min.js',
  './vendor/three/addons/utils/BufferGeometryUtils.js',
  './js/main.js',
  './js/audio.js',
  './js/aussehen.js',
  './js/combat.js',
  './js/dungeon.js',
  './js/ereignis.js',
  './js/flora.js',
  './js/geschoss.js',
  './js/icons.js',
  './js/input.js',
  './js/items.js',
  './js/juice.js',
  './js/lager.js',
  './js/meshkit.js',
  './js/noise.js',
  './js/npc.js',
  './js/orte.js',
  './js/peek.js',
  './js/player.js',
  './js/postfx.js',
  './js/props.js',
  './js/quest.js',
  './js/save.js',
  './js/skills.js',
  './js/story.js',
  './js/village.js',
  './js/voxel.js',
  './js/wesen.js',
  './js/wetter.js',
  './js/zauber.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const schrank = await caches.open(STAND);
    /* Einzeln statt addAll: fehlt eine Datei, soll nicht der ganze Vorrat
       scheitern. Lieber neunundzwanzig von dreißig als gar keinen. */
    await Promise.allSettled(VORRAT.map((pfad) => schrank.add(pfad)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name !== STAND) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const anfrage = e.request;
  if (anfrage.method !== 'GET') return;
  let ort;
  try { ort = new URL(anfrage.url); } catch { return; }
  if (ort.origin !== self.location.origin) return;

  e.respondWith((async () => {
    try {
      const frisch = await fetch(anfrage);
      if (frisch && frisch.ok && frisch.type !== 'opaque') {
        const schrank = await caches.open(STAND);
        schrank.put(anfrage, frisch.clone());
      }
      return frisch;
    } catch (fehlt) {
      const schrank = await caches.open(STAND);
      const alt = await schrank.match(anfrage);
      if (alt) return alt;
      // Wer die Seite selbst aufruft, bekommt das Spielblatt aus dem Vorrat
      if (anfrage.mode === 'navigate') {
        const blatt = await schrank.match('./index.html') || await schrank.match('./');
        if (blatt) return blatt;
      }
      throw fehlt;
    }
  })());
});
