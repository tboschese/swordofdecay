// ============================================================================
// PIECE 6 — POMMEL & THE RELIC CORE
// Owns: the counterweight at the base, and the thing burning inside it.
// Contract: float sdPommel(vec3 p);  Surf shadePommel(vec3 p, vec3 n);
//
// DESIGN BRIEF: this is the weapon's single focal point. Everything else on
// the sword is desaturated steel and dead oxide; the core is the one saturated
// accent in the frame, so it has to earn it.
//
// The sculpt is a jeweller's setting, not a knob: an octagonal faceted WHEEL
// with bevelled faces, a raised BEZEL RING, and four CLAWS that reach over the
// core and physically grip it. The core stands PROUD of the metal — a recessed
// gem sits in its own shadow and dies at thumbnail size. Under the wheel a
// faceted FINIAL resolves the underside instead of the form just stopping.
//
// The core itself is not a shaded surface. `shadePommel` refracts the camera
// ray at the gem's face and MARCHES INTO the volume, accumulating emission
// from a small hot nucleus, from fracture sheets that catch the nucleus'
// light, and from suspended inclusions, attenuating with a tinted
// Beer-Lambert absorption on the way out. That is why it has depth: the light
// genuinely comes from inside a volume and the structure parallaxes against
// the view direction, instead of being painted on a sphere.
//
// COST: sdPommel is analytic only — half-planes, one sphere, two tori, four
// capsules, one cone, one cylinder. No noise and no loops anywhere in it,
// because it runs 220x per camera ray plus every shadow step and AO tap.
// Every expensive thing lives in shadePommel, and the volume march only runs
// on the handful of pixels that actually land on the gem.
// ============================================================================

// ------------------------------------------------------------ proportions --
// SCALE NOTE: p3's corrosion carves craters ~0.011 deep on a ~0.05 cell. Any
// feature finer than that is not a detail, it is noise waiting to be eaten.
// Everything here is deliberately coarse, and the core is deliberately large:
// the metal is *supposed* to lose this fight, and what has to survive is the
// stone it is barely still holding.
#define P6_R     0.0920    // octagon "radius" of the wheel, in XY
#define P6_BOSS  0.0225    // half-thickness of the wheel's central boss
#define P6_RC    0.0640    // relic core radius
#define P6_TAB   0.0460    // half-depth of the core's flat table facet

// Centre of the wheel / the core. Hangs off dims() so p1 can still move the
// grip without leaving the pommel floating.
vec3 p6_centre(){
  Dims D = dims();
  return vec3(0.0, -0.040 - D.gripLen - 0.094, 0.0);
}

// Support radius of a regular octagon — max of eight unit-normal half-planes,
// so combining it with more planes stays an exact intersection.
float p6_oct(vec2 a){
  a = abs(a);
  return max(max(a.x, a.y), (a.x + a.y)*0.70710678);
}

