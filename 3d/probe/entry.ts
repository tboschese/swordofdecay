/**
 * Entry do browser para a sonda de determinismo (Fase 0).
 *
 * Mesma forma do harness 2D (`shots/capture_entry.ts`): passo fixo, sem
 * rAF, render em TODO quadro, e as capturas saem em base64 dentro do DOM
 * pro driver node ler via --dump-dom.
 */
import * as THREE from "three";
import { buildProbe } from "./scene";

interface ShotConfig {
  seed: number;
  shots: number[];
  frames: number;
  width: number;
  height: number;
}

declare global {
  interface Window {
    __SHOT_CONFIG__: ShotConfig;
  }
}

function main(): void {
  const cfg = window.__SHOT_CONFIG__;

  const canvas = document.createElement("canvas");
  canvas.width = cfg.width;
  canvas.height = cfg.height;
  document.body.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    // preserveDrawingBuffer: sem isto, toDataURL pode sair em branco —
    // o browser tem liberdade de descartar o buffer depois do compositing.
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(cfg.width, cfg.height, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const info = renderer.getContext().getExtension("WEBGL_debug_renderer_info");
  const gl = renderer.getContext();
  const rendererName = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "desconhecido";

  const probe = buildProbe(cfg.seed, cfg.width, cfg.height);
  const wanted = new Set(cfg.shots);
  const captured: Array<{ frame: number; png: string }> = [];

  // Custo de render por quadro. Medido em volta do `render()` e não do
  // laço inteiro, porque `toDataURL` é caríssimo e é artefato do harness,
  // não do jogo — misturar os dois daria um número que não existe em
  // execução real.
  const times: number[] = [];
  for (let f = 0; f < cfg.frames; f++) {
    probe.step(f);
    const t0 = performance.now();
    renderer.render(probe.scene, probe.camera);
    // getError força o pipeline a sincronizar; sem isso o tempo medido é
    // só o de ENFILEIRAR comandos, que é uma fração do custo real.
    gl.getError();
    times.push(performance.now() - t0);
    if (wanted.has(f)) captured.push({ frame: f, png: canvas.toDataURL("image/png").split(",")[1]! });
  }
  times.sort((a, b) => a - b);
  const perf = {
    medianaMs: +times[Math.floor(times.length / 2)]!.toFixed(3),
    p99Ms: +times[Math.floor(times.length * 0.99)]!.toFixed(3),
    maxMs: +times[times.length - 1]!.toFixed(3),
    drawCalls: renderer.info.render.calls,
    triangulos: renderer.info.render.triangles,
    programas: renderer.info.programs?.length ?? 0,
  };

  // Qual backend de fato rodou. Se a resposta variar entre execuções, a
  // comparação de hash não significa nada — é a primeira coisa a conferir.
  const meta = document.createElement("script");
  meta.type = "text/plain";
  meta.id = "meta";
  meta.textContent = JSON.stringify({ renderer: rendererName, version: THREE.REVISION, perf });
  document.body.appendChild(meta);

  const sink = document.createElement("script");
  sink.type = "text/plain";
  sink.id = "shots";
  sink.textContent = captured.map((c) => `${c.frame}|${c.png}`).join("\n");
  document.body.appendChild(sink);

  document.title = `OK:${captured.length}`;
}

try {
  main();
} catch (err) {
  document.title = `FAIL:${err instanceof Error ? err.message : String(err)}`;
}
