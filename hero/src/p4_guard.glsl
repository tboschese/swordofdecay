// ============================================================================
// PIECE 4 — CROSSGUARD
// Owns: the guard's sculpt and its own material.
// Contract: float sdGuard(vec3 p);  Surf shadeGuard(vec3 p, vec3 n);
//
// FORM BRIEF — why this is not a bar.
// p1 puts a pair of UPSWEPT PARRY HOOKS at y 0.30..0.48 reaching +-0.186. A
// simple horizontal quillon bar down here rhymes with them and the weapon
// reads as two stacked crosses at thumbnail size. So the guard is built to be
// a different KIND of object from the hooks in every axis:
//   mass      a PLATE ~0.30 tall in the blade plane, 2x their span and many
//             times their area — they become furniture hanging off it
//   direction everything sweeps DOWN: the top edge falls all the way to the
//             ends, the terminals hang below the arm line, and each quillon
//             finishes in a blunt CLAW turned back toward the grip
//   contour   blunt, thick, chamfered — never the thin tapered spur language
//             the hooks are written in
//   position  hub, ferrule and claws carry the mass to y=-0.25, so the guard's
//             centre of gravity sits ~0.45 clear of the hooks
// The one thing it deliberately DOES echo is p1's pierced fuller: each quillon
// carries a gothic pierced eye. Rhyming with the blade's own negative space is
// good; rhyming with the hooks is not.
//
// p3 soaks this whole region — the rot field is at 1.0 at y~0 by design, so
// crust displacement of ~0.02 lands on every surface here. All relief is sized
// to survive that: nothing subtler than ~0.03 would read at all.
// ============================================================================

#define P4_W   0.345   // where the quillon bar ends (terminals reach past it)
#define P4_W0  0.345   // the value of dims().guardHalfW this profile was cut for
#define P4_TZ  0.094   // half-thickness front-to-back at the hub block
#define P4_TA  0.054   // half-thickness out on the arms — the blade is 0.038
                       // at its thickest, so the guard is always the heavier
                       // section wherever the two are seen together
#define P4_LIP 0.018   // half-thickness at the blunt rim, before the chamfer
#define P4_U0  0.014   // how far inside the outline the chamfer springs from

// Every control point below is cut for guardHalfW = 0.345. If p1 retunes the
// span, stretch x rather than let the guard drift out of proportion with the
// blade. Scaling x by 1/kx inflates measured distance when kx < 1, so the
// result is multiplied by min(kx,1) to stay an underestimate.
float p4_kx(){ return max(dims().guardHalfW, 0.06) / P4_W0; }

// A gothic pierced eye: near-parallel sides drawn to a point at both ends.
// Stadium intersected with a rhombus — both exact, so it only underestimates.
float p4_eye(vec2 c, float hl, float r){
  float cap = sdSegment2(c, vec2(-hl, 0.0), vec2(hl, 0.0)) - r;
  float hx  = hl + r;
  float hy  = 2.5*r;
  float k   = inversesqrt(hx*hx + hy*hy);
  float rho = (abs(c.y)*hx + abs(c.x)*hy - hx*hy) * k;
  return max(cap, rho);
}

// CLAW: each quillon finishes turning back down toward the grip. Two tapered
// capsules read as one thick horn without a cone primitive. These are the
// guard's answer to the parry hooks — same idea, opposite direction, four
// times the mass — which is what stops the two rhyming.
// Factored out of p4_plate so shadeGuard can ask "how close is this pixel to
// the claw ridge?" without re-deriving it — the claws are the guard's most
// exposed convex form and carry the most wear.
float p4_claw(vec2 s){
  float claw = sdSegment2(s, vec2(0.336, -0.130), vec2(0.324, -0.190)) - 0.031;
  return min(claw, sdSegment2(s, vec2(0.324, -0.188), vec2(0.300, -0.242)) - 0.016);
}

