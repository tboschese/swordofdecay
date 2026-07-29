// ============================================================================
// PIECE 5 — GRIP
// Owns: the handle — core, wrap, fittings, and its material.
// Contract: float sdGrip(vec3 p);  Surf shadeGrip(vec3 p, vec3 n);
//
// FORM BRIEF: a two-hand grip assembled from five readable parts, bottom to
// top: POMMEL FERRULE · WRAP · MID BAND · WRAP · GUARD FERRULE. Each fitting
// is a turned bronze collar with a proud flange and a scribed rib, stepped
// against the wrap, so the grip terminates INTO the guard and the pommel
// instead of interpenetrating them.
//
// The wrap is an actual STRAND swept along a helix and unioned onto the core —
// not a sine subtracted from a cylinder. That distinction is the whole point:
// a subtracted sine gives a threaded screw (symmetric grooves, nothing
// standing proud); a swept strand gives turns that lie ON the core with a
// narrow dark crease where they meet, so the turns can be counted and each one
// carries its own sliver of light. Its section is wide and low — a strap
// hauled down flat, not a rope. The pitch is not constant: a slow term crowds
// the turns against the ferrules and a faster term jitters them turn to turn,
// which is what hand-winding looks like. One run of turns near the lower hand
// has parted, exposing the bare core.
//
// WHERE THE METAL LIVES. p3 spares the palm of the grip (it was gripped and
// wiped) and drowns both ends, so the end ferrules will be eaten no matter
// what this module does — fighting that would be pointless. The MID BAND sits
// squarely in the protected zone, which is why the grip still gets one clean,
// legible piece of metal: the eye's rest point, and the proof that the wrap
// beside it is not metal.
//
// The leather must read as NOT METAL with the colour removed: roughness is
// floored well above the steel's, the sheen is broad and low, and the crease
// between turns goes fully matte. That contrast against the band is the
// material hierarchy.
// ============================================================================

#define P5_ZS   1.22    // section is 1.22:1 wide-to-thick (an oval, not a tube)
#define P5_NT   15.0    // turns of strand across the wrapped length
#define P5_PA   2.0     // slow pitch drift — turns crowd at both ends
#define P5_PJ   1.3     // fast pitch jitter — turn-to-turn irregularity
#define P5_PJF  3.7     // ...and its frequency, in cycles over the wrap
#define P5_HW   0.0108  // the strand's own half-width — a CONSTANT
#define P5_HT   0.0082  // ...and its height above the core
#define P5_OVW  0.34    // overlap: how much further the riding-over edge reaches
#define P5_OVH  0.50    // ...and how much higher it stands than the tucked edge

// ------------------------------------------------------------- extents ------
float p5_topY(){ return -0.040; }
float p5_botY(){ return -0.040 - dims().gripLen; }

// The wrap runs a little way UNDER each flange so its cut ends never show.
float p5_wrapT(){ return p5_topY() - 0.050; }
float p5_wrapB(){ return p5_botY() + 0.052; }

// Mid band, in grip-fraction u. 0.47 sits deep inside p3's rot-protected palm,
// so it stays clean metal. The lower ring at 0.68 sits right on the edge of
// that protection, so it comes out half-eaten — which is the transition the
// hilt needs between the clean band and the drowned end ferrules.
#define P5_BANDU 0.47
#define P5_BANDH 0.0135
#define P5_RINGU 0.70
#define P5_RINGH 0.0078
float p5_bandY(){ return p5_topY() - P5_BANDU*dims().gripLen; }
float p5_ringY(){ return p5_topY() - P5_RINGU*dims().gripLen; }

// ------------------------------------------------------------- the helix ----
// Turn index as a function of v (0 at the top of the wrap, 1 at the bottom).
// Two sine terms on the DERIVATIVE, integrated: dT/dv swings between ~10 and
// ~20, so the spacing both drifts along the length and jumps from one turn to
// the next. A constant pitch is the single loudest "this is a screw thread"
// tell there is.
float p5_turn (float v){
  return P5_NT*v + P5_PA*sin(TAU*v)*(1.0/TAU)
       + P5_PJ*sin(TAU*P5_PJF*v + 1.3)*(1.0/(TAU*P5_PJF));
}
float p5_dturn(float v){
  return P5_NT + P5_PA*cos(TAU*v) + P5_PJ*cos(TAU*P5_PJF*v + 1.3);
}

