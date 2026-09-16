# MAMPF

> Du bist ein kleines Wesen im Gras. Du frisst, was kleiner ist als du.
> Alles, was du frisst, klebt an dir und macht dich größer.
> Huhn → Schaf → Bauer → Karren → Haus → Turm → Hügel.

Ein Browserspiel, prozedural erzeugt, in einer Klötzchenwelt. Gebaut mit
[three.js](https://threejs.org) als reine statische Seite — kein Build-Schritt,
kein npm install, kein CDN: three.js liegt mit im Repo unter `vendor/`.

## Die eine Regel

**Größe** ist die einzige Zahl, die zählt. Jedes Ding in der Welt hat eine.
Ist deine größer, verschluckst du es beim Vorbeilaufen und wächst. Ist seine
größer, ist es eine Gefahr.

Daraus entsteht von selbst die Umkehr, die das Spiel trägt: **Der Bauer mit
der Mistgabel ist in den ersten zwei Minuten dein Tod. Nach fünf Minuten ist
er ein Snack.** Dieselbe Figur, dieselbe Welt — nur du bist anders.

| Stufe | | Stufe | |
| --- | --- | --- | --- |
| 🐛 Käfer | Gras, Pilze | 🧔 Bauer | Karren, Zäune |
| 🐔 Huhn | Büsche | 🛖 Hütte | kleine Häuser |
| 🐑 Schaf | Hühner | 🏠 Haus | ganze Höfe |
| 🐖 Schwein | Schafe | 🛡️ Ritter | Wachen |
| 🧍 Dorfbewohner | Bäume | 🗼 Turm | alles |

## Die Botschaft — ohne einen Satz Text

Die Kamera zoomt nicht heraus. **Du** wirst größer, und dadurch wird die Welt
zur Modelleisenbahn: Der Tilt-Shift-Pass, der hier schon immer lief, ist vom
Filter zur Aussage geworden. Je größer du wirst, desto stärker verschwimmt
alles außer dir.

Bei Größe 24 ist nichts mehr übrig. Die Welt wird in einem Moment leer, der
Ton dumpf, und irgendwo steht ein einzelner Keim.

- **Hingehen und fressen** → *Satt.* „Du hast alles gefressen, auch das
  Letzte. Es ist sehr still geworden."
- **Einfach stehen bleiben** → *Genug.* „Du hast den Keim stehen lassen.
  Langsam wächst wieder etwas — ohne dich."

Für das zweite Ende muss man aufhören zu spielen. Das ist der ganze Punkt.

## Was du frisst, trägst du

Jeder Bissen hängt als Klotz an deinem Fell — ein Stück Dach, ein Stück Baum,
ein Zaunbrett. Am Ende bist du ein laufender Haufen aus dem Dorf, das du
gefressen hast. Wirst du getroffen, fällt ein Stück wieder ab.

## Steuerung

| Aktion | Handy | Desktop |
| --- | --- | --- |
| Laufen | irgendwo ziehen (Joystick unter dem Finger) | `WASD` / Pfeiltasten |
| Fressen | berühren genügt | berühren genügt |

## Lokal starten

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

## Aufbau

```
index.html          Seite, Import-Map, HUD & Menüs
css/style.css       UI (abgerundet, cremefarben, safe-area-tauglich)
js/noise.js         deterministisches Value-Noise + fbm
js/world.js         Klötzchengelände, Dörfer, alles Fressbare
js/creatures.js     das Wesen und die, die vor ihm weglaufen
js/main.js          Schleife, Rangstufen, Kamera, Ende
js/postfx.js        Tilt-Shift, Konturlinien, Farbgebung
js/juice.js         Bildruck, Kamerawackeln, Schockwellen, Zahlen
js/audio.js         synthetisierter Klang, kein einziges Audiofile
js/input.js         Touch-Joystick + Tastatur
js/meshkit.js       verschmilzt Figuren zu je einem Mesh
vendor/three/       three.js (MIT) lokal eingebunden
```

### Die Welt

Der Boden ist eine Treppe: `heightAt()` rastet auf Stufen von 1,2 m ein, und
jede Zelle wird als Block mit Grasdeckel und Erdwand gebaut — daher der
Minecraft-Schnitt. Darauf steht alles, was man fressen kann, als Eintrag in
`chunk.things` mit Größe, Nährwert und Radius. Beim Bissen verschwindet der
Eintrag und der Chunk baut seine Requisiten neu auf (ein paar Millisekunden).
Dörfer stehen auf einem groben Raster, dazwischen streut Noise Bäume, Büsche,
Pilze und Gras.

### Skalierung

`scaleWorldToSize()` hängt alles an eine Zahl: Kameraabstand, Nebel, Sichtweite
und den Schattenkasten. Der Faktor wächst mit `size^0.72`, also spürbar, aber
nicht explosiv. Dadurch bleibt die Figur immer gleich groß im Bild, während die
Welt darunter schrumpft.

### Bewohner

`js/creatures.js` kennt sieben Sorten von Huhn bis Turmwächter. Wer kleiner ist
als du, gerät in Panik und rennt weg; wer größer ist und `hunts` trägt, kommt
auf dich zu und kostet dich Größe. Nachschub erscheint nur in einem Fenster um
deine eigene Größe herum — immer etwas Beute, immer etwas Gefahr.

### Bild

Ein einziger Composite-Pass macht Tilt-Shift, Bloom, Filmkurve, Vignette, Korn
und die Konturlinien (aus der Tiefentextur, zwei Ringe Stichproben für eine
dickere Linie). Details in `js/postfx.js`.

## Nächste Ideen

- Bosse: eine Burg, die zurückschießt
- Mehr Umkehr-Momente: Dorfbewohner bauen Barrikaden, je größer du wirst
- Ein zweites Biom mit eigener Nahrungskette
- Highscore-Tafel: „größte Größe" und „schnellster Turm"
