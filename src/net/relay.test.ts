/// <reference types="node" />
import { type ChildProcess, spawn } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';

// Startet den echten Relay-Server (server/relay.mjs) mit kurzer Kulanzzeit und spricht ihn mit WebSocket-Clients an.
const PORT = 8800 + Math.floor(Math.random() * 100);
const GRACE_MS = 300;
const V = 'test-1';
let server: ChildProcess;

beforeAll(async () => {
  server = spawn(process.execPath, ['server/relay.mjs'], { env: { ...process.env, PORT: String(PORT), GRACE_MS: String(GRACE_MS) }, stdio: 'pipe' });
  await new Promise<void>((resolve) => server.stdout!.on('data', () => resolve()));
});
afterAll(() => {
  server.kill();
});

type Msg = Record<string, unknown> & { t: string };
interface Client {
  ws: WebSocket;
  send: (m: object) => void;
  next: (t: string, timeout?: number) => Promise<Msg>;
  none: (t: string, ms: number) => Promise<boolean>;
}

/** Client mit Nachrichtenpuffer, damit keine Nachricht zwischen zwei Erwartungen verloren geht. */
async function client(): Promise<Client> {
  const ws = new WebSocket(`ws://localhost:${PORT}`);
  const inbox: Msg[] = [];
  const waiters: (() => void)[] = [];
  ws.on('message', (d: WebSocket.RawData) => {
    inbox.push(JSON.parse(String(d)) as Msg);
    waiters.splice(0).forEach((w) => w());
  });
  await new Promise((r) => ws.once('open', r));
  const next = async (t: string, timeout = 3000): Promise<Msg> => {
    const until = Date.now() + timeout;
    for (;;) {
      const i = inbox.findIndex((m) => m.t === t);
      if (i >= 0) return inbox.splice(i, 1)[0];
      if (Date.now() > until) throw new Error(`Keine Nachricht „${t}“`);
      await Promise.race([new Promise<void>((r) => waiters.push(r)), new Promise((r) => setTimeout(r, 50))]);
    }
  };
  const none = async (t: string, ms: number) => {
    await new Promise((r) => setTimeout(r, ms));
    return !inbox.some((m) => m.t === t);
  };
  return { ws, send: (m) => ws.send(JSON.stringify(m)), next, none };
}

/** Raum mit zwei Spielern, gestartet. */
async function game(start: object = {}): Promise<{ a: Client; b: Client; room: string; tokenB: string }> {
  const a = await client();
  a.send({ t: 'create', name: 'Ada', version: V });
  const joined = await a.next('joined');
  const b = await client();
  b.send({ t: 'join', room: String(joined.room), name: 'Bo', version: V });
  const jb = await b.next('joined');
  a.send({ t: 'start', options: { seed: 1 }, ...start });
  await a.next('start');
  await b.next('start');
  return { a, b, room: String(joined.room), tokenB: String(jb.token) };
}

