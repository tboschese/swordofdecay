// ============================================================================
// PIECE 7 — LIGHTING & SHADING MODEL
// Owns: the BRDF, the light rig, environment radiance, shadows/AO weighting.
// Contract: vec3 lightSurface(vec3 ro, vec3 rd, vec3 p, vec3 n, Surf s);
//           vec3 envRadiance(vec3 dir, float rough);
// Judged on: metal must read as metal — sharp specular with a long falloff,
//            a rim that separates the form from the background, and shadow
//            terminators that describe the cross-section.
//
// Design note: a polished flat is lit by its ENVIRONMENT, not by punctual
// lights. So the environment here is not a gradient — it is a small studio
// built out of rectangular light cards. The blade reflects those rectangles
// as distinct stretched shapes, which is what makes it read as metal.
//
// ROUND 2 — THE LEVEL. The rig's structure was right and the level was several
// stops hot: the blade's whole lit face sat above the tonemap shoulder, where
// value differences stop existing, so a slot/pier environment contrast of
// ~400:1 rendered as one pale slab.
//
// The cut is deliberately NOT a single global multiplier, because the
// over-drive was not global. Ablation (each constant below carries its own
// evidence) separated three independent paths that were each hot by a
// different amount, and one that was not hot at all:
//
//   P7_PSPEC  0.10   punctual specular — the largest offender
//   P7_TUBE   0.16   tube specular
//   P7_DIFF   0.22   diffuse — why the CLAY control was blown
//   P7_AMB    0.95   ambient diffuse — raised; it sets the SHADOW side
//   P7_LEVEL  4.20   environment — RAISED, it now lights the flat alone
//
// Net effect on the thing the critic measured, the blade's lit face, is about
// a 10x cut, but the hilt and the shadow side did not come down with it —
// that separation is the whole point, and it is why the histogram gained a
// mid mass instead of just going dark. Nothing downstream is allowed to bend
// this back (BRIEF standing policy 2), so the level is verified against the
// clay control (--mode 1) and not only against the histogram.
// ============================================================================

// Scene-referred scale for the ENVIRONMENT. Raised, not cut: with the punctual
// rig turned down, the environment is now the only thing lighting the polished
// flat — which is what the design note at the top of this file always claimed
// it was. The blade's value structure is therefore the slot wall's, so the
// wall's own peak (below) is what sets how bright the bands get, and this sets
// the room around them.
const float P7_LEVEL = 4.20;

// Punctual specular scale. THE OTHER HALF OF THE OVER-DRIVE, and the larger
// half. Proven by ablation: zeroing every directional and tube light left the
// blade a dark, structured, correctly-exposed piece of steel lit only by the
// environment; zeroing the slot wall instead changed almost nothing. A
// near-mirror flat has a normal that varies by a couple of degrees over its
// whole face, so a directional light widened to its source's angular radius
// (aP ~ 0.065) covers the ENTIRE flat inside one lobe — the "shaped
// highlight" ends up the size of the blade. Worse, each of those lights is a
// duplicate of an environment card the IBL path is already integrating, so
// the flat was being paid for twice.
//
// So: the environment lights the polished flat (that is the design note at
// the top of this file), and the punctual rig keeps only enough specular to
// put a crisp terminator on the rough materials. Diffuse is NOT cut with it —
// the corroded hilt needs its directional modelling, and a point light's
// diffuse is not double-counted the way its specular is.
const float P7_PSPEC = 0.10;

// Tube (strip) lights: kept, because the travelling highlight is real and is
// what makes a blade read forged rather than printed — but they had exactly
// the same lobe-covers-the-whole-flat problem and have to come down with it.
const float P7_TUBE  = 0.16;

// Edge-rim gain on the grazing env tap (see lightSurface). This and the hot
// cards are the only paths allowed past display 0.9 — everything else is mass.
const float P7_RIM   = 3.2;

// Diffuse scale. Separated from the specular level because the clay control
// (a neutral albedo-0.42 / rough-0.55 / metal-0 surface substituted for every
// material) was still rendering as a blown white slab after the specular cut —
// the diffuse half of the rig was hot on its own terms. It has to be, and can
// safely be, dialled independently: the blade is metal, so its diffuse term is
// identically zero and none of the steel tuning moves when this does. What
// moves is the corroded hilt, which is exactly the part that was over-lit.
const float P7_DIFF  = 0.22;

