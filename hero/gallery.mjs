#!/usr/bin/env node
// Builds the live progress page from hero/progress.json + the round renders.
// Images are downscaled and inlined as data URIs (the page must be standalone).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- png i/o --
function decodePNG(buf) {
  let i = 8, idat = [], w = 0, h = 0, ct = 0;
  while (i < buf.length) {
    const len = buf.readUInt32BE(i), type = buf.toString('ascii', i + 4, i + 8);
    const d = buf.subarray(i + 8, i + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; }
    else if (type === 'IDAT') idat.push(d);
    else if (type === 'IEND') break;
    i += 12 + len;
  }
  const nch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ct];
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * nch, out = Buffer.alloc(h * stride);
  let pos = 0, prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[pos++];
    const line = Buffer.from(raw.subarray(pos, pos + stride)); pos += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= nch ? line[x - nch] : 0, b = prev[x], c = x >= nch ? prev[x - nch] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      line[x] = v & 255;
    }
    line.copy(out, y * stride); prev = line;
  }
  return { w, h, nch, px: out };
}

function crc32(buf) {
  let c, t = [];
  for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  let crc = 0xFFFFFFFF;
  for (const b of buf) crc = t[(crc ^ b) & 255] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, c]);
}
function encodePNG(w, h, rgb) {
  const stride = w * 3, raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// box-downscale to a target width, return a data URI
function thumb(file, tw) {
  if (!existsSync(file)) return null;
  const { w, h, nch, px } = decodePNG(readFileSync(file));
  const th = Math.max(1, Math.round(h * tw / w));
  const out = Buffer.alloc(tw * th * 3);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const x0 = Math.floor(x * w / tw), x1 = Math.max(x0 + 1, Math.floor((x + 1) * w / tw));
    const y0 = Math.floor(y * h / th), y1 = Math.max(y0 + 1, Math.floor((y + 1) * h / th));
    let r = 0, g = 0, b = 0, n = 0;
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
      const p = (yy * w + xx) * nch; r += px[p]; g += px[p + 1]; b += px[p + 2]; n++;
    }
    const o = (y * tw + x) * 3;
    out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n;
  }
  return 'data:image/png;base64,' + encodePNG(tw, th, out).toString('base64');
}

// ------------------------------------------------------------------ page ---
const stateFile = join(here, 'progress.json');
const S = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : { rounds: [], pieces: {} };

const esc = (s) => String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

const PIECE_NAMES = {
  p1: 'Blade form', p2: 'Blade material', p3: 'The Rot', p4: 'Crossguard',
  p5: 'Grip', p6: 'Pommel', p7: 'Lighting', p8: 'Presentation',
};

const rounds = S.rounds || [];
const latest = rounds[rounds.length - 1];
const heroImg = latest && latest.hero ? thumb(join(here, latest.hero), 620) : null;

const timeline = rounds.map((r) => {
  const t = r.hero ? thumb(join(here, r.hero), 176) : null;
  return `<figure class="frame">
    ${t ? `<img src="${t}" alt="round ${esc(r.n)}">` : '<div class="ph"></div>'}
    <figcaption><span class="fnum">${String(r.n).padStart(2, '0')}</span>${esc(r.note || '')}</figcaption>
  </figure>`;
}).join('\n');

const pieceRows = Object.keys(PIECE_NAMES).map((k) => {
  const p = (S.pieces || {})[k] || {};
  const st = p.status || 'pending';
  const cls = st === 'pass' ? 'pass' : st === 'fail' ? 'fail' : 'wait';
  const label = st === 'pass' ? 'holds' : st === 'fail' ? 'reworking' : 'unstruck';
  return `<tr class="${cls}">
    <td class="pn"><span class="sig">${k.toUpperCase()}</span>${esc(PIECE_NAMES[k])}</td>
    <td><span class="tag">${label}</span></td>
    <td class="rd">${p.round == null ? '—' : String(p.round).padStart(2, '0')}</td>
    <td class="gap">${esc(p.gap || '—')}</td>
  </tr>`;
}).join('\n');

const passed = Object.values(S.pieces || {}).filter((p) => p.status === 'pass').length;

