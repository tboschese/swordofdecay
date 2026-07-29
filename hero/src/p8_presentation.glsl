// ============================================================================
// PIECE 8 — PRESENTATION (camera, background, atmosphere, grade)
// Owns: how the weapon is staged and finished as a hero shot.
// Contract: void setupCamera(vec2 uv, out vec3 ro, out vec3 rd);
//           vec3 backgroundCol(vec3 ro, vec3 rd);
//           vec3 applyAtmosphere(vec3 col, vec3 ro, vec3 rd, float d, bool hit);
//           vec3 postProcess(vec3 hdr, vec3 bloomC, vec2 uv);
// Judged on: composition and framing, figure/ground separation, whether the
//            grade reads as a shipped marketing render rather than a viewport.
//
// ROUND 2 — the environment is authored in VALUE, not in hue.
//   Round 1 carried the whole background on blue chroma: mean HSV saturation
//   0.876 against the subject's 0.352, so desaturating the render left a black
//   void with a sword cut out of it. Every constant below is now a cold SLATE
//   (R,G at ~55-65% of B) and the luminance that frees up is spent on things
//   the eye can see in greyscale: a raking shaft, a lit pool of flagstone, a
//   horizon, and a real contact shadow under the pommel.
// ============================================================================

// ------------------------------------------------------------- framing -----
// Three-quarter presentation on a long lens, rolled well off vertical so the
// blade is a diagonal rather than a bar, and pushed off centre in BOTH axes —
// left of the vertical midline, and lifted so the bottom third of the frame is
// floor rather than weapon.
//
// Framing is derived from dims() rather than hardcoded, so it survives the
// blade-form module changing the weapon's proportions underneath it.
const float P8_YAW   = radians(23.5);
const float P8_PITCH = radians(-1.4);   // camera ~1.0 above the floor, not 0.5
const float P8_ROLL  = radians(15.0);
const float P8_DIST  = 9.6;
const float P8_FILL  = 0.740;                 // target fraction of frame height
const vec2  P8_SHIFT = vec2(0.058, -0.038);   // frame offset, uv units

// ------------------------------------------------------------- helpers -----
vec2 p8_rot(vec2 p, float a){
  float c = cos(a), s = sin(a);
  return vec2(c*p.x - s*p.y, s*p.x + c*p.y);
}

// Vertical extent of the weapon: tip down to the underside of the pommel.
vec2 p8_extent(){
  Dims D = dims();
  return vec2(-(D.gripLen + 0.17), D.bladeLen);
}

// The ground the weapon stands on. Derived, not hardcoded — round 1 pinned this
// at -1.02 while the pommel bottomed out at -0.61, so the sword hovered 24% of
// a blade length above its own floor.
float p8_floorY(){ return p8_extent().x; }

vec3 p8_target(){ return vec3(0.0, dot(p8_extent(), vec2(0.5)), 0.0); }

// World units of height the frame spans, sized so the rolled weapon fills
// P8_FILL of it.
float p8_vext(){
  vec2 e = p8_extent();
  return (e.y - e.x)*cos(P8_ROLL)/P8_FILL;
}
float p8_focal(){ return P8_DIST / p8_vext(); }

vec3 p8_camPos(){
  vec3 o = vec3(sin(P8_YAW)*cos(P8_PITCH), sin(P8_PITCH), cos(P8_YAW)*cos(P8_PITCH));
  return p8_target() + o*P8_DIST;
}

void p8_basis(out vec3 F, out vec3 R, out vec3 U){
  F = normalize(p8_target() - p8_camPos());
  vec3 r0 = normalize(cross(vec3(0.0, 1.0, 0.0), F));
  vec3 u0 = cross(F, r0);
  float c = cos(P8_ROLL), s = sin(P8_ROLL);
  R =  r0*c + u0*s;
  U = -r0*s + u0*c;
}

