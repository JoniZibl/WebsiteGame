# Grabwelt

Ein Survival-Spiel im Blockstil, von oben gesehen — im Browser, ohne Installation,
auf dem Handy spielbar.

Du bist ein Gartenzwerg mit einer Laterne. Über Tage liegt eine prozedural
erzeugte Welt aus Wiesen, Wäldern, Wüsten, Schnee, Bergen und Sümpfen. Darunter
liegt alles, was interessanter ist: Höhlen, Kohle, Eisen, Gold, Kristall.

## Der Kniff: die Deckenschnitt-Ansicht

Ein Spiel von oben und ein Spiel, in dem man sich eingräbt, vertragen sich
normalerweise nicht — sobald du unter der Erde bist, siehst du nur noch Erde.
Grabwelt schneidet deshalb die Welt über dir weg: eine Schnittebene folgt dir
nach unten, sodass dein Stollen immer wie ein Querschnitt vor dir liegt. Über
Tage fällt außerdem alles weg, was zwischen Kamera und Zwerg steht — kein
Blätterdach verdeckt dich mehr.

## Steuerung

- **Ziehen** (oder **WASD**) — laufen
- **⛏️** — vor dir abbauen, **⬇️** — nach unten graben, **⬆️** — nach oben
- **🧱** — den gewählten Block setzen
- **🦘** — springen
- Die **Leiste unten** wählt aus, was du in der Hand hast

## Technik

- three.js (lokal unter `vendor/three/`, kein CDN, kein Build-Schritt)
- Chunk-Welt in `Uint8Array`, flächenweises Culling, Schattierung direkt in die
  Vertex-Farben gebacken — zwei Materialien pro Chunk
- Nachbearbeitung (`js/postfx.js`): Tilt-Shift wie bei Miniaturen, Bloom,
  Farbgradierung, Vignette, Korn und tiefenbasierte Konturen
- Ton komplett prozedural über WebAudio, keine Audiodateien

## Starten

```sh
python3 -m http.server 8123
```

Dann `http://localhost:8123/` öffnen.
