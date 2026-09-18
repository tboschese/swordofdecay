// ============================================================================
// core_head.glsl  —  OWNED BY THE HARNESS. Piece agents must NOT edit this.
// Provides: uniforms, structs, noise/SDF libraries, forward declarations.
// ============================================================================
precision highp float;
precision highp int;

out vec4 fragColor;

uniform vec2  uRes;        // full output resolution (supersampled)
uniform vec4  uTile;       // xy = tile origin px, zw = tile size px
uniform float uTime;
uniform vec2  uJitter;     // sub-pixel offset for accumulation AA
uniform int   uIsolate;    // 0 = full sword; 1..4 = isolate material id
uniform int   uMode;       // 0 = beauty, 1 = matcap/clay (form only), 2 = silhouette

#define PI  3.14159265359
#define TAU 6.28318530718

// ---------------------------------------------------------------- structs --
struct Surf {
  vec3  albedo;
  float rough;
  float metal;
  vec3  nPerturb;   // world-space normal perturbation, added then renormalized
  vec3  emissive;
  float ao;
  float spec;       // dielectric F0 scale (0..1, default .5 -> F0 .04)

  // Anisotropic specular. A ground blade's highlight is narrow ACROSS the
  // blade and long ALONG it; a scalar roughness cannot express that, and
  // faking it with normal waviness reads as a faceted mirror up close.
  //   aniso   0 = isotropic, ->1 = strongly stretched along anisoDir
  //   anisoDir  world-space tangent the lobe stretches along (need not be
  //             exactly tangent to the surface; p7 orthogonalises it)
  float aniso;
  vec3  anisoDir;

  // How protected this patch of surface is, 0..1. Set by the PART modules
  // (p2/p4/p5/p6) on arrises, raised lands, and handled areas — the places
  // that get knocked clean or polished by use and so resist corrosion.
  // p3 reads it in applyRot and holds the rot back there. Without this, the
  // rot saturates the whole hilt and erases every part module's material.
  float wear;
};

Surf defaultSurf() {
  Surf s;
  s.albedo   = vec3(0.5);
  s.rough    = 0.4;
  s.metal    = 1.0;
  s.nPerturb = vec3(0.0);
  s.emissive = vec3(0.0);
  s.ao       = 1.0;
  s.spec     = 0.5;
  s.aniso    = 0.0;
  s.anisoDir = vec3(0.0, 1.0, 0.0);
  s.wear     = 0.0;
  return s;
}

// Overall proportions of the weapon, owned by p1_blade_form.
struct Dims {
  float bladeLen;    // guard plane (y=0) to tip
  float bladeHalfW;  // half width at the base of the blade
  float bladeHalfT;  // half thickness at the spine
  float gripLen;     // guard down to pommel top
  float guardHalfW;  // half span of the crossguard
};

// ------------------------------------------------------------------ noise --
float hash11(float p){ p = fract(p*0.1031); p *= p+33.33; p *= p+p; return fract(p); }

float hash13(vec3 p3){
  p3 = fract(p3*0.1031);
  p3 += dot(p3, p3.zyx+31.32);
  return fract((p3.x+p3.y)*p3.z);
}

vec3 hash33(vec3 p3){
  p3 = fract(p3*vec3(0.1031,0.1030,0.0973));
  p3 += dot(p3, p3.yxz+33.33);
  return fract((p3.xxy+p3.yxx)*p3.zyx);
}

float vnoise(vec3 x){
  vec3 i = floor(x), f = fract(x);
  f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash13(i+vec3(0,0,0)), hash13(i+vec3(1,0,0)), f.x),
                 mix(hash13(i+vec3(0,1,0)), hash13(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i+vec3(0,0,1)), hash13(i+vec3(1,0,1)), f.x),
                 mix(hash13(i+vec3(0,1,1)), hash13(i+vec3(1,1,1)), f.x), f.y), f.z);
}

float fbm(vec3 p, int oct){
  float a = 0.5, s = 0.0, n = 0.0;
  for (int i = 0; i < 8; i++){
    if (i >= oct) break;
    s += a; n += a*vnoise(p); p *= 2.02; a *= 0.5;
  }
  return n/max(s, 1e-4);
}

// Ridged fbm — good for corrosion crusts and fibrous growth.
float ridged(vec3 p, int oct){
  float a = 0.5, s = 0.0, n = 0.0;
  for (int i = 0; i < 8; i++){
    if (i >= oct) break;
    float v = 1.0 - abs(vnoise(p)*2.0 - 1.0);
    n += a*v*v; s += a; p *= 2.03; a *= 0.5;
  }
  return n/max(s, 1e-4);
}