// Ambient (environment irradiance) diffuse scale, held separately from the
// punctual diffuse above. These two do different jobs and the round-2 rebalance
// needed them to move in opposite directions. The clay control fixes P7_DIFF:
// it is the KEY-side diffuse, so it sets where a lit matte face lands, and at
// 0.22 a 0.42-albedo clay face lands at display ~0.65, which is correct. But
// the same control says nothing about the SHADOW side, and that is where the
// image was collapsing — the whole corroded hilt was falling off the bottom of
// the histogram into decile 1. Raising the ambient lifts the unlit side into
// the mid band WITHOUT touching the lit-face peak, so it buys back midtone
// without spending any of the headroom clay is guarding.
const float P7_AMB   = 0.95;

// Build an orthonormal frame around a card's centre direction.
void p7_frame(vec3 c, out vec3 u, out vec3 v){
  vec3 up = abs(c.y) > 0.94 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  u = normalize(cross(up, c));
  v = cross(c, u);
}

// A rectangular area light projected on the unit sphere.
// `hs` is the angular half-size (tan units) on the card's u/v axes.
// `blur` widens it with roughness; the peak is scaled down to keep the total
// energy roughly constant, so the same rig serves both the mirror lookup and
// the rough/irradiance lookup.
float p7_card(vec3 dir, vec3 c, vec2 hs, float blur){
  float dc = dot(dir, c);
  if (dc < 0.08) return 0.0;

  vec3 u, v;
  p7_frame(c, u, v);
  vec2 q = vec2(dot(dir, u), dot(dir, v)) / dc;

  vec2 e = hs + blur;
  vec2 d = abs(q) - e;
  float sd = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);

  float feather = 0.015 + blur * 0.55;
  float cov = 1.0 - smoothstep(-feather, feather, sd);

  // soft falloff toward the card's own edges (real softboxes are not flat)
  vec2 t = clamp(abs(q) / max(e, vec2(1e-4)), 0.0, 1.0);
  cov *= (1.0 - 0.35 * t.x * t.x) * (1.0 - 0.30 * t.y * t.y * t.y);

  float gain = (hs.x * hs.y) / max(e.x * e.y, 1e-5);
  return cov * gain;
}

// Same card, but broken into a vertical run of panels separated by dark gaps
// (a gantry / clerestory rather than one continuous strip). A mirror flat
// reflects this as a chain of bright segments down its length instead of one
// dead-even wash — that lengthwise rhythm is what stops a blade reading as a
// flat white slab. The structure dissolves as roughness blurs it away.
float p7_slots(vec3 dir, vec3 c, vec2 hs, float blur, float period, float duty){
  float dc = dot(dir, c);
  if (dc < 0.08) return 0.0;

  vec3 u, v;
  p7_frame(c, u, v);
  vec2 q = vec2(dot(dir, u), dot(dir, v)) / dc;

  vec2 e = hs + blur;
  vec2 d = abs(q) - e;
  float sd = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);

  float feather = 0.015 + blur * 0.55;
  float cov = 1.0 - smoothstep(-feather, feather, sd);

  vec2 t = clamp(abs(q) / max(e, vec2(1e-4)), 0.0, 1.0);
  cov *= (1.0 - 0.30 * t.x * t.x);

  // panel rhythm along v, softened by roughness
  float f  = abs(fract(q.y / period) - 0.5) * 2.0;
  float sm = 0.10 + blur * 2.2;
  float m  = 1.0 - smoothstep(duty - sm, duty + sm, f);
  cov *= mix(1.0, m, clamp(1.0 - blur * 2.4, 0.0, 1.0));

  float gain = (hs.x * hs.y) / max(e.x * e.y, 1e-5);
  return cov * gain;
}

// ---- the studio ------------------------------------------------------------
// A cold vault, a warm ember floor, and five light cards. The two narrow
// front-left cards are the money shot: the blade's front flat reflects them as
// a pair of long vertical slots running most of its length.
//
// POSITION-AWARE. `envRadiance(dir, rough)` is the contract function, but
// nothing in the harness core calls it — it is used from inside this file and
// from p6's gem. So the real worker takes a position and the slot wall lives
// at a FINITE radius: the reflection ray is intersected against a cylinder, so
// the reflected bands slide along the blade as the surface point moves rather
// than being a purely directional decal. That parallax is most of what makes
// a long flat read as a solid object in a room instead of a printed gradient.
const float P7_WALL_R = 5.4;   // radius of the slot wall, world units

