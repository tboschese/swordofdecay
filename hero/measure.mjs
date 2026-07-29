#!/usr/bin/env node
// Objective stats for a rendered PNG. "Looks good" is not evidence — this is.
//   node hero/measure.mjs out/foo.png
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');
  let i = 8, idat = [], w = 0, h = 0, bd = 0, ct = 0;
  while (i < buf.length) {
    const len = buf.readUInt32BE(i), type = buf.toString('ascii', i + 4, i + 8);
    const data = buf.subarray(i + 8, i + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    i += 12 + len;
  }
  if (bd !== 8) throw new Error('need 8-bit png');
  const nch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ct];
  if (!nch) throw new Error('unsupported color type ' + ct);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * nch, out = Buffer.alloc(h * stride);
  let pos = 0, prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[pos++];
    const line = Buffer.from(raw.subarray(pos, pos + stride)); pos += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= nch ? line[x - nch] : 0, b = prev[x], c = x >= nch ? prev[x - nch] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
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

const argv = process.argv.slice(2);
const file = argv.find((a) => !a.startsWith('--'));
const mi = argv.indexOf('--mask');
const maskFile = mi >= 0 ? argv[mi + 1] : null;
if (!file) { console.error('usage: measure.mjs <png> [--mask <silhouette.png>]'); process.exit(1); }
const { w, h, nch, px } = decodePNG(readFileSync(file));

const lum = new Float32Array(w * h);
for (let p = 0, k = 0; k < w * h; k++, p += nch) {
  // perceptual luminance on the sRGB values as displayed
  lum[k] = (0.2126 * px[p] + 0.7152 * px[p + 1] + 0.0722 * px[p + 2]) / 255;
}

// ---- subject extraction: anything meaningfully above the corner background --
const corner = (lum[0] + lum[w - 1] + lum[(h - 1) * w] + lum[h * w - 1]) / 4;
const thr = Math.max(corner + 0.035, 0.045);
// Subject extraction. A luminance threshold on the beauty render confuses
// "bright" with "object", which caps how much presence the background is
// allowed to have. Prefer a real mask from the silhouette pass (--mode 2).
const sub = new Uint8Array(w * h);
let maskSrc = 'luminance threshold (pass --mask for an exact silhouette)';
if (maskFile) {
  const m = decodePNG(readFileSync(maskFile));
  if (m.w !== w || m.h !== h) { console.error(`mask is ${m.w}x${m.h}, image is ${w}x${h}`); process.exit(1); }
  for (let k = 0; k < w * h; k++) sub[k] = m.px[k * m.nch] > 127 ? 1 : 0;
  maskSrc = 'silhouette mask ' + maskFile;
} else {
  for (let k = 0; k < w * h; k++) sub[k] = lum[k] > thr ? 1 : 0;
}

let minx = w, maxx = -1, miny = h, maxy = -1, subjectN = 0;
const rowSpan = new Int32Array(h).fill(-1), rowMin = new Int32Array(h).fill(-1), rowMax = new Int32Array(h).fill(-1);
for (let y = 0; y < h; y++) {
  let a = -1, b = -1;
  for (let x = 0; x < w; x++) if (sub[y * w + x]) { if (a < 0) a = x; b = x; subjectN++; }
  if (a >= 0) {
    rowMin[y] = a; rowMax[y] = b; rowSpan[y] = b - a;
    minx = Math.min(minx, a); maxx = Math.max(maxx, b);
    miny = Math.min(miny, y); maxy = Math.max(maxy, y);
  }
}
const bw = maxx - minx + 1, bh = maxy - miny + 1;

// ---- principal axis ---------------------------------------------------------
// The weapon may be rolled in frame, so "widest row" in screen space is
// meaningless. Find the subject's own long axis by PCA, then measure along and
// across THAT. Without this a rolled composition reports nonsense proportions.
let mx = 0, my = 0, mn = 0;
for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++)
  if (sub[y * w + x]) { mx += x; my += y; mn++; }
mx /= mn; my /= mn;
let cxx = 0, cyy = 0, cxy = 0;
for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++)
  if (sub[y * w + x]) { const dx = x - mx, dy = y - my; cxx += dx * dx; cyy += dy * dy; cxy += dx * dy; }
