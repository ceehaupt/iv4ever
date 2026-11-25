import { defineConfig } from 'vite';

export default defineConfig({
  worker: { format: 'es' },
  // Standard-Aufteilung beibehalten: Pixi lädt WebGPU-/Canvas-Renderer nur bei Bedarf nach,
  // das Handbuch ist ein eigener, erst beim Öffnen geladener Chunk.
  build: { target: 'es2022' },
});
