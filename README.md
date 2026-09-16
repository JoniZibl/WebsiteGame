# Glimm

Ein Grabspiel im Browser, von oben gesehen, auf dem Handy spielbar.

Die Welt ist ein Modell, das du aufschneidest. Wer nach unten gräbt, wandert
durch Farbbänder wie durch einen geologischen Querschnitt — Krume, Lehm,
Roterde, Rostband, Malvenstein, Blaustein, Tiefblau. Jede Schicht hat ihre
eigene Farbe und ihren eigenen Widerstand: je tiefer, desto zäher der Fels.

## Die ganze Steuerung

- **Ziehen** — du läufst. Was im Weg ist, gräbst du weg.
- **Loslassen** — du sinkst. Tiefer ist immer nach unten.
- **Ein Knopf** — gräbst du, oder gehst du nur?

Mehr gibt es nicht. Kein Inventar, keine Werkbank, keine Leiste.

## Was bleibt

Deine Gänge leuchten nach. Wo du gegraben hast, glimmt die Wand — der eigene
Weg steht als warmes Geflecht in der Erde und ist das Einzige, was du hier
hinterlässt.

Das **Glimm** im Fels füllt deine Laterne. Ein harter Sturz lässt die Flamme
ausschlagen; geht sie aus, ist der Abstieg zu Ende. Oben an der Luft füllt sich
das Licht von allein — die Oberfläche ist der sichere Hafen.

## Technik

- three.js (lokal unter `vendor/three/`, kein CDN, kein Build-Schritt)
- Chunk-Welt in `Uint8Array`, flächenweises Culling, Schattierung und
  Schichtfarbe direkt in die Vertex-Farben gebacken
- Die Welt über dem Kopf wird per Clipping-Ebene weggeschnitten; zusätzlich
  fällt weg, was zwischen Kamera und Figur steht
- Höhlen als Röhren: zwei Rauschfelder auf ihren Nulldurchgang eingedampft,
  hohl ist nur die Schnittlinie
- Nachbearbeitung (`js/postfx.js`): Tilt-Shift wie bei Miniaturen, Bloom,
  Farbgradierung, Vignette, Korn, tiefenbasierte Konturen
- Ton komplett prozedural über WebAudio, keine Audiodateien
- Spielstand in `localStorage`: nur Saatkorn und Änderungen

## Starten

```sh
python3 -m http.server 8123
```

Dann `http://localhost:8123/` öffnen.
