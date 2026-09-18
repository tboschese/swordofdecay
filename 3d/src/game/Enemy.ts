/**
 * Inimigo: aldeão corrompido.
 *
 * Lore (`Lore/lore.md`, Mundo 1): "inimigos fracos, corrompidos lentamente".
 * Não é monstro — é gente que a praga pegou primeiro, e por isso ainda anda
 * como gente, só que errado.
 *
 * **A regra que governa este arquivo: ele AVISA antes de atacar.**
 * O jogo 2D chegou a essa conclusão duas vezes, para dois tipos diferentes,
 * e é a mesma aqui: dano que chega sem aviso lê como injusto, e injusto é
 * falha de design, não dificuldade. O aviso tem um formato específico que
 * funciona — ele quase PARA antes de avançar. A pausa é o que faz a
 * investida ler como investida em vez de "andou mais rápido".
 */
import { Level, type Aabb } from "./Level";

export type EnemyState = "patrol" | "telegraph" | "lunge" | "dead";

const W = 0.62;
const H = 1.35;

/** Tudo em segundos/unidades por segundo. */
const TUNE = {
  patrolSpeed: 2.4,
  lungeSpeed: 7.6,
  /** Distância em que ele percebe o guerreiro. */
  senseRange: 7,
  /** Quanto tempo ele fica quase parado avisando. */
  telegraphMs: 520,
  lungeMs: 460,
  recoverMs: 420,
  /** Recuo visível durante o aviso — é o "encolher" antes do "soltar". */
  windUp: 0.55,
} as const;

export class Enemy {
  x: number;
  y: number;
  state: EnemyState = "patrol";
  facing: 1 | -1 = -1;
  /** 0..1 durante o aviso. Alimenta a arte: é o que o jogador tem que ler. */
  charge = 0;
  alive = true;
  /** Vai a 1 quando morre e decai — a arte usa pra dissolver o corpo. */
  deathT = 0;

  private timer = 0;
  private readonly homeX: number;
  private readonly range: number;

  constructor(
    private readonly level: Level,
    x: number,
    y: number,
    range = 5,
  ) {
    this.x = x;
    this.y = y;
    this.homeX = x;
    this.range = range;
  }

  get box(): Aabb {
    return { x: this.x - W / 2, y: this.y, w: W, h: H };
  }

  kill(): void {
    if (!this.alive) return;
    this.alive = false;
    this.state = "dead";
    this.deathT = 1;
  }

  update(dtMs: number, playerX: number, playerY: number): void {
    if (!this.alive) {
      this.deathT = Math.max(0, this.deathT - dtMs / 700);
      return;
    }
    const dt = dtMs / 1000;
    this.timer -= dtMs;

    const dx = playerX - this.x;
    const dist = Math.abs(dx);
    const sameFloor = Math.abs(playerY - this.y) < 2.2;

    switch (this.state) {
      case "patrol": {
        // Vai e volta em torno de casa. Sem `homeX` ele desce a fase
        // inteira atrás do jogador e deixa de ser obstáculo de lugar.
        this.x += this.facing * TUNE.patrolSpeed * dt;
        if (this.x < this.homeX - this.range) this.facing = 1;
        if (this.x > this.homeX + this.range) this.facing = -1;
        // Não anda pra fora da plataforma: inimigo que se suicida em
        // buraco vira piada e some antes de o jogador chegar.
        const ahead = this.level.groundBelow(this.x + this.facing * 0.8, this.y + 0.1);
        if (ahead === null || Math.abs(ahead - this.y) > 0.6) this.facing = (-this.facing) as 1 | -1;
        if (dist < TUNE.senseRange && sameFloor) {
          this.state = "telegraph";
          this.timer = TUNE.telegraphMs;
          this.facing = (dx > 0 ? 1 : -1) as 1 | -1;
        }
        break;
      }
      case "telegraph": {
        this.charge = 1 - Math.max(0, this.timer) / TUNE.telegraphMs;
        // Recua enquanto avisa. É o RECOLHER que dá sentido ao soltar —
        // sem ele o aviso é só uma pausa e não comunica intenção.
        this.x -= this.facing * TUNE.windUp * dt;
        if (this.timer <= 0) {
          this.state = "lunge";
          this.timer = TUNE.lungeMs;
        }
        break;
      }
      case "lunge": {
        this.charge = 1;
        this.x += this.facing * TUNE.lungeSpeed * dt;
        const ahead = this.level.groundBelow(this.x + this.facing * 0.5, this.y + 0.1);
        if (this.timer <= 0 || ahead === null) {
          this.state = "patrol";
          this.charge = 0;
          this.timer = TUNE.recoverMs;
        }
        break;
      }
      default:
        break;
    }
  }
}