cxx /= mn; cyy /= mn; cxy /= mn;
const theta = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
// major axis = the eigenvector with the larger eigenvalue
const t1 = (cxx + cyy) / 2 + Math.hypot((cxx - cyy) / 2, cxy);
let ax = Math.cos(theta), ay = Math.sin(theta);
if (Math.abs(cxx * ax + cxy * ay - t1 * ax) > 1e-6 * t1) { const s = ax; ax = -ay; ay = s; }
const px_ = -ay, py_ = ax;   // perpendicular

const NB = 96;
let tmin = 1e9, tmax = -1e9;
const pts = [];
for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
  if (!sub[y * w + x]) continue;
  const dx = x - mx, dy = y - my;
  const t = dx * ax + dy * ay, u = dx * px_ + dy * py_;
  pts.push(t, u);
  if (t < tmin) tmin = t; if (t > tmax) tmax = t;
}
const binMin = new Float64Array(NB).fill(1e9), binMax = new Float64Array(NB).fill(-1e9);
for (let i = 0; i < pts.length; i += 2) {
  const b = Math.min(NB - 1, Math.floor((pts[i] - tmin) / (tmax - tmin + 1e-9) * NB));
  if (pts[i + 1] < binMin[b]) binMin[b] = pts[i + 1];
  if (pts[i + 1] > binMax[b]) binMax[b] = pts[i + 1];
}
let guardBin = -1, guardSpan = -1;
for (let b = 0; b < NB; b++) {
  const s = binMax[b] - binMin[b];
  if (s > guardSpan) { guardSpan = s; guardBin = b; }
}
const axisLen = tmax - tmin;
const guardT = tmin + (guardBin + 0.5) / NB * axisLen;
// tip is the end of the axis farther from the guard
const tipEnd = (guardT - tmin) > (tmax - guardT) ? tmin : tmax;
const bladeLenPx = Math.abs(guardT - tipEnd);
const hiltLenPx = axisLen - bladeLenPx;
const axisDeg = Math.atan2(ay, ax) * 180 / Math.PI;
const guardY = -1;

// ---- value structure --------------------------------------------------------
const bins = new Array(10).fill(0);
let sMin = 1, sMax = 0, sSum = 0, sN = 0;
for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
  const v = lum[y * w + x];
  if (!sub[y * w + x]) continue;
  bins[Math.min(9, Math.floor(v * 10))]++;
  sMin = Math.min(sMin, v); sMax = Math.max(sMax, v); sSum += v; sN++;
}
const shadow = bins.slice(0, 3).reduce((a, b) => a + b, 0) / sN;
const mid = bins.slice(3, 7).reduce((a, b) => a + b, 0) / sN;
const high = bins.slice(7).reduce((a, b) => a + b, 0) / sN;

// A broad plateau at 0.6-0.8 satisfies the "high" bucket while containing no
// speculars at all, which is how a render with zero highlights can pass the
// value-spread check. Count the actual specular population separately.
let spec90 = 0, spec98 = 0;
for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
  const v = lum[y * w + x];
  if (!sub[y * w + x]) continue;
  if (v > 0.90) spec90++;
  if (v > 0.98) spec98++;
}

// ---- specular breakup along the blade axis ---------------------------------
// Walk the principal axis on the blade side of the guard and take the brightest
// pixel in each slice. A good forged blade gives a wobbling highlight; a flat
// line reads CG and white noise reads like sandpaper.
const SB = 160;
const profBin = new Float64Array(SB).fill(-1);
const lo = Math.min(guardT, tipEnd), hi = Math.max(guardT, tipEnd);
for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
  const v = lum[y * w + x];
  if (!sub[y * w + x]) continue;
  const t = (x - mx) * ax + (y - my) * ay;
  if (t < lo || t > hi) continue;
  const b = Math.min(SB - 1, Math.floor((t - lo) / (hi - lo + 1e-9) * SB));
  if (v > profBin[b]) profBin[b] = v;
}
const prof = Array.from(profBin).filter((v) => v >= 0);
let breakup = { rms: 0, zerox: 0, n: prof.length };
if (prof.length > 8) {
  const mean = prof.reduce((a, b) => a + b, 0) / prof.length;
  // detrend against a wide moving average, then measure residual energy
  const win = Math.max(3, Math.round(prof.length / 8));
  let sum = 0, cross = 0, prevS = 0;
  for (let i = 0; i < prof.length; i++) {
    let a = 0, n = 0;
    for (let j = Math.max(0, i - win); j <= Math.min(prof.length - 1, i + win); j++) { a += prof[j]; n++; }
    const d = prof[i] - a / n;
    sum += d * d;
    const s = Math.sign(d);
    if (i && s && s !== prevS) cross++;
    if (s) prevS = s;
  }
  breakup = { rms: Math.sqrt(sum / prof.length) / Math.max(mean, 1e-3), zerox: cross, n: prof.length };
}

