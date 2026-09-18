/**
 * Rastro da lâmina — UMA definição, usada pelo jogo e pela bancada.
 *
 * Existe como módulo próprio por um motivo prático que custou uma captura
 * enganosa: o arco vivia duplicado em `main.ts` e em `harness/impact_entry.ts`,
 * e quando os valores do jogo mudaram a bancada continuou fotografando os
 * antigos. Bancada que duplica o que mede acaba medindo outra coisa —
 * e o projeto já perdeu rodadas com instrumento mentindo.
 *
 * **Ele é ACENTO, não evento.** Medido pelo dono do módulo de impacto: na
 * versão anterior este arco tinha cerca de 8x a área de todo o jorro de
 * matéria nos quadros congelados do hitstop, em quase-branco a 0.85 de
 * opacidade — o clarão de aço era o assunto e a matéria virava enfeite,
 * exatamente o inverso do que a lore pede. A versão 2D já tinha cometido
 * e corrigido esse mesmo erro.
 *
 * O que ele continua sendo: informação de ALCANCE. Aparece só nos quadros
 * em que a lâmina machuca, porque rastro que dura mais que a caixa de dano
 * ensina o alcance errado.
 */
import * as THREE from "three";

/** Cinza de aço, não quase-branco: branco é vocabulário de magia. */
const COLOR = 0xa8b0a4;
const OPACITY = 0.42;
/** Janela do golpe em que a lâmina machuca, em fração de `swingT`. */
export const ARC_FROM = 0.2;
export const ARC_TO = 0.58;

export function createBladeArc(): THREE.Mesh {
  return new THREE.Mesh(
    // Anel FINO (0.30u) e arco curto. O anel grosso de antes é o que dava
    // a área que engolia o jorro.
    new THREE.RingGeometry(1.22, 1.52, 14, 1, -0.34, 1.32),
    new THREE.MeshBasicMaterial({
      color: COLOR,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
}

/**
 * Posiciona e apaga o arco a partir de `swingT` (0..1 ao longo do golpe).
 * Devolve `true` enquanto ele está visível.
 */
export function updateBladeArc(arc: THREE.Mesh, t: number, x: number, y: number, facing: 1 | -1): boolean {
  const active = t > ARC_FROM && t < ARC_TO;
  arc.visible = active;
  if (!active) return false;
  arc.position.set(x + facing * 0.35, y + 0.85, 0.35);
  arc.scale.set(facing, 1, 1);
  // Gira ao longo do golpe: de cima pra frente, como um corte descendo.
  arc.rotation.z = 1.1 - (t - ARC_FROM) * 3.4;
  // Morre ANTES da matéria: o rastro não pode ser a última coisa que o
  // olho vê num evento que é sobre o que saiu do inimigo.
  (arc.material as THREE.MeshBasicMaterial).opacity = OPACITY * (1 - (t - ARC_FROM) / 0.30);
  return true;
}
