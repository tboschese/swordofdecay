#!/usr/bin/env node
/**
 * Gera um dashboard HTML autocontido do push AAA.
 *
 *   node shots/dashboard.mjs            # -> shots/dashboard.html
 *   node shots/dashboard.mjs --open     # e abre no navegador
 *
 * Lê `progress.json` (estado dos 8 módulos, escrito pelos agentes) e as
 * capturas em `shots/out/<rodada>/`, e embute os PNGs em base64 pra que o
 * arquivo funcione sozinho, sem servidor.
 *
 * Um agente é considerado ATIVO se o heartbeat dele tem menos de 15min.
 * Isso é deliberado: agente que morreu por limite de sessão não deve
 * continuar contando como ativo — foi exatamente esse ponto cego que
 * escondeu três agentes mortos no push da espada.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, watchFile, watch as watchFs } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");
const ACTIVE_WINDOW_MS = 15 * 60 * 1000;

function build() {
const progress = JSON.parse(readFileSync(join(repo, "progress.json"), "utf8"));

// Cada agente escreve SEU próprio arquivo em shots/status/<mod>.json e
// nunca toca no progress.json compartilhado — escrita concorrente no
// mesmo JSON faz um agente sobrescrever o outro silenciosamente, e o
// estado perdido é exatamente o que este painel existe pra evitar.
const statusDir = join(here, "status");
if (existsSync(statusDir)) {
  for (const f of readdirSync(statusDir).filter((x) => x.endsWith(".json"))) {
    const id = f.replace(/\.json$/, "");
    if (!progress.modules[id]) continue;
    try {
      const raw = JSON.parse(readFileSync(join(statusDir, f), "utf8"));
      // O heartbeat vem do MTIME do arquivo, não do campo que o agente
      // escreveu. Agentes não têm relógio confiável — na primeira rodada
      // um gravou meia-noite e outros marcaram 3h no passado, e todos
      // apareceriam como mortos tendo acabado de começar. O sistema de
      // arquivos sabe quando a escrita aconteceu de verdade.
      raw.heartbeat = statSync(join(statusDir, f)).mtime.toISOString();
      Object.assign(progress.modules[id], raw);
    } catch {
      // JSON meio escrito enquanto o agente grava — ignora, o próximo
      // ciclo de watch pega a versão completa.
    }
  }
}

const STATUS = {
  pass: { label: "passou", cls: "pass" },
  fail: { label: "falhou", cls: "fail" },
  active: { label: "em trabalho", cls: "active" },
  pending: { label: "não começou", cls: "pending" },
};

const now = Date.now();
const mods = Object.entries(progress.modules);
const isActive = (m) => m.status === "active" && m.heartbeat && now - Date.parse(m.heartbeat) < ACTIVE_WINDOW_MS;
const isStale = (m) => m.status === "active" && (!m.heartbeat || now - Date.parse(m.heartbeat) >= ACTIVE_WINDOW_MS);

const counts = {
  active: mods.filter(([, m]) => isActive(m)).length,
  stale: mods.filter(([, m]) => isStale(m)).length,
  pass: mods.filter(([, m]) => m.status === "pass").length,
  fail: mods.filter(([, m]) => m.status === "fail").length,
  pending: mods.filter(([, m]) => m.status === "pending").length,
};

// ---- capturas da rodada mais recente que existe em disco
const rounds = (progress.rounds ?? []).filter((r) => existsSync(join(repo, r.dir)));
const latest = rounds[rounds.length - 1];
let shots = [];
if (latest) {
  shots = readdirSync(join(repo, latest.dir))
    .filter((f) => f.endsWith(".png"))
    .sort()
    .map((f) => ({
      file: f,
      scene: f.replace(/_f\d+\.png$/, ""),
      frame: (f.match(/_f(\d+)\.png$/) ?? [])[1] ?? "",
      b64: readFileSync(join(repo, latest.dir, f)).toString("base64"),
    }));
}
const scenes = [...new Set(shots.map((s) => s.scene))];

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const ago = (iso) => {
  if (!iso) return "—";
  const min = Math.round((now - Date.parse(iso)) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min}min`;
  const h = Math.round(min / 60);
  return h < 24 ? `há ${h}h` : `há ${Math.round(h / 24)}d`;
};

const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sword of Decay — push AAA</title>
<style>
:root{
  --ink:#0E0D0B; --panel:#191712; --sunk:#121009; --line:#2C2820;
  --tx:#E9E3D6; --dim:#968D7B; --faint:#5F5949;
  --verd:#8AA36A; --ember:#C4652F; --rust:#A8503A; --bone:#C9BFA6;
}
@media (prefers-color-scheme:light){
  :root{
    --ink:#EFEAE0; --panel:#FBF8F2; --sunk:#E7E1D4; --line:#D6CEBD;
    --tx:#1A1815; --dim:#6C6455; --faint:#9B9382;
    --verd:#5C7A3E; --ember:#9E4A18; --rust:#8E3A24; --bone:#4A4335;
  }
}
*{box-sizing:border-box}
body{margin:0;background:var(--ink);color:var(--tx);
  font:15px/1.6 ui-sans-serif,-apple-system,"Segoe UI",system-ui,sans-serif}
.wrap{max-width:1100px;margin:0 auto;padding:44px 24px 96px}
header{padding-bottom:22px;border-bottom:1px solid var(--line);margin-bottom:30px}
.eyebrow{font:600 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.18em;
  text-transform:uppercase;color:var(--faint);margin:0 0 14px}
h1{font:400 clamp(30px,4.6vw,44px)/1.1 "Iowan Old Style","Hoefler Text",Palatino,Georgia,serif;
  letter-spacing:-.015em;margin:0 0 10px}
h1 em{font-style:italic;color:var(--verd)}
.sub{color:var(--dim);margin:0;max-width:64ch;font-size:14.5px}

.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin:26px 0 40px}
.tile{background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:14px 16px}
.tile b{display:block;font:600 30px/1 ui-monospace,Menlo,monospace;
  font-variant-numeric:tabular-nums;margin-bottom:5px}
.tile span{font:500 11px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.09em;
  text-transform:uppercase;color:var(--dim)}
.t-active b{color:var(--verd)} .t-stale b{color:var(--ember)}
.t-fail b{color:var(--rust)} .t-pass b{color:var(--verd)}

h2{font:400 21px/1.3 "Iowan Old Style",Palatino,Georgia,serif;margin:38px 0 14px;
  padding-bottom:9px;border-bottom:1px solid var(--line)}
.warn{background:rgba(196,101,47,.12);border:1px solid var(--ember);
  border-radius:8px;padding:13px 16px;margin:18px 0;font-size:14px;color:var(--tx)}
.warn b{color:var(--ember)}

.mod{background:var(--panel);border:1px solid var(--line);border-radius:9px;
  padding:16px 18px;margin-bottom:11px}
.mod-h{display:flex;align-items:center;gap:11px;flex-wrap:wrap;margin-bottom:8px}
.mod-id{font:600 12px/1 ui-monospace,Menlo,monospace;color:var(--faint);
  letter-spacing:.1em;text-transform:uppercase}
.mod-n{font:600 16px/1.2 inherit}
.badge{font:600 10.5px/1 ui-monospace,Menlo,monospace;letter-spacing:.09em;
  text-transform:uppercase;padding:4px 8px;border-radius:4px;border:1px solid}
.badge.pass{color:var(--verd);border-color:var(--verd);background:rgba(138,163,106,.13)}
.badge.fail{color:var(--rust);border-color:var(--rust);background:rgba(168,80,58,.13)}
.badge.active{color:var(--verd);border-color:var(--verd);background:rgba(138,163,106,.13)}
.badge.stale{color:var(--ember);border-color:var(--ember);background:rgba(196,101,47,.15)}
.badge.pending{color:var(--dim);border-color:var(--line);background:transparent}
.mod-owns{font:500 11.5px/1 ui-monospace,Menlo,monospace;color:var(--faint);margin-left:auto}
.mod-gap{color:var(--dim);font-size:14px;margin:0}
.mod-as{margin:10px 0 0;padding:9px 12px;background:var(--sunk);border-left:2px solid var(--ember);
  border-radius:0 5px 5px 0;font-size:13.5px;color:var(--bone)}
.mod-as b{color:var(--ember);font:600 10.5px/1 ui-monospace,Menlo,monospace;
  letter-spacing:.09em;text-transform:uppercase;display:block;margin-bottom:4px}

.scene{margin-bottom:26px}
.scene-n{font:600 12px/1 ui-monospace,Menlo,monospace;letter-spacing:.1em;
  text-transform:uppercase;color:var(--verd);margin-bottom:10px}
.strip{display:flex;gap:10px;overflow-x:auto;padding-bottom:8px}
.shot{flex:0 0 auto}
.shot img{display:block;width:288px;height:168px;image-rendering:pixelated;
  border:1px solid var(--line);border-radius:5px;background:#000}
.shot span{display:block;font:500 10.5px/1.5 ui-monospace,Menlo,monospace;color:var(--faint);margin-top:5px}
footer{margin-top:52px;padding-top:18px;border-top:1px solid var(--line);
  color:var(--faint);font:500 12px/1.7 ui-monospace,Menlo,monospace}
</style></head><body><div class="wrap">

<header>
  <p class="eyebrow">Sword of Decay · push AAA · rodada ${progress.round}</p>
  <h1>Estado dos <em>oito módulos</em></h1>
  <p class="sub">${esc(progress.note)}</p>
</header>

<div class="tiles">
  <div class="tile t-active"><b>${counts.active}</b><span>ativos</span></div>
  <div class="tile t-stale"><b>${counts.stale}</b><span>sem sinal</span></div>
  <div class="tile t-pass"><b>${counts.pass}</b><span>passaram</span></div>
  <div class="tile t-fail"><b>${counts.fail}</b><span>falharam</span></div>
  <div class="tile"><b>${counts.pending}</b><span>não começaram</span></div>
  <div class="tile"><b>${shots.length}</b><span>capturas</span></div>
</div>

${counts.stale > 0 ? `<div class="warn"><b>${counts.stale} agente(s) sem sinal.</b>
 Marcados como "em trabalho" mas sem heartbeat há mais de 15 minutos — provavelmente
 morreram por limite de sessão. Confira o que ficou pela metade antes de reatribuir:
 no push da espada, três agentes morreram assim e deixaram superfícies calibradas
 contra premissas que ninguém tinha escrito.</div>` : ""}

<h2>Módulos</h2>
${mods
  .map(([id, m]) => {
    const cls = isStale(m) ? "stale" : STATUS[m.status].cls;
    const label = isStale(m) ? "sem sinal" : STATUS[m.status].label;
    return `<div class="mod">
  <div class="mod-h">
    <span class="mod-id">${esc(id)}</span>
    <span class="mod-n">${esc(m.name)}</span>
    <span class="badge ${cls}">${label}</span>
    ${m.heartbeat ? `<span class="mod-id">${ago(m.heartbeat)}</span>` : ""}
    <span class="mod-owns">${esc(m.owns)}</span>
  </div>
  <p class="mod-gap">${esc(m.gap)}</p>
  ${m.assumption ? `<div class="mod-as"><b>Premissa não validada</b>${esc(m.assumption)}</div>` : ""}
</div>`;
  })
  .join("\n")}

<h2>Capturas — ${latest ? esc(latest.dir) : "nenhuma"}</h2>
${latest ? `<p class="sub" style="margin-bottom:20px">${esc(latest.note)}</p>` : ""}
${scenes
  .map(
    (sc) => `<div class="scene"><div class="scene-n">${esc(sc)}</div><div class="strip">
${shots
  .filter((s) => s.scene === sc)
  .map((s) => `<div class="shot"><img src="data:image/png;base64,${s.b64}" alt="${esc(s.file)}"><span>frame ${esc(s.frame)}</span></div>`)
  .join("")}
</div></div>`,
  )
  .join("\n")}

<footer>
  harness determinístico: ${progress.harness.deterministic ? "sim" : "NÃO"} · ${progress.harness.scenes} cenários ·
  ${progress.harness.shotsPerRound} capturas em ${progress.harness.captureSeconds}s<br>
  gerado em ${new Date().toLocaleString("pt-BR")} · regerar com <b>node shots/dashboard.mjs</b>
</footer>
</div></body></html>`;

return { html, counts, shots: shots.length };
}

// ------------------------------------------------------------------ saída
const out = join(here, "dashboard.html");
const watch = process.argv.includes("--watch");

if (!watch) {
  const { html, counts, shots } = build();
  mkdirSync(here, { recursive: true });
  writeFileSync(out, html);
  console.log(`${out}  ${Math.round(html.length / 1024)}KB  ${counts.active} ativos · ${counts.stale} sem sinal · ${shots} capturas`);
  if (process.argv.includes("--open")) execFile("open", [out]);
} else {
  /**
   * Modo watch: serve o dashboard e recarrega sozinho quando o estado muda.
   * Com 8 agentes em paralelo, regerar à mão não escala — e o valor do
   * painel é justamente ver quem parou de dar sinal enquanto você olha.
   *
   * A página faz long-ish poll em /v; quando a versão muda, recarrega.
   */
  let version = 0;
  let cached = build();
  const rebuild = () => {
    try {
      cached = build();
      version++;
      console.log(`[${new Date().toLocaleTimeString("pt-BR")}] atualizado — ${cached.counts.active} ativos, ${cached.counts.stale} sem sinal`);
    } catch (err) {
      console.error("falha ao regerar:", err.message);
    }
  };

  // Coalescido: agentes escrevem em rajada, e regerar embute PNGs em base64.
  let pending = null;
  const schedule = () => {
    clearTimeout(pending);
    pending = setTimeout(rebuild, 400);
  };
  watchFile(join(repo, "progress.json"), { interval: 1000 }, schedule);
  const outRoot = join(here, "out");
  if (existsSync(outRoot)) watchFs(outRoot, { recursive: true }, schedule);
  const statusRoot = join(here, "status");
  mkdirSync(statusRoot, { recursive: true });
  watchFs(statusRoot, schedule);

  const reload = `<script>
let v=null;setInterval(async()=>{try{const r=await fetch('/v');const n=await r.text();
if(v!==null&&n!==v)location.reload();v=n}catch(e){}},1500)</script>`;

  createServer((req, res) => {
    if (req.url === "/v") {
      res.writeHead(200, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
      res.end(String(version));
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(cached.html.replace("</body>", reload + "</body>"));
  }).listen(4599, "127.0.0.1", () => {
    console.log("dashboard ao vivo em http://127.0.0.1:4599  (ctrl+c pra parar)");
    console.log(`observando progress.json e ${outRoot}`);
    if (process.argv.includes("--open")) execFile("open", ["http://127.0.0.1:4599"]);
  });
}