// Cellular / worley. Returns .x = F1, .y = F2 (F2-F1 gives crack lines).
vec2 worley(vec3 p){
  vec3 i = floor(p), f = fract(p);
  float f1 = 8.0, f2 = 8.0;
  for (int z=-1; z<=1; z++)
  for (int y=-1; y<=1; y++)
  for (int x=-1; x<=1; x++){
    vec3 g = vec3(float(x),float(y),float(z));
    vec3 o = hash33(i+g);
    float d = length(g+o-f);
    if (d < f1){ f2 = f1; f1 = d; } else if (d < f2){ f2 = d; }
  }
  return vec2(f1, f2);
}

// -------------------------------------------------------------- sdf prims --
float sdBox(vec3 p, vec3 b){ vec3 q = abs(p)-b; return length(max(q,0.0))+min(max(q.x,max(q.y,q.z)),0.0); }
float sdRoundBox(vec3 p, vec3 b, float r){ return sdBox(p,b-r)-r; }
float sdSphere(vec3 p, float r){ return length(p)-r; }
float sdTorus(vec3 p, vec2 t){ vec2 q = vec2(length(p.xz)-t.x, p.y); return length(q)-t.y; }

float sdCapsule(vec3 p, vec3 a, vec3 b, float r){
  vec3 pa = p-a, ba = b-a;
  float h = clamp(dot(pa,ba)/dot(ba,ba), 0.0, 1.0);
  return length(pa-ba*h)-r;
}

float sdCappedCyl(vec3 p, float h, float r){
  vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
  return min(max(d.x,d.y),0.0) + length(max(d,0.0));
}

// Cone tapering from r1 (at y=a) to r2 (at y=b)
float sdRoundCone(vec3 p, float r1, float r2, float h){
  vec2 q = vec2(length(p.xz), p.y);
  float b = (r1-r2)/h, a = sqrt(1.0-b*b);
  float k = dot(q, vec2(-b,a));
  if (k < 0.0) return length(q) - r1;
  if (k > a*h) return length(q-vec2(0.0,h)) - r2;
  return dot(q, vec2(a,b)) - r1;
}

// 2D helpers (useful for lens/profile cross-sections)
float sdSegment2(vec2 p, vec2 a, vec2 b){
  vec2 pa = p-a, ba = b-a;
  float h = clamp(dot(pa,ba)/dot(ba,ba), 0.0, 1.0);
  return length(pa-ba*h);
}

float opSmoothUnion(float a, float b, float k){
  float h = clamp(0.5+0.5*(b-a)/k, 0.0, 1.0);
  return mix(b, a, h) - k*h*(1.0-h);
}
float opSmoothSub(float a, float b, float k){
  float h = clamp(0.5-0.5*(b+a)/k, 0.0, 1.0);
  return mix(b, -a, h) + k*h*(1.0-h);
}

mat2 rot2(float a){ float c = cos(a), s = sin(a); return mat2(c,-s,s,c); }

// ------------------------------------------------- piece module contracts --
// Each is defined in exactly one piece file. Forward-declared here so the
// modules can call each other freely regardless of concatenation order.

Dims dims();                                          // p1
float sdBlade(vec3 p);                                // p1
Surf  shadeBlade(vec3 p, vec3 n);                     // p2
float rotDisplace(vec3 p, int mid);                   // p3
Surf  applyRot(Surf s, vec3 p, vec3 n, int mid);      // p3
float sdGuard(vec3 p);                                // p4
Surf  shadeGuard(vec3 p, vec3 n);                     // p4
float sdGrip(vec3 p);                                 // p5
Surf  shadeGrip(vec3 p, vec3 n);                      // p5
float sdPommel(vec3 p);                               // p6
Surf  shadePommel(vec3 p, vec3 n);                    // p6
// The relic core, exposed separately so the rot can EXEMPT it. The gem shares
// the pommel's material id, so rotDisplace (which only sees position and id)
// otherwise chews the focal element's outline into scallops. Negative inside
// the stone, positive outside.
float gemSDF(vec3 p);                                 // p6
vec3  lightSurface(vec3 ro, vec3 rd, vec3 p, vec3 n, Surf s);  // p7
vec3  envRadiance(vec3 dir, float rough);             // p7
void  setupCamera(vec2 uv, out vec3 ro, out vec3 rd); // p8
vec3  backgroundCol(vec3 ro, vec3 rd);                // p8
vec3  applyAtmosphere(vec3 col, vec3 ro, vec3 rd, float dist, bool hit); // p8
vec3  postProcess(vec3 hdr, vec3 bloomC, vec2 uv);    // p8 (composite pass)

// Provided by core_tail, usable from piece modules:
float map(vec3 p);
float mapId(vec3 p, out int mid);
vec3  calcNormal(vec3 p);
float softShadow(vec3 ro, vec3 rd, float tmin, float tmax, float k);
float calcAO(vec3 p, vec3 n);
