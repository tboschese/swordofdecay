// ============================================================================
// core_tail.glsl  —  OWNED BY THE HARNESS. Piece agents must NOT edit this.
// Scene assembly, raymarcher, and main(). Writes linear HDR to fragColor.
// ============================================================================

const int MAT_BLADE  = 1;
const int MAT_GUARD  = 2;
const int MAT_GRIP   = 3;
const int MAT_POMMEL = 4;

bool isolated(int mid){ return uIsolate == 0 || uIsolate == mid; }

float mapId(vec3 p, out int mid){
  float d = 1e9;
  mid = MAT_BLADE;

  if (isolated(MAT_BLADE))  { float t = sdBlade(p);  if (t < d){ d = t; mid = MAT_BLADE;  } }
  if (isolated(MAT_GUARD))  { float t = sdGuard(p);  if (t < d){ d = t; mid = MAT_GUARD;  } }
  if (isolated(MAT_GRIP))   { float t = sdGrip(p);   if (t < d){ d = t; mid = MAT_GRIP;   } }
  if (isolated(MAT_POMMEL)) { float t = sdPommel(p); if (t < d){ d = t; mid = MAT_POMMEL; } }

  // Corrosion eats into the form, so pitting reads in the silhouette — which
  // means the silhouette pass must include it too, or mode 2 lies about the
  // very thing the rubric asks us to check there.
  d += rotDisplace(p, mid);
  return d;
}

float map(vec3 p){ int mid; return mapId(p, mid); }

vec3 calcNormal(vec3 p){
  // Tetrahedral differencing — 4 taps instead of 6.
  const vec2 k = vec2(1.0, -1.0);
  const float h = 0.00035;
  return normalize(k.xyy*map(p + k.xyy*h) +
                   k.yyx*map(p + k.yyx*h) +
                   k.yxy*map(p + k.yxy*h) +
                   k.xxx*map(p + k.xxx*h));
}

float softShadow(vec3 ro, vec3 rd, float tmin, float tmax, float k){
  float res = 1.0, t = tmin, ph = 1e9;
  for (int i = 0; i < 48; i++){
    float h = map(ro + rd*t);
    float y = h*h/(2.0*ph);
    float d = sqrt(max(h*h - y*y, 0.0));
    res = min(res, k*d/max(t-y, 1e-4));
    ph = h;
    t += clamp(h, 0.004, 0.12);
    if (res < 0.004 || t > tmax) break;
  }
  return clamp(res, 0.0, 1.0);
}

float calcAO(vec3 p, vec3 n){
  float occ = 0.0, sca = 1.0;
  for (int i = 0; i < 5; i++){
    float h = 0.008 + 0.055*float(i);
    float d = map(p + n*h);
    occ += (h - d)*sca;
    sca *= 0.72;
  }
  return clamp(1.0 - 2.4*occ, 0.0, 1.0);
}

// Sphere-tracing march. Step relaxation keeps the corroded (non-Lipschitz)
// displacement from over-stepping through thin blade edges.
float march(vec3 ro, vec3 rd, out int mid){
  float t = 0.05;
  mid = 0;
  for (int i = 0; i < 220; i++){
    vec3 p = ro + rd*t;
    int m;
    float d = mapId(p, m);
    if (d < 0.0006*t){ mid = m; return t; }
    t += d*0.72;
    if (t > 24.0) break;
  }
  return -1.0;
}

Surf surfaceAt(int mid, vec3 p, vec3 n){
  Surf s;
  if      (mid == MAT_BLADE)  s = shadeBlade(p, n);
  else if (mid == MAT_GUARD)  s = shadeGuard(p, n);
  else if (mid == MAT_GRIP)   s = shadeGrip(p, n);
  else                        s = shadePommel(p, n);
  return applyRot(s, p, n, mid);
}
