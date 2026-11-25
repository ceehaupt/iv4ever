import './style.css';
import type { FromWorker, ToWorker } from './protocol';
import { GameRenderer, isTyping } from './render/renderer';
import type { GameMap } from './sim/map';
import { Hud } from './ui/hud';
import { Minimap } from './ui/minimap';

const worker = new Worker(new URL('./worker/sim.worker.ts', import.meta.url), { type: 'module' });
const send = (msg: ToWorker) => worker.postMessage(msg);

let map: GameMap | null = null;
let mapStats = '';
let startTile = -1;

const hud = new Hud();
const minimap = new Minimap(document.getElementById('minimap') as HTMLCanvasElement, (x, y) =>
  renderer.centerOn(x, y),
);
const renderer = new GameRenderer(document.getElementById('game')!, {
  onHover: (i) => hud.hoverTile(map, i),
  onSelect: (i) => (i >= 0 ? hud.selectTile(map, i) : hud.selectTile(null, -1)),
  onFrame: () => {
    minimap.draw(renderer.viewRect());
    hud.setStats(`${mapStats} · Frame ${renderer.lastRenderMs.toFixed(1)} ms`);
  },
});
await renderer.init();

worker.onmessage = (e: MessageEvent<FromWorker>) => {
  const msg = e.data;
  if (msg.type === 'mapReady') {
    map = msg.map;
    const t0 = performance.now();
    hud.setStarts(msg.starts);
    startTile = msg.starts[0] ?? -1;
    renderer.setMap(map, msg.starts);
    minimap.setMap(map, msg.starts);
    const buildMs = performance.now() - t0;
    mapStats = `${map.width}×${map.height} · Generierung ${msg.genMs.toFixed(0)} ms · Aufbau ${buildMs.toFixed(0)} ms`;
  }
};

hud.onNewMap = (options) => send({ type: 'newGame', options });

window.addEventListener('keydown', (e) => {
  if (isTyping(e) || e.metaKey || e.ctrlKey) return;
  const k = e.key.toLowerCase();
  if (k === 'g') renderer.toggleGrid();
  else if (k === 'r') renderer.toggleResources();
  else if (k === 'n') hud.requestNewMap(true);
  else if (k === 'h' && startTile >= 0) renderer.centerOnTile(startTile);
});

hud.requestNewMap(false);
