#!/usr/bin/env node
/**
 * Empacota o build num HTML ÚNICO e auto-contido.
 *
 *   npx vite build && node shots/pack.mjs
 *
 * Existe porque o destino de publicação roda sob CSP estrito: nenhuma
 * requisição a host externo, nenhum arquivo irmão. JS e áudio precisam
 * estar embutidos no próprio documento.
 *
 * Só a faixa do mood de LEVEL_1 é embutida. As outras três continuam
 * referenciadas por caminho no bundle mas nunca são buscadas — o jogo faz
 * `preload(LEVEL_1_MOOD)` e carrega uma só. Embutir as quatro levaria o
 * documento de ~900KB pra ~8MB sem tocar uma nota a mais.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");
const dist = join(repo, "dist");

const jsName = readdirSync(join(dist, "assets")).find((f) => f.endsWith(".js"));
if (!jsName) throw new Error("pack: nenhum .js em dist/assets — rode `npx vite build` antes");

let js = readFileSync(join(dist, "assets", jsName), "utf8");

const TRACK = "/assets/audio/music/aventura.m4a";
const audio = readFileSync(join(dist, TRACK));
js = js.replaceAll(TRACK, `data:audio/mp4;base64,${audio.toString("base64")}`);

// Um `</script>` dentro do JS fecharia a tag cedo e quebraria a página.
js = js.replaceAll("</script", "<\\/script");

const html = `<title>Sword of Decay</title>
<style>
  /* Tema único e deliberado: isto é uma cabine, não um documento. As cores
     saem da paleta do próprio jogo — o fundo é a camada 4 do parallax, a
     tinta é PAL.metalHi e o acento é a ferrugem que ficou como âncora. */
  :root {
    --ground: #0f120e;
    --ink: #c8cdc2;
    --muted: #79836f;
    --rust: #c04a20;
  }
  html, body {
    margin: 0;
    padding: 0;
    background: var(--ground);
    color: var(--ink);
    min-height: 100vh;
    overflow: hidden;
  }
  #game-root {
    /* Sangria total de propósito: \`main.ts\` deriva o zoom INTEIRO de
       window.innerWidth/innerHeight, então qualquer cabeçalho ou rodapé
       roubaria altura e derrubaria a escala um degrau — ou pior, forçaria
       escala fracionária, que é o que borra pixel art. A legenda por cima
       existe justamente pra não ocupar layout. */
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
  }
  #game-root canvas {
    image-rendering: pixelated;
    /* Trava: nunca maior que a janela, mesmo se o cálculo de zoom errar
       (DPR, resize antes do layout assentar). Proporção preservada. */
    max-width: 100vw;
    max-height: 100vh;
    width: auto;
    height: auto;
  }
  #legend {
    /* No TOPO, não no rodapé. Verificado numa captura da página empacotada:
       centrado embaixo, a legenda cobria a linha de lore do próprio cartaz
       de título — colisão logo na primeira impressão. Em cima o espaço é
       livre nos dois estados: o cartaz tem céu vazio ali, e em jogo o HUD
       ocupa só os cantos (vidas à esquerda, moedas à direita). */
    position: fixed;
    left: 50%;
    top: 0.9rem;
    transform: translateX(-50%);
    display: flex;
    gap: 1.25rem;
    align-items: center;
    padding: 0.6rem 1rem;
    background: color-mix(in srgb, var(--ground) 88%, transparent);
    border: 1px solid color-mix(in srgb, var(--ink) 18%, transparent);
    border-radius: 2px;
    font: 500 0.72rem/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    letter-spacing: 0.06em;
    color: var(--muted);
    white-space: nowrap;
    transition: opacity 420ms ease;
  }
  #legend.gone { opacity: 0; pointer-events: none; }
  @media (prefers-reduced-motion: reduce) { #legend { transition: none; } }
  #legend b {
    color: var(--ink);
    font-weight: 600;
  }
  #legend .start { color: var(--rust); }
</style>

<div id="game-root"></div>

<p id="legend">
  <span class="start"><b>Z</b> COMEÇAR</span>
  <span><b>&larr; &rarr;</b> ANDAR</span>
  <span><b>Z</b> PULAR</span>
  <span><b>X</b> ESPADA</span>
  <span><b>C</b> ARCO</span>
  <span><b>+ &minus;</b> ZOOM</span>
</p>

<script type="module">
${js}
</script>

<script>
  // A legenda some no primeiro comando: ela ensina, e depois sai da frente.
  // Um teclado só some quando o jogador de fato usou o teclado — sumir por
  // tempo esconderia a informação de quem ainda estava lendo.
  (function () {
    var el = document.getElementById("legend");
    if (!el) return;
    window.addEventListener("keydown", function () { el.className = "gone"; }, { once: true });
  })();
</script>
`;

const out = join(repo, "dist", "sword-of-decay.html");
writeFileSync(out, html);
const mb = (Buffer.byteLength(html) / 1048576).toFixed(2);
console.log(`${out}  ${mb} MB  (js ${(js.length / 1024).toFixed(0)}KB incl. audio embutido)`);
