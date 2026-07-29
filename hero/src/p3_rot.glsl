// ============================================================================
// PIECE 3 — THE ROT (corrosion, decay, blight)
// Owns: everything that eats the weapon. Applies to ALL parts.
// Contract: float rotDisplace(vec3 p, int mid);          // geometry damage
//           Surf  applyRot(Surf s, vec3 p, vec3 n, int mid);  // surface
//
// Structure of the model:
//   p3_field()  = the MOISTURE MAP. Where corrosion could ever take hold.
//                 Pools in the concave seams, runs downward with gravity,
//                 climbs from the hilt in tongues, spares the handled palm.
//   rotDisplace = geometry only, and deliberately cheap: it runs 220x per
//                 camera ray plus every shadow step and AO tap.
//   applyRot    = all the expensive layering, once per pixel: broad stain,
//                 nucleating spots, coalescing flake plates, fine pitting.
//
// The transition is staged, not blended: clean steel -> discoloured halo ->
// isolated blooms -> merging scabs -> consumed crust. That progression is
// what makes it read as *spreading* instead of *applied*.
// ============================================================================

// ---------------------------------------------------------------- helpers --

// Approximate blade half-width from dims() alone, so this module never
// depends on p1's internal helpers (another agent may be rewriting them).
float p3_halfW(float y){
  Dims D = dims();
  float u = clamp(y / max(D.bladeLen, 1e-3), 0.0, 1.0);
  return D.bladeHalfW * mix(1.0, 0.60, smoothstep(0.02, 0.82, u));
}

// The corrosion cell lattice. rotDisplace carves it and applyRot shades it
// at the SAME frequency, so every crater floor is dark and every surviving
// ridge catches light. Coherence between the two is what stops it reading as
// texture pasted over unrelated bumps.
#define P3_CELL vec3(19.0, 16.0, 19.0)

// An unwarped voronoi lattice reads as a turtle shell: evenly sized cells with
// continuous grout lines. Two things fix that, and both ride on one noise
// sample so geometry and shading stay on the SAME lattice:
//   .xyz  a domain warp, which bends the cell walls off the grid
//   .w    a per-region control that varies how much of each cell is eaten,
//         so pit SIZE varies from fine speckle to wide open craters.
vec4 p3_cellSpace(vec3 p){
  float w = vnoise(p*vec3(3.3, 2.4, 3.3) + 61.0);
  float k = w - 0.5;
  return vec4(p + vec3(k, k*0.65, -k)*0.115, w);
}

// 0 at the blade's centre plane, 1 at the honed edge.
float p3_edgeU(vec3 p){
  return abs(p.x) / max(p3_halfW(p.y), 1e-4);
}

