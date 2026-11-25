import type { FromWorker, ToWorker } from '../protocol';
import { cloneMap, mapTransferables } from '../sim/map';
import { generateWorld, type GeneratedWorld } from '../sim/mapgen';

/**
 * Die Simulation läuft vollständig hier. Der Hauptthread rendert nur und schickt Befehle,
 * damit KI-Züge und Rundenberechnung nie die Darstellung blockieren.
 */
let world: GeneratedWorld | null = null;

function post(msg: FromWorker, transfer: Transferable[] = []): void {
  // Im Worker hat postMessage dieselbe Options-Signatur wie window.postMessage.
  self.postMessage(msg, { transfer });
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'newGame': {
      const t0 = performance.now();
      world = generateWorld(msg.options);
      const genMs = performance.now() - t0;
      // Kopie übertragen (zero-copy für die Kopie), Original bleibt beim Worker.
      const copy = cloneMap(world.map);
      post({ type: 'mapReady', map: copy, starts: world.starts.slice(), genMs }, mapTransferables(copy));
      break;
    }
  }
};