// Frame coordinates for a ray — identical space to the uv postProcess gets,
// so background staging and the grade's vignette can be composed together.
vec2 p8_screen(vec3 rd){
  vec3 F, R, U; p8_basis(F, R, U);
  float dz = max(dot(rd, F), 1e-3);
  return vec2(dot(rd, R), dot(rd, U)) * (p8_focal()/dz) - P8_SHIFT;
}

void setupCamera(vec2 uv, out vec3 ro, out vec3 rd){
  ro = p8_camPos();
  vec3 F, R, U; p8_basis(F, R, U);
  vec2 q = uv + P8_SHIFT;
  rd = normalize(F*p8_focal() + R*q.x + U*q.y);
}

// ---------------------------------------------------------- background -----
// PALETTE. Three near-neutral tints, each pre-divided by its own Rec.709
// luminance, so `p8_air(L)` returns a colour whose luminance is exactly L.
// That is the whole point: every constant below is a VALUE with a faint tint,
// not a hue with a brightness bolted on afterwards.
//   air   = vec3(0.740, 0.820, 1.000)  cold slate      lum 0.8160
//   stone = vec3(0.760, 0.775, 0.870)  damp flagstone  lum 0.7787
//   warm  = vec3(1.000, 0.660, 0.400)  ember bounce    lum 0.7133
// Blue is only 1.35x red here, against round 1's 6.8x on screen. That single
// ratio is most of the "coloured gel" verdict.
vec3 p8_air  (float L){ return vec3(0.9069, 1.0049, 1.2255)*L; }
vec3 p8_stone(float L){ return vec3(0.9760, 0.9953, 1.1173)*L; }
vec3 p8_warm (float L){ return vec3(1.4020, 0.9253, 0.5608)*L; }

// Key light direction, matching p7's key. Only its DIRECTION is used (for the
// contact shadow ray and for which side the shaft falls from) — nothing here
// depends on how bright p7 decides to make it.
vec3 p8_key(){ return normalize(vec3(-0.55, 0.48, 0.68)); }

// Lens falloff. Shared between the grade and the environment ceiling below,
// because the ceiling has to know about it: without the compensation the floor
// pool (which sits at ~0.72 falloff) could never reach the same on-screen value
// as the beam (which sits at 1.00), and the ground would stay the dimmest thing
// in the frame no matter what it was fed.
float p8_vig(vec2 uv){
  vec2  vq = (uv + P8_SHIFT*0.55) * vec2(0.98, 1.10);
  float r  = length(vq);
  return (1.0 - smoothstep(0.30, 0.86, r)*0.52)
       * (1.0 - smoothstep(0.50, 1.08, r)*0.36);
}

// Soft ceiling on the environment, in SCENE-LINEAR, applied to the miss path
// only. Art direction, not a tonemap patch: the room is never allowed to
// out-value the weapon, whatever the fbm mottling and the mote layers stack up
// to on a given pixel. Monotonic and C1 at the knee, so it compresses the top
// of the background range instead of clipping it — which also keeps every
// background pixel under measure.mjs's subject threshold, so the bbox / axis /
// proportion numbers downstream stay meaningful.
const float P8_BG_KNEE = 0.0138;
const float P8_BG_CAP  = 0.0172;
vec3 p8_bgCeil(vec3 c, vec2 uv){
  // Partial, not full, compensation: ACES is superlinear through this range, so
  // dividing the scene-linear cap by the falloff outright overshoots on screen.
  float g    = pow(1.0/clamp(p8_vig(uv), 0.60, 1.0), 0.62);
  float knee = P8_BG_KNEE*g;
  float cap  = P8_BG_CAP *g;
  float bl = dot(c, vec3(0.2126, 0.7152, 0.0722));
  if (bl <= knee) return c;
  float sp = cap - knee;
  float bo = cap - sp*exp(-(bl - knee)/sp);
  return c * (bo/max(bl, 1e-8));
}