vec3 p7_envAt(vec3 pos, vec3 dir, float rough){
  float r2   = rough * rough;
  float blur = 0.010 + r2 * 0.95;

  // --- base vault gradient -------------------------------------------------
  // A hard-ish horizon matters: it is the edge the blade's flat reflects as a
  // clean light/dark split across its width.
  float up = dir.y * 0.5 + 0.5;
  vec3 c = mix(vec3(0.075, 0.042, 0.028),   // warm ember bounce, low
               vec3(0.018, 0.021, 0.031),   // dead horizon
               smoothstep(0.10, 0.48, up));
  c = mix(c, vec3(0.066, 0.084, 0.130), smoothstep(0.50, 1.0, up)); // cold vault

  // ember pool spilling up from the floor in front
  c += vec3(0.40, 0.14, 0.040) * pow(max(-dir.y, 0.0), 1.5) * 0.70;

  // --- the slot wall: the primary illuminant for every polished flat -------
  // A row of tall lit slots wrapping the front-left of the vault. A near-flat
  // blade only sweeps its reflection through ~60 degrees of azimuth across its
  // width, so a single softbox — however placed — covers the whole face and
  // the blade reads as one dead slab. A periodic wall cannot be missed: the
  // reflection always crosses two or three slots, giving bands of value across
  // the width that bend and wobble with the grind. This is the "you can see
  // the shape of the light in the metal" cue, and it is the whole ballgame.
  //
  // Ray/cylinder intersection gives the point on the wall this direction
  // actually sees from `pos`. Falls back to the pure directional read when the
  // ray never meets the wall.
  vec3  hitDir = dir;
  float parY   = dir.y;
  {
    vec2  o  = pos.xz;
    vec2  dd = dir.xz;
    float A  = dot(dd, dd);
    if (A > 1e-4){
      float Bq = dot(o, dd);
      float Cq = dot(o, o) - P7_WALL_R * P7_WALL_R;
      float disc = Bq * Bq - A * Cq;
      if (disc > 0.0){
        float t = (-Bq + sqrt(disc)) / A;
        if (t > 0.0){
          vec3 hp = pos + dir * t;
          hitDir = normalize(vec3(hp.x, 0.0, hp.z));
          // Height ON the wall, remapped into the same -0.42..0.86 window the
          // directional read uses. The wall is a physical band from y=-1.2 to
          // y=+6.7, which brackets the whole weapon with headroom, so the
          // reflected slots run the blade's full length instead of sliding off
          // the top of a window that was calibrated for direction cosines.
          parY   = clamp((hp.y - 1.4) / 6.2, -1.4, 1.4);
        }
      }
    }
  }

  float el = parY;
  // the wall is not perfectly straight — a slow bend so the reflected bands
  // wander along the blade instead of ruling it with dead-parallel lines.
  float az = atan(hitDir.x, hitDir.z) + 0.055*sin(el*4.4 + 1.1) + 0.03*sin(el*9.0);

  // slots survive only while the specular lobe is narrower than their pitch
  float crisp = clamp(1.0 - blur * 3.1, 0.0, 1.0);

  float pitch = 0.40;                                   // ~23 degrees per slot
  float wq    = abs(fract(az / pitch) - 0.5) * 2.0;
  float sm    = 0.045 + blur * 1.9;
  float slot  = 1.0 - smoothstep(0.21 - sm, 0.21 + sm, wq);

  // the wall runs from just below the horizon up to head height, and wraps
  // the front-left quadrant, falling off behind.
  float wallV = smoothstep(-0.42, -0.08, el) * (1.0 - smoothstep(0.42, 0.86, el));
  float wallH = smoothstep(-0.35, 0.35, hitDir.z) * (0.10 + 0.90*smoothstep(0.45, -0.45, hitDir.x));
  float wall  = wallV * wallH;

  // bright slot / dark pier: the contrast between them is the value structure.
  // ~400:1 between a lit slot and the pier beside it. At the round-1 level
  // that contrast lived entirely above the tonemap shoulder and was invisible;
  // at this level it IS the blade's value structure.
  c += vec3(1.00, 0.945, 0.860) * (0.10 + 4.30*crisp) * slot * wall;
  c += vec3(0.26, 0.31, 0.44) * 0.10 * wall;

  // --- key: a single very bright slot, front-left and high, the hero one ---
  vec3 kA = normalize(vec3(-0.58, 0.30, 0.76));
  c += vec3(1.00, 0.955, 0.880) * 2.4 * p7_slots(dir, kA, vec2(0.055, 0.70), blur, 0.34, 0.60);

  // --- hot core: a small blown slot high up, the bloom's fuel ---------------
  // Re-keyed UP against the global cut. This card and the grazing rim are the
  // only things allowed past display 0.9; everything else is mass.
  vec3 hD = normalize(vec3(-0.50, 0.55, 0.67));
  c += vec3(1.00, 0.97, 0.92) * 45.0 * p7_card(dir, hD, vec2(0.020, 0.052), blur);

  // a second, smaller hot pip further round — gives the tip and the far bevel
  // somewhere to catch a true blown point as the form turns.
  vec3 h2 = normalize(vec3(-0.20, 0.42, 0.89));
  c += vec3(1.00, 0.96, 0.90) * 24.0 * p7_card(dir, h2, vec2(0.016, 0.040), blur);

  // --- cold back-right kicker: separates the form from the background ------
  vec3 rD = normalize(vec3(0.66, 0.40, -0.64));
  c += vec3(0.50, 0.66, 1.05) * 5.0 * p7_card(dir, rD, vec2(0.11, 0.50), blur);

  // --- cool front-right bounce card: a dim, cold far facet -----------------
  vec3 bD = normalize(vec3(0.78, 0.14, 0.61));
  c += vec3(0.40, 0.50, 0.80) * 0.32 * p7_card(dir, bD, vec2(0.14, 0.55), blur);

  // --- warm ember card, low front: hue in the shadow side ------------------
  vec3 eD = normalize(vec3(0.20, -0.72, 0.66));
  c += vec3(1.00, 0.34, 0.09) * 2.1 * p7_card(dir, eD, vec2(0.42, 0.28), blur);

  return c * P7_LEVEL;
}

