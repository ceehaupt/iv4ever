// iv4ever – Relay-Server für Online-Spiele (deterministischer Lockstep).
// Der Server rechnet nichts: Er ordnet die Aktionen aller Spieler in eine feste Reihenfolge und verteilt sie.
// Jeder Client rechnet die Simulation selbst; Prüfsummen je Runde decken Abweichungen auf.
//
// Start: npm run server
// Umgebung: PORT (8787), GRACE_MS (Kulanzzeit nach Verbindungsabbruch, 30000), MAX_PLAYERS (8).
// Für TLS (wss://) einen Reverse-Proxy davorschalten, siehe docs/SERVER.md.
import { randomBytes } from 'node:crypto';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT ?? 8787);
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS ?? 8);
const GRACE_MS = Number(process.env.GRACE_MS ?? 30_000);
/** Größte Nachricht (Spielstände beim Fortsetzen/Reparieren können einige MB groß sein). */
const MAX_PAYLOAD = 32 * 1024 * 1024;
/** Höchstens so viele Nachrichten je Verbindung und Sekunde. */
const RATE_LIMIT = 60;
const MAX_ROOMS = 500;

/**
 * Raum: { code, version, players: Seat[], started, seq, log: act[], start: msg, hashes, turnSeconds,
 *         ended: Set<seat>, timer, deadline }
 * Seat: { ws|null, name, seat, token, connected, handedOver, grace }
 */
const rooms = new Map();

function code() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do {
    c = Array.from(randomBytes(5), (b) => chars[b % chars.length]).join('');
  } while (rooms.has(c));
  return c;
}

const send = (ws, msg) => ws && ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));
const broadcast = (room, msg) => room.players.forEach((p) => p.connected && send(p.ws, msg));
const lobby = (room) =>
  broadcast(room, { t: 'lobby', players: room.players.map((p) => ({ seat: p.seat, name: p.name, connected: p.connected })), host: 0 });