// Raking shaft, from a window that is off the frame entirely.
//
// Four things make a bar of light read as a BEAM rather than as a soft field,
// and round 1 had none of them:
//   1. the source is off-frame — the beam is CUT by the right edge at full
//      strength rather than fading out inside the picture, so the eye infers a
//      window it cannot see;
//   2. the cross-section is asymmetric — the edge facing the aperture is hard,
//      the trailing edge bleeds, because that is what an occluding jamb does;
//   3. it loses strength along its length, and dies before it reaches the far
//      corner;
//   4. there is dust in it, streaked ALONG the beam. Isotropic noise reads as
//      cloud; noise stretched down the axis reads as rays.
//
// Geometry: 37 deg off vertical against the blade's 12, entering at the right
// edge and raking down-left to land exactly on the floor pool. The two lines
// cross at s=(-0.17,-0.46) — the contact point — so the beam and the blade open
// into a V whose vertex is where the weapon meets the ground, and the beam
// explains why that patch of stone is lit.
const vec2 P8_BEAM_C = vec2(0.100, -0.100);
float p8_shaft(vec2 s){
  vec2 q = p8_rot(s - P8_BEAM_C, radians(45.0));

  // (2) asymmetric cross-section; (1)+(3) spread and decay along the length.
  float spread = smoothstep(0.55, -0.45, q.y);          // 0 at source, 1 far
  float wHard  = 0.027 + 0.038*spread;
  float wSoft  = 0.056 + 0.122*spread;
  float wq     = (q.x > 0.0) ? wHard : wSoft;
  float band   = exp(-(q.x*q.x)/(2.0*wq*wq));

  // No taper at the top: the beam leaves through the frame edge at full value.
  float run  = smoothstep(-0.56, -0.14, q.y)
             * mix(0.40, 1.0, smoothstep(-0.34, 0.46, q.y));

  // (4) dust: high frequency across the beam, low along it => striations.
  float ray  = fbm(vec3(q.x*17.0, q.y*1.9, 0.0), 3);
  float mote = fbm(vec3(s*5.4, 2.3), 3);
  return band*run*(0.26 + 0.92*ray)*(0.66 + 0.54*mote);
}

// Ambient wash. NOT a halo — round 1 centred a radial glow at s=(0.02,0.02),
// within 0.08 of the subject's own centre, so the weapon sat inside a radial
// bullseye and read as a specimen on a light table. This is an anisotropic
// gradient anchored to the BEAM, up in the empty camera-right quadrant and a
// third of a frame away from the subject, so the field falls off diagonally
// instead of nesting around the sword.
float p8_halo(vec2 s){
  vec2 q = p8_rot(s - vec2(0.285, 0.115), radians(45.0));
  q *= vec2(1.55, 0.72);   // narrow across the beam, long along it
  return exp(-dot(q, q)*3.1);
}

// Screen-space shape of the light pool on the floor: keeps the lit ground
// under the weapon and lets the frame edges go to black, so the pool reads as
// a compositional element rather than as a wash across the bottom.
float p8_pool(vec2 s){
  vec2 d = (s - vec2(-0.080, -0.390)) * vec2(1.34, 1.46);
  return exp(-dot(d, d)*1.45);
}

