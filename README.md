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
js/entities.js      Spielfigur, Gegner, Wächter, Pfeile, Geschosse, Edelsteine, Partikel
js/upgrades.js      Upgrade-Karten, Erfahrungskurve
js/audio.js         synthetisierter Klang (Wind, Feuer, Effekte, Untermalung)
js/villagers.js     Dorfbewohner und Krämerstand
js/save.js          Spielstand, dauerhafte Verbesserungen, Bestwerte
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

### Regionen

Statt harter Biomgrenzen gibt es zwei weiche Felder: `drynessAt` und
`woodinessAt`. Trockenheit zieht dasselbe Grün ins Goldene, lichtet den Wald
und streut mehr Steine; Bewaldung verdichtet ihn und verschiebt die Nadeln ins
Dunkle. Daraus ergeben sich Wiesen, Hain, Tiefer Wald, Heide und Trockenwald —
der Name der Gegend steht im HUD.

### Fortschritt

Jeder eingesammelte Edelstein ist ein Erfahrungspunkt. Bei einem Stufenaufstieg
hält das Spiel an und bietet drei zufällige Karten an: Doppelschuss, Schnelle
Hand, Scharfe Spitzen, Durchschlag, Weitsicht, Zäh, Leichte Schuhe,
Sammlerglück oder Warme Suppe. Jede Karte hat ein Maximum und stapelt bis
dahin. Mit jeder Stufe werden auch die Gegner zäher.

### Wächter der Steinkreise

Steinkreise senden eine schmale Lichtsäule nach oben — von Weitem das einzige
Ziel in der Landschaft. Im Kreis schläft ein Wächter, zusammengesunken und
unverwundbar, bis jemand auf 15 m herankommt. Dann richtet er sich auf und
kämpft: Er geht schwer auf einen zu, kündigt seinen Schlag mit einem
wachsenden Ring an (wer im Ring steht, kassiert ihn) und ruft ab und zu zwei
Hüpfer zu Hilfe. Sein schmaler Kollisionsradius lässt ihn zwischen den eigenen
Steinen hindurch.

Besiegt lässt er sieben Edelsteine, Heilung und eine sofortige Stufe fallen.
Welche Kreise erledigt sind, merkt sich der Lauf über einen Schlüssel aus den
Koordinaten — ein toter Wächter bleibt tot, auch wenn der Chunk zwischendurch
entladen wird.

### Dorfleben und Handel

Nähert man sich einem Dorf auf 80 m, besetzt `js/villagers.js` es mit fünf
Bewohnern, die zwischen den Häusern umherschlendern, und einem Krämer mit
Stand (cremefarbene Plane, Waren auf dem Tisch, darüber ein schwebendes
Zeichen). Der Krämer dreht sich zu einem hin. Steht man vor dem Stand,
erscheint der Handeln-Knopf.

Im Laden kauft man mit gesammelten Edelsteinen **dauerhafte** Verbesserungen:
Zähe Haut (+20 Startleben), Harter Kern (+1 Grundschaden), Zweiter Pfeil,
Wanderstiefel (+6 % Tempo) und Glückssteine (Gegner lassen öfter zwei Steine
fallen). Gekauftes wirkt sofort, nicht erst im nächsten Lauf.

### Spielstand

`js/save.js` legt Vorrat, gekaufte Verbesserungen und den besten Lauf in
localStorage ab — alles defensiv gelesen, im privaten Modus darf der Zugriff
auch fehlschlagen. Jeder eingesammelte Edelstein wandert sofort in den Vorrat,
gespeichert wird alle zwölf Sekunden sowie beim Verlassen der Seite. Ein
abgebrochener Lauf verliert also nichts — wichtig auf dem Handy.

### Tag und Nacht

Ein voller Umlauf dauert gut fünf Minuten. Zwischen sechs Stützstellen werden
Himmel, Nebel, Sonnenfarbe, Sonnenstärke und Umgebungslicht interpoliert, die
Sonne wandert dabei von Ost nach West. Nachts ist es blaugrau und dämmrig,
Lagerfeuer leuchten spürbar stärker, und es sind mehr Gegner unterwegs. Die
Tageszeit steht im HUD.

### Lagerfeuer

Zelte und einzelne Feuerstellen sind Rastplätze: In 4 m Umkreis heilt man
16 Leben pro Sekunde, das HUD zeigt „Du rastest". Ein einziges wanderndes
Punktlicht sitzt immer auf der nächstgelegenen Feuerstelle — deshalb glimmen
Lager schon von Weitem warm, ohne dass es Dutzende Lichter kostet.

### Kampf

Stehen bleiben → nach 0,1 s zielt die Figur automatisch auf den nächsten Gegner in
Reichweite und schießt. Sobald man wieder läuft, hört das Schießen auf.

Drei Gegnersorten, die zu unterschiedlichem Verhalten zwingen:

| Sorte | Verhalten |
| --- | --- |
| **Hüpfer** | rennt stur heran und beißt |
| **Brocken** | langsam, zäh, trifft hart |
| **Spucker** | hält 11 m Abstand, bläht sich vorm Schuss sichtbar auf und spuckt — dagegen hilft nur Laufen |

Gegner werden in 17–28 m Entfernung nachgeschoben; je weiter man vom Startpunkt
wegläuft und je höher die eigene Stufe, desto mehr und zähere kommen.

## Klang

`js/audio.js` erzeugt jeden Ton zur Laufzeit mit der Web Audio API — es gibt
keine einzige Audiodatei. Ein Rauschpuffer trägt Wind, Lagerfeuerknistern und
alle Schläge; kurze Oszillatoren mit Hüllkurve machen Bogen, Treffer und
Geschosse. Edelsteine klingen beim schnellen Einsammeln eine Pentatonik
aufwärts, der Stufenaufstieg ist ein Dreiklang, und alle 9–16 Sekunden liegt
ein ruhiger Akkordton darunter. Das Feuer wird aus der Entfernung geregelt, ist
also von selbst räumlich. Browser lassen Ton erst nach einer Geste zu — der
Startknopf schaltet ihn frei, der 🔊-Knopf schaltet ihn stumm (wird gemerkt).

## Nächste Ideen

- Kleine Aufträge der Dorfbewohner („bring mir zehn Steine")
- Wetter: Regen, Nebelbänke, Schnee in kalten Regionen
- Mehr Wächtersorten mit eigenen Angriffsmustern
- Ausrüstung mit Fundstücken statt nur Werten
- Eine Karte, die schon besuchte Gegenden zeigt