describe('Relay-Server', () => {
  it('ordnet Aktionen und verteilt sie an alle', async () => {
    const { a, b } = await game();
    a.send({ t: 'act', action: { kind: 'endTurn' } });
    b.send({ t: 'act', action: { kind: 'endTurn' } });
    expect([(await a.next('act')).seq, (await a.next('act')).seq]).toEqual([0, 1]);
    expect((await b.next('act')).seq).toBe(0);
    a.ws.close();
    b.ws.close();
  });

  it('lehnt fremde Spielversionen und unbekannte Räume ab', async () => {
    const a = await client();
    a.send({ t: 'create', name: 'Ada', version: V });
    const { room } = await a.next('joined');
    const b = await client();
    b.send({ t: 'join', room, name: 'Bo', version: 'alt' });
    expect(String((await b.next('error')).text)).toContain('Andere Spielversion');
    b.send({ t: 'join', room: 'XXXXX', name: 'Bo', version: V });
    expect((await b.next('error')).text).toBe('Raum nicht gefunden');
    a.ws.close();
    b.ws.close();
  });

  it('Clients können keine Server-Aktionen (leave/rejoin) fälschen', async () => {
    const { a, b } = await game();
    a.send({ t: 'act', action: { kind: 'leave' } });
    expect(await b.none('act', 200)).toBe(true);
    a.ws.close();
    b.ws.close();
  });

  it('Wiedereinstieg innerhalb der Kulanzzeit: keine KI-Übernahme, Aktionen werden nachgespielt', async () => {
    const { a, b, room, tokenB } = await game();
    a.send({ t: 'act', action: { kind: 'command', command: { type: 'skip', unit: 1 } } });
    await a.next('act');
    b.ws.close();
    expect((await a.next('left')).final).toBe(false);
    const b2 = await client();
    b2.send({ t: 'rejoin', room, seat: 1, token: tokenB, version: V });
    expect((await b2.next('joined')).seat).toBe(1);
    await b2.next('start');
    const replay = await b2.next('replay');
    expect((replay.acts as Msg[]).map((x) => x.seq)).toEqual([0]);
    await a.next('back');
    expect(await a.none('act', GRACE_MS + 200)).toBe(true);
    a.ws.close();
    b2.ws.close();
  });

  it('nach der Kulanzzeit übernimmt die KI; ein späterer Wiedereinstieg gibt den Platz zurück', async () => {
    const { a, b, room, tokenB } = await game();
    b.ws.close();
    await a.next('left');
    expect((await a.next('left', GRACE_MS + 1000)).final).toBe(true);
    expect(await a.next('act')).toMatchObject({ seq: 0, seat: 1, action: { kind: 'leave' } });
    const b2 = await client();
    b2.send({ t: 'rejoin', room, seat: 1, token: 'falsch', version: V });
    expect(String((await b2.next('error')).text)).toContain('Wiedereinstieg nicht möglich');
    b2.send({ t: 'rejoin', room, seat: 1, token: tokenB, version: V });
    await b2.next('joined');
    expect((await b2.next('replay')).acts).toHaveLength(1);
    expect(await a.next('act')).toMatchObject({ seq: 1, seat: 1, action: { kind: 'rejoin' } });
    a.ws.close();
    b2.ws.close();
  });

  it('Zeitlimit: Wer nicht fertig ist, dessen Runde beendet der Server', async () => {
    const { a, b } = await game({ turnSeconds: 1 });
    expect(Number((await a.next('timer')).deadline)).toBeGreaterThan(Date.now());
    a.send({ t: 'act', action: { kind: 'endTurn' } });
    expect(await a.next('act')).toMatchObject({ seat: 0, action: { kind: 'endTurn' } });
    expect(await a.next('act', 2500)).toMatchObject({ seat: 1, action: { kind: 'endTurn' } });
    // Neue Runde → neuer Timer.
    await a.next('timer');
    a.ws.close();
    b.ws.close();
  });

  it('Chat und Reparatur: der Stand des Gastgebers gilt auch für spätere Wiedereinsteiger', async () => {
    const { a, b, room, tokenB } = await game();
    b.send({ t: 'chat', text: '  Hallo <b>!  ' });
    expect(await a.next('chat')).toMatchObject({ seat: 1, name: 'Bo', text: 'Hallo <b>!' });
    a.send({ t: 'act', action: { kind: 'endTurn' } });
    await a.next('act');
    b.send({ t: 'resync', upto: 0, save: 'X' }); // nur der Gastgeber darf
    expect(await a.none('resync', 150)).toBe(true);
    a.send({ t: 'resync', upto: 0, save: 'STAND' });
    expect(await b.next('resync')).toMatchObject({ upto: 0, save: 'STAND' });
    a.send({ t: 'act', action: { kind: 'command', command: { type: 'skip', unit: 2 } } });
    await a.next('act');
    b.ws.close();
    await a.next('left');
    const b2 = await client();
    b2.send({ t: 'rejoin', room, seat: 1, token: tokenB, version: V });
    await b2.next('start');
    expect((await b2.next('resync')).save).toBe('STAND');
    expect(((await b2.next('replay')).acts as Msg[]).map((x) => x.seq)).toEqual([1]);
    a.ws.close();
    b2.ws.close();
  });
});