const cleanName = (n) => String(n ?? 'Spieler').replace(/[<>&"']/g, '').trim().slice(0, 24) || 'Spieler';
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

/** Geordnete Aktion an alle verteilen und protokollieren (für Wiedereinstieg). */
function act(room, seat, action) {
  const msg = { t: 'act', seq: room.seq++, seat, action };
  room.log.push(msg);
  broadcast(room, msg);
  if (action.kind === 'endTurn' || action.kind === 'leave') {
    room.ended.add(seat);
    maybeNewRound(room);
  }
}

// --- Zeitlimit je Runde -----------------------------------------------------------------------

const activeSeats = (room) => room.players.filter((p) => !p.handedOver);

function startTimer(room) {
  clearTimeout(room.timer);
  room.timer = null;
  if (!room.turnSeconds) return;
  room.deadline = Date.now() + room.turnSeconds * 1000;
  broadcast(room, { t: 'timer', deadline: room.deadline });
  room.timer = setTimeout(() => {
    // Zeit abgelaufen: für alle, die noch nicht fertig sind, die Runde beenden – als geordnete Aktion.
    for (const p of activeSeats(room)) if (!room.ended.has(p.seat)) act(room, p.seat, { kind: 'endTurn' });
  }, room.turnSeconds * 1000);
}

function maybeNewRound(room) {
  if (activeSeats(room).every((p) => room.ended.has(p.seat))) {
    room.ended.clear();
    startTimer(room);
  }
}

// --- Verbindungsabbruch und Wiedereinstieg --------------------------------------------------------

function disconnect(room, me) {
  me.connected = false;
  me.ws = null;
  if (!room.started) {
    room.players = room.players.filter((p) => p !== me);
    room.players.forEach((p, i) => (p.seat = i));
    if (!room.players.length) rooms.delete(room.code);
    else lobby(room);
    return;
  }
  if (!room.players.some((p) => p.connected)) {
    // Niemand mehr da: Raum nach der Kulanzzeit aufräumen.
    clearTimeout(room.timer);
    room.cleanup = setTimeout(() => rooms.delete(room.code), Math.max(GRACE_MS, 60_000));
    return;
  }
  broadcast(room, { t: 'left', seat: me.seat, name: me.name, final: false });
  // Nach der Kulanzzeit übernimmt die KI – als geordnete Aktion, damit alle Clients an derselben Stelle umstellen.
  me.grace = setTimeout(() => {
    if (me.connected || me.handedOver) return;
    me.handedOver = true;
    broadcast(room, { t: 'left', seat: me.seat, name: me.name, final: true });
    act(room, me.seat, { kind: 'leave' });
  }, GRACE_MS);
}

function rejoin(ws, room, me) {
  clearTimeout(me.grace);
  clearTimeout(room.cleanup);
  me.ws = ws;
  me.connected = true;
  send(ws, { t: 'joined', room: room.code, seat: me.seat, host: me.seat === 0, token: me.token });
  send(ws, room.start);
  // Nach einer Reparatur: deren Stand laden und nur die Aktionen danach nachspielen.
  if (room.snapshot) send(ws, { t: 'resync', ...room.snapshot });
  send(ws, { t: 'replay', acts: room.snapshot ? room.log.filter((a) => a.seq > room.snapshot.upto) : room.log });
  if (room.deadline && room.timer) send(ws, { t: 'timer', deadline: room.deadline });
  broadcast(room, { t: 'back', seat: me.seat, name: me.name });
  if (me.handedOver) {
    me.handedOver = false;
    act(room, me.seat, { kind: 'rejoin' });
  }
}

// --- Server ------------------------------------------------------------------------------------

const wss = new WebSocketServer({ port: PORT, maxPayload: MAX_PAYLOAD });
wss.on('connection', (ws) => {
  let room = null;
  let me = null;
  let window = { start: Date.now(), count: 0 };
  ws.on('message', (data) => {
    // Ratenbegrenzung
    const now = Date.now();
    if (now - window.start > 1000) window = { start: now, count: 0 };
    if (++window.count > RATE_LIMIT) return send(ws, { t: 'error', text: 'Zu viele Nachrichten' });
    let msg;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
    switch (msg.t) {
      case 'create': {
        if (room) return;
        if (rooms.size >= MAX_ROOMS) return send(ws, { t: 'error', text: 'Server ist voll' });
        const c = code();
        room = { code: c, version: str(msg.version, 64), players: [], started: false, seq: 0, log: [], start: null,
          hashes: new Map(), turnSeconds: 0, ended: new Set(), timer: null, deadline: 0 };
        rooms.set(c, room);
        me = { ws, name: cleanName(msg.name), seat: 0, token: randomBytes(16).toString('hex'), connected: true, handedOver: false };
        room.players.push(me);
        send(ws, { t: 'joined', room: c, seat: 0, host: true, token: me.token });
        lobby(room);
        break;
      }
      case 'join': {
        if (room) return;
        const r = rooms.get(str(msg.room, 8).toUpperCase());
        if (!r) return send(ws, { t: 'error', text: 'Raum nicht gefunden' });
        if (r.version !== str(msg.version, 64)) return send(ws, { t: 'error', text: `Andere Spielversion (Raum: ${r.version || '?'}, du: ${str(msg.version, 64) || '?'})` });
        if (r.started) return send(ws, { t: 'error', text: 'Das Spiel läuft bereits' });
        if (r.players.length >= MAX_PLAYERS) return send(ws, { t: 'error', text: 'Der Raum ist voll' });
        room = r;
        me = { ws, name: cleanName(msg.name), seat: r.players.length, token: randomBytes(16).toString('hex'), connected: true, handedOver: false };
        r.players.push(me);
        send(ws, { t: 'joined', room: r.code, seat: me.seat, host: false, token: me.token });
        lobby(r);
        break;
      }
      case 'rejoin': {
        if (room) return;
        const r = rooms.get(str(msg.room, 8).toUpperCase());
        const seat = r?.players.find((p) => p.seat === msg.seat && p.token === msg.token);
        if (!r || !seat || !r.started) return send(ws, { t: 'error', text: 'Wiedereinstieg nicht möglich (Raum beendet oder unbekannt)' });
        if (seat.connected) return send(ws, { t: 'error', text: 'Dieser Platz ist schon verbunden' });
        if (r.version !== str(msg.version, 64)) return send(ws, { t: 'error', text: 'Andere Spielversion' });
        room = r;
        me = seat;
        rejoin(ws, r, seat);
        break;
      }
      case 'start': {
        if (!room || me.seat !== 0 || room.started) return;
        room.started = true;
        room.turnSeconds = Math.max(0, Math.min(3600, Number(msg.turnSeconds) || 0));
        const options = { ...(msg.options && typeof msg.options === 'object' ? msg.options : {}), humans: room.players.length, mode: 'online' };
        room.start = { t: 'start', options, names: room.players.map((p) => p.name), save: typeof msg.save === 'string' ? msg.save : undefined,
          turnSeconds: room.turnSeconds };
        broadcast(room, room.start);
        startTimer(room);
        break;
      }
      case 'act': {
        // Aktion eines Spielers: mit fortlaufender Nummer an alle (auch den Absender) zurück.
        if (!room || !room.started || !msg.action || typeof msg.action !== 'object') return;
        const kind = msg.action.kind;
        if (kind !== 'command' && kind !== 'endTurn') return; // leave/rejoin erzeugt nur der Server
        if (kind === 'endTurn' && room.ended.has(me.seat)) return;
        act(room, me.seat, msg.action);
        break;
      }
      case 'hash': {
        if (!room || !room.started) return;
        const turn = Number(msg.turn);
        const per = room.hashes.get(turn) ?? new Map();
        per.set(me.seat, str(msg.hash, 32));
        room.hashes.set(turn, per);
        const expected = room.players.filter((p) => p.connected).length;
        if (per.size >= expected) {
          if (new Set(per.values()).size > 1) broadcast(room, { t: 'desync', turn, upto: room.seq - 1 });
          room.hashes.delete(turn);
        }
        break;
      }
      case 'resync': {
        // Nur der Gastgeber: sein Spielstand gilt; geht geordnet an alle (samt Aktionsnummer, bis zu der er reicht).
        if (!room || me.seat !== 0 || typeof msg.save !== 'string') return;
        room.snapshot = { upto: Number(msg.upto), save: msg.save };
        broadcast(room, { t: 'resync', ...room.snapshot });
        break;
      }
      case 'chat': {
        if (!room) return;
        const text = str(msg.text, 300).trim();
        if (text) broadcast(room, { t: 'chat', seat: me.seat, name: me.name, text });
        break;
      }
    }
  });
  ws.on('close', () => {
    if (room && me) disconnect(room, me);
  });
});
console.log(`iv4ever Relay läuft auf ws://localhost:${PORT} (bis ${MAX_PLAYERS} Spieler, Kulanzzeit ${GRACE_MS / 1000} s)`);
