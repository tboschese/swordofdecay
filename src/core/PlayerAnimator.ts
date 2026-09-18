import { KnightRenderer } from "../render/KnightRenderer";

export type ActionAnim = "thrust" | "slash" | "shot" | "cshot" | "hurt";

/**
 * Tempo contínuo em movimento a partir do qual a passada vira CORRIDA.
 * O chamador só informa um booleano `moving`, então tempo em movimento é o
 * proxy de velocidade que dá pra medir daqui.
 *
 * 0.14s, não 0.28s: o valor antigo foi calibrado em `accel=420 /
 * maxSpeed=115`, e o retune de 2026-08-14 (ver `config/archetypes.ts`)
 * levou a aceleração a 1100, com a velocidade saturando em ~0.14s. Manter
 * 0.28 deixaria o guerreiro em `walk` por um quarto de segundo JÁ na
 * velocidade máxima — passada lenta com o corpo voando, que é o tipo de
 * dessincronia que lê como animação errada.
 *
 * Este acoplamento estava registrado no TASKS como dívida ("trocar agora
 * seria churn"); o retune de física é exatamente o momento em que ele
 * deixa de ser churn e vira correção obrigatória.
 */
const RUN_AFTER_SEC = 0.14;
/** Queda curta demais não merece quadro de pouso (degrau, quina de tile). */
const LAND_MIN_AIR_SEC = 0.12;
/**
 * Recorte do ciclo `jump`, que é LINHA DO TEMPO e não ciclo.
 * Entra depois da antecipação (quando o animator descobre que houve pulo o
 * impulso já saiu — agachar no ar seria mentira) e para na descida; o fim
 * do arco é o estado `land`.
 */
const JUMP_IN = 0.13;
const JUMP_OUT = 0.72;

/**
 * Escolhe qual animação do KnightRenderer tocar a cada frame: locomoção
 * (idle/walk/run/jump) contínua, sobreposta por uma ação de tiro único
 * (ataque/dano/pouso) até ela terminar — igual a qualquer state machine
 * simples de animação de jogo (a ação sempre vence a locomoção enquanto
 * ativa).
 */
export class PlayerAnimator {
  anim = "idle";
  t = 0;
  private actionActive = false;
  private wasGrounded = true;
  private airSec = 0;
  private movingSec = 0;

  update(deltaMs: number, moving: boolean, grounded: boolean): void {
    const dt = deltaMs / 1000;

    const airBefore = this.airSec;
    this.airSec = grounded ? 0 : this.airSec + dt;
    // No ar o acumulador CONGELA em vez de zerar: o chamador reporta
    // moving=false por definição enquanto voa, e airControl é 0.85 — o
    // guerreiro não perde a velocidade. Zerando, todo pouso em velocidade
    // máxima voltava pro ciclo `walk` por um quarto de segundo.
    if (grounded) this.movingSec = moving ? this.movingSec + dt : 0;
    const justLanded = grounded && !this.wasGrounded && airBefore >= LAND_MIN_AIR_SEC;
    this.wasGrounded = grounded;

    // Pouso: não interrompe ação em curso — aterrissar no meio de um golpe
    // mantém o golpe, que é o que o jogador mandou fazer.
    if (justLanded && !this.actionActive) {
      this.anim = "land";
      this.t = 0;
      this.actionActive = true;
    }

    if (this.actionActive) {
      const dur = KnightRenderer.DUR[this.anim] ?? 1;
      this.t += dt / dur;
      if (this.t >= 1) {
        this.actionActive = false;
        this.t = 0;
        this.anim = grounded ? (moving ? this.gait() : "idle") : "jump";
      }
      return;
    }

    const desired = !grounded ? "jump" : moving ? this.gait() : "idle";
    if (desired !== this.anim) {
      // walk↔run trocam SEM zerar o tempo: os dois ciclos usam a mesma fase
      // (quadril = A·sin), então preservar t faz a passada acelerar em vez
      // de dar um salto de pose no meio do passo.
      if (!isGait(desired) || !isGait(this.anim)) this.t = 0;
      this.anim = desired;
    }

    const dur = KnightRenderer.DUR[this.anim] ?? 1;
    if (this.anim === "jump") {
      this.t = Math.min(JUMP_OUT, Math.max(JUMP_IN, this.t) + dt / dur);
    } else {
      this.t = (this.t + dt / dur) % 1;
    }
  }

  /** `walk` enquanto acelera, `run` depois que a velocidade satura. */
  private gait(): string {
    return this.movingSec >= RUN_AFTER_SEC ? "run" : "walk";
  }

  trigger(action: ActionAnim): void {
    this.anim = action;
    this.t = 0;
    this.actionActive = true;
  }
}

function isGait(anim: string): boolean {
  return anim === "walk" || anim === "run";
}