// ------------------------------------------------------------ moisture map --
// 0 = pristine, 1 = fully consumed. `oct` lets the raymarcher buy a cheap
// version of the same field the shader uses, so geometry and surface agree.
float p3_field(vec3 p, int mid, int oct){
  Dims D = dims();
  float L = max(D.bladeLen, 0.4);

  // (a) The blight came up out of the hilt. It dies out well before the tip —
  //     most of the blade has to stay steel or there is no contrast, no story.
  float climb = 1.0 - smoothstep(-0.22, 0.66*L, p.y);

  // (b) Moisture SAT in the concave seams: guard/blade junction, and the
  //     collar where the grip meets the pommel. Corrosion is a map of where
  //     water could not drain.
  float pool = 0.90*exp(-abs(p.y - 0.012)*8.5)
             + 0.60*exp(-abs(p.y + D.gripLen + 0.052)*12.0);

  // (c) Gravity. Blotches sampled with y strongly compressed become vertical
  //     runs and tongues rather than round patches.
  float run = fbm(vec3(p.x*9.0, p.y*0.90, p.z*9.0) + vec3(13.0, 0.0, 5.0), oct);

  float drive = climb*0.94 + pool*0.36;

  // The broken front only exists where there is drive — otherwise stray noise
  // would seed rust on clean steel halfway up the blade.
  float amp = 1.15*smoothstep(0.03, 0.30, drive);
  float front = drive + (run - 0.5)*amp;

  // Deliberately long ramp: this IS the transition zone. The low tail of r is
  // the discoloured halo, which has to reach well beyond the crust.
  float r = smoothstep(0.00, 0.88, front);

  // Where it is truly soaked, nothing survives.
  r = max(r, smoothstep(0.82, 1.12, drive));

  // (d) Isolated outbreak colonies quarantined further up the clean steel.
  // Quarantined outbreaks well up the clean steel, ahead of the main front.
  // They are what makes the transition read as *spreading* rather than as a
  // zone that was painted on up to a line — and they carry it into the upper
  // half of the weapon, which round 1 left at exactly 0% coverage.
  float col = vnoise(p*vec3(5.0, 2.6, 5.0) + vec3(37.0, 3.0, 19.0));
  col  = smoothstep(0.54, 0.77, col);
  col *= smoothstep(0.10*L, 0.24*L, p.y) * (1.0 - smoothstep(0.58*L, 0.96*L, p.y));
  r = max(r, col*0.78);

  // A second, sparser and much finer generation: single seeds, no colony
  // around them yet, reaching nearly to the tip. These have to be DISCRETE and
  // opaque, not a veil: the blade renders near clipping, so a soft tarnish
  // wash is compressed away by the tonemap while a hard dark pit still punches
  // through. Sparse hard marks are the only stage-1 signal that survives up
  // there — verified by driving the wash to full and watching nothing happen.
  float sd = vnoise(p*vec3(11.0, 5.5, 11.0) + vec3(3.0, 51.0, 88.0));
  sd  = smoothstep(0.64, 0.85, sd);
  sd *= smoothstep(0.22*L, 0.40*L, p.y) * (1.0 - smoothstep(0.86*L, 1.06*L, p.y));
  r = max(r, sd*0.66);

  // (e) Leather is not iron. It stains and goes soft and mouldy, but it does
  //     not scale off in plates — and the palm has been gripped and wiped.
  if (mid == 3){
    float g = clamp((-p.y - 0.040) / max(D.gripLen, 1e-3), 0.0, 1.0);
    float palm = smoothstep(0.10, 0.34, g) * (1.0 - smoothstep(0.62, 0.92, g));
    r *= 0.78 * mix(1.0, 0.30, palm);
  }

  return clamp(r, 0.0, 1.0);
}

// -------------------------------------------------------------- geometry ---
// CHEAP BY CONTRACT. One worley, one 3-octave fbm, two 1-tap noises.
float rotDisplace(vec3 p, int mid){
  // Leather: swells and shrinks, never pits.
  if (mid == 3){
    float rl = p3_field(p, mid, 2);
    if (rl < 0.06) return 0.0;
    return (vnoise(p*vec3(20.0, 34.0, 20.0)) - 0.5)*0.0038*rl;
  }

  float r = p3_field(p, mid, 3);
  if (r < 0.10) return 0.0;

  // THE RELIC CORE DOES NOT CORRODE. It shares the pommel's material id, so
  // without this the rot chews the focal element of the whole image into
  // scallops. Cut stone spalls, it does not pit like iron — and the contrast
  // between an intact stone and a setting eaten out from under it is the
  // point. Feathered over ~10 thou so the SDF stays continuous.
  if (mid == 4){
    float gm = smoothstep(-0.0015, 0.0110, gemSDF(p));
    if (gm < 0.02) return 0.0;
    r *= gm;
  }
  // Geometry only appears where there is actual crust, not out in the halo.
  r = smoothstep(0.10, 0.55, r);

  // SIGN MATTERS: this value is ADDED to the distance field, so POSITIVE eats
  // the surface inward and negative swells it outward. Corrosion removes
  // metal, so the craters must be positive — negative craters render as
  // blisters, which is why so much procedural rust looks like barnacles.
  // ONE cellular field read two ways:
  //   F1 near zero      -> the floor of a crater  (bites in)
  //   F2-F1 near zero   -> the ridge of crust left standing between them
  vec4 cs = p3_cellSpace(p);
  vec2 w  = worley(P3_CELL*cs.xyz);
  float th = mix(0.26, 0.78, cs.w);      // pit size varies region to region
  float crater = smoothstep(th, th*0.10, w.x);
  float ridge  = smoothstep(0.06, 0.00, w.y - w.x);

  // Edges have more exposed surface per unit metal, so they go first.
  float ek = 1.0;
  if (mid == 1) ek = 1.0 + 1.2*smoothstep(0.58, 1.00, p3_edgeU(p));

  // Fine grain is zero-mean: it roughens without moving the form.
  float fine = vnoise(p*vec3(46.0, 40.0, 46.0)) - 0.5;

  float d = crater*0.0080*r*ek*(0.55 + 0.75*cs.w) - ridge*0.0013*r + fine*0.0026*r;

  // Big irregular bites out of the honed edge. This is the part that has to
  // read in the silhouette at thumbnail size — fine pitting never will.
  if (mid == 1){
    float nick = smoothstep(0.44, 0.86, vnoise(vec3(3.0, p.y*6.5, 1.0)));
    d += nick * smoothstep(0.55, 0.95, p3_edgeU(p)) * 0.020 * r;
  }

  return d;
}

