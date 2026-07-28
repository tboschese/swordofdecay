// ============================================================================
// PIECE 1 — BLADE FORM / SILHOUETTE
// Owns: overall weapon proportions (dims) and the blade's 3D shape.
// Contract: Dims dims();  float sdBlade(vec3 p);
//
// FORM BRIEF: a two-handed war blade, not an arming sword. The memorable
// silhouette event is a zweihander-style construction — a long narrow blunt
// RICASSO rising out of the guard, a pair of upswept PARRY HOOKS
// (parierhaken), then a hard STEP OUT to the full-width blade. Read bottom to
// top the widths go: wide (guard) -> very narrow (ricasso) -> wide (hooks) ->
// step out -> long near-parallel blade -> asymmetric CLIP POINT. That rhythm
// is what makes it identifiable in a loot filter at 64px.
//
// Cross-section is a three-facet grind — deep fuller with hard shoulders down
// the middle of the blade, a long primary bevel, and a distinct secondary
// bevel at the edge — plus real distal taper (base:tip thickness ~3.5:1) so
// light breaks across the blade in bands instead of washing over a flat.
// ============================================================================

Dims dims(){
  Dims d;
  d.bladeLen   = 1.72;   // guard plane to tip
  d.bladeHalfW = 0.132;  // half-width of the blade proper (widest, at the heel)
  d.bladeHalfT = 0.038;  // half-thickness at the spine, base of blade
  d.gripLen    = 0.44;   // long enough for two hands
  d.guardHalfW = 0.345;  // wide guard sells the scale
  return d;
}

// ---------------------------------------------------------------- constants -
// Blade profile control points in the XY plane. Straight edges between them,
// so the 2D profile is an exact convex intersection of half-planes.
//   right: (0.132,0.42) -> (0.112,1.42) -> tip (0.010,1.72)
//   left : (-0.132,0.42) -> (-0.1156,1.26) -> (-0.070,1.56) -> tip
// The left chain breaks twice near the point while the right sweeps on in one
// line: that is the clip / false edge, and it throws the point off-axis.

#define P1_TIPY  1.720
#define P1_HEEL  0.420   // where the blade proper steps out of the ricasso

// -------------------------------------------------------------- 2D profile --
// Convex intersection of half-planes -> exact against faces, underestimates at
// the corners, never overestimates. Safe to sphere-trace.
float p1_profile(vec2 a){
  float d = P1_HEEL - a.y;                                                // heel
  d = max(d, dot(a - vec2( 0.13200, 0.420), vec2( 0.999800,  0.019996))); // RA
  d = max(d, dot(a - vec2( 0.11200, 1.420), vec2( 0.946782,  0.321906))); // RB
  d = max(d, dot(a - vec2(-0.13200, 0.420), vec2(-0.999809,  0.019520))); // LA
  d = max(d, dot(a - vec2(-0.11560, 1.260), vec2(-0.988629,  0.150274))); // LB
  d = max(d, dot(a - vec2(-0.07000, 1.560), vec2(-0.894427,  0.447214))); // LC
  return d;
}

// Local half-width of the blade proper at height y. Also normalises the
// cross-section, and p2 uses it to map spine->edge.
float bladeHalfWidth(float y){
  float s1 = clamp((y - 0.42)/1.00, 0.0, 1.0);
  float s2 = clamp((y - 1.42)/0.30, 0.0, 1.0);
  return max(0.132 - 0.020*s1 - 0.102*s2, 0.010);
}

// Half-thickness at the spine. Real distal taper — the point is ~3.5x thinner
// than the forte, which is what stops it reading as an extrusion.
float bladeHalfThick(float y){
  float u = clamp(y / P1_TIPY, 0.0, 1.0);
  float k = 0.55*u + 0.45*u*u;
  return mix(0.0380, 0.0108, k);
}