// ------------------------------------------------------------- 2D profile --
// The guard's outline in the blade plane. Negative inside. Convex primitives
// combined with min/max only ever underestimate -> march-safe.
float p4_plate(vec2 a){
  float ax = abs(a.x);
  vec2  s  = vec2(ax, a.y);

  // Quillon bar: a downswept WEDGE with real vertical depth (0.20 tall at the
  // root, 0.12 at the tip), not a rod. Intersection of three half-planes. The
  // top edge falls 0.14 across the span — steep enough that the eye reads a
  // gesture, not a horizontal.
  //   top edge    (0, 0.085) -> (0.345, -0.055)
  //   bottom edge (0,-0.115) -> (0.345, -0.175)
  float bar = ax - P4_W;
  bar = max(bar, dot(s - vec2(0.0,  0.085), vec2( 0.37601, 0.92663)));
  bar = max(bar, dot(s - vec2(0.0, -0.115), vec2(-0.17134,-0.98521)));

  // Terminal: a heavy blunt head that hangs BELOW the arm line, so the top
  // edge keeps falling uninterrupted all the way to the ends.
  vec2 t = abs(s - vec2(0.318, -0.108)) - vec2(0.036, 0.068);
  float term = length(max(t, 0.0)) + min(max(t.x, t.y), 0.0) - 0.020;

  float claw = p4_claw(s);

  // Hub: a KEYSTONE, wide under the blade and tapering down into the ferrule,
  // so the centre of the guard has a downward gesture of its own.
  float hub = dot(s - vec2(0.066, 0.060), vec2(0.98603, -0.16663));
  hub = max(hub, a.y - 0.060);
  hub = max(hub, -0.165 - a.y);
  hub -= 0.020;

  float d = opSmoothUnion(bar, term, 0.024);
  d = opSmoothUnion(d, claw, 0.020);
  d = opSmoothUnion(d, hub, 0.034);

  // PIERCED EYE through each quillon. Real negative space inside the mass —
  // this is what stops the guard reading as a solid brick at thumbnail size,
  // and the roof below gives its rim a chamfer for free.
  vec2 ec = rot2(0.2820) * (s - vec2(0.203, -0.0744));
  d = max(d, -p4_eye(ec, 0.052, 0.023));

  return d;
}

// Half-thickness in Z as a function of how far inside the profile we are.
// RE-CUT. This used to be two steps of 0.017 and 0.013 in z, plus a smooth
// swell in x for the hub. BRIEF policy 7: p3's crater displacement is ~0.013
// deep on a ~0.05 cell plus grain, so relief under ~0.03 is simply erased at
// final size — all three of those were, and the guard rendered as one lump of
// crust with no arris anywhere on it.
//
// So the roof is now ONE hard step of 0.036, and the hub's extra section is an
// explicit stepped block in sdGuard rather than a swell (a swell has no arris
// at all, so there was nothing there for the crust to fail to cover):
//     u < 0.014          LIP      az 0.018   the blunt rim of the plate
//     0.014 .. 0.050     CHAMFER             one 45-degree facet, 0.036 rise
//     u > 0.050          LAND     az 0.054   the quillon spine
//     hub block                   az 0.094   +0.040
//     boss ring                   az 0.134   +0.040
//     boss countersink            az 0.098   -0.036
// Four flats, four steps, none of them under 0.036. Each step is a hard crease
// carrying a bright lip on the lit side and a black one opposite, and the
// flats are exactly what `s.wear` protects below.
float p4_roof(float d2){
  return min(P4_LIP + max(-d2 - P4_U0, 0.0), P4_TA);
}

