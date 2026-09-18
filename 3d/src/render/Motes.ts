/**
 * Partículas de ar: poeira e esporo à deriva.
 *
 * Mundo parado lê como DIORAMA, não como lugar — e este era o defeito mais
 * barato de resolver que ainda restava. Nenhuma geometria a mais no palco
 * conserta isso; o que conserta é alguma coisa se movendo devagar em
 * profundidades diferentes.
 *
 * Três camadas em Z distintos, e é a diferença de PARALAXE entre elas que
 * dá volume de ar: partícula longe cruza o quadro devagar, partícula perto
 * atravessa rápido. Com uma camada só o efeito lê como chuvisco na lente.
 *
 * Determinístico por construção: a posição é função do índice e do número
 * do quadro, nunca de `Math.random()` nem de relógio.
 */
import * as THREE from "three";
import { hash2 } from "../engine/rng";

const LAYERS = [
  { n: 90, z: -8, size: 0.075, speed: 0.35, alpha: 0.3, span: 46 },
  { n: 70, z: 1.5, size: 0.11, speed: 0.7, alpha: 0.4, span: 40 },
  { n: 34, z: 6.5, size: 0.19, speed: 1.5, alpha: 0.3, span: 34 },
];

export class Motes {
  readonly object = new THREE.Group();
  private readonly pts: Array<{ geo: THREE.BufferGeometry; base: Float32Array; cfg: (typeof LAYERS)[number] }> = [];

  constructor() {
    for (const cfg of LAYERS) {
      const pos = new Float32Array(cfg.n * 3);
      for (let i = 0; i < cfg.n; i++) {
        pos[i * 3] = (hash2(i, cfg.z * 13) - 0.5) * cfg.span;
        pos[i * 3 + 1] = (hash2(i, cfg.z * 7 + 1) - 0.5) * 22;
        pos[i * 3 + 2] = cfg.z + (hash2(i, 5) - 0.5) * 2;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        color: 0xd7e0c4,
        size: cfg.size,
        transparent: true,
        opacity: cfg.alpha,
        depthWrite: false,
        // Sem névoa: a poeira PERTO da lente não pode ser apagada pela
        // névoa de distância, senão a camada da frente some justo onde
        // ela mais dá sensação de ar.
        fog: cfg.z < 0,
      });
      const p = new THREE.Points(geo, mat);
      this.object.add(p);
      this.pts.push({ geo, base: pos.slice(), cfg });
    }
  }

  /**
   * `camX`/`camY` para as partículas seguirem a câmera: uma nuvem fixa no
   * mundo sai do quadro em dois segundos e o efeito some. O que se quer é
   * ar em todo lugar, então a nuvem viaja junto e o movimento vem da
   * deriva interna, não do deslocamento dela.
   */
  update(frame: number, camX: number, camY: number): void {
    this.object.position.set(camX, camY, 0);
    for (const { geo, base, cfg } of this.pts) {
      const arr = geo.getAttribute("position") as THREE.BufferAttribute;
      const a = arr.array as Float32Array;
      const t = frame / 60;
      for (let i = 0; i < cfg.n; i++) {
        const drift = hash2(i, 3) * 0.6 + 0.7;
        // Deriva lateral constante + balanço vertical fora de fase: só a
        // deriva lê como neve caindo de lado; o balanço é o que faz ler
        // como partícula suspensa no ar.
        let x = base[i * 3]! - t * cfg.speed * drift;
        x = ((x + cfg.span / 2) % cfg.span + cfg.span) % cfg.span - cfg.span / 2;
        a[i * 3] = x;
        a[i * 3 + 1] = base[i * 3 + 1]! + Math.sin(t * 0.5 * drift + i) * 0.55;
      }
      arr.needsUpdate = true;
    }
  }
}
