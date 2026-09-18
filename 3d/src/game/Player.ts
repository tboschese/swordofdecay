/**
 * Física do guerreiro.
 *
 * Três coisas aqui não são preferência — são o que separa plataforma que
 * responde de plataforma que briga com o jogador. Estão implementadas de
 * propósito e explícitas:
 *
 *  **Gravidade assimétrica.** Sobe com uma gravidade, cai com outra quase
 *  o dobro. Pulo real cai mais rápido do que sobe; quando a razão fica
 *  perto de 1 o corpo lê como boneco puxado por barbante. Ver `MOVE` em
 *  `tuning.ts`.
 *
 *  **Coyote time.** Alguns quadros DEPOIS de sair da beirada o pulo ainda
 *  vale. Sem isso o jogador jura que apertou a tempo — e apertou, só que o
 *  pé já tinha saído da plataforma um quadro antes.
 *
 *  **Jump buffer.** Apertar pulo um pouco ANTES de encostar no chão conta.
 *  Sem isso, encadear pulos exige precisão de quadro e o jogo lê como
 *  travado.
 *
 * As três juntas são invisíveis quando estão certas e são a primeira coisa
 * que o jogador sente quando faltam.
 */
import { MOVE, WORLD } from "./tuning";
import type { Keyboard } from "../engine/input";
import { Level, type Aabb } from "./Level";

const HALF_W = 0.34;
const HEIGHT = 1.62;

export type PlayerAnim = "idle" | "run" | "jump" | "fall" | "land";

export class Player {
  /** Posição dos PÉS, centro em X. */
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  facing: 1 | -1 = 1;
  grounded = false;

  private coyoteMs = 0;
  private bufferMs = 0;
  private jumpHeld = false;
  private landTimerMs = 0;
  private airMs = 0;

  constructor(
    private readonly level: Level,
    spawn: { x: number; y: number },
  ) {
    this.x = spawn.x;
    this.y = spawn.y;
  }

  get box(): Aabb {
    return { x: this.x - HALF_W, y: this.y, w: HALF_W * 2, h: HEIGHT };
  }

  /** 0..1 — quanto da velocidade máxima. Alimenta a animação. */
  get speed01(): number {
    return Math.min(1, Math.abs(this.vx) / MOVE.maxSpeed);
  }

  get anim(): PlayerAnim {
    if (this.landTimerMs > 0) return "land";
    if (!this.grounded) return this.vy > 0 ? "jump" : "fall";
    return Math.abs(this.vx) > 0.6 ? "run" : "idle";
  }

  teleportTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.coyoteMs = 0;
    this.bufferMs = 0;
    this.jumpHeld = false;
    this.landTimerMs = 0;
    this.airMs = 0;
    this.grounded = false;
  }

  update(dtMs: number, keys: Keyboard): void {
    const dt = dtMs / 1000;

    // --- janelas de perdão -------------------------------------------
    if (this.grounded) {
      this.coyoteMs = MOVE.coyoteMs;
      this.jumpHeld = false;
    } else {
      this.coyoteMs = Math.max(0, this.coyoteMs - dtMs);
    }
    this.bufferMs = keys.justDown("KeyZ") ? MOVE.jumpBufferMs : Math.max(0, this.bufferMs - dtMs);
    this.landTimerMs = Math.max(0, this.landTimerMs - dtMs);

    // --- horizontal ---------------------------------------------------
    const dir = (keys.isDown("ArrowRight") ? 1 : 0) - (keys.isDown("ArrowLeft") ? 1 : 0);
    if (dir !== 0) {
      this.facing = dir as 1 | -1;
      const accel = MOVE.accel * (this.grounded ? 1 : MOVE.airControl);
      this.vx = Math.max(-MOVE.maxSpeed, Math.min(MOVE.maxSpeed, this.vx + dir * accel * dt));
    } else {
      // Fricção só sem input. Aplicar sempre faria a aceleração competir
      // consigo mesma e o personagem nunca chegaria na velocidade máxima.
      const drop = (this.grounded ? MOVE.frictionGround : MOVE.frictionAir) * dt;
      this.vx = Math.abs(this.vx) <= drop ? 0 : this.vx - Math.sign(this.vx) * drop;
    }

    // --- pulo -----------------------------------------------------------
    if (this.bufferMs > 0 && (this.grounded || this.coyoteMs > 0)) {
      this.vy = MOVE.jumpVelocity;
      this.grounded = false;
      this.coyoteMs = 0;
      this.bufferMs = 0;
      this.jumpHeld = true;
    }
    // Altura variável: soltar o botão subindo corta a subida uma vez só.
    if (this.jumpHeld && keys.justUp("KeyZ") && this.vy > 0) {
      this.vy *= MOVE.jumpCutoff;
      this.jumpHeld = false;
    }

    const g = this.vy > 0 ? MOVE.gravityUp : MOVE.gravityDown;
    this.vy = Math.max(-MOVE.maxFallSpeed, this.vy - g * dt);

    // --- colisão, eixo por eixo ----------------------------------------
    // X antes de Y, e separados: resolver os dois juntos produz o caso
    // clássico de subir parede ao andar contra ela pulando.
    const boxX = this.box;
    const rx = this.level.moveX(boxX, this.vx * dt);
    if (rx.hit) this.vx = 0;
    this.x = rx.x + HALF_W;

    const wasAir = !this.grounded;
    const boxY = this.box;
    const ry = this.level.moveY(boxY, this.vy * dt);
    this.y = ry.y;
    if (ry.grounded) {
      // Só conta como aterrissagem se estava de fato voando um tempo —
      // descer um degrau de 20cm não merece quadro de pouso.
      if (wasAir && this.airMs > 90) this.landTimerMs = 130;
      this.vy = 0;
      this.grounded = true;
      this.airMs = 0;
    } else {
      this.grounded = false;
      this.airMs += dtMs;
      if (ry.ceiling && this.vy > 0) this.vy = 0;
    }
  }

  /** Caiu do mapa? */
  get fellOff(): boolean {
    return this.y < WORLD.killPlaneY;
  }
}
