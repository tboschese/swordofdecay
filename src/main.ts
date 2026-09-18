import { GameLoop } from "./engine/loop";
import { TilemapGame, VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from "./game/TilemapGame";

const MIN_ZOOM = 1;
const MAX_ZOOM = 16;

let zoomLevel = 1;
/** true depois que +/- é usado — resize automático para de sobrescrever o ajuste manual. */
let zoomIsManual = false;

// Zoom inteiro máximo que cabe na janela atual — mantém upscale integer
// (CLAUDE.md) sem nunca cortar a tela em viewports menores que o canvas.
function integerZoomForViewport(width: number, height: number): number {
  return Math.max(MIN_ZOOM, Math.floor(Math.min(window.innerWidth / width, window.innerHeight / height)));
}

const root = document.getElementById("game-root");
if (!root) throw new Error("main.ts: #game-root não encontrado no index.html");

const canvas = document.createElement("canvas");
root.appendChild(canvas);
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("main.ts: contexto 2d indisponível");

function applyZoom(zoom: number): void {
  canvas.width = VIEWPORT_WIDTH * zoom;
  canvas.height = VIEWPORT_HEIGHT * zoom;
  ctx!.imageSmoothingEnabled = false;
  ctx!.setTransform(zoom, 0, 0, zoom, 0, 0);
}

zoomLevel = integerZoomForViewport(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
applyZoom(zoomLevel);

window.addEventListener("resize", () => {
  if (zoomIsManual) return;
  zoomLevel = integerZoomForViewport(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  applyZoom(zoomLevel);
});

// Resolução lógica fixa: wide (384x224). HD/Full HD/4K entram via zoom
// inteiro automático ou manual, sem mudar o tamanho lógico do mundo.
window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();

  if (key === "+" || key === "=") {
    zoomLevel = Math.min(MAX_ZOOM, zoomLevel + 1);
    zoomIsManual = true;
    applyZoom(zoomLevel);
    return;
  }

  if (key === "-" || key === "_") {
    zoomLevel = Math.max(MIN_ZOOM, zoomLevel - 1);
    zoomIsManual = true;
    applyZoom(zoomLevel);
  }
});

TilemapGame.create().then((first) => {
  // Reinicio pos vitoria/derrota: instancia nova abre no titulo por
  // construcao, entao o fluxo fecha sem precisar de um resetRun().
  let game = first;
  let rebuilding = false;
  const loop = new GameLoop(
    (deltaMs) => {
      game.update(deltaMs);
      if (!rebuilding && game.consumeRestartRequest()) {
        rebuilding = true;
        void TilemapGame.create().then((next) => {
          game = next;
          rebuilding = false;
        });
      }
    },
    () => game.render(ctx!),
  );
  loop.start();
});
