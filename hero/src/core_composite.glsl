// ============================================================================
// core_composite.glsl — OWNED BY THE HARNESS.
// Box-resolves the supersampled HDR buffer, then hands off to p8's grade.
// ============================================================================
uniform sampler2D uHDR;
uniform sampler2D uBloomTex;
uniform float     uInvSamples;
uniform int       uSS;

void main(){
  // Resolve SS x SS HDR texels down to one output pixel (resolve in linear HDR,
  // tonemap afterwards — the order that keeps highlight edges from crawling).
  float ss = float(max(uSS, 1));
  vec2 baseTexel = (gl_FragCoord.xy - 0.5) * ss;
  vec2 hdrSize   = uRes * ss;

  vec3 hdr = vec3(0.0);
  for (int y = 0; y < 8; y++){
    if (y >= uSS) break;
    for (int x = 0; x < 8; x++){
      if (x >= uSS) break;
      vec2 t = (baseTexel + vec2(float(x), float(y)) + 0.5) / hdrSize;
      hdr += texture(uHDR, t).rgb;
    }
  }
  hdr *= uInvSamples / (ss*ss);

  vec3 bloomC = texture(uBloomTex, gl_FragCoord.xy / uRes).rgb;
  vec2 uv = (gl_FragCoord.xy - 0.5*uRes) / uRes.y;

  fragColor = vec4(postProcess(hdr, bloomC, uv), 1.0);
}