vec3 backgroundCol(vec3 ro, vec3 rd){
  vec2 s = p8_screen(rd);

  // -- the air ---------------------------------------------------------------
  // A directional gradient, brightest toward the shaft's source in the upper
  // right and falling to near-black in the lower left. Value, not hue: this is
  // a plain luminance ramp wearing a faint slate tint.
  float dw = smoothstep(-0.55, 0.55, 0.62*s.x + 0.78*s.y);
  vec3  c  = p8_air(mix(0.00395, 0.00495, dw));
  c += p8_air(0.00130) * p8_halo(s);

  // Distance haze, one-sided ABOVE the horizon only. The far ground has to
  // terminate against something brighter than itself or it is not an edge, and
  // keeping the haze off the ground side keeps the break sharp.
  float hz = exp(-(rd.y*rd.y)/(2.0*0.055*0.055)) * step(-0.0005, rd.y);
  c += p8_air(0.00620) * hz * (0.40 + 0.90*p8_halo(s));

  // -- the shaft -------------------------------------------------------------
  float sh = p8_shaft(s);
  c += p8_air(0.01000) * sh;
  c += p8_warm(0.00260) * sh*sh;   // rot-ochre where the beam is densest

  // -- flagstone floor -------------------------------------------------------
  float fy = p8_floorY();
  if (rd.y < -0.004){
    float tf = (fy - ro.y)/rd.y;
    if (tf > 0.5 && tf < 400.0){
      vec3  fp = ro + rd*tf;

      // Perspective is carried by the world-space cell size, so the stones
      // compress correctly toward the horizon: that is what makes a plane a
      // plane rather than a gradient. But the camera sits barely a unit above
      // this plane, so a few rows short of the horizon one pixel spans several
      // flagstones — texture there aliases into horizontal smears. Estimate the
      // pixel's world footprint analytically and fade the detail out as it
      // outgrows the cell. Derived from uRes, so it is correct at any output
      // size and any supersample factor.
      float fw   = (ro.y - fy) / (p8_focal()*uRes.y*max(rd.y*rd.y, 1e-7));
      float det  = smoothstep(0.42, 0.06, fw);

      vec2  w    = worley(vec3(fp.x*1.15, 0.0, fp.z*1.15));
      float slab = smoothstep(0.015, 0.130, w.y - w.x);       // mortar seams
      float grit = 0.80 + 0.34*fbm(vec3(fp.x*2.4, 0.0, fp.z*2.4), 3);
      // Shallow contrast on purpose. At this camera height one pixel already
      // spans most of a flagstone; a 5:1 seam-to-face ratio does not read as
      // stone from here, it reads as scratches raked across the frame.
      float surf = mix(0.94, grit*mix(0.66, 1.06, slab), det);

      // Light pool: physical falloff about the weapon, shaped in screen space
      // so the frame corners stay black.
      float rxz  = length(fp.xz);
      float pool = exp(-rxz*rxz*0.115) * p8_pool(s);

      // Real contact shadow. softShadow() is forward-declared in core_head and
      // defined in core_scene, so the miss path can trace the scene too — the
      // floor takes a genuine shadow from the weapon standing on it. Gated to
      // the weapon's neighbourhood so it costs nothing out in the dark.
      float occ = 1.0;
      if (rxz < 4.2){
        float sv = softShadow(fp + vec3(0.0, 0.010, 0.0), p8_key(), 0.03, 7.0, 14.0);
        occ = mix(1.0, sv, smoothstep(4.2, 3.0, rxz));
        // Two ambient contact lobes on top of the traced shadow.
        //  - a tight near-black core at the seam where the pommel meets stone:
        //    darkest and smallest exactly at contact, which is the gradient
        //    that reads as weight;
        //  - a wide lobe STRETCHED along the key's floor projection, so the
        //    soft occlusion has the same direction the cast shadow does. p7's
        //    key is slightly camera-side, so its true cast runs away from the
        //    viewer and is heavily foreshortened; this gives that direction
        //    something legible on the near side of the plane.
        occ *= 1.0 - 0.90*exp(-rxz*rxz*4.60);
        vec2  sdir  = normalize(vec2(0.55, -0.68));      // shadow, floor plane
        float along = dot(fp.xz, sdir);
        float acrs  = dot(fp.xz, vec2(-sdir.y, sdir.x));
        float aa    = (along > 0.0) ? along*0.68 : along*1.90;
        occ *= 1.0 - 0.58*exp(-(aa*aa + acrs*acrs*2.60)*1.55);
      }

      // The ember bounce is folded INTO the pool rather than added on top, so
      // the warm note costs value it already has instead of extra brightness.
      vec3 poolCol = mix(vec3(0.9760, 0.9953, 1.1173), vec3(1.4020, 0.9253, 0.5608), 0.34);
      vec3 stone = (p8_stone(0.00520) + poolCol*(0.02450*pool*occ)) * surf;

      float fog  = exp(-max(tf - 12.0, 0.0)*0.075);
      float edge = smoothstep(0.0, 0.018, -rd.y);
      c = mix(c, stone, clamp(fog*edge, 0.0, 1.0));
    }
  }

  // -- mottling so nothing is a dead ramp ------------------------------------
  c *= 0.84 + 0.32*fbm(vec3(s*6.0, 1.7), 4);
  c *= 0.93 + 0.14*fbm(vec3(s*21.0, 5.3), 3);
  return p8_bgCeil(max(c, 0.0), s);
}