// --------------------------------------------------------- the metal body --
float p6_body(vec3 p){
  Dims D = dims();
  float top = -0.040 - D.gripLen;          // where the grip ends
  vec3  q   = p - p6_centre();

  float oc = p6_oct(q.xy);
  float az = abs(q.z);

  // --- the wheel ------------------------------------------------------------
  // Eight side facets, then a bevel rolling the faces back to a thin rim, then
  // a flat central boss. All exact half-planes: the intersection only ever
  // underestimates, so it is safe to sphere-trace.
  float d = oc - P6_R;
  d = max(d, az*0.9701 + oc*0.2425 - 0.03298);  // face bevel (unit normal)
  d = max(d, az - P6_BOSS);                     // flat boss around the setting

  // --- bezel ring: the collar the core sits down into -----------------------
  // abs(q.z) mirrors it onto both faces; a reflection is an isometry, so the
  // field stays exact. It rides just OUTSIDE the girdle — a bezel that climbs
  // over the stone buries the very thing it is presenting.
  float ring = sdTorus(vec3(q.x, az - 0.0180, q.y), vec2(0.0720, 0.0160));
  d = min(d, ring);

  // --- four claws, gripping the core at its girdle -------------------------
  // Set on the diagonals, rooted just inside the rim. Prongs pushed PAST the
  // rim were tried and rejected: they fill the octagon's corners and the
  // outline collapses into a rounded square. Inside the rim they instead read
  // as four dark bars crossing the lit stone, which is what says *held* rather
  // than *drilled*. They bite the girdle only — cross the table and the focal
  // point becomes a lattice. Two segments each so the prong tapers instead of
  // reading as a sausage.
  vec2 rq = vec2(q.x + q.y, q.y - q.x)*0.70710678;   // 45 degrees
  vec3 cv = vec3(rq.x, abs(rq.y), az);
  vec3 ch = vec3(abs(rq.x), rq.y, az);
  float clawV = min(sdCapsule(cv, vec3(0.0, 0.0885, 0.0030), vec3(0.0, 0.0700, 0.0220), 0.0155),
                    sdCapsule(cv, vec3(0.0, 0.0700, 0.0220), vec3(0.0, 0.0495, 0.0435), 0.0105));
  float clawH = min(sdCapsule(ch, vec3(0.0885, 0.0, 0.0030), vec3(0.0700, 0.0, 0.0220), 0.0155),
                    sdCapsule(ch, vec3(0.0700, 0.0, 0.0220), vec3(0.0495, 0.0, 0.0435), 0.0105));
  d = opSmoothUnion(d, min(clawV, clawH), 0.012);

  // --- ferrule: the collar the grip is peened into -------------------------
  float coll = sdCappedCyl(p - vec3(0.0, top + 0.004, 0.0), 0.019, 0.0440);
  coll = max(coll, abs(p.z) - 0.0355);                  // follows the grip oval
  float bead = sdTorus(p - vec3(0.0, top - 0.0075, 0.0), vec2(0.0400, 0.0082));
  coll = min(coll, bead);
  d = opSmoothUnion(d, coll, 0.014);

  // --- finial: the underside resolves in a faceted drop --------------------
  // Long enough to actually come to a point below the wheel: the outline has
  // to go collar -> flare -> disc -> point, or the pommel is just a bead.
  // The drop's axis is Y, so its cross-section lives in XZ — faceting it with
  // the wheel's XY octagon deletes it outright (learned the hard way).
  vec3 nq = vec3(q.x, -(q.y + 0.046), q.z);
  float fin = sdRoundCone(nq, 0.0420, 0.0080, 0.0780);
  fin = max(fin, p6_oct(vec2(q.x, q.z)) - 0.0400);      // octagonal drop
  d = opSmoothUnion(d, fin, 0.016);

  return d;
}

// ---------------------------------------------------------- the relic core --
// A cabochon with a flat table front and back and an eight-facet girdle. The
// tables give it one clean specular each; the girdle gives the outline corners
// so it does not read as a bead.
float p6_gem(vec3 p){
  vec3 g  = p - p6_centre();
  float oc = p6_oct(g.xy);
  float az = abs(g.z);
  float d = sdSphere(g, P6_RC);
  d = max(d, oc - 0.0585);                      // eight girdle facets
  d = max(d, az*0.7870 + oc*0.6170 - 0.05656);  // crown facets (unit normal)
  d = max(d, az - P6_TAB);                      // the table
  return d;
}

float sdPommel(vec3 p){
  float d = min(p6_body(p), p6_gem(p));
  // Safety factor: the smooth unions and the folds push the gradient a hair
  // over 1 at the seams, and the core sits behind thin claws.
  return d * 0.92;
}

// ============================================================================
//                                  SHADING
// ============================================================================

