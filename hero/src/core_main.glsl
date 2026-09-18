// ============================================================================
// core_main.glsl - OWNED BY THE HARNESS. Scene-pass entry point.
// ============================================================================
void main(){
  // Tiled rendering works via glViewport; gl_FragCoord is already absolute in
  // the framebuffer, so it must NOT be offset by the tile origin again.
  vec2 pix = gl_FragCoord.xy + uJitter;
  vec2 uv  = (pix - 0.5*uRes) / uRes.y;   // y in [-.5,.5], x aspect-corrected

  vec3 ro, rd;
  setupCamera(uv, ro, rd);

  int mid;
  float t = march(ro, rd, mid);

  vec3 col;
  bool hit = t > 0.0;

  if (uMode == 2){
    // Pure silhouette pass — white form on black, for shape readability tests.
    col = hit ? vec3(1.0) : vec3(0.0);
    fragColor = vec4(col, 1.0);
    return;
  }

  if (hit){
    vec3 p = ro + rd*t;
    vec3 n = calcNormal(p);

    if (uMode == 1){
      // Clay pass: neutral material, judge form/silhouette without materials.
      Surf s   = defaultSurf();
      s.albedo = vec3(0.42);
      s.rough  = 0.55;
      s.metal  = 0.0;
      s.ao     = calcAO(p, n);
      col = lightSurface(ro, rd, p, n, s);
    } else {
      Surf s = surfaceAt(mid, p, n);
      if (length(s.nPerturb) > 1e-5) n = normalize(n + s.nPerturb);
      col = lightSurface(ro, rd, p, n, s);
    }
  } else {
    col = backgroundCol(ro, rd);
  }

  col = applyAtmosphere(col, ro, rd, hit ? t : 24.0, hit);
  fragColor = vec4(max(col, 0.0), 1.0);
}
