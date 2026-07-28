# Sword of Decay — Hero Render. Shared brief.

Read this fully before touching anything. You are one of many agents working
on the same weapon, each owning exactly one module.

## The goal

One image: a legendary dark-fantasy sword, corroded by a plague called The Rot,
presented as a **hero shot** — the kind of render a studio puts on a store page
or a loot-reveal screen.

## The bar

A shipped legendary-weapon hero shot from Path of Exile or Diablo IV.
We win only if a viewer comparing side by side cannot tell ours from the
shipped asset, or prefers ours.

**Honest constraint:** we cannot display the actual shipped assets here — no
image access to proprietary art. So the bar is enforced by the concrete rubric
below plus the measurement tools, not by literally diffing pixels against a real
screenshot. Do not pretend you compared against a real image. Judge against the
rubric, and be harsh.

### What those references actually do (the rubric)

1. **Silhouette reads at 64px.** Blacked out and shrunk to thumbnail height, the
   weapon is still instantly identifiable and interesting. Negative space (under
   the guard, between guard arms) is deliberate, not accidental.
2. **Value structure, not uniform darkness.** There is a full range: true blacks,
   a mid mass, and small hot speculars. The subject separates from the
   background by value AND by temperature. A dark image is not the same as a
   moody image.
3. **Material hierarchy.** Steel, corroded oxide, leather, and any gem must be
   distinguishable *with the color removed* — by roughness and specular
   behaviour alone. Metal shows a tight, bright, long-tailed highlight; oxide
   shows broad, dull, scattered response; leather sits between with a soft
   sheen.
4. **Damage is grown, not painted.** Corrosion follows crevices, gravity, and
   contact points. It eats into the silhouette (pitting visible on the edge
   profile), and there is a believable transition zone between clean and
   consumed — not a uniform noise overlay.
5. **Specular breakup at the right frequency.** Real forged metal shows
   directional grinding marks and low-frequency surface waviness that make the
   highlight *wobble* along the blade. A perfectly clean highlight reads CG;
   uniform high-frequency noise reads like sandpaper. It's the middle
   frequencies that sell it.
6. **Edge definition.** Blade edges catch a thin, near-blown rim. That rim
   varies in intensity along its length — it is never a constant-width stroke.
7. **A single focal point.** One place the eye lands first (typically a relic
   core, or the brightest edge segment). Everything else supports it.
8. **The grade reads as marketing art, not a viewport.** Deliberate vignette,
   subtle chromatic richness in the shadows, filmic highlight rolloff, and
   grain that sits under the detail rather than over it.

## Standing policy (learned the hard way — do not relitigate)

**1. Author in VALUE first, chroma second.** Round 1 failed on exactly this, in
three modules independently: the background carried its entire structure in blue
chroma (saturation 0.88 against the subject's 0.35 — desaturate the render and it
becomes a black void with a sword cut out of it), and the corrosion carried its
entire structure in orange chroma (saturation 0.70 against a luminance range of
only 0.13). Both read loud and both read cheap. Real dark-fantasy art is
*desaturated* and gets its impact from an enormous value range. If your feature
disappears when you convert the render to greyscale, you built it wrong. Test
that way.

**2. Division of responsibility for exposure and tonemapping.**
- p7 owns **scene-referred radiance**. It decides how much light there is.
- p8 owns **one exposure normalisation before ACES**, then a monotonic tonemap,
  and *nothing keyed to display-referred values after it*.
- p8 must never add a band compressor, shoulder dip, or local gain to bend a
  too-bright subject back down — that is a patch for a lighting problem, it
  rings around speculars, and it inverts (a dimmer rig gets crushed harder).
  If the subject is too bright, p7 turns the lights down.

**3. Passing the metrics is not passing.** `measure.mjs` is a floor, not a
target, and it has been gamed twice: a broad plateau at 0.6-0.8 satisfied the
"high" bucket while the render contained literally zero speculars, and a deep
blue background satisfied the corner-luminance check while reading as bright.
Check `specular pop` for real highlights, and trust the image over the numbers.

