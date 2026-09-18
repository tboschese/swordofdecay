/**
 * Cena-sonda para a Fase 0: a pergunta é se captura determinística existe
 * em WebGL headless, e a resposta só vale se a cena for REPRESENTATIVA.
 *
 * Um quad chapado pode sair byte-idêntico e um jogo de verdade não —
 * o não-determinismo em GPU mora justamente nos caminhos que um teste
 * mínimo não exercita. Então esta cena tem, de propósito:
 *
 *  - sombra projetada (shadow map: depende de bias, PCF e ordem de draw)
 *  - névoa exponencial (aritmética de float no fragment shader)
 *  - material com iluminação (normais interpoladas, specular)
 *  - geometria instanciada por PRNG semeado (ordem de buffer)
 *  - transparência (blending, que é sensível a ordem de sorting)
 *
 * Se ISTO for byte-idêntico entre execuções, o método do projeto 2D
 * sobrevive em 3D. Se não for, a base de comparação precisa ser redesenhada
 * antes de qualquer arte — ver PUSH_PROMPT.md, Fase 0.
 */
import * as THREE from "three";

/** mulberry32 — mesmo PRNG do jogo 2D (`src/engine/rng.ts`). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Probe {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Avança o mundo em passo FIXO. Nada de delta de relógio. */
  step(frame: number): void;
}

export function buildProbe(seed: number, width: number, height: number): Probe {
  const rng = makeRng(seed);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b2018);
  // Névoa: o equivalente 3D da perspectiva atmosférica que o jogo 2D usa
  // pra separar planos por valor (DESIGN.md §2.2).
  scene.fog = new THREE.Fog(0x1b2018, 18, 60);

  const camera = new THREE.PerspectiveCamera(52, width / height, 0.1, 200);
  camera.position.set(0, 7, 14);
  camera.lookAt(0, 1.5, 0);

  // Luz direcional COM sombra — o caminho mais suspeito de não-determinismo.
  const sun = new THREE.DirectionalLight(0xd8e0c8, 2.1);
  sun.position.set(-8, 14, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -22;
  sun.shadow.camera.right = 22;
  sun.shadow.camera.top = 22;
  sun.shadow.camera.bottom = -22;
  sun.shadow.bias = -0.0012;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x8899aa, 0x2a2f22, 0.7));

  // Chão.
  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(60, 1, 60),
    new THREE.MeshStandardMaterial({ color: 0x3d4436, roughness: 0.95 }),
  );
  ground.position.y = -0.5;
  ground.receiveShadow = true;
  scene.add(ground);

  // Plataformas espalhadas por PRNG: exercita ordem de buffer e sombra
  // projetada de várias fontes.
  const platGeo = new THREE.BoxGeometry(3, 0.6, 3);
  const platMat = new THREE.MeshStandardMaterial({ color: 0x6b7355, roughness: 0.8 });
  for (let i = 0; i < 24; i++) {
    const m = new THREE.Mesh(platGeo, platMat);
    m.position.set((rng() - 0.5) * 34, 0.8 + rng() * 5, (rng() - 0.5) * 30);
    m.rotation.y = rng() * Math.PI;
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  }

  // "Guerreiro": cápsula que se move em passo fixo, com sombra projetada —
  // o instrumento de leitura de profundidade que o jogo 2D já provou ser
  // central (`src/render/ContactShadow.ts`).
  const hero = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.5, 1.1, 6, 12),
    new THREE.MeshStandardMaterial({ color: 0xb8b0a0, roughness: 0.55, metalness: 0.35 }),
  );
  hero.castShadow = true;
  scene.add(hero);

  // Partículas translúcidas: blending é sensível a ordem de sorting.
  const dustGeo = new THREE.BufferGeometry();
  const count = 300;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rng() - 0.5) * 40;
    pos[i * 3 + 1] = rng() * 12;
    pos[i * 3 + 2] = (rng() - 0.5) * 34;
  }
  dustGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({ color: 0xc9d2bb, size: 0.09, transparent: true, opacity: 0.55, depthWrite: false }),
  );
  scene.add(dust);

  return {
    scene,
    camera,
    step(frame: number): void {
      // Passo FIXO derivado do número do quadro, nunca de relógio: função
      // pura do frame é o que torna a captura reproduzível.
      const t = frame / 60;
      hero.position.set(Math.sin(t * 1.4) * 6, 1.6 + Math.abs(Math.sin(t * 2.2)) * 2.4, Math.cos(t * 0.9) * 3);
      hero.rotation.y = t * 1.1;
      dust.rotation.y = t * 0.05;
      camera.position.set(Math.sin(t * 0.25) * 3, 7, 14);
      camera.lookAt(0, 1.5, 0);
    },
  };
}
