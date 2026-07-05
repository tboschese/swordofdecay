import Phaser from "phaser";
import { PlaygroundScene } from "./scenes/PlaygroundScene";
import { TilemapScene } from "./scenes/TilemapScene";
import { DEFAULT_RESOLUTION_ID, RESOLUTIONS, type ResolutionId } from "./config/resolution";

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

function createGame(resolutionId: ResolutionId): Phaser.Game {
  const { width, height } = RESOLUTIONS[resolutionId];
  zoomLevel = integerZoomForViewport(width, height);
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game-root",
    width,
    height,
    pixelArt: true,
    backgroundColor: "#5c94fc",
    scale: {
      mode: Phaser.Scale.NONE,
      zoom: zoomLevel,
    },
    physics: {
      default: "arcade",
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false,
      },
    },
    scene: [TilemapScene, PlaygroundScene],
  });
}

let game = createGame(DEFAULT_RESOLUTION_ID);

window.addEventListener("resize", () => {
  if (zoomIsManual) return;
  const { width, height } = RESOLUTIONS[DEFAULT_RESOLUTION_ID];
  zoomLevel = integerZoomForViewport(width, height);
  game.scale.setZoom(zoomLevel);
});

// Resolução lógica fixa: wide (384x224). HD/Full HD/4K entram via zoom
// inteiro automático ou manual, sem mudar o tamanho lógico do mundo.
window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();

  if (key === "+" || key === "=") {
    zoomLevel = Math.min(MAX_ZOOM, zoomLevel + 1);
    zoomIsManual = true;
    game.scale.setZoom(zoomLevel);
    return;
  }

  if (key === "-" || key === "_") {
    zoomLevel = Math.max(MIN_ZOOM, zoomLevel - 1);
    zoomIsManual = true;
    game.scale.setZoom(zoomLevel);
  }
});