// ---------------------------------------------------------- atmosphere -----
// Drifting blight spores: layered camera-parallel planes of jittered specks,
// culled by the weapon's depth so they read as air in front of the steel.
float p8_motes(vec3 ro, vec3 rd, float dHit){
  vec3 F, R, U; p8_basis(F, R, U);
  float dz = max(dot(rd, F), 1e-3);
  float acc = 0.0;

  for (int i = 0; i < 7; i++){
    float fi = float(i);
    float depth = 3.4 + fi*1.35;
    float t = depth/dz;
    if (t > dHit) continue;

    vec3 p = ro + rd*t;
    vec2 g = vec2(dot(p - ro, R), dot(p - ro, U));

    float cell = 0.120 + 0.034*fi;
    vec2  gi   = floor(g/cell);
    vec3  h    = hash33(vec3(gi, fi*13.7 + 4.1));
    vec2  ctr  = (gi + 0.16 + 0.68*h.xy)*cell;
    float rad  = cell*(0.028 + 0.046*h.z);
    float d    = length(g - ctr);

    float live = step(0.68, fract(h.z*7.31 + h.x*3.17));
    acc += smoothstep(rad, rad*0.20, d) * live * (0.30 + 0.70*h.y);
  }
  return acc;
}

vec3 applyAtmosphere(vec3 col, vec3 ro, vec3 rd, float d, bool hit){
  vec2 s = p8_screen(rd);

  if (hit){
    // A thin veil of lit air. The weapon sits at ~9.6 units, so this is a
    // near-uniform lift that seats the steel in the room rather than a depth
    // ramp — the sword is far too shallow in Z for real distance haze.
    float f = 1.0 - exp(-max(d - 6.0, 0.0)*0.030);
    vec3  haze = p8_air(0.00360)
               + p8_air(0.01500)*p8_shaft(s)
               + p8_air(0.00300)*p8_halo(s);
    col = mix(col, haze, clamp(f, 0.0, 1.0));
  }

  // Spores catch the shaft; they are near-invisible out in the dark corners.
  float lit = 0.18 + 1.55*p8_shaft(s) + 0.55*p8_halo(s);
  col += p8_air(0.00260) * min(p8_motes(ro, rd, hit ? d : 1e4) * lit, 1.5);

  // The environment — background plus the spores drifting in it — sits under
  // one ceiling. Only the miss path: motes crossing the weapon belong to the
  // subject and are not clamped.
  if (!hit) col = p8_bgCeil(col, s);

  return col;
}

// --------------------------------------------------------------- grade -----
// Smooth contrast about an arbitrary pivot (S-curve, no clipping).
vec3 p8_contrast(vec3 x, float amt, float pivot){
  vec3 g = vec3(log(0.5)/log(clamp(pivot, 0.02, 0.98)));
  vec3 u = pow(clamp(x, 0.0, 1.0), g);
  return mix(x, pow(u*u*(3.0 - 2.0*u), 1.0/g), amt);
}

vec3 p8_srgb(vec3 c){
  c = clamp(c, 0.0, 1.0);
  return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4)) - 0.055, step(vec3(0.0031308), c));
}

