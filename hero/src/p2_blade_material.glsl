// ============================================================================
// PIECE 2 — BLADE MATERIAL (clean steel substrate)
// Owns: the metal itself — albedo, roughness, metalness, micro-normal.
// Contract: Surf shadeBlade(vec3 p, vec3 n);
// Does NOT own corrosion (piece 3) or lighting (piece 7).
//
// MATERIAL BRIEF: this is DARK forged steel, not chrome. A shipped ARPG blade
// sits low in the value range; the brightness comes from a handful of hot,
// concentrated speculars and a keen rim, never from the flat itself sitting at
// mid-grey. So the base f0 is deliberately low — metal, but a DARK metal, a
// blued forge patina at ~0.115 linear — and the read comes from ROUGHNESS
// structure, which is monotone across the form and separable with the colour
// removed:
//
//   ricasso / parry hooks   rough .505   raw stock, never dressed
//   fuller recess           rough .440   sunk, never got wiped
//   ridge roof (inner)      rough .262   awkward facet, coarsest grind
//   flats                   rough .196   ground, not polished
//   burnished creases       rough .082   the wheel's own witness lines
//   secondary bevel         rough .058   honed
//   apex                    rough .028   near-mirror; the keen edge
//
// The honed facets are also the only places allowed a HIGH f0: honing cuts
// through the patina to bare steel (f0 ~0.42). Dark blued body, bright bare
// edge — that is how a blade stays dark and still throws a keen hot rim.
//
// ROUND 3 — THE ANISOTROPY IS NO LONGER FAKED.
// The previous author of this file wrote that the grain was "the wrong kind of
// fake": `Surf` only carried a scalar roughness, so a lobe that is narrow
// ACROSS the blade and long ALONG it could not be expressed. What was there
// instead was a low isotropic roughness on the flats plus normal waviness to
// break it up — which at hero scale reads as a set of crisp bands that wobble,
// not as one long soft streak. `Surf` now carries `aniso`/`anisoDir` and p7
// implements two-axis GGX, so the lobe is stated directly:
//
//   flats          aniso .86   ground the length of the blade
//   ridge roof     aniso .72   same wheel, awkward facet, same direction
//   secondary bevel aniso .46  honed, and honed along the EDGE, not the axis
//   apex           aniso .30   stropped nearly smooth; little grain survives
//   fuller floor   aniso .30   sunk, never properly dressed
//   ricasso/hooks  aniso  0    raw stock — no grain at all
//
// The roughness numbers below were RAISED to pay for it. Disney's aspect
// mapping preserves ax*ay, so at aniso .86 (aspect .475) the across-blade alpha
// is 0.475*a: feeding the old 0.196 straight in would have made the flat
// TIGHTER across its width than it was before, which is the opposite of the
// goal. The flats now run 0.272, which puts the across-blade lobe back at
// about 0.19 isotropic-equivalent and stretches the along-blade lobe to about
// 0.40 — narrow across, long along, which is the actual optics of a ground
// flat and the thing the previous author could not say.
//
// Because the streak is now a real lobe, the WAVINESS FAKE has been cut from
// 0.0070 to 0.0022: it is no longer carrying the breakup, only a trace of
// hand-ground form. What replaces it is a slow WANDER OF THE GRAIN DIRECTION
// (a couple of degrees, same low-frequency field) — the streak drifts instead
// of the surface crumpling, which is what a hand-ground flat actually does.
//
// WEAR. `s.wear` gates p3's hold-back. Set high wherever use keeps steel
// polished — the honed bevel, the two burnished crease hairlines, the apex and
// the ridge crest are all proud arrises that get wiped by every draw and every
// parry — and low in the fuller recess, which is a trench that held the water.
// ============================================================================

// A/B switches. Set P2_ANISO_GAIN to 0.0 to render the isotropic control.
const float P2_ANISO_GAIN = 1.0;
const float P2_WAVE_AMP   = 0.00220;