// The camera ray for this pixel, reconstructed exactly the way core_main does
// it. The volume march needs a real view direction — parallax against the view
// is the whole reason the interior reads as depth rather than as a texture.
vec3 p6_viewRay(){
  vec2 pix = gl_FragCoord.xy + uJitter;
  vec2 uv  = (pix - 0.5*uRes) / uRes.y;
  vec3 ro, rd;
  setupCamera(uv, ro, rd);
  return rd;
}

// The core's IDEAL normal, from the analytic cut alone. The normal the
// raymarcher hands us has p3's corrosion gradient baked into it, and refracting
// through that scrambles the interior into fizz. Refracting through the cut
// facets instead keeps the volume coherent — the crust still eats the stone's
// outline, but what you see *through* the table stays a stone.
vec3 p6_gemNormal(vec3 p){
  const vec2 k = vec2(1.0, -1.0);
  const float h = 0.0012;
  return normalize(k.xyy*p6_gem(p + k.xyy*h) + k.yyx*p6_gem(p + k.yyx*h) +
                   k.yxy*p6_gem(p + k.yxy*h) + k.xxx*p6_gem(p + k.xxx*h));
}

// Emission at a point inside the core. `g` is local to the core's centre.
// Three layers, in descending scale:
//   nucleus  — a single small hot kernel, deliberately off-centre. This is the
//              only genuinely blown thing in the whole image, and it is small.
//   fissures — cellular sheets through the volume, brightest where they pass
//              near the nucleus, so they read as cracks lit from within.
//   motes    — suspended inclusions that occlude, giving the volume grain.
vec3 p6_gemEmit(vec3 g){
  // Off-centre nucleus, sunk toward the back so the front table looks *into*
  // the stone rather than at a lamp stuck on its surface.
  vec3  nc = g - vec3(0.0045, -0.0055, -0.0125);
  float dn = length(nc);

  float hot  = exp(-dn*dn*14000.0);         // sigma ~ 0.006 — deliberately tiny
  float glow = exp(-dn*52.0);

  // Fracture sheets. F2-F1 near zero is a cell wall — a plane of damage.
  vec2  w    = worley(g*21.0 + vec3(11.0, 3.0, 7.0));
  float fis  = smoothstep(0.135, 0.0, w.y - w.x);
  float mote = smoothstep(0.34, 0.14, w.x);

  // Slow swirl so the deep body is not a dead constant.
  float murk = vnoise(g*58.0 + 21.0);

  vec3 cHot  = vec3(1.000, 0.980, 0.640);   // near-white, tipped yellow
  vec3 cSick = vec3(0.520, 0.880, 0.130);   // sick yellow-green: the rot's hue
  vec3 cDeep = vec3(0.045, 0.190, 0.070);   // blight verdigris in the depths

  // Ratios matter more than magnitudes: body ~0.05, fissures ~1, nucleus ~15.
  // A gem whose whole face sits above 1.0 is not a gem, it is a lamp.
  vec3 e = cHot  * hot * 2600.0
         + cSick * glow * 14.0
         + cSick * fis * (0.05 + 1.9*glow) * 46.0
         + cDeep * (2.2 + 7.0*murk);

  // Inclusions eat light rather than emit it.
  e *= (1.0 - mote*0.70);
  return e;
}

// March the refracted ray through the stone, accumulating emission with a
// tinted absorption. Ten fixed steps covers the full chord.
vec3 p6_marchCore(vec3 p, vec3 n, vec3 rd){
  vec3 c = p6_centre();

  vec3 dir = refract(rd, n, 1.0/1.45);
  if (dot(dir, dir) < 0.25) dir = rd;      // TIR guard

  // Absorption is strong on purpose. Weak absorption averages the whole chord
  // and the internal structure smears into a flat wash; strong absorption
  // means what you see is mostly the first few millimetres of stone, so the
  // fissures stay crisp and parallax against the view.
  const float dt = 0.0128;
  vec3 sig = vec3(72.0, 26.0, 56.0);       // green survives the depth, red dies
  vec3 att = exp(-sig*dt);

  vec3 acc = vec3(0.0);
  vec3 tr  = vec3(1.0);
  vec3 q   = p + dir*0.003;
  float lim = (P6_RC*1.04)*(P6_RC*1.04);

  for (int i = 0; i < 10; i++){
    vec3 g = q - c;
    if (dot(g, g) > lim) break;
    acc += tr * p6_gemEmit(g) * dt;
    tr  *= att;
    q   += dir*dt;
  }
  return acc;
}