// ----------------------------------------------------- micro relief (bump) --
// Sampled 4x per pixel for a gradient. Kept to one worley + one noise.
// Deliberately several times finer than P3_CELL: this is grain UNDER the
// craters, and if the two frequencies are close they alias into one mesh.
float p3_bump(vec3 q){
  vec2 b = worley(q*vec3(58.0, 50.0, 58.0));
  return b.x*0.45 + vnoise(q*128.0)*0.22;
}

// ------------------------------------------------------------ value ramp ---
// THE WHOLE POINT OF ROUND 2. Corrosion is a VALUE phenomenon, not a chroma
// one: near-black pit floors, a mid crust, and pale dry efflorescence on the
// high points, spanning roughly 0.03..0.55 rendered luminance within a square
// inch. Round 1 had 0.70 saturation across 0.13 of value range and read as
// orange foam. Here the three anchors are almost neutral; a separate tint
// (see p3_tint) supplies what little chroma there is.
vec3 p3_tone(float v){
  // The dark anchor carries REAL chroma. Deep iron oxide holds a warm
  // red-brown bias all the way down, and dead scale goes brown-black, never
  // neutral-black. Trading chroma for value overshot here first time: the
  // floors flattened to grey and stopped reading as oxide at all — they read
  // as dirt in a hole. Note the albedo is deliberately not as low as it looks
  // it should be; the DARKNESS of a pit floor is supplied by the cavity AO
  // below, so the albedo is free to carry hue instead of carrying value.
  vec3 dark = vec3(0.0330, 0.0158, 0.0098);   // soaked pit floor, red-brown
  vec3 mid  = vec3(0.0980, 0.0810, 0.0665);   // bulk crust
  vec3 pale = vec3(0.7300, 0.6820, 0.6060);   // salt / oxide efflorescence
  // Lower half squared, so the bulk crust sits low and the floors go properly
  // black. Upper half LINEAR — squaring it too was the bug that quietly ate
  // the efflorescence: raising the pale anchor moved the render not at all.
  float t0 = clamp(v/0.58, 0.0, 1.0);
  float t1 = clamp((v - 0.58)/0.42, 0.0, 1.0);
  return mix(mix(dark, mid, t0*t0), pale, t1);
}

// Hue rides a field of its OWN (see applyRot). Each tint has mean ~1 so it
// shifts hue without moving value — value and hue stay independent by
// construction, which is what round 1 failed at.
vec3 p3_tint(float f){
  vec3 tFerric = vec3(1.42, 0.82, 0.72);   // ~ 9 deg  red iron oxide, hematite
  vec3 tOchre  = vec3(1.34, 0.96, 0.55);   // ~31 deg  ferric hydroxide
  vec3 tKhaki  = vec3(1.12, 1.03, 0.72);   // ~47 deg  dried scale, low chroma
  return (f < 0.45) ? mix(tFerric, tOchre, f/0.45)
                    : mix(tOchre, tKhaki, (f - 0.45)/0.55);
}