// --- anisotropic grinding field ------------------------------------------
// Fine across the blade, long along it (aspect roughly 35:1 up to 75:1).
// `side` decorrelates the two faces so front and back never share a scratch.
//
// Split in two on purpose. The MID band is the only one allowed to move the
// normal: at hero-shot scale the blade is ~90px wide, so anything finer than
// this is sub-pixel and, driven into a normal, aliases into moire — which is
// exactly the crumpled-tinfoil read we are trying to kill. The FINE band is
// real grinding grit, but it lives in roughness only, where sub-pixel detail
// degrades gracefully into a slightly wider lobe instead of into shimmer.
float p2_grindN(float x, float y, float side){
  return vnoise(vec3(x* 56.0, y* 1.7, side))
       + 0.55*vnoise(vec3(x*128.0, y* 3.6, side + 3.71));
}
float p2_grindR(float x, float y, float side){
  return 0.40*vnoise(vec3(x*118.0, y* 2.4, side + 1.90))
       + 0.34*vnoise(vec3(x*312.0, y* 5.0, side + 6.31))
       + 0.26*vnoise(vec3(x*690.0, y* 9.0, side + 9.14));
}

// --- hand-grind waviness --------------------------------------------------
// One slow wave roughly every bladeLen/8, plus a half-octave of irregularity.
// Returned as a height so the caller can difference it into a gradient.
float p2_wave(float x, float y, float side){
  return vnoise(vec3(x* 4.4, y* 4.6, side))
       + 0.42*vnoise(vec3(x*10.5, y*11.3, side + 5.19));
}

