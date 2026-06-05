# LMU Telemetrie-Analyse

Eine schlanke, lokale Web-App zur Analyse der **Le Mans Ultimate**-Telemetrie. Sie liest die vom Spiel
aufgezeichneten **DuckDB-Telemetriedateien** (`UserData\Telemetry\*.duckdb`), lädt automatisch die neueste
Aufnahme und zeigt dir, **wo du auf der Strecke Zeit verlierst** – plus Reifen-/Bremsen-Analyse,
einen Boxenstopp-/Energie-Rechner und einen Setup-Vergleich.

> Reine Lokal-App – läuft offline, keine Cloud, kein Account. Eine kleine Node-„Bridge" liest die
> DuckDB-Dateien über die mitgelieferte DuckDB-CLI und liefert die HTML-Oberfläche unter `http://localhost:8777` aus.

## Features

- 🎯 **Wo verliere ich Zeit?** – Zeitdelta über die Runde, automatisch erkannte Verlustzonen mit konkreten Tipps (Bremspunkt, Mindestgeschwindigkeit, Gasannahme).
- 📈 **Vergleich** – Speed / Gas / Bremse / Lenkung / Gang zweier Runden überlagert.
- 🗺️ **Interaktive Streckenkarte** (groß, oben; auch im Vergleich- und Reifen-Tab) – mit der Maus über die Strecke fahren zeigt **Speed, Delta, Gas und Bremse** an dieser Stelle; umschaltbar Delta- (Gewinn/Verlust) oder Tempo-Färbung; im Reifen-Tab nach **Bremstemperatur** (Ø 4 Bremsen) eingefärbt; synchron mit den Charts. **Alle Streckenkarten sind zoombar** (Mausrad zoomen, ziehen zum Verschieben, Doppelklick = zurücksetzen).
- 📂 **Referenz-Lap hochladen** – eigene **MoTeC `.ld`-Datei** als Referenzrunde laden und deine Runden dagegen vergleichen.
- ⏱️ **Sektor-Zeiten** – S1/S2/S3 pro Runde, beste Sektoren hervorgehoben, theoretische Bestzeit.
- 🌦️ **Wetter & Strecke** – Bedingungen, Luft-/Streckentemperatur, Wind, Nässe.
- 🧭 **Gewinn/Verlust-Streckenkarte** – immer sichtbare Mini-Karte (Sidebar), grün = Zeit gewonnen, rot = verloren.
- 📋 **Letzte Session** – Tabelle aller Runden: Zeit, Δ zur Bestzeit, Top-Speed, VE-/Sprit-/Reifenverbrauch pro Runde.
- 🔄 **Versionscheck** – meldet automatisch, wenn auf GitHub ein neueres Release verfügbar ist.
- 🛞 **Reifen & Bremsen** – Temperatur (innen/mitte/außen je Rad), Druck, Restprofil/Verschleiß, Bremstemperaturen + Hinweise zu Druck/Sturz/Balance.
- 🔧 **Setup & Pace** – vergleicht zwei deiner Sessions: was am Setup geändert wurde und wie sich die Bestzeit verändert hat, plus Setup-Hinweise aus der Telemetrie.
- ⛽ **Boxenstopp-Rechner** – aus Rennlänge, Reifensätzen, Fahrern und der gemessenen Pace/Verbrauch: Stint-Längen, Ziel-Virtual-Energy pro Runde, schnellste Gesamtzeit-Strategie, Fahrer-Einteilung (berücksichtigt Energie **und** Reifenverschleiß). Plus **Lift-&-Coast-Streckenkarte**: zeigt die Anbremszonen mit dem größten Spritspar-Potenzial (① = beste Zone).
- ⏺ **Live** – lädt nach jedem Stint automatisch die neue Aufnahme; während eine Aufnahme läuft (Datei gesperrt) wird die letzte fertige Session gezeigt.
- 🌐 **Sprache** – Oberfläche per Klick umschaltbar zwischen **Deutsch und Englisch** (oben rechts).
- 🪟 **Aufgeräumte Oberfläche** – **einklappbare Sidebar**, **Delta-Grafik** auch im Vergleich-Tab und Links zu **GitHub** und zum **YouTube-Kanal** in der Kopfzeile. Delta-Vergleiche ignorieren Out-/In-Laps konsequent als Referenz.

## Voraussetzungen

- Windows mit **Le Mans Ultimate** (PC, ab v1.2 mit nativer Telemetrie-Aufzeichnung).
- **Node.js** – zum Ausführen der Bridge. Wird vom Starter **automatisch installiert bzw. heruntergeladen**, falls nicht vorhanden (per winget oder portabel ohne Adminrechte).
- Telemetrie-Aufzeichnung in LMU aktiviert (siehe unten).

## Telemetrie-Aufzeichnung in LMU aktivieren

In `…\Le Mans Ultimate\UserData\player\Settings.JSON`:

```json
"Automatically Record Telemetry": true
```

(LMU vorher schließen.) Alternativ im Spiel unter *Optionen → Tastenbelegung* die Funktion
**„Telemetry Recording"** auf eine Taste legen und pro Stint manuell starten. Danach entstehen
`.duckdb`-Dateien in `UserData\Telemetry`.

## Starten

**Am einfachsten – ohne Konsolenfenster:** **`LMU-Telemetry-Analyzer-Vx.x.x.exe`** doppelklicken. Die App startet
komplett im Hintergrund (**kein schwarzes Kommandozeilenfenster**) und öffnet den Browser automatisch.
Beenden über den **⏻-Button** oben rechts in der App. (DuckDB-CLI wird beim ersten Start geladen, falls
nicht daneben vorhanden. Meldungen schreibt die App in `lmu-telemetrie.log` neben der EXE.)

**Aus dem Quellcode (mit Node.js):** **`Start LMU Telemetrie.cmd`** doppelklicken. Beim ersten Start
beschafft das Skript automatisch **Node.js** (falls nötig) und die **DuckDB-CLI**, startet die Bridge und
öffnet `http://localhost:8777` im Browser.

Der Telemetrie-Ordner wird automatisch über die Steam-Bibliotheken gefunden. Abweichender Pfad:
```
node lmu-bridge.js --dir="D:\Pfad\zu\Le Mans Ultimate\UserData\Telemetry"
```

## Wie es funktioniert

LMU schreibt die Telemetrie als **DuckDB-Datenbank** – eine Tabelle pro Kanal/Event (`value` bzw.
`value1..4` pro Rad), plus Meta-Tabellen (`metadata`, `channelsList`, `eventsList`); das komplette
Fahrzeug-Setup steckt als JSON in `metadata`. Da ein Browser DuckDB nicht direkt lesen kann, liest die
Bridge (`lmu-bridge.js`) die Dateien über `duckdb.exe` und stellt sie als JSON bereit. Die gesamte
Analyse (Runden-Erkennung, Delta, Reifen, Strategie) läuft im Browser (`lmu-telemetry-analyzer.html`,
Vanilla JS, eigene Canvas-Charts, keine externen Libraries).

## Datenschutz

Es werden **keine Daten hochgeladen**. Bestzeiten-Referenzen und der Session-Verlauf werden nur lokal im
Browser (`localStorage`) gespeichert. Die Telemetriedateien bleiben auf deinem Rechner.

## Lizenz

MIT – siehe [LICENSE](LICENSE). Kein offizielles Studio-397/Motorsport-Games-Produkt; „Le Mans Ultimate"
ist Eigentum der jeweiligen Rechteinhaber.
