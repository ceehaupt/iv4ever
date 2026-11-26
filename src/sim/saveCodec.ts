// Spielstand ⇄ Text (JSON mit Base64 für typisierte Arrays): für das Online-Spiel (Wiedereinstieg, Fortsetzen,
// Reparatur abweichender Stände) und für den Export/Import als Datei. Läuft im Browser, im Worker und in Node.
import type { SaveData } from './save';

const TYPED = { Uint8Array, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array, Float32Array, Float64Array } as const;
type TypedName = keyof typeof TYPED;

/** Kennung des Dateiformats (erste Zeile des JSON). */
export const SAVE_FILE_KIND = 'iv4ever-save';

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeSave(data: SaveData): string {
  return JSON.stringify({ kind: SAVE_FILE_KIND, data }, (_key, value: unknown) => {
    if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
      const name = value.constructor.name as TypedName;
      if (!(name in TYPED)) throw new Error(`Unbekannter Array-Typ ${name}`);
      const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      return { __typed: name, b64: toBase64(bytes) };
    }
    return value;
  });
}

export function decodeSave(text: string): SaveData {
  const parsed = JSON.parse(text, (_key, value: unknown) => {
    if (value && typeof value === 'object' && '__typed' in value && 'b64' in value) {
      const { __typed, b64 } = value as { __typed: TypedName; b64: string };
      const Ctor = TYPED[__typed];
      if (!Ctor) throw new Error(`Unbekannter Array-Typ ${__typed}`);
      const bytes = fromBase64(b64);
      return new Ctor(bytes.buffer as ArrayBuffer, 0, bytes.byteLength / Ctor.BYTES_PER_ELEMENT);
    }
    return value;
  }) as { kind?: string; data?: SaveData };
  if (parsed?.kind !== SAVE_FILE_KIND || !parsed.data) throw new Error('Keine iv4ever-Spielstanddatei');
  return parsed.data;
}