Surf shadeBlade(vec3 p, vec3 n){
  Surf s = defaultSurf();
  Dims D = dims();

  float y   = p.y;
  float hw  = max(bladeHalfWidth(y), 1e-4);
  float wr  = abs(p.x) / hw;                       // raw spine->edge ratio
  float ux  = clamp(wr, 0.0, 1.0);
  float u   = clamp(y / D.bladeLen, 0.0, 1.0);     // along the blade
  float side = p.z >= 0.0 ? 0.0 : 19.7;            // which face

  // ---------------------------------------------------------------- regions --
  // Facets, matched to the creases p1 actually cuts at ux .25 and ux .82.
  float bevelM = smoothstep(0.775, 0.885, ux);              // secondary bevel
  float ridgeM = 1.0 - smoothstep(0.185, 0.305, ux);        // ridge roof
  float flatM  = (1.0 - bevelM) * (1.0 - ridgeM);

  // Fuller recess — same window p1 sinks the floor in, and only on the parts
  // still facing out of the face (the slot walls are not the recess).
  float fulM = smoothstep(0.48, 0.62, y) * (1.0 - smoothstep(1.14, 1.36, y))
             * smoothstep(0.635, 0.500, ux)
             * smoothstep(0.42, 0.80, abs(n.z));

  // Unfinished stock: the ricasso, and the parry hooks that sit outboard of
  // the blade's own width down at the heel. Neither was ever sharpened, so
  // neither may inherit the honed edge finish.
  float ric   = 1.0 - smoothstep(0.40, 0.56, y);
  float hook  = smoothstep(1.02, 1.22, wr) * (1.0 - smoothstep(0.50, 0.68, y));
  float blunt = clamp(ric + hook, 0.0, 1.0);

  // The two creases p1 actually cuts (ux .25 and .82) are where the wheel
  // burnished the steel hardest, so they run keener than the facets they
  // divide — a pair of hairlines down the length. And the apex itself is the
  // keenest thing on the weapon: that is the keen bright edge.
  float dA = (ux - 0.250)/0.042;
  float dB = (ux - 0.820)/0.036;
  float crease = max(exp(-dA*dA), exp(-dB*dB)) * (1.0 - blunt);
  float apex   = smoothstep(0.952, 1.000, ux) * (1.0 - blunt);

  // ---------------------------------------------------------------- albedo ---
  // Metal, so albedo IS f0. Dark steel, cold, low. Everything downstream is
  // supposed to be lit into the picture, not painted bright here.
  vec3 base = vec3(0.1150, 0.1222, 0.1390);

  // Forge banding: slow value drift stretched down the blade's length.
  float band = fbm(vec3(p.x*17.0, p.y*2.6, side*0.7 + 1.3), 4);
  base *= 0.82 + 0.34*band;

  // Tempering / heat treatment. Very subtle — this must read as depth, not as
  // a rainbow. Cold blue-grey through the body of the flat, a faint straw
  // where the edge was drawn back, a whisper of plum along the spine.
  float temper = fbm(vec3(p.x*3.0, p.y*2.1, side*0.3 + 7.7), 3);
  vec3  cold   = vec3(0.0925, 0.1078, 0.1430);
  vec3  straw  = vec3(0.1690, 0.1385, 0.0885);
  vec3  plum   = vec3(0.1265, 0.1040, 0.1340);
  base = mix(base, cold,  flatM * (0.32 + 0.30*temper));
  base = mix(base, straw, bevelM * smoothstep(0.30, 0.72, temper) * 0.42);
  base = mix(base, plum,  ridgeM * smoothstep(0.62, 0.30, temper) * 0.24);

  // The flat carries a dark forge patina — a thin oxide film that genuinely
  // drops its reflectance, which is why a blued blade reads near-black in the
  // body. The honed facets cut straight through that film to bare polished
  // steel, whose f0 is several times higher. That contrast — dark blued flat,
  // bright bare edge — is the whole reason an ARPG blade can be dark AND still
  // throw a keen hot edge, and it is a material fact, not an exposure trick.
  vec3 bare = vec3(0.408, 0.420, 0.447);
  // How much bare steel the honing actually exposed, drifting slowly along the
  // length — this is what stops the rim reading as a constant-width stroke.
  float hone = clamp(0.34 + 1.30*fbm(vec3(1.7, p.y*2.35, side*0.4 + 31.0), 3), 0.0, 1.0);

  // Recess and unfinished stock are darker and dirtier: neither ever got wiped.
  base = mix(base, vec3(0.0620, 0.0640, 0.0700), fulM*0.66);
  base = mix(base, vec3(0.0810, 0.0820, 0.0870), blunt*0.58);
  base = mix(base, bare*0.74, crease*0.48*(0.45 + 0.75*hone));
  base = mix(base, bare,       bevelM*0.52*(0.30 + 0.95*hone));
  base = mix(base, bare*1.38,  apex*0.78*(0.22 + 1.05*hone));

  // The ridge crest itself — the very centreline of the blade — is the proudest
  // arris on the flat, and every wipe of a rag runs down it.
  float crest = exp(-(ux/0.105)*(ux/0.105)) * (1.0 - blunt);

  // ------------------------------------------------------------- roughness ---
  // NOTE the flats and the ridge roof read HIGHER than round 2. That is the
  // price of real anisotropy: the across-blade alpha is aspect*a, so the base
  // has to come up to keep the across-width read where it was. See the header.
  float rough = 0.272;                          // flats: ground, not polished
  rough = mix(rough, 0.318, ridgeM);            // ridge roof, shallower pass
  rough = mix(rough, 0.066, bevelM);            // honed secondary bevel
  rough = mix(rough, 0.440, fulM);              // fuller floor, never dressed
  rough = mix(rough, 0.505, blunt);             // ricasso / hooks, raw stock
  rough = mix(rough, min(rough, 0.090), crease*0.80);   // burnished crease line
  rough = mix(rough, 0.030, apex*0.90);                 // the honed apex

  // The bevel gets keener toward the point — the last third took the most work.
  rough -= bevelM*(1.0 - blunt)*0.022*smoothstep(0.35, 0.95, u);

  // Grinding marks modulate the finish along the length.
  float grind = p2_grindR(p.x, p.y, side);
  rough *= 0.885 + 0.215*grind;
  // Uneven polish in slow patches — a hand-finished blade is never uniform.
  float polishVar = fbm(vec3(p.x*6.0, p.y*3.4, side*0.5 + 23.0), 3);
  rough *= 0.90 + 0.22*polishVar;
  rough = clamp(rough, 0.024, 0.78);

  // ------------------------------------------------------------ anisotropy ---
  // How much GRAIN the surface has. A blade is ground on a wheel that runs the
  // length of it, so almost everything on the flat is strongly directional; the
  // exceptions are surfaces that were never dressed (the ricasso, the parry
  // hooks, the sunk fuller floor) and the apex, which is stropped until the
  // scratches are almost gone. p3 zeroes this again under crust, and damps it
  // under tarnish, so corroded steel loses its grain without help from here.
  float aniso = 0.86;                          // flats: heavily directional
  aniso = mix(aniso, 0.72, ridgeM);            // ridge roof, same wheel
  aniso = mix(aniso, 0.46, bevelM);            // honed, finer and shorter
  aniso = mix(aniso, 0.30, fulM);              // sunk, never properly dressed
  aniso = mix(aniso, 0.30, apex*0.90);         // stropped nearly smooth
  aniso = mix(aniso, 0.00, blunt);             // raw stock: no grain at all
  // Never perfectly uniform — the grind wanders in strength as well as angle.
  aniso *= 0.86 + 0.26*polishVar;
  aniso = clamp(aniso*P2_ANISO_GAIN, 0.0, 0.92);

  // ---- the grain DIRECTION -------------------------------------------------
  // Blade axis for everything ground on the wheel. The secondary bevel is the
  // exception: it is honed along the EDGE, and near the point the edge sweeps
  // inboard hard (the profile loses 0.34 of half-width per unit of height up
  // there), so its grain tilts with it. p7 orthogonalises against N for us.
  float hw1  = max(bladeHalfWidth(y + 0.01), 1e-4);
  float dhw  = (hw1 - hw)/0.01;                          // d(halfWidth)/dy
  vec3  eDir = normalize(vec3(sign(p.x)*dhw, 1.0, 0.0)); // local edge tangent
  vec3  gDir = normalize(mix(vec3(0.0, 1.0, 0.0), eDir, bevelM*0.85 + apex*0.15));

  // Slow wander of the grain angle — a couple of degrees, driven by the same
  // low-frequency field the waviness used to use. This is the replacement for
  // most of the old normal waviness: the STREAK drifts, instead of the surface
  // crumpling to fake a drifting streak.
  float wa = (p2_wave(p.x, p.y, side) - 0.5) * 0.075 * (0.5 + 0.7*flatM);
  gDir = normalize(gDir + vec3(wa, 0.0, 0.0));
  s.aniso    = aniso;
  s.anisoDir = gDir;

  // ------------------------------------------------------------------ wear ---
  // p3's rot field saturates over the heel and now reaches mid-blade, and
  // applyRot overwrites albedo/rough/metal outright — so without this, every
  // facet above is simply deleted wherever the crust lands. High on the proud,
  // handled, honed geometry; near zero in the fuller trench, which is exactly
  // where standing water sat.
  float wr2 = clamp(apex*1.00 + bevelM*0.74 + crease*0.88 + crest*0.52, 0.0, 1.0);
  // The same drift that stops the honed rim reading as a constant-width stroke
  // also stops the bare-metal band doing so.
  wr2 *= 0.52 + 0.72*hone;
  wr2 *= 1.0 - 0.88*fulM;                      // recess: let the rot have it
  wr2 *= 1.0 - 0.62*blunt;                     // raw stock was never polished
  s.wear = clamp(wr2, 0.0, 1.0);

  // --------------------------------------------------------- micro-normal ----
  // Build the surface tangent frame so the same heightfield works on the flat,
  // on the bevel and on the fuller wall without any of them being special-cased.
  vec3 T = cross(n, vec3(0.0, 1.0, 0.0));
  float tl = length(T);
  T = tl > 1e-3 ? T/tl : vec3(1.0, 0.0, 0.0);   // across the blade
  vec3 B = cross(n, T);                          // along the blade

  const float e = 0.0016;
  // Low-frequency hand-grind waviness — forward differences into a gradient.
  float w0 = p2_wave(p.x,     p.y,     side);
  float wx = p2_wave(p.x + e, p.y,     side);
  float wy = p2_wave(p.x,     p.y + e, side);
  float gwx = (wx - w0)/e;
  float gwy = (wy - w0)/e;

  // Grinding striations: only differenced across the blade, because that is the
  // only axis they actually vary on.
  const float e2 = 0.00060;
  float s0 = p2_grindN(p.x,      p.y, side);
  float sx = p2_grindN(p.x + e2, p.y, side);
  float gsx = (sx - s0)/e2;

  // Waviness must survive on the flats and get damped on the honed bevel (it
  // was ground true) and on the raw stock (it was never ground at all).
  // CUT TO ~1/3 in round 3. This was a stand-in for a lobe the material could
  // not previously express; now that it can, keeping the old amplitude just
  // buckles the streak the anisotropy is drawing. What remains is form, not
  // breakup.
  float wAmp = P2_WAVE_AMP * (1.0 - 0.55*bevelM) * (1.0 - 0.55*apex) * (1.0 - 0.35*blunt) * (0.75 + 0.55*flatM);
  float sAmp = 0.00017 * (1.0 - 0.50*bevelM) * (1.0 - 0.60*apex) + 0.00011*fulM;

  s.nPerturb = T * (-gwx*wAmp - gsx*sAmp)
             + B * (-gwy*wAmp*1.15);

  s.albedo = base;
  s.metal  = 1.0;
  s.rough  = rough;
  // The fuller floor is a trench: it sees less of the room than the flat does.
  s.ao     = 1.0 - 0.22*fulM - 0.10*blunt;

  return s;
}