const html = `<title>Sword of Decay — forge log</title>
<style>
  :root{
    --ink:#0E0D0B; --panel:#191712; --sunk:#121009; --line:#2C2820;
    --tx:#E9E3D6; --dim:#968D7B; --faint:#5F5949;
    --verd:#8AA36A; --ember:#C4652F;
    --verd-bg:rgba(138,163,106,.14); --ember-bg:rgba(196,101,47,.15); --dim-bg:rgba(150,141,123,.12);
    --stage:#08070A;
  }
  @media (prefers-color-scheme: light){
    :root{
      --ink:#EFEAE0; --panel:#FBF8F2; --sunk:#E7E1D4; --line:#D6CEBD;
      --tx:#1A1815; --dim:#6C6455; --faint:#9B9382;
      --verd:#5C7A3E; --ember:#9E4A18;
      --verd-bg:rgba(92,122,62,.13); --ember-bg:rgba(158,74,24,.13); --dim-bg:rgba(108,100,85,.11);
      --stage:#141218;
    }
  }
  :root[data-theme="dark"]{
    --ink:#0E0D0B; --panel:#191712; --sunk:#121009; --line:#2C2820;
    --tx:#E9E3D6; --dim:#968D7B; --faint:#5F5949;
    --verd:#8AA36A; --ember:#C4652F;
    --verd-bg:rgba(138,163,106,.14); --ember-bg:rgba(196,101,47,.15); --dim-bg:rgba(150,141,123,.12);
    --stage:#08070A;
  }
  :root[data-theme="light"]{
    --ink:#EFEAE0; --panel:#FBF8F2; --sunk:#E7E1D4; --line:#D6CEBD;
    --tx:#1A1815; --dim:#6C6455; --faint:#9B9382;
    --verd:#5C7A3E; --ember:#9E4A18;
    --verd-bg:rgba(92,122,62,.13); --ember-bg:rgba(158,74,24,.13); --dim-bg:rgba(108,100,85,.11);
    --stage:#141218;
  }

  *{box-sizing:border-box}
  html{-webkit-text-size-adjust:100%}
  body{
    margin:0;background:var(--ink);color:var(--tx);
    font:15px/1.6 ui-sans-serif,-apple-system,"Segoe UI",system-ui,sans-serif;
    font-feature-settings:"kern" 1;
  }
  .wrap{max-width:1040px;margin:0 auto;padding:44px 24px 96px}

  /* ---- masthead ---- */
  header{padding-bottom:22px;border-bottom:1px solid var(--line);margin-bottom:34px}
  .eyebrow{
    font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;
    letter-spacing:.18em;text-transform:uppercase;color:var(--faint);margin:0 0 14px;
  }
  h1{
    font:400 clamp(30px,4.6vw,44px)/1.1 "Iowan Old Style","Hoefler Text",Palatino,
        "Palatino Linotype","Book Antiqua",Georgia,serif;
    letter-spacing:-.015em;margin:0 0 10px;text-wrap:balance;
  }
  h1 em{font-style:italic;color:var(--verd)}
  .sub{color:var(--dim);margin:0;max-width:60ch;font-size:14.5px}
  .assay{
    display:flex;flex-wrap:wrap;gap:10px 26px;margin-top:20px;
    font:500 12.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace;
    font-variant-numeric:tabular-nums;color:var(--dim);
  }
  .assay span b{color:var(--tx);font-weight:600}
  .assay span i{font-style:normal;color:var(--faint)}

  /* ---- section headings ---- */
  h2{
    font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;
    letter-spacing:.18em;text-transform:uppercase;color:var(--faint);
    margin:44px 0 16px;display:flex;align-items:center;gap:14px;
  }
  h2::after{content:"";flex:1;height:1px;background:var(--line)}

  /* ---- the stage ---- */
  .stage{
    background:var(--stage);border:1px solid var(--line);
    padding:26px;display:flex;justify-content:center;
  }
  .stage img{max-width:100%;height:auto;display:block}
  .ph{width:190px;height:238px;background:#000}

  /* ---- filmstrip ---- */
  .strip{display:flex;gap:0;overflow-x:auto;border:1px solid var(--line);background:var(--sunk)}
  .frame{margin:0;flex:0 0 auto;padding:14px;border-right:1px solid var(--line)}
  .frame:last-child{border-right:none}
  .frame img{display:block;width:176px;height:auto;background:#000}
  .ph{width:176px;height:220px}
  figcaption{
    margin-top:10px;font:12px/1.4 ui-sans-serif,system-ui,sans-serif;color:var(--dim);
    max-width:176px;display:flex;gap:8px;align-items:baseline;
  }
  .fnum{
    font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;
    font-variant-numeric:tabular-nums;color:var(--verd);letter-spacing:.05em;
  }

  /* ---- assay ledger ---- */
  .tblwrap{overflow-x:auto;border:1px solid var(--line);background:var(--panel)}
  table{border-collapse:collapse;width:100%;min-width:660px;font-size:13.5px}
  th,td{text-align:left;padding:12px 16px;border-bottom:1px solid var(--line);vertical-align:top}
  th{
    font:600 10.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace;
    letter-spacing:.14em;text-transform:uppercase;color:var(--faint);
  }
  tbody tr:last-child td{border-bottom:none}
  /* severity rail encodes state in form, not just colour */
  tbody td:first-child{border-left:2px solid transparent}
  tr.pass td:first-child{border-left-color:var(--verd)}
  tr.fail td:first-child{border-left-color:var(--ember)}
  tr.wait td:first-child{border-left-color:var(--line)}
  .sig{
    font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;
    color:var(--faint);letter-spacing:.06em;margin-right:9px;
  }
  .rd{font:500 13px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;
    font-variant-numeric:tabular-nums;color:var(--dim)}
  .gap{color:var(--dim);max-width:460px}
  .tag{
    font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;
    letter-spacing:.08em;padding:4px 9px;white-space:nowrap;display:inline-block;
    background:var(--dim-bg);color:var(--dim);
  }
  tr.pass .tag{background:var(--verd-bg);color:var(--verd)}
  tr.fail .tag{background:var(--ember-bg);color:var(--ember)}

  .note{
    color:var(--dim);font-size:13px;margin-top:30px;padding:14px 18px;
    border-left:2px solid var(--ember);background:var(--panel);max-width:70ch;
  }
  .note b{color:var(--tx);font-weight:600}
  a{color:var(--verd)}
  :focus-visible{outline:2px solid var(--verd);outline-offset:2px}
</style>
<div class="wrap">
<header>
  <p class="eyebrow">Forge log</p>
  <h1>Sword of <em>Decay</em></h1>
  <p class="sub">Eight modules of one raymarched blade. Each is built by one agent and
  torn apart by another, round after round, until it holds against the bar.</p>
  <div class="assay">
    <span><b>${passed}</b><i> / 8 hold</i></span>
    <span><b>${rounds.length}</b><i> round${rounds.length === 1 ? '' : 's'} struck</i></span>
    <span><i>bar:</i> <b>shipped ARPG legendary</b></span>
  </div>
</header>

<h2>Current strike</h2>
<div class="stage">${heroImg ? `<img src="${heroImg}" alt="current hero render of the sword">` : '<div class="ph"></div>'}</div>

<h2>Evolution</h2>
<div class="strip">${timeline || '<p class="sub" style="padding:16px">No rounds yet.</p>'}</div>

<h2>Assay</h2>
<div class="tblwrap"><table>
  <thead><tr><th scope="col">Module</th><th scope="col">State</th><th scope="col">Rd</th><th scope="col">Biggest remaining gap</th></tr></thead>
  <tbody>
  ${pieceRows}
  </tbody>
</table></div>

<p class="note"><b>On the bar.</b> The reference is a shipped legendary-weapon hero shot from
Path of Exile or Diablo IV. That art cannot be displayed here, so no critic claims to have
diffed against it. Each verdict is made against a fixed written rubric plus objective
measurements taken from the render itself — silhouette fill, value distribution, and
specular breakup frequency.</p>
</div>`;

writeFileSync(join(here, 'progress.html'), html);
console.log(`progress.html — ${rounds.length} rounds, ${passed}/8 passed, ${Math.round(html.length / 1024)}KB`);