// ---------------------------------------------------------------- the sculpt --
// Both of the things the material needs to know about the metal body, from one
// tetrahedron of taps: the SMOOTHED analytic normal (which land am I on) and
// the CONVEXITY (am I on an arris or down in a crevice).
//
// Why curvature rather than a hand-written mask per feature: this sculpt has
// eight octagon corners, two mirrored bevel breaks, a torus crown, four claw
// crests, a collar bead and an eight-sided finial, and every one of them is an
// arris. Enumerating them is a page of near-duplicate smoothsteps that goes
// stale the moment a radius moves. The mean of the SDF over a small tetrahedron
// minus its value at the centre is exactly zero on a plane, positive on a
// convex edge and negative inside a fillet — it finds all of them at once, and
// it finds them on the CLEAN sculpt, so the wear follows the jeweller's work
// rather than the corrosion's noise. Scaled to read as 1/radius.
//
// Five p6_body evaluations. This is in shadePommel, which runs once per pixel,
// not in sdPommel.
void p6_sculpt(vec3 p, out vec3 gn, out float curv){
  const vec2  k = vec2(1.0, -1.0);
  const float h = 0.0060;
  float d0 = p6_body(p);
  float a  = p6_body(p + k.xyy*h);
  float b  = p6_body(p + k.yyx*h);
  float cc = p6_body(p + k.yxy*h);
  float dd = p6_body(p + k.xxx*h);
  gn   = normalize(k.xyy*a + k.yyx*b + k.yxy*cc + k.xxx*dd + vec3(1e-9, 1e-9, 0.0));
  curv = 3.0*((a + b + cc + dd)*0.25 - d0)/(h*h);
}

