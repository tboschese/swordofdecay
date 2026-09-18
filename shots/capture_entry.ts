/**
 * Entry do browser para captura determinística.
 *
 * Não usa `GameLoop` de propósito: o rAF entrega delta variável (bom pro
 * jogo, fatal pra reprodutibilidade). Aqui o passo é fixo em 1000/60 e a
 * timeline de input é sintetizada como KeyboardEvent real na window, de
 * modo que `engine/input.ts` não sabe que está sendo dirigido por script.
 *
 * `render()` roda em TODO frame, mesmo nos que não viram PNG, porque o
 * screenshake consome o RNG dentro do render — pular frames de render
 * desalinharia o fluxo de aleatoriedade em relação ao jogo real.
 */
import { TilemapGame, VIEWPORT_WIDTH, VIEWPORT_HEIGHT } from "../src/game/TilemapGame";
import { rng } from "../src/engine/rng";
import { setEnabled as setMusicEnabled } from "../src/engine/audio";
// @ts-expect-error — .mjs sem tipos, compartilhado com o driver node
import { sceneByName, keysAtFrame } from "./scenes.mjs";

const DT = 1000 / 60;

interface ShotConfig {
  scene: string;
  seed: number;
  shots: number[];
  frames: number;
}

declare global {
  interface Window {
    __SHOT_CONFIG__: ShotConfig;
  }
}

function syncKeys(previous: Set<string>, next: Set<string>): void {
  for (const code of next) {
    if (!previous.has(code)) window.dispatchEvent(new KeyboardEvent("keydown", { code }));
  }
  for (const code of previous) {
    if (!next.has(code)) window.dispatchEvent(new KeyboardEvent("keyup", { code }));
  }
}

async function main(): Promise<void> {
  const cfg = window.__SHOT_CONFIG__;
  const scene = sceneByName(cfg.scene);

  const canvas = document.createElement("canvas");
  canvas.width = VIEWPORT_WIDTH;
  canvas.height = VIEWPORT_HEIGHT;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d", { willReadFrequently: false });
  if (!ctx) throw new Error("contexto 2d indisponível");
  ctx.imageSmoothingEnabled = false;

  // Sem áudio no headless. Não afeta determinismo (o áudio não toca no
  // rng), mas o construtor do jogo faz preload da faixa do mood — seriam
  // ~6MB baixados por cenário e um `play()` bloqueado a cada captura.
  // ANTES de create(), que é onde o preload acontece.
  setMusicEnabled(false);

  // Semear ANTES de create() — o construtor pode consumir aleatoriedade.
  rng.seed(cfg.seed);
  const game = await TilemapGame.create();

  // Cenarios de combate declaram startAt: posicionar antes de rodar e a
  // unica forma confiavel de encostar num inimigo especifico.
  // Sem isto TODA captura do harness vira o cartaz de titulo e a
  // validacao visual de todo mundo quebra. O agente m7 avisou.
  // Cenario pode pedir a tela de titulo explicitamente; o padrao e pular,
  // senao TODA captura vira cartaz e a validacao de todo mundo quebra.
  const wantsTitle = (scene as { screen?: string }).screen === "title";
  if (!wantsTitle) {
    (game as unknown as { debugSetScreen(s: "playing"): void }).debugSetScreen("playing");
  }

  const raw = scene as {
    summon?: { index: number; dx: number } | Array<{ index: number; dx: number }>;
    startAt?: { x: number; y: number };
  };

  // `startAt`: levar a câmera até um trecho específico da fase. O comentário
  // logo acima já prometia isso ("Cenarios de combate declaram startAt")
  // mas o suporte nunca existiu — só `summon`. Consequência: água, espinho,
  // chave, porta e objetivo NUNCA apareceram em captura nenhuma, e por isso
  // nenhum dos 8 módulos de arte olhou pra eles. Mesmo tipo de buraco que
  // fez os cenários de espada golpearem o ar por duas rodadas.
  //
  // A posição tem que cair em chão comprovadamente sólido: teleportar pra
  // coordenada arbitrária já falhou duas vezes aqui, porque buraco dispara
  // respawn e o cenário volta pro spawn sem avisar.
  if (raw.startAt) {
    (game as unknown as { debugPlaceAt(x: number, y: number): void }).debugPlaceAt(raw.startAt.x, raw.startAt.y);
  }

  const summons = raw.summon ? (Array.isArray(raw.summon) ? raw.summon : [raw.summon]) : [];
  for (const s of summons) {
    (game as unknown as { debugSummonEnemy(i: number, dx: number): void }).debugSummonEnemy(s.index, s.dx);
  }

  const wanted = new Set<number>(cfg.shots);
  const captured: Array<{ frame: number; png: string }> = [];
  const states: Array<Record<string, unknown>> = [];
  let held = new Set<string>();

  for (let f = 0; f < cfg.frames; f++) {
    const next = new Set<string>(keysAtFrame(scene, f) as string[]);
    syncKeys(held, next);
    held = next;

    game.update(DT);
    game.render(ctx);

    if (f % 10 === 0 || wanted.has(f)) {
      states.push({ f, ...(game as unknown as { debugState(): object }).debugState() });
    }
    if (wanted.has(f)) {
      captured.push({ frame: f, png: canvas.toDataURL("image/png").split(",")[1]! });
    }
  }

  const probe = document.createElement("script");
  probe.type = "text/plain";
  probe.id = "probe";
  probe.textContent = JSON.stringify(states);
  document.body.appendChild(probe);

  const sink = document.createElement("script");
  sink.type = "text/plain";
  sink.id = "shots";
  // base64 não contém caractere especial de HTML, então sobrevive ao
  // --dump-dom sem escaping. Uma linha por captura.
  sink.textContent = captured.map((c) => `${c.frame}|${c.png}`).join("\n");
  document.body.appendChild(sink);

  document.title = `OK:${captured.length}`;
}

main().catch((err: unknown) => {
  document.title = `FAIL:${err instanceof Error ? err.message : String(err)}`;
});
