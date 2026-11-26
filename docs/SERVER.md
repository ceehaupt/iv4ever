# Relay-Server für Online-Spiele

Der Relay-Server (`server/relay.mjs`) rechnet nichts. Er ordnet die Aktionen aller Spieler in eine feste Reihenfolge und
verteilt sie; jeder Browser berechnet das Spiel selbst (deterministischer Lockstep).

## Starten

```bash
npm run server                       # ws://localhost:8787
PORT=9000 GRACE_MS=60000 npm run server
```

| Variable | Standard | Bedeutung |
|---|---|---|
| `PORT` | 8787 | Port des WebSocket-Servers |
| `GRACE_MS` | 30000 | Kulanzzeit nach einem Verbindungsabbruch, bevor die KI den Platz übernimmt |
| `MAX_PLAYERS` | 8 | Menschen je Raum (zusätzlich begrenzt durch die Startplätze der Karte) |

## Funktionen

- **Räume** mit 5-stelligem Code; der Erste ist Gastgeber und startet das Spiel.
- **Versionsprüfung:** Nur Browser mit derselben Spielversion (Paketversion + Git-Stand, im Dialog angezeigt) dürfen beitreten.
- **Wiedereinstieg:** Jeder Platz hat ein geheimes Token (im Browser gespeichert). Nach einem Abbruch oder Neuladen
  „Online …“ → „Wieder beitreten“. Der Server schickt Startdaten und alle bisherigen Aktionen, der Browser spielt sie nach.
  Innerhalb der Kulanzzeit merkt niemand etwas; danach hat die KI übernommen und gibt den Platz beim Wiedereinstieg zurück.
- **Speichern und Fortsetzen:** Der Gastgeber speichert mit Strg/⌘ + S. Zum Fortsetzen einen neuen Raum eröffnen, im Dialog
  „Spielstand fortsetzen“ wählen und starten. Die Plätze werden in Beitrittsreihenfolge vergeben; fehlende Menschen spielt die KI.
- **Reparatur:** Weichen die Prüfsummen am Rundenende ab, verteilt der Gastgeber automatisch seinen Spielstand; alle laden ihn
  und spielen die Aktionen danach erneut an.
- **Zeitlimit je Runde** (vom Gastgeber gewählt): Ist die Zeit um, beendet der Server die Runde für alle, die noch nicht fertig sind.
- **Chat** im Spiel (unten links).

## Sicherheit

- Nachrichten werden geprüft: Clients können nur eigene Spielaktionen senden (`command`, `endTurn`); `leave`/`rejoin`
  erzeugt nur der Server. Reparaturen darf nur der Gastgeber auslösen.
- Grenzen: 32 MB je Nachricht (Spielstände), 60 Nachrichten pro Sekunde und Verbindung, 500 Räume.
- Namen werden von HTML-Sonderzeichen befreit; Chattexte werden im Browser nur als Text angezeigt.
- **Grenze des Lockstep-Verfahrens:** Jeder Browser kennt den vollständigen Spielstand. Wer will, kann mit Entwicklerwerkzeugen
  hinter den Nebel schauen. Für Spiele unter Freunden ist das akzeptiert; ein Server, der alles berechnet, wäre ein Neubau.

## Verschlüsselung (wss://) mit einem Reverse-Proxy

Der Relay spricht selbst nur unverschlüsseltes `ws://`. Für den Betrieb im Internet einen Reverse-Proxy mit TLS davorschalten,
z. B. Caddy (holt Zertifikate automatisch):

```caddyfile
spiel.example.org {
	reverse_proxy localhost:8787
}
```

Im Spiel dann `wss://spiel.example.org` als Server eintragen. Mit nginx entsprechend `proxy_pass http://localhost:8787;`
plus `proxy_http_version 1.1;`, `proxy_set_header Upgrade $http_upgrade;` und `proxy_set_header Connection "upgrade";`.
