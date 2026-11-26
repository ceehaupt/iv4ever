import type { NewGameOptions, RemoteAction } from '../protocol';

/** Nachrichten des Relay-Servers (server/relay.mjs). */
type ServerMsg =
  | { t: 'joined'; room: string; seat: number; host: boolean; token: string }
  | { t: 'lobby'; players: { seat: number; name: string; connected: boolean }[] }
  | { t: 'start'; options: NewGameOptions; names: string[]; save?: string; turnSeconds?: number }
  | { t: 'act'; seq: number; seat: number; action: RemoteAction }
  | { t: 'replay'; acts: LoggedAction[] }
  | { t: 'resync'; upto: number; save: string }
  | { t: 'desync'; turn: number; upto: number }
  | { t: 'left'; seat: number; name: string; final: boolean }
  | { t: 'back'; seat: number; name: string }
  | { t: 'chat'; seat: number; name: string; text: string }
  | { t: 'timer'; deadline: number }
  | { t: 'error'; text: string };

export interface LoggedAction {
  seq: number;
  seat: number;
  action: RemoteAction;
}

export interface OnlineEvents {
  onJoined(room: string, seat: number, host: boolean): void;
  onLobby(players: { seat: number; name: string; connected: boolean }[]): void;
  onStart(options: NewGameOptions, names: string[], save: string | undefined): void;
  onAction(seat: number, action: RemoteAction): void;
  /** Mehrere Aktionen auf einmal (Wiedereinstieg, nach Reparatur). */
  onReplay(acts: LoggedAction[]): void;
  /** Stand des Gastgebers übernehmen; danach `onReplay` mit allen späteren Aktionen. */
  onResync(save: string): void;
  onDesync(turn: number): void;
  onLeft(name: string, final: boolean): void;
  onBack(name: string): void;
  onChat(name: string, text: string, own: boolean): void;
  onTimer(deadline: number): void;
  onError(text: string): void;
}

/** Gemerkte Sitzung für den Wiedereinstieg nach Abbruch oder Neuladen. */
export interface OnlineSession {
  url: string;
  room: string;
  seat: number;
  token: string;
  name: string;
}

const SESSION_KEY = 'iv4ever-online-session';

export function savedSession(): OnlineSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as OnlineSession) : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

/**
 * Verbindung zum Relay. Aktionen werden nie lokal vorweg ausgeführt: Erst wenn der Server sie in der
 * festen Reihenfolge zurückschickt, gehen sie an die Simulation – auf allen Rechnern gleich.
 */
export class OnlineClient {
  private ws: WebSocket | null = null;
  seat = -1;
  room = '';
  host = false;
  private url = '';
  private name = '';
  private expectedSeq = 0;
  /** Alle angewandten Aktionen seit dem Start bzw. der letzten Reparatur (zum Nachspielen nach einer Reparatur). */
  private log: LoggedAction[] = [];
  readonly version = __APP_VERSION__;

  constructor(private readonly ev: OnlineEvents) {}

  get connected(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  /** Nummer der zuletzt angewandten Aktion (für Reparaturen). */
  get lastSeq(): number {
    return this.expectedSeq - 1;
  }

  connect(url: string, name: string): Promise<void> {
    this.close();
    this.url = url;
    this.name = name;
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error(`Keine Verbindung zu ${url}`));
      ws.onclose = () => {
        if (this.ws === ws) this.ev.onError('Verbindung zum Server getrennt – über „Online …“ kannst du wieder beitreten');
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
        this.host = m.host;
        localStorage.setItem(SESSION_KEY, JSON.stringify({ url: this.url, room: m.room, seat: m.seat, token: m.token, name: this.name } satisfies OnlineSession));
        this.ev.onJoined(m.room, m.seat, m.host);
        break;
      case 'lobby':
        this.ev.onLobby(m.players);
        break;
      case 'start':
        this.expectedSeq = 0;
        this.log = [];
        if (m.turnSeconds) this.ev.onTimer(0);
        this.ev.onStart(m.options, m.names, m.save);
        break;
      case 'act':
        if (m.seq !== this.expectedSeq) this.ev.onError(`Aktion ${m.seq} außer der Reihe (erwartet ${this.expectedSeq})`);
        this.expectedSeq = m.seq + 1;
        this.log.push(m);
        this.ev.onAction(m.seat, m.action);
        break;
      case 'replay':
        if (!m.acts.length) break;
        this.expectedSeq = m.acts[m.acts.length - 1].seq + 1;
        this.log.push(...m.acts);
        this.ev.onReplay(m.acts);
        break;
      case 'resync': {
        // Stand des Gastgebers laden, dann alle Aktionen danach erneut anwenden.
        this.ev.onResync(m.save);
        const later = this.log.filter((a) => a.seq > m.upto);
        this.log = later;
        if (later.length) this.ev.onReplay(later);
        break;
      }
      case 'desync':
        this.ev.onDesync(m.turn);
        break;
      case 'left':
        this.ev.onLeft(m.name, m.final);
        break;
      case 'back':
        this.ev.onBack(m.name);
        break;
      case 'chat':
        this.ev.onChat(m.name, m.text, m.seat === this.seat);
        break;
      case 'timer':
        this.ev.onTimer(m.deadline);
        break;
      case 'error':
        this.ev.onError(m.text);
        break;
    }
  }

  private send(msg: object): void {
    if (this.connected) this.ws!.send(JSON.stringify(msg));
  }

  create(): void {
    this.send({ t: 'create', name: this.name, version: this.version });
  }

  join(room: string): void {
    this.send({ t: 'join', room, name: this.name, version: this.version });
  }

  /** Nach Abbruch oder Neuladen auf den alten Platz zurück. */
  async rejoin(session: OnlineSession): Promise<void> {
    await this.connect(session.url, session.name);
    this.send({ t: 'rejoin', room: session.room, seat: session.seat, token: session.token, version: this.version });
  }

  start(options: NewGameOptions, save?: string, turnSeconds = 0): void {
    this.send({ t: 'start', options, save, turnSeconds });
  }

  act(action: RemoteAction): void {
    this.send({ t: 'act', action });
  }

  hash(turn: number, hash: string): void {
    this.send({ t: 'hash', turn, hash });
  }

  /** Nur Gastgeber: eigener Stand gilt für alle (nach erkannter Abweichung). `upto` = letzte Aktion im Stand. */
  resync(save: string, upto: number): void {
    this.send({ t: 'resync', upto, save });
  }

  chat(text: string): void {
    this.send({ t: 'chat', text });
  }
}
