import { TILE_SIZE } from "../config/tileset";

/**
 * Sombra de contato do jogador. Parte do m3 (guerreiro).
 *
 * Da review do baseline: "o guerreiro não está apoiado no mundo — não há
 * sombra de contato nem oclusão sob os pés, então ele flutua sobre a
 * linha do chão". Esse é o maior ganho por esforço do jogo inteiro: uma
 * elipse escura de poucos pixels resolve a maior parte do "flutuando".
 *
 * As duas regras que fazem a sombra funcionar, e que quase todo mundo
 * erra na primeira tentativa:
 *
 * **A sombra é projetada no CHÃO, não colada no personagem.** Ela fica
 * onde o chão está, não onde os pés estão. Colada nos pés ela sobe junto
 * no pulo e o efeito se inverte — o personagem passa a parecer preso a
 * um adesivo.
 *
 * **Ela tem que ser mais LARGA que a pegada do personagem.** A primeira
 * versão usava raio 7.5px, menor que as botas — o próprio guerreiro
 * cobria a sombra inteira e o efeito não existia. Se você não enxerga a
 * sombra, quase sempre é isto.
 *
 * **Ela encolhe e desbota com a altura, não some.** Quanto mais alto o
 * salto, menor e mais fraca — é assim que o olho lê altura. Uma sombra de
 * opacidade constante não informa nada.
 */

const MAX_DROP_PX = TILE_SIZE * 5;
const BASE_RX = 12;
const BASE_RY = 3.2;
const BASE_ALPHA = 0.62;

export class ContactShadow {
  /**
   * @param feetX     posição dos pés em tela
   * @param feetY     posição dos pés em tela
   * @param groundY   topo do chão sólido abaixo do jogador, em tela
   */
  render(ctx: CanvasRenderingContext2D, feetX: number, feetY: number, groundY: number): void {
    const drop = Math.max(0, groundY - feetY);
    if (drop > MAX_DROP_PX) return;

    // Altura normalizada: 0 = no chão, 1 = no topo do alcance.
    const t = drop / MAX_DROP_PX;
    const shrink = 1 - t * 0.55;
    const alpha = BASE_ALPHA * (1 - t) * (1 - t);
    if (alpha < 0.02) return;

    ctx.save();
    // Duas elipses: o núcleo mais opaco dá o ponto de contato, o halo
    // mais aberto dá a penumbra. Uma elipse só lê como decalque.
    ctx.fillStyle = `rgba(8,10,8,${alpha * 0.45})`;
    ctx.beginPath();
    ctx.ellipse(feetX, groundY + 1, BASE_RX * shrink * 1.5, BASE_RY * shrink * 1.4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(6,8,6,${alpha})`;
    ctx.beginPath();
    ctx.ellipse(feetX, groundY + 1, BASE_RX * shrink, BASE_RY * shrink, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
