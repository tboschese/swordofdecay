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
#define P4_TZ  0.094   // half-thickness front-to-back at the hub
#define P4_TA  0.048   // half-thickness out on the arms — the blade is 0.038
                       // at its thickest, so the guard is always the heavier
                       // section wherever the two are seen together

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

  // CLAW: each quillon finishes turning back down toward the grip. Two tapered
  // capsules read as one thick horn without a cone primitive. These are the
  // guard's answer to the parry hooks — same idea, opposite direction, four
  // times the mass — which is what stops the two rhyming.
  float claw = sdSegment2(s, vec2(0.336, -0.130), vec2(0.324, -0.190)) - 0.031;
  claw = min(claw, sdSegment2(s, vec2(0.324, -0.188), vec2(0.300, -0.242)) - 0.016);

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
// This is where the guard gets its relief, and it is deliberately a STEPPED
// roof, not a smooth ramp: a narrow rim chamfer, then a flat LAND, then a
// second step up to a raised central panel. Two hard arrises follow every
// contour — the outer silhouette AND the pierced eyes — so each one carries a
// bright lip on the lit side and a black one opposite. A smooth chamfer at
// this scale is erased by p3's crust; a step survives it.
// The hub also runs much thicker than the arms, so it reads as the block that
// takes the load and the quillons as plate hung off it.
float p4_roof(float ax, float d2){
  float T = mix(P4_TZ, P4_TA, smoothstep(0.045, 0.205, ax));
  float u = max(-d2, 0.0);
  float A = T*0.74;                                     // the land
  float t = min(0.018 + 0.70*u, A + 0.90*max(u - 0.032, 0.0));
  return min(t, T);
}

float sdGuard(vec3 p){
  float kx = p4_kx();
  // Safety factor: the roof makes the field non-unit in the chamfer band, and
  // the x stretch inflates it further when the guard is narrowed.
  float sc = 0.72*min(kx, 1.0);
  vec3  ps = vec3(p.x/kx, p.y, p.z);

  // Conservative bound. sdGuard runs 220x per camera ray plus every shadow and
  // AO tap, and most of those are far up the blade — bail out cheaply there.
  vec3 bq = abs(ps - vec3(0.0, -0.052, 0.0)) - vec3(0.390, 0.222, 0.142);
  float bnd = length(max(bq, 0.0)) + min(max(bq.x, max(bq.y, bq.z)), 0.0);
  if (bnd > 0.045) return bnd*sc;

  float ax = abs(ps.x), az = abs(ps.z);

  float d2 = p4_plate(ps.xy);
  float th = p4_roof(ax, d2);

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

  // RAISED BOSS: a two-step lozenge standing well proud of both hub faces. The
  // step is the point — one chamfered shoulder catching the key and a second
  // plateau above it gives the centre of the guard a highlight and a cast
  // shadow of its own instead of a flat panel with a decal on it.
  // It has to stand a full 0.04 proud of the hub face: p3 lays ~0.02 of crust
  // over everything here, so anything shallower is simply erased.
  vec3 lp = vec3(ps.x, ps.y + 0.008, az - P4_TZ + 0.004);
  lp.xy = rot2(0.7854)*lp.xy;
  float loz = sdRoundBox(lp, vec3(0.048, 0.048, 0.012), 0.010);
  loz = min(loz, sdRoundBox(vec3(lp.xy, lp.z - 0.024), vec3(0.028, 0.028, 0.012), 0.008));
  d = opSmoothUnion(d, loz, 0.014);

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

  // FORM-DRIVEN WEAR. Noise-driven polish reads as texture; wear that follows
  // the sculpt reads as history. Two masks, both read straight off the
  // geometry this file built: the chamfer arrises round every contour and the
  // pierced eyes (dp), and the raised boss and hub lands standing proud in z.
  // Those are the surfaces a scabbard, a hand and a shield rim actually touch,
  // and they are also the ones p3's crust holds least well.
  float dp    = -p4_plate(vec2(p.x/p4_kx(), p.y));
  float arris = smoothstep(0.034, 0.004, dp);
  float proud = smoothstep(0.052, 0.098, abs(p.z));
  float wear  = clamp(arris*0.80 + proud*0.60, 0.0, 1.0);

  // The lips between hammer blows also burnish, at a much finer frequency.
  vec2  wl   = worley(p*vec3(9.0, 11.5, 9.0));
  float lip  = smoothstep(0.11, 0.0, wl.y - wl.x);
  float burn = clamp(lip*0.55 + wear, 0.0, 1.0);
  base = mix(base, vec3(0.205, 0.186, 0.160), burn*0.62);

  s.albedo = base;
  s.metal  = 1.0;
  s.rough  = clamp(0.74 - 0.34*burn + 0.18*(f - 0.5) - 0.10*scaleM, 0.20, 0.94);
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