**4. `Surf` now carries anisotropy** — `s.aniso` (0 = isotropic, →1 = strongly
stretched) and `s.anisoDir` (world-space tangent the lobe stretches along).
A ground blade's highlight is narrow across the blade and long along it, which
a scalar roughness cannot express; faking it with normal waviness reads as a
faceted mirror close up. **p7 must consume these in its GGX** (anisotropic D and
V terms), and material modules should set them where the surface has a grain
direction. Until p7 consumes them they are simply ignored.

**5. `spec breakup` in measure.mjs does NOT measure blade material.** It takes
the brightest pixel per slice, and that pixel lands on a corroded rim, so the
number is driven by the blade *form* and the *rot*, not by the steel. This was
proven with a control: zeroing all of the blade material's normal and roughness
variation left the metric essentially unchanged. Do not tune the material
against it. Judge material by eye, on a greyscale crop, with `--isolate 1`.

**6. `Surf` carries `wear` (0..1), and the rot must respect it.** The rot field
saturates to 1.0 across the entire hilt by design, and `applyRot` overwrites
albedo and roughness — so the guard, grip and pommel modules were contributing
*nothing* to the camera-facing surfaces. This was proven: adding a whole wear
mask to the guard produced a pixel-identical render. Part modules now set
`s.wear` high on arrises, raised lands and handled areas; **p3 must hold the
corrosion back where `s.wear` is high**, leaving exposed metal on the proud
edges. That contrast — oxide in the recesses, bare knocked-clean metal on the
edges — is most of what makes corroded metal read as metal rather than as mud.

**7. Sculpted relief must be at least ~0.03 deep to survive.** The rot's crater
displacement is ~0.013 plus fine grain, so any chamfer, step or engraving
shallower than that is simply erased at final size. Several of the guard's roof
steps were cut at 0.012-0.015 and do not read at all. Size relief accordingly,
in every part module.

**8. The relic core must not corrode.** `gemSDF(vec3 p)` is now part of the
contract (defined in p6, negative inside the stone). **p3's `rotDisplace` must
exempt it** — the gem shares the pommel's material id, so the rot was chewing
the focal element of the entire image into scallops, and p6 was masking that by
fading the emission out over the girdle rather than fixing it. Cut stone does
not pit like iron. The metal *setting* around it should still be consumed; that
contrast is the point.

**9. p8 can trace shadow rays.** `softShadow()` is declared in `core_head.glsl`
and defined in `core_scene.glsl`, so `backgroundCol` may call it — a floor drawn
in the miss path can still take a real contact shadow from the weapon by tracing
toward the key light. Ground contact is not architecturally blocked.

## The tech

WebGL2 fragment shader. The whole weapon is a raymarched SDF, shaded with GGX
PBR, rendered to HDR, bloomed, tonemapped. Runs headless via SwiftShader — CPU
rendering, so keep an eye on cost.

### Layout

```
hero/src/core_head.glsl    uniforms, structs, noise + SDF library, forward decls
hero/src/core_scene.glsl   scene assembly, raymarcher, shadows, AO
hero/src/core_main.glsl    scene-pass main()
hero/src/core_composite.glsl  supersample resolve + handoff to the grade
hero/src/p1..p8_*.glsl     THE EIGHT PIECES — one owner each
hero/build.mjs             concatenates modules into build/<bundle>.js
hero/render.mjs            drives chrome-headless-shell, writes a PNG
```

**The core_*.glsl files are owned by the harness. Do not edit them.**
**Edit only the one p*_*.glsl file you were assigned.** Another agent is
editing every other file at the same time.

### Rendering

```bash
node hero/render.mjs --out out/mine.png --w 360 --h 450 --ss 1 --tile 150
```

Flags:
- `--w --h` output size. `--ss` supersample factor (1 for iteration, 2 for final).
- `--mode 0` beauty · `--mode 1` clay (neutral material — judge FORM only)
  · `--mode 2` silhouette (white on black — judge SHAPE only)
