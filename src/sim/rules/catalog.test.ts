/// <reference types="node" />
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { catalogMarkdown } from './catalog';

// docs/REGELN-DATEN.md wird aus den Regeltabellen erzeugt. `npm run docs` schreibt sie neu;
// dieser Test schlägt fehl, wenn jemand Regeln ändert und die Datei nicht aktualisiert.
const FILE = new URL('../../../docs/REGELN-DATEN.md', import.meta.url);

describe('Spieldaten-Dokumentation', () => {
  it('docs/REGELN-DATEN.md ist aktuell', () => {
    const md = catalogMarkdown();
    if (process.env.UPDATE_DOCS) writeFileSync(FILE, md);
    expect(readFileSync(FILE, 'utf8')).toBe(md);
  });
});