// How hard this stretch was hauled down. Fat, proud turns where the tension
// was high; flatter, slacker ones where the winder let it run.
float p5_tension(float v){
  return clamp(0.5 + 0.34*sin(v*TAU*2.3 + 0.9) + 0.16*sin(v*TAU*5.7 + 2.4), 0.0, 1.0);
}

// Core radius under the wrap: tapers toward the pommel with a shallow swell
// through the middle, so the silhouette is not a parallel tube.
float p5_coreR(float u){
  return 0.0300*(1.0 - 0.10*u) + 0.0016*sin(u*PI);
}

// One run of turns near the lower hand has parted. 1 = intact, falling toward
// 0.2 across the failure — and it fails worse on the side facing camera,
// because a wrap that came undone on the hidden side did not come undone.
float p5_intact(vec3 q, float v, float rho){
  float band = 1.0 - smoothstep(0.0, 0.062, abs(v - 0.630));
  float vis  = (q.x*0.44 + q.z*0.90)/max(rho, 1e-4);
  float side = 0.26 + 0.74*smoothstep(-0.30, 0.85, vis);
  return 1.0 - 0.90*band*side;
}

// ----------------------------------------------------------- wrap solver ----
// Everything both the SDF and the shader need, from one place, so geometry and
// shading can never disagree about where a turn is.
// q is the z-scaled point (the grip is round in q space).
void p5_wrap(vec3 q, out float v, out float f, out float sk, out float cr,
             out float A, out float B, out float rho, out float intact,
             out float phi){
  float wt = p5_wrapT(), wb = p5_wrapB();
  float wl = max(wt - wb, 1e-3);

  rho = max(length(q.xz), 1e-4);
  v   = clamp((wt - q.y) / wl, 0.0, 1.0);

  float u = clamp((p5_topY() - q.y) / max(dims().gripLen, 1e-3), 0.0, 1.0);
  cr = p5_coreR(u);

  // Turn parameter: constant along one strand of the helix.
  phi = atan(q.z, q.x);
  float t = p5_turn(v) + phi*(1.0/TAU);

  // |grad t| in world units -> the true centre-to-centre spacing of the turns,
  // which is what the strand's width has to be measured against.
  float gy = p5_dturn(v)/wl;
  float gp = 1.0/(TAU*rho);
  float sp = inversesqrt(gy*gy + gp*gp);

  float fs = fract(t) - 0.5;           // SIGNED position across the strand
  f  = abs(fs)*sp;                     // perpendicular distance to it
  sk = clamp(fs*2.0, -1.0, 1.0);       // -1 at one shared crease, +1 at the other

  intact = p5_intact(q, v, rho);

  // The strand is ONE piece of leather: its width does not change because the
  // winder changed the pitch. Sizing the strand from the local pitch — the
  // obvious shortcut — makes the grip bulge and pinch along its length like a
  // sausage. Fixed width, and the varying pitch shows up where it actually
  // shows up in life: in the GAP between turns. It only narrows where turns
  // crowd hard enough to squeeze it.
  float ten = 0.90 + 0.20*p5_tension(v);

  // THE OVERLAP. A wound strap is not laid edge to edge — each turn is hauled
  // down partly ON TOP of the one before it, so its section is asymmetric: one
  // edge is a LIP standing proud and overhanging, the other is TUCKED under
  // its neighbour. Skewing width and height together by sk does exactly that,
  // and it changes what the line between two turns IS: not the floor of a
  // symmetric groove (a corrugated pipe, which is what was here before) but
  // the shadow under an overhang. That is the one cue a milled thread can
  // never produce. The turns also stay countable, which the old symmetric
  // profile could only manage by keeping the overlap tiny: the step in HEIGHT
  // between a lip and the tucked edge beside it holds the dark line even where
  // the strand now runs right over its neighbour.
  float wid = 1.0 + P5_OVW*sk;                 // reaches further, on the lip side
  float hgt = max(1.0 + P5_OVH*sk, 0.26);      // ...and stands higher there
  A = min(P5_HW*ten*wid, sp*0.62)*intact;      // half-width across the strand
  B = P5_HT*ten*hgt*intact;                    // height standing off the core
}

