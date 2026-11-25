// iv4ever – Relay-Server für Online-Spiele (deterministischer Lockstep).
// Der Server rechnet nichts: Er ordnet die Aktionen aller Spieler in eine feste Reihenfolge und verteilt sie.
// Jeder Client rechnet die Simulation selbst; Prüfsummen je Runde decken Abweichungen auf.
//
// Start: npm run server   (Port über PORT, Standard 8787)
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT ?? 8787);
const MAX_PLAYERS = 4;
const rooms = new Map(); // code → { host, players: [{ ws, name, seat }], started, seq, options, hashes: Map<turn, Map<seat, hash>> }

function code() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do {
    c = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(c));
  return c;
}

const send = (ws, msg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));
const broadcast = (room, msg) => room.players.forEach((p) => send(p.ws, msg));
const lobby = (room) => broadcast(room, { t: 'lobby', players: room.players.map((p) => ({ seat: p.seat, name: p.name })), host: 0 });

const wss = new WebSocketServer({ port: PORT });
wss.on('connection', (ws) => {
  let room = null;
  let me = null;
  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    switch (msg.t) {
      case 'create': {
        const c = code();
        room = { code: c, players: [], started: false, seq: 0, options: null, hashes: new Map() };
        rooms.set(c, room);
        me = { ws, name: String(msg.name ?? 'Spieler').slice(0, 24), seat: 0 };
        room.players.push(me);
        send(ws, { t: 'joined', room: c, seat: 0, host: true });
        lobby(room);
        break;
      }
      case 'join': {
        const r = rooms.get(String(msg.room ?? '').toUpperCase());
        if (!r) return send(ws, { t: 'error', text: 'Raum nicht gefunden' });
        if (r.started) return send(ws, { t: 'error', text: 'Das Spiel läuft bereits' });
        if (r.players.length >= MAX_PLAYERS) return send(ws, { t: 'error', text: 'Der Raum ist voll' });
        room = r;
        me = { ws, name: String(msg.name ?? 'Spieler').slice(0, 24), seat: r.players.length };
        r.players.push(me);
        send(ws, { t: 'joined', room: r.code, seat: me.seat, host: false });
        lobby(r);
        break;
      }
      case 'start': {
        if (!room || me.seat !== 0 || room.started) return;
        room.started = true;
        room.options = { ...msg.options, humans: room.players.length, mode: 'online' };
        broadcast(room, { t: 'start', options: room.options, names: room.players.map((p) => p.name) });
        break;
      }
      case 'act': {
        // Aktion eines Spielers: mit fortlaufender Nummer an alle (auch den Absender) zurück.
        if (!room || !room.started) return;
        broadcast(room, { t: 'act', seq: room.seq++, seat: me.seat, action: msg.action });
        break;
      }
      case 'hash': {
        if (!room) return;
        const per = room.hashes.get(msg.turn) ?? new Map();
        per.set(me.seat, msg.hash);
        room.hashes.set(msg.turn, per);
        if (per.size === room.players.length) {
          if (new Set(per.values()).size > 1) broadcast(room, { t: 'desync', turn: msg.turn });
          room.hashes.delete(msg.turn);
        }
        break;
      }
    }
  });
  ws.on('close', () => {
    if (!room) return;
    room.players = room.players.filter((p) => p !== me);
    if (!room.players.length) rooms.delete(room.code);
    else broadcast(room, { t: 'left', seat: me.seat, name: me.name });
    if (!room.started) lobby(room);
  });
});
console.log(`iv4ever Relay läuft auf ws://localhost:${PORT}`);