// Contract wrapper. Directional-only read, used where no position is handy.
vec3 envRadiance(vec3 dir, float rough){
  return p7_envAt(vec3(0.0, 1.2, 0.0), dir, rough);
}

// ---- GGX, anisotropic ------------------------------------------------------
// A ground blade's highlight is narrow ACROSS the blade and long ALONG it.
// A scalar roughness cannot say that, and faking it with normal waviness reads
// as a faceted mirror when the camera comes in. `Surf.aniso` / `Surf.anisoDir`
// drive a two-axis alpha; at aniso == 0 every term below collapses EXACTLY to
// the isotropic Smith-GGX it replaces (with ax == ay, ToH^2 + BoH^2 ==
// 1 - NoH^2, so the aniso D reduces to a2/(PI*(NoH^2*(a2-1)+1)^2) term for
// term, and the aniso Smith lambdas reduce to the isotropic ones).
vec3 F_Schlick(vec3 f0, float u){
  return f0 + (1.0 - f0)*pow(1.0 - u, 5.0);
}

// Orthonormal shading frame: T along the surface's grain, B across it.
void p7_grainFrame(vec3 n, Surf s, out vec3 T, out vec3 B){
  vec3 d = s.anisoDir;
  vec3 t = d - n * dot(n, d);
  float l = length(t);
  if (l < 1e-3){ p7_frame(n, T, B); return; }   // grain parallel to N: any frame
  T = t / l;
  B = cross(n, T);
}

// alpha along the grain (ax, stretched) and across it (ay, tightened).
// Disney's aspect mapping — the product ax*ay is preserved, so anisotropy
// redistributes the lobe rather than adding energy to it.
void p7_alphas(float a, float aniso, out float ax, out float ay){
  float aspect = sqrt(1.0 - 0.9 * clamp(aniso, 0.0, 1.0));
  ax = clamp(a / aspect, 0.0015, 1.0);
  ay = clamp(a * aspect, 0.0015, 1.0);
}

float p7_D(float NoH, float ToH, float BoH, float ax, float ay){
  float d = (ToH*ToH)/(ax*ax) + (BoH*BoH)/(ay*ay) + NoH*NoH;
  return 1.0 / max(PI * ax * ay * d * d, 1e-9);
}

