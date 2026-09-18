/**
 * O portão caído — o objetivo da fase.
 *
 * Existe porque sem ele o fim da fase é uma coordenada invisível: o
 * jogador chega num x arbitrário e a tela de vitória aparece do nada. Um
 * objetivo que não se vê de longe não é objetivo, é gatilho.
 *
 * Lore (`Lore/lore.md`): a civilização perdeu. Então não é um portão
 * inteiro com bandeira — são duas colunas de pedra rachadas e a viga que
 * caiu entre elas. O jogador atravessa o que sobrou.
 *
 * **Ele precisa ser visível ANTES de estar perto.** Por isso as colunas
 * são altas: elas furam a linha do horizonte e aparecem no quadro muito
 * antes do guerreiro chegar, dando direção sem precisar de seta.
 */
import * as THREE from "three";
import { hash2 } from "../engine/rng";

const STONE = 0x8a8f80;
const STONE_DARK = 0x4e5347;
const EMBER = 0xd98b3a;

export class GoalMarker {
  readonly object = new THREE.Group();
  private readonly ember: THREE.Mesh;
  private t = 0;

  constructor(x: number, groundY: number) {
    const mat = new THREE.MeshStandardMaterial({ color: STONE, roughness: 0.95 });
    const dark = new THREE.MeshStandardMaterial({ color: STONE_DARK, roughness: 0.98 });

    // Duas colunas, alturas DIFERENTES: simétrico lê como portal de jogo,
    // assimétrico lê como ruína.
    for (const [i, side] of [-1, 1].entries()) {
      // 4.2-5.4 de altura para 1.9 de largura. A primeira versão tinha
      // 1.1 de largura para até 7 de altura — razão de 6:1, que lê como
      // TRAVE, não como coluna de pedra em ruína. Verificado ampliado.
      const h = 4.2 + hash2(i, 7) * 1.2;
      const col = new THREE.Mesh(new THREE.BoxGeometry(1.9, h, 1.7), mat);
      col.position.set(side * 2.6, groundY + h / 2, 0);
      col.castShadow = true;
      col.receiveShadow = true;
      this.object.add(col);

      // Blocos soltos no pé: a coluna não brota do chão, ela desmoronou.
      for (let k = 0; k < 3; k++) {
        const s = 0.32 + hash2(i * 9 + k, 31) * 0.4;
        const b = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.7, s), dark);
        b.position.set(side * (1.5 + hash2(k, i) * 1.6), groundY + s * 0.35, (hash2(k, 3) - 0.5) * 1.4);
        b.rotation.y = hash2(k, 5) * 3;
        b.castShadow = true;
        this.object.add(b);
      }
    }

    // A viga que caiu, atravessada e torta.
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(6.2, 1.0, 1.5), mat);
    lintel.position.set(0, groundY + 3.9, 0);
    lintel.rotation.z = -0.17;
    lintel.castShadow = true;
    this.object.add(lintel);

    /**
     * Brasa no vão. É o único ponto quente e saturado do Mundo 1, e é
     * deliberado: num mundo inteiro de verde-acinzentado, um acento quente
     * pequeno funciona como âncora e o olho vai nele de longe. A mesma
     * conclusão que o jogo 2D levou rodadas pra chegar — e lá a lição
     * final foi que âncora se ganha por saliência, não por área.
     */
    this.ember = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 12, 10),
      new THREE.MeshBasicMaterial({ color: EMBER, transparent: true, opacity: 0.9 }),
    );
    this.ember.position.set(0, groundY + 1.1, 0.6);
    this.object.add(this.ember);

    this.object.position.x = x;
  }

  /** `frame`, não relógio: o harness precisa de captura reproduzível. */
  update(frame: number): void {
    this.t = frame;
    // Respiração lenta. Rápido demais lê como pisca-pisca de interface;
    // este é o resto de calor de um lugar morto, não um ícone.
    const b = 0.78 + Math.sin(frame / 34) * 0.16;
    this.ember.scale.setScalar(b);
    (this.ember.material as THREE.MeshBasicMaterial).opacity = 0.55 + b * 0.35;
  }
}