- `--isolate 0` whole sword · `1` blade · `2` guard · `3` grip · `4` pommel
- `--src <dir> --bundle <name>` render from a private copy of the shader tree.

**If you are working in parallel with other agents, always use your own copy:**

```bash
cp -r hero/src /tmp/hero_pN && \
  node hero/render.mjs --src /tmp/hero_pN --bundle pN --out out/pN.png \
       --w 360 --h 450 --ss 1 --tile 150
```
Edit `/tmp/hero_pN/pN_*.glsl`, and when you are done copy your one file back to
`hero/src/`.

Cost: roughly 50k pixels/second. 360×450 ss1 ≈ 2s. 720×900 ss2 ≈ 60s.
Iterate small, verify once at size.

### Reading the result

`node hero/measure.mjs <png>` prints objective stats: silhouette bounding box
and fill, blade/hilt proportion, luminance histogram, percent of pixels in
shadow/midtone/highlight, and specular-breakup frequency along the blade.
Use it. "Looks good" is not evidence.

**Always actually look at the PNG with the Read tool.** You are judging an
image; you cannot judge it from source code.

## Shader contracts

Each piece defines exactly these functions. Do not change the signatures —
other modules call them.

| file | defines |
|---|---|
| `p1_blade_form` | `Dims dims();` `float sdBlade(vec3 p);` |
| `p2_blade_material` | `Surf shadeBlade(vec3 p, vec3 n);` |
| `p3_rot` | `float rotDisplace(vec3 p, int mid);` `Surf applyRot(Surf s, vec3 p, vec3 n, int mid);` |
| `p4_guard` | `float sdGuard(vec3 p);` `Surf shadeGuard(vec3 p, vec3 n);` |
| `p5_grip` | `float sdGrip(vec3 p);` `Surf shadeGrip(vec3 p, vec3 n);` |
| `p6_pommel` | `float sdPommel(vec3 p);` `Surf shadePommel(vec3 p, vec3 n);` |
| `p7_lighting` | `vec3 lightSurface(...);` `vec3 envRadiance(vec3 dir, float rough);` |
| `p8_presentation` | `setupCamera`, `backgroundCol`, `applyAtmosphere`, `postProcess` |

You may add any number of helper functions inside your own file. Prefix them so
they can't collide with another module's helpers (`p3_`, `p7_`, …).

`Surf` fields: `albedo, rough, metal, nPerturb (world-space normal offset),
emissive, ao, spec`. `Dims` gives the weapon's proportions; call `dims()`
rather than hardcoding sizes.

Available in `core_head.glsl`: `hash11/hash13/hash33`, `vnoise`, `fbm`,
`ridged`, `worley` (returns F1,F2), `sdBox/sdRoundBox/sdSphere/sdTorus/
sdCapsule/sdCappedCyl/sdRoundCone`, `opSmoothUnion`, `opSmoothSub`, `rot2`.
From `core_scene.glsl`: `map`, `mapId`, `calcNormal`, `softShadow`, `calcAO`.

World space: Y up, sword vertical, blade points +Y, guard at y≈0, tip at
y≈`dims().bladeLen`, pommel below y≈-0.5. Blade faces the ±Z directions.

### GLSL ES 3.0 gotchas that will cost you a round

- `patch`, `sample`, `filter`, `input`, `output`, `active` are **reserved words**.
- Loops must have a constant bound; use `for(int i=0;i<8;i++){ if(i>=n) break; }`.
- No implicit int→float. `1.0/2.0`, never `1/2`.
- A compile error in your file blocks every other agent. Verify before you
  hand back. The build reports errors as `module:line`, so if the error names a
  module that is not yours, another agent is mid-edit — wait a few seconds and
  re-render.

## Performance budget

The raymarcher already costs 220 steps plus soft shadows and AO. If you add
expensive work inside `map()` (which `rotDisplace` is called from), it
multiplies across every march step, every shadow ray, and every AO tap.
Keep `rotDisplace` cheap; put expensive detail in the shading functions, which
run once per pixel. If a render that took 2s starts taking 40s, that is why.