// Heitz height-correlated Smith visibility, anisotropic form.
float p7_V(vec3 T, vec3 B, vec3 V, vec3 L,
           float NoV, float NoL, float ax, float ay){
  float lv = NoL * length(vec3(ax*dot(T, V), ay*dot(B, V), NoV));
  float ll = NoV * length(vec3(ax*dot(T, L), ay*dot(B, L), NoL));
  return 0.5 / max(lv + ll, 1e-7);
}

// One specular evaluation. Every light path in this file funnels through here.
vec3 p7_spec(vec3 N, vec3 V, vec3 L, vec3 T, vec3 B, vec3 f0,
             float ax, float ay){
  vec3  H   = normalize(V + L);
  float NoL = max(dot(N, L), 0.0);
  float NoV = max(dot(N, V), 1e-4);
  float NoH = max(dot(N, H), 0.0);
  float VoH = max(dot(V, H), 0.0);
  float D   = p7_D(NoH, dot(T, H), dot(B, H), ax, ay);
  float Vs  = p7_V(T, B, V, L, NoV, NoL, ax, ay);
  return F_Schlick(f0, VoH) * D * Vs;
}

vec3 brdf(vec3 N, vec3 V, vec3 L, Surf s, vec3 lightCol){
  vec3 T, B; p7_grainFrame(N, s, T, B);
  float ax, ay; p7_alphas(max(s.rough*s.rough, 0.0015), s.aniso, ax, ay);
  vec3 f0 = mix(vec3(0.04*s.spec*2.0), s.albedo, s.metal);
  vec3 diff = s.albedo * (1.0 - s.metal) * (P7_DIFF / PI);
  return (diff + p7_spec(N, V, L, T, B, f0, ax, ay)) * lightCol * max(dot(N, L), 0.0);
}

// Directional light with a finite angular radius (every real light has one).
// A true delta light on a near-mirror metal is a disaster: the GGX peak goes
// into the hundreds, so even the far shoulder of the lobe clips to white and
// the whole flat renders as one blown slab. Widening the lobe to the source's
// real angular size and renormalising drops the peak by orders of magnitude
// while keeping the total energy, which is what turns the slab back into a
// shaped highlight with a readable terminator. The widening is added to BOTH
// alphas, so an anisotropic surface keeps its aspect under a soft source.
vec3 p7_dirLight(vec3 N, vec3 V, vec3 L, Surf s, vec3 lightCol, float ang,
                 vec3 T, vec3 B){
  float NoL = max(dot(N, L), 0.0);

  vec3  f0 = mix(vec3(0.04*s.spec*2.0), s.albedo, s.metal);
  float a  = max(s.rough*s.rough, 0.0015);
  float ax, ay; p7_alphas(a, s.aniso, ax, ay);
  float axP = clamp(ax + ang*0.5, 0.0015, 1.0);
  float ayP = clamp(ay + ang*0.5, 0.0015, 1.0);
  float en  = (ax/axP) * (ay/ayP);

  vec3 spec = p7_spec(N, V, L, T, B, f0, axP, ayP) * en * P7_PSPEC;
  vec3 diff = s.albedo * (1.0 - s.metal) * (P7_DIFF / PI);

  return (diff + spec) * lightCol * NoL;
}