// ------------------------------------------------------------- fittings -----
// A turned collar: y0..y1, radius lerped r0..r1, edges rounded by rr, with
// `fl` of vertical fluting cut around it.
//
// The fluting is not decoration for its own sake. p3 drowns both ends of the
// grip in oxide, which flattens their albedo to near zero — and a smooth cone
// with near-zero albedo is a black trapezoid, the exact hole in the weapon
// this module exists to close. Flutes give the corroded fitting an alternating
// light/dark rhythm that survives ANY albedo, because it is carried by the
// normal rather than the colour.
float p5_cyl(vec3 q, float y0, float y1, float r0, float r1, float rr,
             float fl, float phi){
  float rho = length(q.xz);
  float mid = 0.5*(y0 + y1), hh = 0.5*(y1 - y0);
  float tt  = clamp((q.y - y0)/max(y1 - y0, 1e-4), 0.0, 1.0);
  float r   = mix(r0, r1, tt) - fl*(0.5 + 0.5*cos(8.0*phi));
  vec2 d = vec2(rho, abs(q.y - mid)) - vec2(r - rr, hh - rr);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - rr;
}

// A raised ring of radius r at height y — the bead that catches the light at
// a seam. One line reads as an accident; a bead plus a scribed rib reads as
// something that was turned on purpose.
float p5_ring(vec3 q, float y, float r, float rad){
  return length(vec2(length(q.xz) - r, q.y - y)) - rad;
}

// ================================================================== SDF =====
float sdGrip(vec3 p){
  Dims D = dims();
  float top = p5_topY();
  float bot = p5_botY();

  // Work in a space where the oval section is round; divide out the largest
  // scale factor at the end so the estimate stays conservative.
  vec3 q = vec3(p.x, p.y, p.z*P5_ZS);

  float v, f, sk, cr, A, B, rho, intact, phi;
  p5_wrap(q, v, f, sk, cr, A, B, rho, intact, phi);

  // --- core ----------------------------------------------------------------
  vec2 dc = vec2(rho - cr, abs(q.y - 0.5*(top + bot)) - 0.5*D.gripLen);
  float core = min(max(dc.x, dc.y), 0.0) + length(max(dc, 0.0));

  // --- the strand: an elliptical tube swept along the helix, lying ON the
  //     core. Wide across, low in height: a strap pulled down, not a rope.
  //
  //     The section is ASYMMETRIC — see p5_wrap. A and B are already skewed by
  //     sk, so the centreline lift has to be skewed with them or the tucked
  //     edge would drop below the core instead of sitting on it.
  float Rc = cr + B*(0.34 + 0.30*sk);
  float e  = length(vec2((rho - Rc)/max(B, 1e-5), f/max(A, 1e-5)));
  float cord = (e - 1.0)*min(A, B);    // rescaled by the smaller axis: safe
  cord = max(cord, abs(q.y - 0.5*(p5_wrapT() + p5_wrapB()))
                   - 0.5*(p5_wrapT() - p5_wrapB()));

  float d = min(core, cord);

  // --- guard ferrule: a proud flange capping the wrap end, then a CONE that
  //     flares up to the guard block's own width. A parallel collar leaves a
  //     dead band of nothing between two parts; a cone is a transition, and
  //     the eye reads it as one piece seated into another.
  d = min(d, p5_cyl (q, top - 0.100, top - 0.082, 0.0505, 0.0496, 0.0055, 0.0000, phi));
  d = min(d, p5_cyl (q, top - 0.086, top,         0.0452, 0.0600, 0.0040, 0.0022, phi));
  d = min(d, p5_ring(q, top - 0.079, 0.0458, 0.0048));
  d = min(d, p5_ring(q, top - 0.103, 0.0462, 0.0044));

  // --- pommel ferrule: the same construction, mirrored. Both beads matter:
  //     down here the key rakes from above, so it is the UPWARD-facing edge
  //     that carries the light, and without it the whole fitting goes flat.
  d = min(d, p5_cyl (q, bot + 0.044, bot + 0.062, 0.0496, 0.0505, 0.0055, 0.0000, phi));
  d = min(d, p5_cyl (q, bot + 0.004, bot + 0.048, 0.0570, 0.0452, 0.0040, 0.0022, phi));
  d = min(d, p5_ring(q, bot + 0.065, 0.0462, 0.0044));
  d = min(d, p5_ring(q, bot + 0.041, 0.0458, 0.0048));

  // --- lower ring: slimmer than the mid band, and half-eaten ----------------
  float ry = p5_ringY();
  d = min(d, p5_cyl (q, ry - P5_RINGH, ry + P5_RINGH, 0.0450, 0.0450, 0.0034, 0.0000, phi));
  d = min(d, p5_ring(q, ry - P5_RINGH, 0.0436, 0.0038));
  d = min(d, p5_ring(q, ry + P5_RINGH, 0.0436, 0.0038));

  // --- mid band: a doubled binding ring, grooved down the middle. It sits in
  //     the palm, which is the one stretch of the grip the rot spares — so it
  //     is the only piece of clean metal the hilt is going to keep.
  float by = p5_bandY();
  float band = p5_cyl(q, by - P5_BANDH, by + P5_BANDH, 0.0464, 0.0464, 0.0038, 0.0000, phi);
  band = max(band, -(p5_ring(q, by, 0.0512, 0.0075)));   // groove down the middle
  band = min(band, p5_ring(q, by - P5_BANDH + 0.0030, 0.0442, 0.0042));
  band = min(band, p5_ring(q, by + P5_BANDH - 0.0030, 0.0442, 0.0042));
  d = min(d, band);

  // The skewed section makes A, B and Rc functions of position, so the cord
  // term's gradient exceeds one by more than the old symmetric profile's did.
  return d * (0.72/P5_ZS);
}

