import type { NewGameOptions, RemoteAction } from '../protocol';

/** Nachrichten des Relay-Servers (server/relay.mjs). */
type ServerMsg =
  | { t: 'joined'; room: string; seat: number; host: boolean }
  | { t: 'lobby'; players: { seat: number; name: string }[] }
  | { t: 'start'; options: NewGameOptions; names: string[] }
  | { t: 'act'; seq: number; seat: number; action: RemoteAction }
  | { t: 'desync'; turn: number }
  | { t: 'left'; seat: number; name: string }
  | { t: 'error'; text: string };

export interface OnlineEvents {
  onJoined(room: string, seat: number, host: boolean): void;
  onLobby(players: { seat: number; name: string }[]): void;
  onStart(options: NewGameOptions, names: string[]): void;
  onAction(seat: number, action: RemoteAction): void;
  onDesync(turn: number): void;
  onLeft(name: string): void;
  onError(text: string): void;
}

/**
 * Verbindung zum Relay. Aktionen werden nie lokal vorweg ausgeführt: Erst wenn der Server sie in der
 * festen Reihenfolge zurückschickt, gehen sie an die Simulation – auf allen Rechnern gleich.
 */
export class OnlineClient {
  private ws: WebSocket | null = null;
  seat = -1;
  room = '';
  private expectedSeq = 0;

  constructor(private readonly ev: OnlineEvents) {}

  get connected(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  connect(url: string): Promise<void> {
    this.close();
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error(`Keine Verbindung zu ${url}`));
      ws.onclose = () => {
        if (this.ws === ws) this.ev.onError('Verbindung zum Server getrennt');
      };
      ws.onmessage = (e) => this.handle(JSON.parse(String(e.data)) as ServerMsg);
    });
  }

  close(): void {
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }

  private handle(m: ServerMsg): void {
    switch (m.t) {
      case 'joined':
        this.seat = m.seat;
        this.room = m.room;
        this.ev.onJoined(m.room, m.seat, m.host);
        break;
      case 'lobby':
        this.ev.onLobby(m.players);
        break;
      case 'start':
        this.expectedSeq = 0;
        this.ev.onStart(m.options, m.names);
        break;
      case 'act':
        if (m.seq !== this.expectedSeq) this.ev.onError(`Aktion ${m.seq} außer der Reihe (erwartet ${this.expectedSeq})`);
        this.expectedSeq = m.seq + 1;
        this.ev.onAction(m.seat, m.action);
        break;
      case 'desync':
        this.ev.onDesync(m.turn);
        break;
      case 'left':
        this.ev.onLeft(m.name);
        break;
      case 'error':
        this.ev.onError(m.text);
        break;
    }
  }

  private send(msg: object): void {
    if (this.connected) this.ws!.send(JSON.stringify(msg));
  }

  create(name: string): void {
    this.send({ t: 'create', name });
  }

  join(room: string, name: string): void {
    this.send({ t: 'join', room, name });
  }

  start(options: NewGameOptions): void {
    this.send({ t: 'start', options });
  }

  act(action: RemoteAction): void {
    this.send({ t: 'act', action });
  }

  hash(turn: number, hash: string): void {
    this.send({ t: 'hash', turn, hash });
  }
}
