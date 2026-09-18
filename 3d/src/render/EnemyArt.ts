/**
 * Arte do inimigo: aldeão corrompido.
 *
 * Duas exigências governam o desenho, e as duas são de LEITURA, não de
 * gosto:
 *
 * 1. **Silhueta distinta do guerreiro.** O guerreiro é ereto, com ombreira
 *    e espada nas costas. Este é curvado, mais baixo e mais largo — se os
 *    dois virassem manchas pretas, ainda dariam pra separar. É o critério
 *    §6 da rubrica do projeto.
 * 2. **O aviso de ataque tem que ser visível a distância.** `charge` vai de
 *    0 a 1 durante o telégrafo, e a arte responde com uma mudança de FORMA
 *    (o corpo recolhe e a cabeça baixa), não só de cor: cor sozinha some
 *    contra fundo errado, forma não.
 */
import * as THREE from "three";
import type { Enemy } from "../game/Enemy";

const SKIN = 0x6b6a52;
const CLOTH = 0x3d4436;
const ROT = 0x9dbe3f;

export class EnemyRig {
  readonly object = new THREE.Group();
  private readonly body: THREE.Mesh;
  private readonly head: THREE.Mesh;
  private readonly armL: THREE.Mesh;
  private readonly armR: THREE.Mesh;
  private readonly glow: THREE.Mesh;
  private step = 0;

  constructor() {
    const cloth = new THREE.MeshStandardMaterial({ color: CLOTH, roughness: 0.95 });
    const skin = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.8 });

    // Tronco largo e curto — a proporção que separa da silhueta do herói.
    this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.44, 4, 10), cloth);
    this.body.position.y = 0.68;
    this.body.castShadow = true;

    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), skin);
    this.head.position.set(0.06, 1.16, 0);
    this.head.castShadow = true;

    const arm = new THREE.CapsuleGeometry(0.085, 0.42, 4, 8);
    this.armL = new THREE.Mesh(arm, skin);
    this.armR = new THREE.Mesh(arm, skin);
    this.armL.position.set(0, 0.78, 0.2);
    this.armR.position.set(0, 0.78, -0.2);
    this.armL.castShadow = true;

    /**
     * Brasa do Rot no peito. Emissiva e SEM sombra: durante o aviso ela
     * cresce, e é a única fonte de cor quente-doente no personagem. Serve
     * de segunda leitura do telégrafo, redundante com a mudança de forma —
     * duas leituras do mesmo evento é o que faz o aviso sobreviver a fundo
     * ruim ou a jogador distraído.
     */
    this.glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 10, 8),
      new THREE.MeshBasicMaterial({ color: ROT, transparent: true, opacity: 0 }),
    );
    this.glow.position.set(0.1, 0.86, 0.26);

    this.object.add(this.body, this.head, this.armL, this.armR, this.glow);
  }

  update(e: Enemy, dtMs: number): void {
    this.object.visible = e.alive || e.deathT > 0;
    if (!this.object.visible) return;

    this.object.position.set(e.x, e.y, 0);
    this.object.scale.x = e.facing;

    if (!e.alive) {
      // Morte: o corpo AFUNDA e encolhe em vez de sumir com alpha. Some por
      // transparência lê como bug de render; afundar lê como colapso.
      const t = 1 - e.deathT;
      this.object.position.y = e.y - t * 0.5;
      this.object.scale.set(e.facing * (1 - t * 0.35), Math.max(0.05, 1 - t), 1 - t * 0.35);
      // A brasa APAGA na morte, não brilha: `deathT` decai de 1 a 0, então
      // elevar ao quadrado faz a luz sumir rápido no começo e não ficar
      // acesa acompanhando o corpo até o fim.
      //
      // Motivo, apontado por quem fez o módulo de impacto: durante a morte
      // este era o único disco saturado e aceso perto do golpe, e empurrava
      // o evento inteiro pro lado "mágico". A praga que consumia o aldeão
      // se apaga junto com ele — o que sobra é a matéria que o esporo leva.
      (this.glow.material as THREE.MeshBasicMaterial).opacity = e.deathT * e.deathT * 0.45;
      return;
    }

    this.object.scale.set(e.facing, 1, 1);

    // Passada: bob vertical simples. Personagem que desliza sem ciclo de
    // passo é dos tells mais rápidos de amadorismo.
    if (e.state === "patrol") {
      this.step += dtMs / 1000 * 7;
      this.object.position.y = e.y + Math.abs(Math.sin(this.step)) * 0.06;
      this.armL.rotation.z = Math.sin(this.step) * 0.5;
      this.armR.rotation.z = -Math.sin(this.step) * 0.5;
    }

    // Telégrafo por FORMA: recolhe o corpo, baixa a cabeça, ergue os braços.
    const c = e.charge;
    this.body.scale.set(1 + c * 0.16, 1 - c * 0.2, 1 + c * 0.16);
    this.body.position.y = 0.68 - c * 0.12;
    this.head.position.y = 1.16 - c * 0.2;
    this.head.position.x = 0.06 + c * 0.16;
    this.armL.rotation.z = -c * 1.5;
    this.armR.rotation.z = -c * 1.5;
    (this.glow.material as THREE.MeshBasicMaterial).opacity = c * 0.9;
    this.glow.scale.setScalar(1 + c * 1.1);
  }
}