// Cross-section: fraction of the spine half-thickness at normalised width ux
// (0 = centreline, 1 = edge), at height y.
float p1_section(float ux, float y){
  ux = clamp(ux, 0.0, 1.0);

  // Three facets per half-face, so light breaks in bands instead of washing
  // over a flat:  steep RIDGE ROOF (inner 25%) -> broad shallow FLAT ->
  // steep SECONDARY BEVEL over the outer 18%, which carries the edge highlight
  // as its own narrow strip. The two creases at ux=0.25 and ux=0.82 are real
  // geometry, not shading tricks.
  float h = min(min(1.0 - 1.90*ux, 0.62 - 0.40*ux), 1.4675 - 1.4375*ux);

  // Deep fuller with a hard shoulder, down the middle of the blade. Above it
  // the ridge takes over; that hand-off is a readable event in the shading.
  float run  = smoothstep(0.48, 0.62, y) * (1.0 - smoothstep(1.14, 1.36, y));
  float band = smoothstep(0.60, 0.53, ux);
  float flr  = 0.22 + 0.06*ux;                  // near-flat, deeply set floor
  h = mix(h, min(h, flr), run*band);

  // Ricasso is unsharpened: flat sides with rolled corners, no edge at all.
  float ric = 1.0 - smoothstep(0.34, 0.50, y);
  h = mix(h, smoothstep(1.02, 0.74, ux), ric);

  return max(h, 0.0);
}

// Back-compat wrapper (older signature).
float sectionProfile(float u){ return p1_section(u, 1.0); }

// A gothic slot: near-parallel sides through the middle, drawn to a point at
// both ends. Stadium intersected with a rhombus — both exact, so the result
// only ever underestimates.
float p1_slot(vec2 a, float y0, float y1, float r){
  float yc = 0.5*(y0 + y1);
  float hy = 0.5*(y1 - y0) + r;
  float hx = 2.8*r;
  float cap = sdSegment2(a, vec2(0.0, y0), vec2(0.0, y1)) - r;
  float k   = inversesqrt(hy*hy + hx*hx);
  float rho = (abs(a.x)*hy + abs(a.y - yc)*hx - hx*hy) * k;
  return max(cap, rho);
}

// Extrude a 2D distance along Z with rounding r.
float p1_ext(float d2, float dz, float r){
  vec2 q = vec2(d2 + r, dz + r);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float sdBlade(vec3 p){
  vec2  a  = p.xy;
  float az = abs(p.z);

  // --- blade proper ---------------------------------------------------------
  float w   = bladeHalfWidth(a.y);
  float thB = bladeHalfThick(a.y) * p1_section(abs(a.x)/w, a.y);
  float pr  = p1_profile(a);

  // Pierced fuller: two openings punched clean through the blade, split by a
  // narrow bridge. Real negative space inside the mass — this is the thing that
  // makes the silhouette unmistakable at thumbnail size.
  float slotA = p1_slot(a, 0.580, 0.915, 0.038);
  float slotB = p1_slot(a, 0.990, 1.205, 0.028);
  pr = max(pr, -min(slotA, slotB));

  float dB  = p1_ext(pr, az - thB, 0.0016);

  // --- ricasso: long, narrow, blunt; buried down into the guard -------------
  vec2 qa = abs(a - vec2(0.0, 0.1925)) - vec2(0.061 - 0.014, 0.2475 - 0.014);
  float dA2 = length(max(qa, 0.0)) + min(max(qa.x, qa.y), 0.0) - 0.014;
  float thA = 0.0375 * smoothstep(1.04, 0.70, abs(a.x)/0.063);
  float dA  = p1_ext(dA2, az - thA, 0.0028);

  // --- parry hooks: upswept lugs at the top of the ricasso ------------------
  vec2 ha = vec2(abs(a.x), a.y);
  float horn = sdSegment2(ha, vec2(0.038, 0.300), vec2(0.160, 0.398)) - 0.030;
  float spur = sdSegment2(ha, vec2(0.152, 0.386), vec2(0.186, 0.482)) - 0.017;
  float dC   = p1_ext(min(horn, spur), az - 0.0300, 0.0040);

  // Union. min() of exact pieces only ever underestimates -> march-safe.
  float d = min(dB, min(dA, dC));

  // Global safety factor: the fuller shoulders push the gradient a little over
  // 1, and thin edges are unforgiving.
  return d * 0.85;
}