float sdGuard(vec3 p){
  float kx = p4_kx();
  // Safety factor: the roof's chamfer now runs at a true 45 degrees, so the
  // field `az - roof` overestimates by up to sqrt(2) there; the x stretch
  // inflates it further when the guard is narrowed.
  float sc = 0.70*min(kx, 1.0);
  vec3  ps = vec3(p.x/kx, p.y, p.z);

  // Conservative bound. sdGuard runs 220x per camera ray plus every shadow and
  // AO tap, and most of those are far up the blade — bail out cheaply there.
  vec3 bq = abs(ps - vec3(0.0, -0.052, 0.0)) - vec3(0.390, 0.222, 0.142);
  float bnd = length(max(bq, 0.0)) + min(max(bq.x, max(bq.y, bq.z)), 0.0);
  if (bnd > 0.045) return bnd*sc;

  float ax = abs(ps.x), az = abs(ps.z);

  float d2 = p4_plate(ps.xy);
  float th = p4_roof(d2);

  // Extrude the profile through the roof. Small radius keeps the arrises from
  // reading as razor-thin CG creases.
  float r = 0.006;
  vec2  q = vec2(d2 + r, az - th + r);
  float d = min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;

  // COLLAR — a stepped socket clamping the ricasso, and FERRULE — a ring over
  // the top of the grip. Both are built in 3D rather than in the plate profile
  // because they have to be THICKER front-to-back than the parts they hold
  // (ricasso is 0.075 across, grip 0.066) or the joint reads as interpenetration
  // instead of assembly.
  float col = sdRoundBox(vec3(ps.x, ps.y - 0.092, ps.z), vec3(0.086, 0.028, 0.060), 0.012);
  col = min(col, sdRoundBox(vec3(ps.x, ps.y - 0.130, ps.z), vec3(0.068, 0.020, 0.048), 0.010));
  float fer = sdRoundBox(vec3(ps.x, ps.y + 0.186, ps.z), vec3(0.050, 0.022, 0.048), 0.014);
  d = min(d, min(col, fer));   // hard creases: these read as separate pieces

  // HUB BLOCK — the guard's thick centre section. This used to be a smooth
  // swell of the roof in x; a swell has no arris, so there was no edge for the
  // crust to break over and the centre of the guard read as a mound. As an
  // explicit solid it steps a hard 0.040 proud of the quillon land, and the
  // keystone plane (the same one p4_plate cuts the hub with, inset) keeps it
  // just inside the outline so the step reads all the way round.
  float hb = sdRoundBox(vec3(ps.x, ps.y + 0.036, ps.z), vec3(0.104, 0.086, P4_TZ - 0.014), 0.014);
  hb = max(hb, dot(vec2(ax, ps.y) - vec2(0.066, 0.060), vec2(0.98603, -0.16663)) - 0.016);
  d = min(d, hb);

  // RAISED BOSS: a lozenge standing 0.040 proud of the hub block, with a
  // COUNTERSUNK eye 0.036 deep sunk into it — so the centre of the guard is a
  // RING of proud metal around a recess. It was two stacked plateaus of 0.018
  // and 0.022, both under the 0.03 floor and both erased. One step out and one
  // step in, each 0.036+, gives two arrises where there were none, and the
  // pairing is the whole material argument: bare knocked-clean metal on the
  // ring, oxide pooled in the recess it surrounds.
  vec3 lp = vec3(ps.x, ps.y + 0.030, az - P4_TZ);
  lp.xy = rot2(0.7854)*lp.xy;
  float loz = sdRoundBox(lp, vec3(0.038, 0.038, 0.032), 0.008);
  loz = max(loz, -sdRoundBox(vec3(lp.xy, lp.z - 0.070), vec3(0.021, 0.021, 0.060), 0.006));
  d = min(d, loz);

  return d*sc;
}

// ----------------------------------------------------------- material -------
// Hand-forged height field: overlapping hammer dishes with raised lips left
// standing between them, plus fine scale underneath. Runs per pixel only.
float p4_forge(vec3 q){
  vec2 w = worley(q*vec3(9.0, 11.5, 9.0));
  float dish = 1.0 - w.x;                        // each cell is one hammer blow
  float lip  = smoothstep(0.11, 0.0, w.y - w.x); // ridge left between blows
  return dish*0.55 + lip*0.30 + fbm(q*34.0, 3)*0.22;
}

