import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RemoteAction } from '../protocol';
import { type LoggedAction, OnlineClient, type OnlineEvents } from './online';

/** Minimaler WebSocket-Ersatz: Nachrichten des „Servers“ werden direkt eingespeist. */
class FakeSocket {
  static last: FakeSocket;
  static OPEN = 1;
  readyState = 1;
  OPEN = 1;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    FakeSocket.last = this;
    queueMicrotask(() => this.onopen?.());
  }
  send(d: string) {
    this.sent.push(JSON.parse(d));
  }
  close() {}
  emit(msg: object) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

const store = new Map<string, string>();
beforeEach(() => {
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
});
afterEach(() => vi.unstubAllGlobals());

function events() {
  const calls: string[] = [];
  const ev: OnlineEvents = {
    onJoined: () => calls.push('joined'),
    onLobby: () => {},
    onStart: () => calls.push('start'),
    onAction: (seat: number, a: RemoteAction) => calls.push(`act:${seat}:${a.kind}`),
    onReplay: (acts: LoggedAction[]) => calls.push(`replay:${acts.map((a) => a.seq).join(',')}`),
    onResync: (save: string) => calls.push(`resync:${save}`),
    onDesync: () => {},
    onLeft: () => {},
    onBack: () => {},
    onChat: () => {},
    onTimer: () => {},
    onError: (t: string) => calls.push(`error:${t}`),
  };
  return { calls, ev };
}

describe('Online-Client', () => {
  it('merkt sich die Sitzung für den Wiedereinstieg', async () => {
    const { ev } = events();
    const c = new OnlineClient(ev);
    await c.connect('ws://x', 'Ada');
    FakeSocket.last.emit({ t: 'joined', room: 'ABCDE', seat: 1, host: false, token: 't0k' });
    expect(JSON.parse(store.get('iv4ever-online-session')!)).toMatchObject({ room: 'ABCDE', seat: 1, token: 't0k', name: 'Ada' });
  });

  it('Reparatur: Stand des Gastgebers laden, danach nur die späteren Aktionen erneut anwenden', async () => {
    const { calls, ev } = events();
    const c = new OnlineClient(ev);
    await c.connect('ws://x', 'Bo');
    const s = FakeSocket.last;
    s.emit({ t: 'start', options: {}, names: [] });
    s.emit({ t: 'act', seq: 0, seat: 0, action: { kind: 'endTurn' } });
    s.emit({ t: 'act', seq: 1, seat: 1, action: { kind: 'endTurn' } });
    s.emit({ t: 'act', seq: 2, seat: 0, action: { kind: 'endTurn' } });
    s.emit({ t: 'resync', upto: 1, save: 'STAND' });
    expect(calls).toEqual(['start', 'act:0:endTurn', 'act:1:endTurn', 'act:0:endTurn', 'resync:STAND', 'replay:2']);
    expect(c.lastSeq).toBe(2);
  });

  it('meldet Aktionen außer der Reihe', async () => {
    const { calls, ev } = events();
    const c = new OnlineClient(ev);
    await c.connect('ws://x', 'Bo');
    FakeSocket.last.emit({ t: 'start', options: {}, names: [] });
    FakeSocket.last.emit({ t: 'act', seq: 3, seat: 0, action: { kind: 'endTurn' } });
    expect(calls.some((x) => x.startsWith('error:Aktion 3 außer der Reihe'))).toBe(true);
  });
});