// ---- thumbnail silhouette readability (64px tall) ---------------------------
const th = 64, tw = Math.max(1, Math.round(w * th / h));
let tOn = 0;
const tgrid = [];
for (let y = 0; y < th; y++) {
  let row = '';
  for (let x = 0; x < tw; x++) {
    const x0 = Math.floor(x * w / tw), x1 = Math.max(x0 + 1, Math.floor((x + 1) * w / tw));
    const y0 = Math.floor(y * h / th), y1 = Math.max(y0 + 1, Math.floor((y + 1) * h / th));
    let a = 0, n = 0;
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { a += sub[yy * w + xx]; n++; }
    const on = a / n > 0.4;
    if (on) tOn++;
    row += on ? '#' : '.';
  }
  tgrid.push(row);
}

const pct = (x) => (100 * x).toFixed(1) + '%';
console.log(`file            ${file}`);
console.log(`size            ${w}x${h}`);
console.log(`bg corner lum   ${corner.toFixed(4)}   subject from ${maskSrc}`);
console.log(`subject bbox    x[${minx}..${maxx}] y[${miny}..${maxy}]  ${bw}x${bh}`);
console.log(`frame fill      height ${pct(bh / h)}  width ${pct(bw / w)}  coverage ${pct(subjectN / (w * h))}`);
console.log(`principal axis  ${axisDeg.toFixed(1)} deg from horizontal, length ${axisLen.toFixed(0)}px`);
console.log(`widest point    ${guardSpan.toFixed(0)}px across, at ${(100 * Math.abs(guardT - tipEnd) / axisLen).toFixed(0)}% of the way from the tip`);
console.log(`proportion      blade ${bladeLenPx.toFixed(0)}px : hilt ${hiltLenPx.toFixed(0)}px  = ${(bladeLenPx / Math.max(1, hiltLenPx)).toFixed(2)}:1  (measured along the weapon's own axis)`);
console.log(`subject lum     min ${sMin.toFixed(3)} mean ${(sSum / sN).toFixed(3)} max ${sMax.toFixed(3)}`);
console.log(`value spread    shadow(0-.3) ${pct(shadow)}  mid(.3-.7) ${pct(mid)}  high(.7-1) ${pct(high)}`);
console.log(`histogram       ${bins.map((b) => (100 * b / sN).toFixed(0).padStart(3)).join(' ')}   (deciles 0..1)`);
console.log(`specular pop    >0.90: ${pct(spec90 / sN)}   >0.98: ${pct(spec98 / sN)}`);
console.log(`                (a hero shot wants a small but non-empty population here — roughly`);
console.log(`                 0.5-4% above 0.90. Zero means no highlights; a broad plateau in the`);
console.log(`                 0.6-0.8 deciles satisfies "high" while containing no speculars.)`);
console.log(`spec breakup    rms ${breakup.rms.toFixed(3)} of mean, ${breakup.zerox} reversals over ${breakup.n} rows`);
console.log(`                (flat CG highlight -> rms<0.05; sandpaper -> zerox>n/3; forged steel -> rms .10-.30, zerox n/6..n/4)`);
console.log(`thumbnail 64px  ${pct(tOn / (tw * th))} coverage`);
console.log(tgrid.map((r) => '                ' + r).join('\n'));