// --------------------------------------------------------------- surface ---
Surf applyRot(Surf s, vec3 p, vec3 n, int mid){
  float r = p3_field(p, mid, 4);

  // The rot answers to the form, not just to position: upward-facing surfaces
  // held the water, edges present more surface, and the blade's flats — the
  // parts that got wiped down — hold out longest.
  float up   = clamp(n.y*0.5 + 0.5, 0.0, 1.0);
  float edge = (mid == 1) ? smoothstep(0.50, 1.00, p3_edgeU(p)) : 0.0;
  // Undersides drained and stayed cleaner. Keeping them readable is what lets
  // the guard still read as a forged bar instead of a lump of rust.
  r = clamp(r*(0.58 + 0.66*up + 0.26*edge), 0.0, 1.0);

  // WEAR. The part modules mark their arrises, raised lands and handled areas;
  // those are knocked clean by use and the rot has to yield there. Without
  // this the field saturates to 1.0 across the whole hilt, applyRot overwrites
  // albedo/roughness/metalness, and p4/p5/p6 contribute literally nothing to
  // any camera-facing surface — proven twice, with pixel-identical renders.
  // Oxide down in the recesses against bare metal on the proud edges is most
  // of what makes corroded steel read as metal instead of as mud.
  float prot = clamp(s.wear, 0.0, 1.0);
  float hold = smoothstep(0.06, 0.72, prot);
  r *= 1.0 - 0.90*hold;

  // The relic core is stone. It does not corrode, and it is the focal point of
  // the entire image — it must not be indistinguishable from the rust around
  // it. The metal setting that holds it still gets eaten. This mask gates the
  // tarnish below as well as the crust: a dulled, run-stained gem is just as
  // dead as a pitted one.
  float gemM = (mid == 4) ? smoothstep(-0.0015, 0.0110, gemSDF(p)) : 1.0;
  r *= gemM;

  // -- STAGE 1: THE HALO. Still metal, just soured and dulled. ---------------
  // THIS RUNS BEFORE THE EARLY-OUT, and that is the whole point. Water carrying
  // dissolved iron drained down the blade long before anything bit, so the
  // discolouration reaches far above the crust front. Round 1 computed this
  // block *after* `if (r < 0.012) return s;`, so the halo could only exist
  // where there was already crust — which is exactly why the upper half of the
  // weapon measured 0% and the transition read as a painted zone with an edge.
  float Lb = max(dims().bladeLen, 0.4);
  float streak = fbm(vec3(p.x*24.0, p.y*0.85, p.z*24.0) + 71.0, 3);
  // Run-off drains, ungated: thin vertical stripes thinning out with height.
  // Reaches PAST the tip, so nothing on the blade is perfectly pristine — the
  // faintest sourness still touches the point. The crust must not follow it
  // up there: the bright tip is the focal highlight and rot on it would fight
  // the composition. Halo far, crust near.
  float reach  = 1.0 - smoothstep(0.03*Lb, 1.14*Lb, p.y);
  // Deliberately high contrast between drain and no-drain: a uniform veil at
  // this strength turns the blade into unfinished cast iron (verified — it
  // kills the rim and the grind together). Stripes read; a wash does not.
  float runoff = reach*mix(0.45, 1.0, reach)
               * (0.10 + 1.10*smoothstep(0.42, 0.72, streak))
               * (0.55 + 0.45*up);
  float stain  = smoothstep(0.02, 0.30, r);                  // halo around crust
  float st = clamp(stain*(0.45 + 1.05*smoothstep(0.46, 0.74, streak))
                 + runoff*2.20, 0.0, 1.0);
  st *= (1.0 - 0.72*hold) * gemM;
  // On a blade this bright the halo can only register by killing the MIRROR:
  // a tarnished patch scatters, so the highlight dies there and the patch
  // reads as a dark smudge. Tinting it warm alone does nothing at all against
  // a near-blown specular.
  s.albedo = mix(s.albedo, s.albedo*vec3(0.58, 0.49, 0.42) + vec3(0.011, 0.009, 0.008), st*0.88);
  s.rough  = mix(s.rough, clamp(s.rough + 0.42, 0.0, 1.0), st*0.90);
  s.metal  = mix(s.metal, s.metal*0.58, st);
  s.aniso  = mix(s.aniso, s.aniso*0.35, st);      // tarnish scatters the grain
  s.ao     = mix(s.ao, s.ao*0.88, st);

  if (r < 0.012) return s;

  // -- NUCLEATION -----------------------------------------------------------
  // As r climbs, the threshold drops. Spots appear discretely, widen, and
  // finally merge. One monotone mechanism, but it reads as four stages.
  float seed = vnoise(p*vec3(8.4, 7.0, 8.4) + 5.0)*0.64
             + vnoise(p*vec3(3.0, 2.4, 3.0) + 17.0)*0.36;
  float thP  = mix(0.88, 0.02, smoothstep(0.12, 0.92, r));
  // Border width is the transition: crisp flake edges deep inside the crust,
  // soft diffuse ones at the advancing front, so the frontier never reads as
  // a cut-out decal boundary.
  float bw = mix(0.22, 0.055, smoothstep(0.25, 0.72, r));
  float plate = smoothstep(thP, thP + bw, seed);
  float plateEdge = plate*(1.0 - plate)*4.0;         // the lip of a scab

  float grain = vnoise(p*vec3(23.0, 20.0, 23.0) + 9.0);
  float thF   = mix(0.90, 0.16, r);
  float speck = smoothstep(thF, thF + 0.16, grain);

  // Iron crusts in patches AND peppers with fine pits. Leather does not
  // pepper — it goes in soft blotches — so it drops the fine term.
  float covN = (mid == 3) ? plate*0.92
                          : clamp(plate*0.76 + speck*0.28, 0.0, 1.0);
  float cov  = covN * smoothstep(0.09, 0.30, r);             // actual crust
  float deep  = plate * smoothstep(0.55, 0.96, r);           // consumed

  // -- CELLULAR STRUCTURE INSIDE THE CRUST ----------------------------------
  vec4 cs = p3_cellSpace(p);
  vec2 wp = worley(P3_CELL*cs.xyz);                          // == the geometry
  vec2 wf = worley(cs.xyz*vec3(52.0, 44.0, 52.0));           // fine pitting
  // Ragged the crater rim with a much finer noise, or every cell reads as a
  // clean round blob and the whole crust turns into animal print.
  float thC = mix(0.26, 0.78, cs.w) * (0.80 + 0.40*vnoise(p*vec3(74.0, 66.0, 74.0) + 12.0));
  float craterFloor = smoothstep(thC, thC*0.10, wp.x);       // sunken, dark
  float flakeRim    = smoothstep(0.09, 0.0, wp.y - wp.x);    // standing ridge
  float pitFloor    = smoothstep(0.30, 0.02, wf.x);

  // -- VALUE ----------------------------------------------------------------
  // Everything the eye reads as crust lives in this one scalar. Build it out
  // of the SAME cellular masks the geometry was carved from, so a dark pixel
  // is dark because there is a hole there, not because a noise said so — that
  // coherence is what survives conversion to greyscale.
  float age = fbm(p*vec3(5.2, 3.4, 5.2) + 41.0, 3);

  // Only some ridges are still live. A continuous bright grout line around
  // every cell is the single loudest voronoi tell there is.
  float live = smoothstep(0.34, 0.62, fbm(p*vec3(9.0, 6.0, 9.0) + 97.0, 2));

  // EFFLORESCENCE. Salts wicked out of the wet crust and dried on the exposed
  // high points as a pale, powdery, almost colourless bloom. This is the top
  // end of the value range and round 1 had none of it at all — which is half
  // the reason the corrosion had 0.13 of spread. It sits on plate interiors,
  // never in the craters (still wet), and prefers what faces up.
  // It has to drift across the crust at a scale UNRELATED to the cells —
  // sampled anywhere near P3_CELL it lands one cap on each cell and the whole
  // surface turns into leopard print.
  float efl = smoothstep(0.37, 0.75, fbm(p*vec3(4.4, 3.1, 4.4) + vec3(5.0, 88.0, 3.0), 3));
  float bloom = efl * mix(0.55, 1.0, plate) * (1.0 - craterFloor*0.85)
              * (0.54 + 0.46*up) * smoothstep(0.20, 0.62, r);

  // Three scales of value, deliberately: slow mottling, cell-scale craters,
  // fine pitting. One dominant frequency is what makes procedural corrosion
  // read as animal print, so no single term is allowed to own the range.
  // MOST OF THE RANGE LIVES ON THE LOW FREQUENCY. Spending it per-cell reads
  // as animal print; spending it on big soaked-black regions grading out to
  // big dry pale ones reads as a front that is advancing. Same numbers, and
  // only one of them is a picture of decay.
  float vf = 0.46 + (age - 0.5)*1.00;      // slow mottling of the bulk crust
  // Craters are dark because they are HOLES, not because the oxide in them is
  // a different colour — that work belongs to the geometry and to the cavity
  // AO below. Paying for it a third time in albedo is what turned the crust
  // into leopard print: three coincident copies of one frequency.
  vf -= (craterFloor*0.10 + craterFloor*craterFloor*0.30)*(0.45 + 0.55*deep);
  vf -= pitFloor*0.30;                     // fine scale competes with the cells
  vf -= plateEdge*0.30;                    // the undercut lip of a scab
  vf += flakeRim*0.20*live;                // standing ridge still catching
  vf += bloom*1.04;                        // the pale dry top end
  vf  = clamp(vf, 0.0, 1.0);

  // -- HUE, on a field of its OWN -------------------------------------------
  // Round 1 rode hue and value both on `age`, so the "four hues" measured as
  // one 6-degree window. Hue now has an independent, lower-frequency field:
  // a dark patch is no more likely to be red than to be ash-grey.
  float hueF = fbm(p*vec3(2.2, 1.45, 2.2) + vec3(133.0, 17.0, 58.0), 3)
             + (vnoise(p*vec3(7.5, 5.2, 7.5) + vec3(211.0, 9.0, 40.0)) - 0.5)*0.34;
  hueF = clamp((hueF - 0.5)*2.4 + 0.5, 0.0, 1.0);
  vec3 tintRaw = p3_tint(hueF);

  // Necrotic bloom — the thing that makes it rot rather than rust. Its own
  // mask again, so olive lands as a real region instead of a rounding error.
  vec3  tBlight = vec3(0.94, 1.10, 0.64);   // ~68 deg
  float blightM = smoothstep(0.54, 0.79, fbm(p*vec3(3.4, 2.2, 3.4) + vec3(60.0, 7.0, 2.0), 3))
                * smoothstep(0.26, 0.70, r);
  tintRaw = mix(tintRaw, tBlight, blightM*0.62);

  // CHROMA IS A CURVE OVER VALUE, not one global trim. Flattening it applied
  // the same reduction to the floors as to the crust, and the floors — which
  // have almost no luminance to spend — went neutral and stopped reading as
  // oxide. Deep wet oxide is the MOST chromatic thing on the surface; the mid
  // crust is modest; the dry salt bloom on top is nearly colourless.
  float chroma = mix(1.22, 0.74, smoothstep(0.04, 0.44, vf));
  chroma = mix(chroma, 0.26, smoothstep(0.52, 0.92, vf));
  vec3 tint = mix(vec3(1.0), tintRaw, chroma);

  vec3 oxide = p3_tone(vf) * tint;

  // A genuine warm accent — young oxide still being fed air and water — kept
  // to the live standing ridges only, which is well under a tenth of the area.
  vec3 cFresh = vec3(0.150, 0.070, 0.030);
  oxide = mix(oxide, cFresh, flakeRim*live*0.40*(1.0 - deep*0.45)*(1.0 - bloom));

  // Leather does not scale into oxide. It goes black and wet where it soaked,
  // and blooms a pale grey-green mould where it dried — the pale bloom is the
  // only thing that will actually read against dark leather.
  if (mid == 3){
    vec3 wet   = vec3(0.012, 0.011, 0.010);
    vec3 mould = vec3(0.230, 0.235, 0.195);
    oxide = mix(wet, mould, smoothstep(0.12, 0.66, blightM*0.8 + seed*0.55 + efl*0.35));
  }

  // -- STAGE 2..4: the crust itself. ----------------------------------------
  // Roughness tracks VALUE too: the dry pale bloom is powder (dead matte), the
  // wet dark floors are slicker. Material hierarchy has to survive greyscale.
  float oxRough = mix(0.70, 0.95, clamp(grain*0.6 + age*0.4, 0.0, 1.0));
  oxRough = mix(oxRough, 0.60, flakeRim*0.45*live);   // live scab rims are slicker
  oxRough = mix(oxRough, 0.98, bloom);                // efflorescence is powder
  oxRough = mix(oxRough, 0.55, craterFloor*0.45);     // floors held the water
  if (mid == 3) oxRough = clamp(oxRough + 0.05, 0.0, 1.0);

  s.albedo = mix(s.albedo, oxide, cov);
  s.metal  = mix(s.metal, 0.02, cov);
  s.spec   = mix(s.spec, mix(0.20, 0.09, bloom), cov);   // oxide F0 is low
  s.rough  = mix(s.rough, oxRough, cov);
  s.aniso  = mix(s.aniso, 0.0, cov);              // crust has no grain direction
  // Cavity occlusion at the cell scale — driven to full, because after the
  // albedo chroma came down this is the other half of the value range.
  // Leather has no pits to occlude, so it is exempt or it just reads peppery.
  float cav = clamp(craterFloor*1.00 + pitFloor*0.45 + plateEdge*0.30, 0.0, 1.0);
  if (mid == 3) cav *= 0.25;
  s.ao     = mix(s.ao, s.ao*mix(0.94, 0.18, cav)*mix(1.0, 0.78, deep), cov);

  // -- RELIEF ---------------------------------------------------------------
  // Gradient of the cellular relief, projected onto the surface, so each
  // flake and pit catches light on one side instead of shimmering uniformly.
  float e = 0.0035;
  float h0 = p3_bump(p);
  vec3 g = vec3(p3_bump(p + vec3(e, 0.0, 0.0)) - h0,
                p3_bump(p + vec3(0.0, e, 0.0)) - h0,
                p3_bump(p + vec3(0.0, 0.0, e)) - h0) / e;
  g -= n*dot(n, g);
  g /= (1.0 + length(g)*0.06);
  s.nPerturb += -g * (0.026*cov) * ((mid == 3) ? 0.20 : 1.0);

  // Plate-scale waviness so the corroded areas are not flat under the detail.
  float wob = fbm(p*vec3(7.0, 5.5, 7.0) + 23.0, 3) - 0.5;
  s.nPerturb += vec3(wob, wob*0.4, wob)*0.22*cov;

  // -- EMISSIVE: sparse and hierarchical. -----------------------------------
  // A few deep fissures burning, not a glowing net. Restraint here is the
  // difference between a cursed artifact and a toy with LEDs.
  // Only a few regions host anything burning at all.
  // Now that the crust has real value range the glow finally registers — which
  // means it also has to be pulled WAY back, or it reads as lichen speckle
  // instead of as a few fissures with something alive down them. Higher vein
  // threshold, cores only, and it burns amber-into-green rather than lime.
  float veinR = smoothstep(0.68, 0.88, vnoise(p*vec3(2.2, 1.5, 2.2) + vec3(71.0, 13.0, 29.0)));
  // Light comes from DOWN in the damage, not off its surface: it needs a fine
  // pit sunk inside a crater, so it can only ever appear in the deepest places.
  float fis  = smoothstep(0.030, 0.0, wf.y - wf.x);
  float core = pitFloor * craterFloor;
  float glow = veinR * smoothstep(0.52, 0.92, r)
             * clamp(fis*0.22 + core*0.95, 0.0, 1.0) * cov;
  glow *= (mid == 3) ? 0.10 : 1.0;
  s.emissive += (vec3(0.16, 0.13, 0.03) + vec3(0.50, 0.66, 0.16)*smoothstep(0.35, 0.95, glow))
              * glow * 1.5;

  return s;
}