Surf shadePommel(vec3 p, vec3 n){
  Surf s = defaultSurf();
  vec3  c = p6_centre();
  vec3  g = p - c;

  float dGem  = p6_gem(p);
  float dBody = p6_body(p);

  // ------------------------------------------------------------- the core --
  if (dGem <= dBody){
    vec3 rd = p6_viewRay();
    // Half the cut normal, half the plain dome. Pure cut normals are what a
    // real faceted stone does — each facet shows its own view of the interior —
    // but at the size this thing occupies, the hard parallax jump across the
    // table/crown break just reads as two blown squares with a seam. Half-way
    // keeps the facets legible as a shift in the interior without the tear.
    vec3 gn = normalize(normalize(g + vec3(1e-6)) + p6_gemNormal(p));
    float NoV = clamp(dot(gn, -rd), 0.0, 1.0);

    // A gem is a dielectric with a high F0 and a mirror-smooth face. That is
    // how it separates from the oxide around it with the colour removed:
    // a single tight specular against a broad dull one.
    s.albedo = vec3(0.030, 0.052, 0.024);
    s.metal  = 0.0;
    s.spec   = 1.0;                          // F0 ~ .08
    s.rough  = 0.085;
    s.ao     = 1.0;

    vec3 inner = p6_marchCore(p, gn, rd);

    // Grazing angles look along the longest chord AND catch total internal
    // reflection, so real stones burn brightest at their rims.
    float fres = pow(1.0 - NoV, 3.5);
    inner *= 1.0 + fres*1.05;

    // ROUND 3: THE EMISSION FADE IS GONE.
    // It used to read `inner *= 0.10 + 0.90*(1 - smoothstep(0.028, 0.058, oc))`,
    // which killed nine tenths of the light everywhere outside the table — and
    // the table only runs to oc 0.033, so that fade was eating the crown
    // facets entirely. It existed to hide `rotDisplace` chewing the stone's
    // outline into scallops. p3 now exempts `gemSDF` in both the displacement
    // and the tarnish, and the exemption was verified: rendering the gem alone
    // under mode 2 (which includes rot displacement) gives a clean faceted
    // disc with straight girdle segments and zero scalloping. The problem the
    // fade was hiding no longer exists, so the stone runs clear to its girdle
    // and the crown facets finally carry light.
    //
    // The overall gain came down to pay for it: the same emission over three
    // times the area is three times the light, and the rig underneath was
    // rebalanced darker (punctual specular cut 10x). What matters is that the
    // nucleus is still the only blown thing and it is still small.

    // A polished stone's other half is its SURFACE: one tight, colourless,
    // Fresnel-weighted reflection of the room. Verified by rendering with the
    // emission switched off — p3's crust fully overwrites albedo/rough/metal on
    // the pommel, so the BRDF gives the core no specular at all and it stops
    // being distinguishable from oxide once you remove the colour. Reflecting
    // the studio by hand off the CUT normal puts that cue back, and it is the
    // one thing here that reads as glass rather than as a light.
    vec3 refl = envRadiance(reflect(rd, gn), 0.055);
    float F   = 0.045 + 0.955*pow(1.0 - NoV, 5.0);
    s.emissive = inner*0.62 + min(refl*F, vec3(9.0));

    // Cut stone has no grain and does not corrode: leave aniso at zero, and
    // mark it fully worn so p3's hold-back backs the crust off the setting's
    // innermost lip as well. (p3 already exempts the stone itself by gemSDF;
    // this only affects the feather zone.)
    s.wear = 1.0;
    return s;
  }

  // ------------------------------------------------------------ the metal --
  vec3  gn; float curv;
  p6_sculpt(p, gn, curv);

  float rxy = length(g.xy);
  float az  = abs(g.z);
  float dr  = max(length(g) - P6_RC, 0.0);      // distance out from the stone

  // ============================== WEAR =====================================
  // This is the channel that decides whether any of the rest of this file is
  // visible at all. p3's corrosion field saturates to 1.0 across the whole
  // hilt and applyRot REPLACES albedo, roughness and metalness — so until
  // s.wear is set, everything below here is computed and then thrown away, and
  // the pommel renders as an undifferentiated lump of oxide. p3 holds the
  // crust back by 1 - 0.90*smoothstep(0.06, 0.72, wear), so 0.72 is the value
  // that means "bare metal" and 0.06 is the value that means "let it rot".
  //
  // A jeweller's setting is not worn evenly. It is worn where a thumb, a belt
  // and a table edge have touched it for a century: the arrises, the crown of
  // the bezel, the crests of the claws, the octagon's corners, the collar bead
  // and the finial's points. It is NOT worn in the moat behind the girdle, in
  // the socket under the stone, or in the undercut beneath a claw — those are
  // exactly where the water sat.
  //
  // Thresholds are not guesses: the curvature field was rendered to screen and
  // read off. A true arris (an exact max() of two planes) comes back around
  // 150-300; the gently domed lands between them sit at 20-60; a smooth-union
  // fillet returns -30 to -80. Setting `ridge` at 9 — the first attempt —
  // saturated the mask to 1.0 across the entire pommel, and every surface came
  // back bare, which is the same failure as no mask at all with the sign
  // flipped. Bare metal has to be the MINORITY of the area or the contrast it
  // is there to create does not exist.
  float ridge = smoothstep(85.0, 240.0, curv);        // true arrises and crests
  float swell = smoothstep(18.0, 80.0, curv);         // the domed lands
  float fillet= smoothstep(18.0, 70.0, -curv);        // welds, undercuts, moat

  // Crown of the bezel ring: the torus tops out at radial 0.072, az 0.034, and
  // that circular ridge is the single most legible piece of jewellery on the
  // pommel. Named explicitly because the curvature there is gentle (tube 0.016)
  // and `ridge` alone under-reads it.
  float bezel = (1.0 - smoothstep(0.008, 0.030, abs(rxy - 0.0740)))
              * smoothstep(0.016, 0.031, az);

  // The moat: the narrow trench between the stone's girdle and the ring's inner
  // wall. Nothing can reach in there to polish it and everything drains into
  // it. Same feature the AO term below darkens.
  float moat = (1.0 - smoothstep(0.0, 0.013, dr)) * (1.0 - smoothstep(0.016, 0.030, az));

  float wear = clamp(ridge*0.98 + bezel*0.55 + swell*0.30, 0.0, 1.0);
  wear *= (1.0 - 0.85*fillet)*(1.0 - 0.90*moat);
  // Patchy, not stencilled. Deliberately high contrast — mean about 0.78 but
  // reaching 0.3 — so the bare metal comes and goes ALONG an arris instead of
  // tracing it like a drawn line. Rubric 6: an edge highlight of constant
  // width is the single most reliable tell that something was rendered rather
  // than photographed.
  wear *= 0.30 + 0.96*fbm(p*17.0 + 8.0, 2);
  wear  = clamp(wear, 0.0, 1.0);
  s.wear = wear;

  // ============================ THE MATERIAL ===============================
  // Cast, not forged: darker and slightly warmer than the guard's hammered
  // iron, with low-frequency casting waviness instead of hammer facets.
  vec3 base = vec3(0.0680, 0.0630, 0.0575);
  float grain = fbm(p*36.0, 4);
  base *= 0.76 + 0.50*grain;

  float wave = fbm(p*14.0, 3);
  s.metal    = 1.0;
  s.rough    = clamp(0.52 + 0.34*(wave - 0.5), 0.22, 0.88);
  s.nPerturb = vec3(fbm(p*58.0, 3) - 0.5)*0.09;

  // BURNISH. Driven by the SAME field as the wear, and that is the point: the
  // places the rot yields and the places the metal is bright have to be the
  // same places, or the surface reads as two unrelated textures stacked. A
  // metal's albedo is its F0 — 0.068 is darker than any real alloy and only
  // survived before because p3 was overwriting it. Where a thumb has been, this
  // is latten: pale, warm, and reflective enough to actually carry a highlight.
  float burnish = wear*wear*(3.0 - 2.0*wear);         // smootherstep-ish
  base = mix(base, vec3(0.2280, 0.2030, 0.1600), burnish*0.86);
  s.rough = mix(s.rough, 0.300, burnish*0.86);
  // Casting grain is a property of the SKIN. Where the skin has been rubbed
  // off, the normal has to calm down with it — leaving the full perturbation
  // on a rough-0.30 surface turned the burnished lands into crazed glass.
  s.nPerturb *= 1.0 - 0.72*burnish;
  s.albedo = base;

  // ============================= ANISOTROPY ================================
  // Honest about where a grain actually exists. The wheel and the finial are
  // CAST and the claws were filed by hand in every direction — no grain, aniso
  // stays 0. But the bezel ring and the face bevels were turned: the whole
  // wheel spun on its Z axis under a graver, so those two surfaces carry a
  // circumferential grain, and the collar was turned about Y for the same
  // reason. A turned band's highlight runs AROUND the band, not across it, and
  // that is the cue that separates a mounted setting from a cast knob.
  vec3  tanZ = vec3(-g.y, g.x, 0.0);                  // about the wheel's axis
  vec3  tanY = vec3(-p.z, 0.0, p.x);                  // about the collar's axis
  float onWheel  = (bezel + swell*smoothstep(0.030, 0.055, rxy))
                 * smoothstep(0.020, 0.048, rxy);
  float onCollar = smoothstep(-0.030, 0.010, g.y) * (1.0 - smoothstep(0.030, 0.052, rxy));
  float turned   = clamp(max(onWheel, onCollar), 0.0, 1.0);
  vec3  tdir     = (onCollar > onWheel) ? tanY : tanZ;
  if (dot(tdir, tdir) > 1e-8){
    s.anisoDir = normalize(tdir);
    // Damped by the burnish: a turned grain only survives where the surface is
    // still metal. Under crust there is nothing left to be directional.
    s.aniso    = clamp(turned*0.72, 0.0, 0.80) * (0.30 + 0.70*burnish);
  }

  // The moat between the girdle and the bezel is a deep, narrow trench that the
  // 5-tap AO barely finds. Occluding it by hand is most of what stops the
  // wheel's face reading as one flat plate — and s.ao is one of the few
  // channels the rot layer multiplies rather than replaces.
  s.ao *= 1.0 - 0.58*moat;
  s.ao *= 1.0 - 0.30*fillet;

  // --- the core has damaged the metal around it ----------------------------
  // Whatever is in there has been cooking the socket for a long time: the
  // walls are scorched black and bloomed with verdigris, and the boundary is
  // ragged rather than a clean radius. Held OFF the burnished arrises — scorch
  // is a deposit, and a rubbed edge does not hold a deposit.
  float burn = exp(-dr*19.0);
  float bn   = fbm(p*74.0 + 4.0, 3);
  float sc   = clamp(burn*(0.50 + 1.05*bn), 0.0, 1.0) * (1.0 - 0.70*burnish);
  s.albedo = mix(s.albedo, vec3(0.0320, 0.0455, 0.0215), sc*0.88);
  s.rough  = clamp(mix(s.rough, 0.74, sc*0.72), 0.05, 1.0);

  // --- coloured bounce out of the socket -----------------------------------
  // The single cheapest thing that sells a light source as *contained*: the
  // walls facing it are lit by it. Additive, so it survives the rot layer.
  vec3  toC = normalize(c - p + vec3(0.0, 0.0, 1e-5));
  float facing = clamp(dot(n, toC)*0.74 + 0.26, 0.0, 1.0);
  facing *= facing;
  // A volume source wraps further round its housing than a point would, so the
  // wide term keeps a floor on the surfaces turned away from it — without it
  // the finial and the underside of the wheel go to dead black and the form
  // stops resolving at the bottom of the frame.
  float wrap = clamp(dot(n, toC)*0.55 + 0.45, 0.0, 1.0);

  // Two terms: a tight one that scorches the socket walls, and a wide, much
  // dimmer one so the rest of the wheel still knows the light is there.
  // Discipline: the accent hue is only worth anything while it is scarce, so
  // both falloffs are deliberately short. Tightened in round 3 — the stone now
  // runs clear to its girdle, so it throws far more light of its own, and the
  // old wide term on top of that turned the whole setting into one green mass
  // and buried the jewellery it is supposed to be lighting.
  s.emissive += vec3(0.36, 0.82, 0.17) * facing * 0.80 / (1.0 + dr*dr*2400.0);
  s.emissive += vec3(0.20, 0.50, 0.14) * wrap*wrap * 0.26 / (1.0 + dr*dr*620.0);

  // The seam. Light escapes the joint between the stone and the metal that
  // holds it, and that thin hot line is the cheapest, most legible signal at
  // thumbnail size that the pommel CONTAINS something rather than IS green.
  float seam = exp(-dr*340.0) * (0.30 + 0.70*bn);
  s.emissive += vec3(0.55, 1.00, 0.26) * seam * 1.30;

  return s;
}

// ---------------------------------------------------------------------------
// Harness-seeded (round 2 owner: p6). Exposes the relic core to p3 so the rot
// can exempt it — the gem is cut stone, it does not corrode like iron, and its
// silhouette is the focal point of the whole image.
float gemSDF(vec3 p){ return p6_gem(p); }
