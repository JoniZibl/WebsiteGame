# Cozy Grove — Prototyp

Ein kleiner Top-Down-Prototyp im Browser: prozedural erzeugte, endlose Low-Poly-Welt,
eine Figur in der Mitte, Steuerung wie in *Archero* — **laufen oder schießen, nie beides**.
Die Welt sieht durch einen Tilt-Shift-Pass aus wie eine Miniaturlandschaft.

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

## Am Handy testen (GitHub Pages)

Der Workflow `.github/workflows/pages.yml` veröffentlicht den Stand automatisch.
Einmalig nötig: in GitHub unter **Settings → Pages → Build and deployment → Source**
auf **GitHub Actions** stellen (der Workflow kann Pages nicht selbst einschalten —
das darf nur ein Mensch mit Admin-Rechten). Danach den Workflow unter **Actions →
Deploy to GitHub Pages → Run workflow** einmal starten. Danach liegt das Spiel unter
`https://jonizibl.github.io/WebsiteGame/` und lässt sich am Handy wie eine App
zum Startbildschirm hinzufügen.

## Aufbau

```
index.html          Seite, Import-Map, HUD & Menüs
css/style.css       cozy UI (abgerundet, cremefarben, safe-area-tauglich)
js/noise.js         deterministisches Value-Noise + fbm (gleiche Koordinate = gleicher Wert)
js/world.js         Höhenfeld, Chunk-Streaming, Gelände-Mesh, Bäume/Häuser/Steinkreise
js/input.js         Touch-Joystick + Tastatur
js/entities.js      Spielfigur, Gegner, Pfeile, Edelsteine, Partikel
js/postfx.js        Tilt-Shift (Miniatureffekt) als eigener Render-Pass
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

### Miniatureffekt

`js/postfx.js` zeichnet die Szene in ein Render-Target, weichzeichnet eine halb
aufgelöste Kopie zweimal separabel (horizontal/vertikal) und mischt beides über
eine Maske, die nur ein schmales, leicht geneigtes Band in Bildmitte scharf lässt —
genau der Trick, der echte Landschaften wie Modellbau aussehen lässt. Dazu eine
Spur mehr Sättigung. Die Unschärfe läuft in halber Auflösung, auf dem Handy mit
einem Durchgang statt zwei.

### Farbpalette

Alles kommt aus einer Familie: warme Salbei- und Olivgrüne fürs Gelände
(`#a8bd78` → `#2f4423`), Sand `#d6c391`, Stein `#a6a48d`, Wasser `#7fa88b`.
Terrakotta `#df8a5c` ist der einzige Fremdton und bleibt den Dingen vorbehalten,
die auffallen sollen: Dächer, Zelte, Gegner und die Kapuze der Figur. Die Figur
selbst ist das hellste Objekt im Bild, damit man sie im Wald immer findet.

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