// ============================================================== material ====
// 1 inside the slab [a,b], 0 outside, softened by e.
float p5_slab(float y, float a, float b, float e){
  return smoothstep(a - e, a + e, y)*smoothstep(b + e, b - e, y);
}

// Which fitting are we on? 0 = leather, 1 = bronze.
float p5_metalMask(float y){
  float top = p5_topY(), bot = p5_botY();
  float by = p5_bandY(), ry = p5_ringY();
  float e = 0.0032;
  float mT = smoothstep(top - 0.105 - e, top - 0.105 + e, y);
  float mB = smoothstep(bot + 0.068 + e, bot + 0.068 - e, y);
  float mM = smoothstep(by - P5_BANDH - e, by - P5_BANDH + e, y)
           * smoothstep(by + P5_BANDH + e, by + P5_BANDH - e, y);
  float mR = smoothstep(ry - P5_RINGH - e, ry - P5_RINGH + e, y)
           * smoothstep(ry + P5_RINGH + e, ry + P5_RINGH - e, y);
  return clamp(max(max(mT, mB), max(mM, mR)), 0.0, 1.0);
}

Surf shadeGrip(vec3 p, vec3 n){
  Surf s = defaultSurf();
  Dims D = dims();
  float top = p5_topY();

  vec3 q = vec3(p.x, p.y, p.z*P5_ZS);
  float v, f, sk, cr, A, B, rho, intact, phi;
  p5_wrap(q, v, f, sk, cr, A, B, rho, intact, phi);

  float u = clamp((top - p.y)/max(D.gripLen, 1e-3), 0.0, 1.0);
  float m = p5_metalMask(p.y);

  // Height above the bare core, normalised so 0 = core, 1 = crest of a turn.
  float hn    = clamp((rho - cr)/max(1.30*B, 1e-4), 0.0, 1.4);
  float crown = smoothstep(0.30, 0.90, hn);
  // Across-the-strand position: 0 at its centreline, 1 at its edge. Where this
  // saturates is the crease two turns share.
  float across = clamp(f/max(A, 1e-4), 0.0, 1.6);
  float crease = smoothstep(0.60, 1.00, across);
  // The two sides of a crease are not the same thing. One is the LIP of the
  // strand riding over its neighbour — it catches light and takes the wear.
  // The other is the UNDERCUT it hides — packed with grime and fully occluded.
  float lip  = smoothstep(0.52, 0.94,  sk)*crease;
  float undc = smoothstep(0.52, 0.94, -sk)*crease;
  float bare   = clamp((1.0 - intact)*1.35, 0.0, 1.0)*(1.0 - crown*0.75);

  // Which fittings are the fluted cones (as opposed to the plain bands), and
  // where the flutes' standing ribs are. The cut REMOVES radius where
  // cos(8phi) is +1, so the proud rib is the -1 side.
  float cone = m*clamp(smoothstep(top - 0.086, top - 0.078, p.y)
                     + smoothstep(p5_botY() + 0.052, p5_botY() + 0.042, p.y), 0.0, 1.0);
  vec3  ephi = normalize(vec3(-p.z, 0.0, p.x + 1e-5));
  float rib  = 0.5 - 0.5*cos(8.0*phi);

  // --- leather --------------------------------------------------------------
  float grain = fbm(vec3(p.x*80.0, p.y*150.0, p.z*80.0), 3);
  // Stretched hard in xz, fine in y: reads as the twist striations running
  // around each strand rather than as generic dirt.
  float fibre = fbm(vec3(p.x*95.0, p.y*330.0, p.z*95.0), 2);

  // Strand-to-strand variation. It has to be a function of v alone: any
  // function of the turn index would be discontinuous where atan wraps and
  // would rule a visible seam down one side of the grip.
  float strand = 0.5 + 0.5*sin(v*TAU*4.3 + 1.9) + 0.25*sin(v*TAU*9.1 + 0.4);

  // Two hands, two burnished bands, a less handled stretch between them.
  float hand = max(1.0 - smoothstep(0.0, 0.21, abs(u - 0.26)),
                   1.0 - smoothstep(0.0, 0.21, abs(u - 0.71)));
  float polish = crown*hand;

  // VALUE. These were roughly twice as light, and measured on the render the
  // wrap came out at a mean of 120/255 — the same value as the bronze beside
  // it. Two materials at one value is no material hierarchy at all, whatever
  // their roughness does, and the point of the wrap is to be the dark mass the
  // one clean fitting reads against. Old dark leather is genuinely this
  // black: a 0.08 albedo, and everything you see on it is specular.
  vec3 cDirt = vec3(0.018, 0.014, 0.012);   // grime packed into the crease
  vec3 cCord = vec3(0.082, 0.058, 0.041);   // the strand body
  vec3 cWorn = vec3(0.146, 0.104, 0.072);   // hand-burnished crest
  vec3 cCore = vec3(0.062, 0.050, 0.037);   // dry exposed core

  vec3 base = mix(cDirt, cCord, smoothstep(0.04, 0.72, hn));
  base = mix(base, cWorn, polish*0.66);
  base = mix(base, cDirt, crease*0.55 + undc*0.55);
  base = mix(base, cWorn, lip*hand*0.40);
  base = mix(base, cCore, bare*0.92);
  base *= 0.80 + 0.34*strand;               // some turns darker than others
  base *= 0.78 + 0.44*grain;
  base *= 0.90 + 0.20*fibre;

  // Frayed where the wrap terminates under the flanges — loose fibre catches
  // light, so it goes lighter AND rougher, never merely darker.
  float fray = clamp((1.0 - smoothstep(0.0, 0.085, v)) +
                     (1.0 - smoothstep(0.0, 0.085, 1.0 - v)), 0.0, 1.0);
  fray *= (0.35 + 0.65*fbm(p*300.0, 2))*(1.0 - m);
  base = mix(base, base*1.5 + vec3(0.016, 0.012, 0.009), fray*0.45);

  // Leather response: broad and soft, and floored well above metal roughness
  // so it can never produce a tight highlight. That floor is what keeps the
  // material hierarchy legible once the colour is taken away.
  // 0.54 on the crest was a gloss, not a sheen — under a 4.20 environment it
  // gave the turns hard bright arcs that read as stacked metal washers. The
  // rubric's word for leather is "a soft sheen between the two": the lobe has
  // to stay BROAD, and the crest earns its light by being brighter, not by
  // being tighter.
  float rgh = mix(0.92, 0.64, crown) - 0.09*polish + 0.11*(grain - 0.5)
            + 0.06*(strand - 0.6);
  rgh = mix(rgh, 0.94, crease*0.75);
  rgh = mix(rgh, 0.93, fray*0.55);
  rgh = mix(rgh, 0.90, bare*0.6);
  rgh = clamp(rgh, 0.42, 0.97);

  // Dielectric sheen: low, and confined to the crests. Pushing F0 any higher
  // is exactly how procedural leather ends up looking like copper wire.
  float spc = mix(0.26, 0.62, crown*(0.40 + 0.60*hand)*(1.0 - crease*0.85));
  spc = mix(spc, 0.20, fray*0.6);

  // --- gilt bronze fittings -------------------------------------------------
  // The two end ferrules are fluted cones. p3 drowns both ends of the grip and
  // replaces ~92% of the albedo there with near-black oxide, so whatever hue
  // those fittings keep has to come out of the 8% that survives the mix — a
  // timid brown bronze lands on the same dead grey-green as mouldy leather and
  // reopens the black gap this module exists to close. Hence a real gold-family
  // F0: gilt bronze, which is period-correct for a fitting anyway.
  // NOTE ON THE BRIGHTNESS. This used to be a near-white gilt — F0 (0.98,
  // 0.70, 0.34) — and the header's argument for it was that p3 replaced ~92%
  // of it with oxide anyway, so only a scream would survive the mix. That
  // argument is now void: s.wear (below) holds the rot off the flanges and the
  // band, so what is written here is very nearly what is rendered. Left as it
  // was, the four fittings came out as bars of blown highlight stacked up the
  // handle, four rival focal points against one relic core. Aged gilt bronze,
  // read off the real thing: warm, dark, and nowhere near a mirror.
  float mg = fbm(p*130.0, 3);
  vec3 mcol = vec3(0.640, 0.462, 0.248)*(0.80 + 0.34*mg);

  // Gilding survives on the standing ribs of the flutes and has been rubbed
  // out of the grooves, which is the direction wear actually runs.
  mcol *= 1.0 + 0.34*(rib - 0.5)*cone;

  // Hierarchy between the fittings. The mid band is the piece the palm has been
  // rubbing for a century: its gilding is worn back to plain bronze, but it is
  // the one that stayed POLISHED, so it wins on specular tightness while the
  // gilt ends win on albedo. Four equally hot bands would give the eye four
  // places to land, which is the same as giving it none.
  float mPol = smoothstep(0.19, 0.10, abs(u - P5_BANDU));
  float mRgh = mix(0.58, 0.30, mPol) + 0.16*(mg - 0.5);

  s.albedo = mix(base, mcol*mix(1.0, 0.62, mPol), m);
  s.metal  = m;
  s.spec   = mix(spc, 0.60, m);
  s.rough  = mix(rgh, clamp(mRgh, 0.22, 0.76), m);

  // --- WEAR ------------------------------------------------------------------
  // The half of the contract this module was not holding up. p3's field
  // saturates across the whole hilt and applyRot then overwrites albedo,
  // roughness and metalness — so until this is set, everything above is
  // computed and thrown away, and the wrap renders as the pale grey-green
  // mould colour from p3 with no leather anywhere in it. Verified directly:
  // forcing s.wear = 1.0 turns the grip from grey rings into brown leather.
  //
  // The header already reasoned about WHERE the metal lives, but it had to
  // reason about it second-hand — hoping p3's palm exemption happened to land
  // on the mid band. This states it instead.
  //
  // LEATHER. A wrap is handled constantly; its high points stay burnished and
  // its creases hold the damp. So: the crest of each turn, hardest under the
  // two hands, and the proud lip of the overlap — which is precisely the edge
  // that takes the rub, because it is the edge that stands out from the grip.
  float wL = crown*(0.68 + 0.32*hand);
  wL = max(wL, lip*(0.72 + 0.28*hand));       // the overhanging lip
  wL = mix(wL, wL*0.16, crease*(1.0 - lip));  // the shared crease floor
  wL = mix(wL, 0.02, undc*0.90);              // tucked under: never touched
  wL *= 1.0 - 0.82*bare;                      // the parted run let water in
  wL *= 1.0 - 0.55*fray;                      // cut ends wick and stay damp

  // BRONZE. The proud collars and the scribed beads are knocked clean by every
  // draw from the scabbard; the mid band lives in the palm and is the cleanest
  // thing on the hilt; the lower ring sits on the edge of that and comes out
  // half-eaten. The fluted cones stay largely drowned — the ends of a grip are
  // where water runs to and stands — but their standing ribs keep enough metal
  // to give the corroded cone a light/dark rhythm that is now carried by
  // MATERIAL as well as by the normal.
  float by = p5_bandY(), ry = p5_ringY(), bot = p5_botY();
  float flT = p5_slab(p.y, top - 0.108, top - 0.076, 0.0040);
  float flB = p5_slab(p.y, bot + 0.038, bot + 0.070, 0.0040);
  float bnd = p5_slab(p.y, by - P5_BANDH, by + P5_BANDH, 0.0035);
  float rng = p5_slab(p.y, ry - P5_RINGH, ry + P5_RINGH, 0.0030);
  // ...except the groove turned down the middle of the band, which is a trap.
  bnd *= 1.0 - 0.78*(1.0 - smoothstep(0.0018, 0.0062, abs(p.y - by)));
  float wM = max(max(flT, flB)*0.84, max(bnd*0.97, rng*0.50));
  wM = max(wM, cone*(0.06 + 0.50*rib));

  s.wear = clamp(mix(wL, wM, m), 0.0, 1.0);

  // --- ANISOTROPY ------------------------------------------------------------
  // Both materials here have a genuine grain, and they do not share it.
  // Leather fibre runs ALONG the strand, which is the helix tangent: the
  // direction perpendicular to grad(turn index) on the surface. Written out,
  // grad t = (-dturn/wl axially, 1/(TAU*rho) circumferentially), so the
  // tangent swaps those and flips one sign. It comes out steeply
  // circumferential — as a wrap's strand should, since it goes around the grip
  // fifteen times and along it once.
  float wlen = max(p5_wrapT() - p5_wrapB(), 1e-3);
  float gy = p5_dturn(v)/wlen;
  float gp = 1.0/(TAU*max(rho, 1e-4));
  vec3 tStrand = normalize(ephi*gy + vec3(0.0, gp, 0.0)*1.0);

  // The fittings were turned on a lathe, so their grain is circumferential —
  // the same direction the tool travelled. The flutes were cut across that
  // afterwards, which is exactly what destroys it, so the cones get much less.
  s.anisoDir = normalize(mix(tStrand, ephi, m));
  float aL = (0.26 + 0.44*crown)*(1.0 - 0.60*crease)
           * (1.0 - 0.70*bare)*(1.0 - 0.55*fray);
  float aM = mix(0.70, 0.20, cone*(0.55 + 0.45*(1.0 - rib)));
  s.aniso  = clamp(mix(aL, aM, m), 0.0, 0.85);

  // --- relief ---------------------------------------------------------------
  // Flute shading. The cut itself has to stay shallow or the SDF stops being
  // conservative, so the geometry states the flutes and the normal exaggerates
  // them — the right division of labour, because what these corroded cones need
  // is not depth but a light/dark rhythm across their width, and that rhythm
  // survives an albedo the rot has already flattened to nothing.
  s.nPerturb  = ephi*(-0.45*sin(8.0*phi))*cone;

  // Fibre tilt: a y-axis nudge on a near-horizontal normal, which is the
  // direction a strand's twist would actually throw it.
  s.nPerturb += vec3(0.0, 1.0, 0.0)*(fibre - 0.5)*0.34*crown*(1.0 - m);
  s.nPerturb += (vec3(fbm(p*vec3(170.0, 240.0, 170.0), 3)) - 0.5)
              * (0.34*(1.0 - m)*(0.6 + 0.9*fray) + 0.09*m);

  // Cavity occlusion between the turns. The creases are only ~0.008 deep and
  // the first AO tap is at 0.008, so the contact darkening has to be stated
  // here or every turn renders at the same flat value.
  s.ao = mix(0.44, 1.0, smoothstep(0.02, 0.85, hn))
       * mix(1.0, 0.70, crease) * mix(1.0, 0.48, undc);
  s.ao = mix(s.ao, 0.94, m);

  return s;
}