vec3 postProcess(vec3 hdr, vec3 bloomC, vec2 uv){
  // Halation: the bloom is re-added warm-biased so hot steel glows like film,
  // not like a screen-space blur of itself. The RATIO between the channels is
  // the look; the magnitude is deliberately modest. At 0.40 the tip's halo grew
  // faster than the frame did — at 360x450 it inflated the measured subject
  // bbox from 3.3:1 to 9.1:1 blade:hilt — and it would grow again the moment
  // p7 puts its stop back. A grade should not become a different grade at a
  // different output size.
  vec3 c = hdr + bloomC*vec3(0.22, 0.187, 0.154);

  // ---- the ONE exposure normalisation, scene-referred, before the tonemap.
  // p7 owns how much light there is; this is the single trim, and nothing
  // downstream is keyed to display values. Round 1's band compressor near the
  // shoulder is gone: it applied ~3.4x local gain over a 0.13-wide window,
  // rang around speculars, and inverted (a dimmer rig got crushed harder).
  c *= 1.05;

  // Highlight bleach before the tonemap: very bright things lose saturation on
  // the way to white, which stops speculars reading as coloured plastic.
  float lp = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c, vec3(lp), smoothstep(1.2, 7.0, lp)*0.55);

  // Filmic tonemap (ACES fit) — long shoulder, gentle toe. MONOTONIC.
  const mat3 acesIn = mat3(
    0.59719, 0.07600, 0.02840,
    0.35458, 0.90834, 0.13383,
    0.04823, 0.01566, 0.83777);
  const mat3 acesOut = mat3(
     1.60475, -0.10208, -0.00327,
    -0.53108,  1.10813, -0.07276,
    -0.07367, -0.00605,  1.07602);
  vec3 v = acesIn * c;
  vec3 a = v*(v + 0.0245786) - 0.000090537;
  vec3 b = v*(0.983729*v + 0.4329510) + 0.238081;
  c = clamp(acesOut * (a/b), 0.0, 1.0);

  // Vignette. Centred on the composition rather than the frame, and shaped so
  // it never announces itself as a ring. Same curve the background ceiling uses.
  c *= p8_vig(uv);

  // Display encode. Everything after this is print-side grading.
  c = p8_srgb(c);

  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));

  // Shadow lift, near-neutral. Round 1 lifted into (0.0035,0.0075,0.0155) —
  // R at 23% of B — which put a blue gel over the entire background all by
  // itself, on top of an already blue background. The environment now carries
  // its own value, so this only needs to keep the blacks off dead paper.
  float shw = 1.0 - smoothstep(0.0, 0.40, l);
  c += vec3(0.0036, 0.0039, 0.0046)*shw;
  c  = mix(c, c*vec3(0.965, 0.995, 1.045), shw*0.70);

  // Highlights carried a touch warm so blown steel reads hot, not screen-white.
  float hiw = smoothstep(0.58, 1.0, l);
  c = mix(c, c*vec3(1.085, 1.010, 0.905), hiw*0.75);

  // Contrast pivoted low, where this image's mid mass actually lives.
  c = p8_contrast(c, 0.18, 0.34);

  // Saturation. Held back in the deep shadows so the dark air stays a neutral
  // slate, opened through the mids where the weapon lives, bleached at the top.
  // The subject owns the colour in this frame; the room does not.
  l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float sat = mix(0.90, 1.24, smoothstep(0.035, 0.30, l))
            * mix(1.00, 0.84, smoothstep(0.55, 0.96, l));
  c = mix(vec3(l), c, sat);

  // Grain weighted to the mids so it sits under the detail instead of
  // sparkling on the speculars — but never switched fully OFF, because the
  // darkest field is the one with the fewest quantisation levels and it is
  // exactly where dither is needed. Round 1 gated at l=0.03 while the
  // background sat at l=0.02, giving 13 distinct values over 450 rows.
  // (keyed to pixels, not to uv, so the grain size holds at any output res)
  float gw = (0.22 + 0.78*smoothstep(0.004, 0.16, l))*(1.0 - smoothstep(0.55, 0.98, l));
  float gn = hash13(vec3(uv*uRes.y + 17.0, 4.31)) - 0.5;
  c += gn*0.024*gw;

  return clamp(c, 0.0, 1.0);
}