Surf shadeGuard(vec3 p, vec3 n){
  Surf s = defaultSurf();

  // The blade is cold ground steel at albedo ~0.19 / rough ~0.25. This is a
  // different, older piece: black-iron forging, warmer, much darker and far
  // rougher, so the two separate even with the colour pulled out.
  float grain = fbm(p*vec3(26.0, 22.0, 26.0), 4);
  vec3  base  = mix(vec3(0.046, 0.040, 0.035), vec3(0.116, 0.102, 0.086), grain);

  // Forge scale — the blue-black skin the fire leaves, in patches.
  float scaleM = smoothstep(0.44, 0.74, fbm(p*7.0 + 11.0, 3));
  base = mix(base, vec3(0.024, 0.026, 0.032), scaleM*0.60);

  float f = p4_forge(p);

  // ---------------------------------------------------------------- WEAR --
  // FORM-DRIVEN WEAR. Noise-driven polish reads as texture; wear that follows
  // the sculpt reads as history. Every term below is read straight off the
  // geometry this file built, and the result goes into `s.wear` so p3 holds
  // the crust back there (BRIEF policy 6/6b). Until this was assigned, the
  // rot overwrote albedo/rough/metal on every camera-facing pixel of the
  // guard and this whole material contributed nothing — proven twice with
  // pixel-identical renders.
  vec2  pl = vec2(p.x/p4_kx(), p.y);
  vec2  sl = vec2(abs(pl.x), pl.y);
  float d2 = p4_plate(pl);
  float u  = max(-d2, 0.0);              // how deep inside the outline we are
  float az = abs(p.z);

  // Z-facing FLATS vs. the walls and chamfers between them. A scabbard mouth,
  // a palm and a shield rim sweep across the flats; they never reach a wall,
  // and a 45-degree chamfer recedes from all of them. This is deliberately a
  // wide smoothstep: the crust tilts the normal by up to ~25 degrees, so a
  // narrow test would flicker, and letting a badly cratered patch lose its
  // protection is the right answer anyway.
  float fw = smoothstep(0.30, 0.72, abs(n.z));

  // The four flats of the roof, in order of how exposed they are.
  float onLip  = smoothstep(0.022, 0.006, u);            // blunt rim of the plate
  float onLand = smoothstep(0.044, 0.058, u);            // quillon spine
  float onHub  = smoothstep(0.064, 0.086, az);           // hub block face
  float onBoss = smoothstep(0.106, 0.128, az);           // the boss ring
  // The claws hang below the arm line: nothing is set down, dropped, leaned or
  // dragged without these taking it first.
  float onClaw = smoothstep(0.034, 0.006, p4_claw(sl));

  // max(), not a sum — a sum saturates the whole guard to 1.0 (measured) and
  // then p3 holds everything back equally, which is the same flat answer as
  // holding nothing back. The point is the SPREAD.
  float wear = max(max(onLip*0.66, onClaw*0.60),
                   fw*max(onLand*0.48, max(onHub*0.60, onBoss*0.96)));

  // --- and where nothing could ever reach. ---------------------------------
  // Down inside the pierced eyes the bore is a shadowed slot that held water.
  // The eye's LIP is a flat and keeps its wear; only the wall loses it.
  float de   = p4_eye(rot2(0.2820)*(sl - vec2(0.203, -0.0744)), 0.052, 0.023);
  float bore = smoothstep(0.022, 0.000, abs(de))*(1.0 - fw);
  // The seams where the guard is socketed onto blade and grip: a dead crevice
  // at both ends that no hand touches and nothing ever drained out of.
  float seam = max(smoothstep(0.030, 0.004, abs(pl.y - 0.152)),
                   smoothstep(0.030, 0.004, abs(pl.y + 0.210)));
  // The countersink inside the boss ring, and every other up-facing shelf: on
  // a vertical weapon the guard IS the horizontal surface, so this is where
  // everything that ran down the blade stopped and sat.
  float pool = clamp(n.y, 0.0, 1.0)*(1.0 - onBoss*fw);

  wear = clamp(wear*(1.0 - 0.90*bore)*(1.0 - 0.70*seam)*(1.0 - 0.55*pool),
               0.0, 1.0);
  s.wear = wear;

  // ANISOTROPY. Hand-forged iron has no grain worth the name and the rest of
  // this guard is left isotropic on purpose. The ONE exception is the blunt
  // rim: that band is draw-filed flat along the contour after forging, and a
  // filed band genuinely stretches its highlight along the file direction.
  // Tangent = the plate contour's own tangent, straight off its gradient.
  vec2  ge = vec2(0.0035, 0.0);
  vec2  gp = vec2(p4_plate(pl + ge.xy) - p4_plate(pl - ge.xy),
                  p4_plate(pl + ge.yx) - p4_plate(pl - ge.yx));
  s.anisoDir = normalize(vec3(-gp.y*p4_kx(), gp.x, 0.0) + vec3(1e-5, 1e-5, 0.0));
  s.aniso    = 0.44*onLip;

  // The lips between hammer blows burnish too, but only where the surface was
  // already being rubbed — as an independent additive term (it was) this is a
  // high-frequency craquelure laid over everything, which reads as cracked
  // glaze, not as iron. It modulates wear; it does not create it.
  vec2  wl   = worley(p*vec3(9.0, 11.5, 9.0));
  float lip  = smoothstep(0.11, 0.0, wl.y - wl.x);
  float burn = clamp(wear*(0.80 + 0.34*lip), 0.0, 1.0);
  base = mix(base, vec3(0.176, 0.160, 0.138), burn*0.74);

  s.albedo = base;
  s.metal  = 1.0;
  // Burnished iron is the tight-highlight end of this material and the crust
  // p3 leaves in the chamfers is the broad-scatter end; that separation is the
  // rubric's material hierarchy, and it has to survive greyscale.
  s.rough  = clamp(0.80 - 0.44*burn + 0.16*(f - 0.5) - 0.08*scaleM, 0.22, 0.95);
  s.ao     = 1.0 - 0.20*smoothstep(0.55, 0.05, wl.x)*(1.0 - wear*0.6);

  // Normal from the gradient of the forge field, projected into the tangent
  // plane. This is what makes the facets read as planar dents rather than a
  // noise overlay: the highlight breaks at the cell walls.
  const vec2 k = vec2(1.0, -1.0);
  const float e = 0.0055;
  vec3 g = k.xyy*p4_forge(p + k.xyy*e) + k.yyx*p4_forge(p + k.yyx*e) +
           k.yxy*p4_forge(p + k.yxy*e) + k.xxx*p4_forge(p + k.xxx*e);
  g -= n*dot(g, n);
  s.nPerturb = -g*0.42;

  return s;
}
