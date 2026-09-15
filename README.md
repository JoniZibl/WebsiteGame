# Cozy Grove — Prototyp

Ein kleiner Top-Down-Prototyp im Browser: prozedural erzeugte, endlose Low-Poly-Welt,
eine Figur in der Mitte, Steuerung wie in *Archero* — **laufen oder schießen, nie beides**.

Gebaut mit [three.js](https://threejs.org) als reine statische Seite. Kein Build-Schritt,
kein npm install, kein CDN: three.js liegt mit im Repo unter `vendor/`.

## Steuerung

| Aktion | Handy | Desktop |
| --- | --- | --- |
| Laufen | irgendwo auf dem Bildschirm ziehen (Joystick erscheint unter dem Finger) | `WASD` / Pfeiltasten |
| Angreifen | Finger loslassen → automatisches Zielen & Schießen | Tasten loslassen |
| Grafik umschalten | ✨-Knopf oben rechts (Schatten an/aus) | ✨-Knopf |

## Lokal starten

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

Am Handy im gleichen WLAN: `http://<IP-des-Rechners>:8000`.

## Aufbau

```
index.html          Seite, Import-Map, HUD & Menüs
css/style.css       cozy UI (abgerundet, cremefarben, safe-area-tauglich)
js/noise.js         deterministisches Value-Noise + fbm (gleiche Koordinate = gleicher Wert)
js/world.js         Höhenfeld, Chunk-Streaming, Gelände-Mesh, Bäume/Häuser/Steinkreise
js/input.js         Touch-Joystick + Tastatur
js/entities.js      Spielfigur, Gegner, Pfeile, Partikel
js/main.js          Szene, Licht, Kamera, Spielschleife, Kampf-Regel
vendor/three/       three.js (MIT) lokal eingebunden
```

### Wie die Welt entsteht

`heightAt(x, z)` ist eine reine Funktion aus Noise — dieselbe Koordinate ergibt immer
dieselbe Höhe. Dadurch passen Chunks ohne Nahtstellen aneinander und die Welt ist
beliebig groß. Rund um die Figur werden 5×5 Chunks à 56 m gehalten, pro Frame höchstens
einer neu gebaut (~1–5 ms), weiter entfernte werden wieder entsorgt. Bäume, Felsen,
Blumen, Dörfer und Steinkreise streut ein pro Chunk gesäter Zufallsgenerator, alle
Meshes eines Chunks werden pro Material zu einem Mesh zusammengefasst —
im Schnitt ~70 Draw Calls für die ganze sichtbare Welt.

### Kampf

Stehen bleiben → nach 0,1 s zielt die Figur automatisch auf den nächsten Gegner in
17 m Umkreis und schießt alle 0,42 s einen Pfeil. Sobald man wieder läuft, hört das
Schießen auf. Gegner werden in 17–28 m Entfernung nachgeschoben; je weiter man vom
Startpunkt wegläuft, desto zäher und schneller werden sie.

## Nächste Ideen

- Items & kleine Upgrades nach jedem Level (mehr Pfeile, Rückstoß, Heilung)
- Biome (Wüste, Schnee) über eine zweite Noise-Ebene
- Lagerfeuer als Speicherpunkt, kleine NPC-Dörfer mit Aufträgen
- Sounds und Musik