// ---- finite-distance tube (strip) light ------------------------------------
// The environment cards are infinitely far away, so a near-flat blade reflects
// essentially the same patch of them from base to tip and reads as one even
// slab. A strip light at a real distance does not: the half-vector, the
// incidence and the falloff all change along the blade, so the highlight
// travels, narrows and fades. That is what makes a hero-shot blade look forged
// rather than printed. Karis' representative-point approximation.
vec3 p7_tube(vec3 p, vec3 n, vec3 V, Surf s, vec3 A, vec3 Bp,
             float radius, vec3 lcol, vec3 T, vec3 Bt){
  vec3 R  = reflect(-V, n);
  vec3 L0 = A - p;
  vec3 Ld = Bp - A;

  float RoLd = dot(R, Ld);
  float t = (dot(R, L0)*RoLd - dot(L0, Ld)) / max(dot(Ld, Ld) - RoLd*RoLd, 1e-4);
  vec3  Lc = L0 + Ld*clamp(t, 0.0, 1.0);       // representative point

  // widen the point into a sphere of `radius` toward the reflection ray
  vec3 ctr = dot(Lc, R)*R - Lc;
  vec3 cl  = Lc + ctr * clamp(radius / max(length(ctr), 1e-4), 0.0, 1.0);

  float dist = max(length(cl), 1e-3);
  vec3  L    = cl / dist;

  float a  = max(s.rough*s.rough, 0.0015);
  float ax, ay; p7_alphas(a, s.aniso, ax, ay);
  float w   = radius/(2.0*dist);
  float axP = clamp(ax + w, 0.0015, 1.0);
  float ayP = clamp(ay + w, 0.0015, 1.0);
  float en  = (ax/axP) * (ay/ayP);             // sphere-light normalisation

  float NoL = max(dot(n, L), 0.0);
  vec3  f0  = mix(vec3(0.04*s.spec*2.0), s.albedo, s.metal);
  vec3 spec = p7_spec(n, V, L, T, Bt, f0, axP, ayP) * en;

  // diffuse takes the segment midpoint — no need for the representative point
  vec3  Dm  = (A + Bp)*0.5 - p;
  float dm  = max(length(Dm), 1e-3);
  vec3  diff = s.albedo * (1.0 - s.metal) * (P7_DIFF / PI);
  float NoLd = max(dot(n, Dm/dm), 0.0);

  return lcol * (spec * NoL / (dist*dist) + diff * NoLd / (dm*dm));
}

// Karis' analytic split-sum DFG term. x scales F0, y is the additive
// grazing-angle lobe that gives edges their near-blown rim.
vec2 p7_envBRDF(float NoV, float rough){
  const vec4 c0 = vec4(-1.0, -0.0275, -0.572,  0.022);
  const vec4 c1 = vec4( 1.0,  0.0425,  1.040, -0.040);
  vec4 r = rough * c0 + c1;
  float a004 = min(r.x*r.x, exp2(-9.28 * NoV)) * r.x + r.y;
  return vec2(-1.04, 1.04) * a004 + r.zw;
}

