/// <reference types="node" />
import { type ChildProcess, spawn } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';

// Startet den echten Relay-Server (server/relay.mjs) und spricht ihn mit WebSocket-Clients an.
const PORT = 8800 + Math.floor(Math.random() * 100);
let server: ChildProcess;

beforeAll(async () => {
  server = spawn(process.execPath, ['server/relay.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
  await new Promise<void>((resolve) => server.stdout!.on('data', () => resolve()));
});
afterAll(() => {
  server.kill();
});

type Msg = Record<string, unknown> & { t: string };

/** Client mit Nachrichtenpuffer, damit keine Nachricht zwischen zwei Erwartungen verloren geht. */
async function client(): Promise<{ ws: WebSocket; send: (m: object) => void; next: (t: string) => Promise<Msg> }> {
  const ws = new WebSocket(`ws://localhost:${PORT}`);
  const inbox: Msg[] = [];
  const waiters: (() => void)[] = [];
  ws.on('message', (d) => {
    inbox.push(JSON.parse(String(d)) as Msg);
    waiters.splice(0).forEach((w) => w());
  });
  await new Promise((r) => ws.once('open', r));
  const next = async (t: string): Promise<Msg> => {
    for (;;) {
      const i = inbox.findIndex((m) => m.t === t);
      if (i >= 0) return inbox.splice(i, 1)[0];
      await new Promise<void>((r) => waiters.push(r));
    }
  };
  return { ws, send: (m) => ws.send(JSON.stringify(m)), next };
}

describe('Relay-Server', () => {
  it('ordnet Aktionen, verteilt sie an alle und meldet einen Abgang als geordnete Aktion', async () => {
    const a = await client();
    a.send({ t: 'create', name: 'Ada' });
    const joined = await a.next('joined');
    expect(joined.host).toBe(true);

    const b = await client();
    b.send({ t: 'join', room: String(joined.room).toLowerCase(), name: 'Bo' });
    expect((await b.next('joined')).seat).toBe(1);

    a.send({ t: 'start', options: { seed: 1 } });
    const start = await b.next('start');
    expect((start.options as { humans: number }).humans).toBe(2);

    a.send({ t: 'act', action: { kind: 'endTurn' } });
    b.send({ t: 'act', action: { kind: 'endTurn' } });
    const [a1, a2] = [await a.next('act'), await a.next('act')];
    expect([a1.seq, a2.seq]).toEqual([0, 1]);
    expect((await b.next('act')).seq).toBe(0);

    // Gast trennt die Verbindung → Gastgeber bekommt „left“ und eine geordnete leave-Aktion.
    b.ws.close();
    expect((await a.next('left')).seat).toBe(1);
    const leave = await a.next('act');
    expect(leave).toMatchObject({ seq: 2, seat: 1, action: { kind: 'leave' } });
    a.ws.close();
  });

  it('lehnt unbekannte Räume ab', async () => {
    const c = await client();
    c.send({ t: 'join', room: 'XXXXX', name: 'Cy' });
    expect((await c.next('error')).text).toBe('Raum nicht gefunden');
    c.ws.close();
  });
});
