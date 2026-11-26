import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// Spielversion für das Online-Spiel: Paketversion + Git-Stand. Nur gleiche Versionen dürfen zusammen spielen.
function appVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
  let rev = 'dev';
  try {
    rev = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    // ohne Git (z. B. entpacktes Archiv)
  }
  return `${pkg.version}+${rev}`;
}

export default defineConfig({
  worker: { format: 'es' },
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  // Standard-Aufteilung beibehalten: Pixi lädt WebGPU-/Canvas-Renderer nur bei Bedarf nach,
  // das Handbuch ist ein eigener, erst beim Öffnen geladener Chunk.
  build: { target: 'es2022' },
});