vec3 lightSurface(vec3 ro, vec3 rd, vec3 p, vec3 n, Surf s){
  vec3 V = -rd;
  float NoV = max(dot(n, V), 1e-4);
  vec3 col = vec3(0.0);

  float ao = clamp(s.ao * calcAO(p, n), 0.0, 1.0);
  // Specular occlusion: sharper materials see past a cavity, so they should
  // not be shut down by the same AO that kills the diffuse.
  float sao = clamp(mix(ao, 1.0, 0.45 + 0.35*(1.0 - s.rough)), 0.0, 1.0);

  vec3 f0 = mix(vec3(0.04*s.spec*2.0), s.albedo, s.metal);

  // Anisotropic shading frame, built once and shared by every light path.
  vec3 T, B; p7_grainFrame(n, s, T, B);

  // --- key: hard warm-white, upper front-left, matched to the key cards ----
  vec3  kDir = normalize(vec3(-0.55, 0.48, 0.68));
  vec3  kCol = vec3(1.00, 0.965, 0.900) * 6.0 * P7_LEVEL;
  float kSh  = softShadow(p + n*0.005, kDir, 0.02, 6.0, 14.0);
  kSh = mix(0.30, 1.0, kSh);            // shadows keep hue, never go dead
  col += p7_dirLight(n, V, kDir, s, kCol, 0.085, T, B) * kSh;

  // --- cold rim from back-right -------------------------------------------
  vec3  rDir = normalize(vec3(0.70, 0.40, -0.60));
  vec3  rCol = vec3(0.52, 0.68, 1.06) * 8.0 * P7_LEVEL;
  float rSh  = softShadow(p + n*0.005, rDir, 0.02, 6.0, 20.0);
  col += p7_dirLight(n, V, rDir, s, rCol, 0.11, T, B) * mix(0.18, 1.0, rSh);

  // --- warm ember bounce from below, unshadowed ----------------------------
  vec3 fDir = normalize(vec3(0.26, -0.62, 0.60));
  vec3 fCol = vec3(1.00, 0.40, 0.15) * 1.35 * P7_LEVEL;
  col += p7_dirLight(n, V, fDir, s, fCol, 0.55, T, B) * mix(0.15, 1.0, ao);

  // --- top-back cold accent: reads the spine and the tip -------------------
  vec3 tDir = normalize(vec3(-0.18, 0.86, -0.48));
  vec3 tCol = vec3(0.62, 0.74, 1.00) * 3.0 * P7_LEVEL;
  col += p7_dirLight(n, V, tDir, s, tCol, 0.45, T, B) * mix(0.18, 1.0, ao);

  // --- strip lights: the travelling highlights that make the blade forged --
  // 1. primary polish line: a long vertical strip sitting ON the reflection
  //    ray of the blade's flat, so its image stretches the whole length.
  col += p7_tube(p, n, V, s, vec3(-1.14, -2.30, 2.34), vec3(-0.98, 4.90, 2.06),
                 0.075, vec3(1.00, 0.945, 0.865) * 1.9 * P7_LEVEL * P7_TUBE, T, B)
         * mix(0.45, 1.0, ao);

  // 2. bevel line: rotated outboard so it lands on the ground bevel rather
  //    than the flat — a second, tighter highlight parallel to the first.
  //    Kept hot against the cut: this is a specular SOURCE, not fill.
  col += p7_tube(p, n, V, s, vec3(-0.10, -1.40, 2.62), vec3(0.06, 4.20, 2.44),
                 0.026, vec3(1.00, 0.975, 0.930) * 16.0 * P7_LEVEL * P7_TUBE, T, B)
         * mix(0.45, 1.0, ao);

  // 3. cold back-right strip: catches the far bevel, the spine and the arms.
  col += p7_tube(p, n, V, s, vec3(1.55, -1.60, -1.35), vec3(1.20, 3.20, -1.05),
                 0.10, vec3(0.46, 0.62, 1.05) * 2.6 * P7_LEVEL * P7_TUBE, T, B)
         * mix(0.35, 1.0, ao);

  // --- image based lighting ------------------------------------------------
  // Anisotropy bends the reflection vector toward the grain-aligned normal
  // (Filament's bent-normal trick), so the environment's slot bands smear
  // along the grain instead of reflecting as a circular patch.
  vec3 Nr = n;
  if (s.aniso > 0.001){
    vec3 aT = cross(B, V);
    vec3 aN = cross(aT, B);
    float bend = clamp(s.aniso, 0.0, 1.0) * clamp(2.5*s.rough + 0.25, 0.0, 1.0);
    Nr = normalize(mix(n, aN, bend));
  }
  vec3 R = reflect(-V, Nr);

  vec2 ab = p7_envBRDF(NoV, s.rough);
  vec3 dfg = f0 * ab.x + vec3(ab.y);
  // multi-scatter energy compensation
  dfg *= 1.0 + f0 * (1.0 / max(ab.x + ab.y, 1e-3) - 1.0) * 0.5;

  vec3 pref = p7_envAt(p, R, s.rough);
  col += pref * dfg * sao;

  // Grazing lobe tap — the EDGE RIM. The split-sum approximation evaluates the
  // whole specular lobe with one sample at R, which is badly wrong at glancing
  // incidence: there the GGX lobe is long, stretched toward the horizon and
  // reaches well past R. Single-sampling it is why a raymarched blade edge
  // renders as a thin grey line instead of catching a near-blown rim. A second
  // tap along the stretched axis, weighted by the same grazing term that makes
  // the rim exist at all, fixes it. It costs one env evaluation and it is
  // confined to the silhouette: (1-NoV)^4 is ~0 over the whole flat.
  float gz = pow(1.0 - NoV, 2.5);
  vec3  Rg = normalize(R + V * (0.42 * gz));
  col += p7_envAt(p, Rg, min(s.rough + 0.08, 1.0)) * (ab.y * gz * P7_RIM) * sao;

  // Diffuse ambient takes a sharpened AO: on the corroded hilt the crevices
  // are the only thing describing relief, and a linear AO leaves it flat.
  // Sharpened, not squared — ao*ao was costing the hilt most of its midtone
  // for relief it only needed a fraction of that curve to describe.
  float aoD = mix(ao, ao*ao, 0.55);
  vec3 irr = p7_envAt(p, n, 1.0);
  col += s.albedo * (1.0 - s.metal) * irr * (ao * aoD * P7_AMB);

  // --- emissive -------------------------------------------------------------
  col += s.emissive;

  return col;
}
