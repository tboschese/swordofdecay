/**
 * Amarração do jogo.
 *
 * Os rigs (câmera, palco, guerreiro, atmosfera) entram por INJEÇÃO, não
 * por import direto. Dois motivos, os dois práticos:
 *
 *  - os módulos são de donos diferentes e ficam prontos em tempos
 *    diferentes; o núcleo não pode ficar refém do último a chegar;
 *  - física é pura e não precisa de WebGL. Com injeção, o smoke test de
 *    travessia roda em Node puro em milissegundos, sem browser, sem GPU.
 *    Um teste que custa 10ms é um teste que se roda a cada mudança.
 */
import type { AtmosphereRig, CameraRig, HeroRig, LevelData, StageRig } from "../contracts";
import type { Keyboard } from "../engine/input";
import { Level } from "./Level";
import { Player } from "./Player";
import { Enemy } from "./Enemy";
import { Combat } from "./Combat";
import { sfx } from "../engine/audio";

export interface Rigs {
  camera?: CameraRig;
  stage?: StageRig;
  hero?: HeroRig;
  atmosphere?: AtmosphereRig;
}

export interface GameState {
  x: number;
  y: number;
  vx: number;
  grounded: boolean;
  anim: string;
  deaths: number;
  reachedGoal: boolean;
  hp: number;
  enemiesAlive: number;
}

const MAX_HP = 3;
/** Invulnerabilidade após tomar dano. Sem ela, encostar num inimigo drena
 *  a vida inteira num segundo e a morte parece bug, não erro. */
const IFRAMES_MS = 900;

/**
 * Modo de fotografia: desliga dano por perigo e por inimigo.
 *
 * Existe porque o trecho da TORÇÃO era infotografável: a poça do Rot mata
 * por contato no primeiro quadro e a câmera volta pro spawn, então toda
 * captura de lá mostrava a rua. Eu cheguei a concluir que a parede da
 * torção estava sem variação — conclusão errada tirada de instrumento
 * quebrado, que é o erro que este projeto mais repete.
 *
 * Só afeta captura. O jogo publicado nunca liga isto.
 */
const PHOTO_MODE = typeof location !== "undefined" && location.hash.includes("photo");

export class Game {
  readonly level: Level;
  readonly player: Player;
  readonly enemies: Enemy[];
  readonly combat: Combat;
  private frame = 0;
  private deaths = 0;
  private reachedGoal = false;
  private hp = MAX_HP;
  private invulnMs = 0;
  /** Estado do quadro anterior, pra detectar TRANSIÇÃO e não estado.
   *  Os sons ficam aqui e não em `Player` de propósito: física que importa
   *  áudio deixa de ser testável sem browser, e o smoke test de travessia
   *  roda em Node puro justamente porque ela é pura. */
  private wasGrounded = true;
  /** Consumido pelo render pra soltar partícula no ponto certo. */
  hitFx: { x: number; y: number; t: number } | null = null;

  constructor(
    data: LevelData,
    private readonly keys: Keyboard,
    private readonly rigs: Rigs = {},
  ) {
    this.level = new Level(data);
    this.player = new Player(this.level, data.spawn);
    this.enemies = data.enemies.map((e) => new Enemy(this.level, e.x, e.y, e.range ?? 5));
    this.combat = new Combat({
      onSwing: () => sfx.swing(),
      onHit: (x, y) => {
        sfx.hit();
        this.hitFx = { x, y, t: 1 };
      },
      onKill: () => sfx.enemyDeath(),
    });
    this.rigs.camera?.snapTo({ x: this.player.x, y: this.player.y, vx: 0, grounded: true });
  }

  get state(): GameState {
    return {
      x: this.player.x,
      y: this.player.y,
      vx: this.player.vx,
      grounded: this.player.grounded,
      anim: this.player.anim,
      deaths: this.deaths,
      reachedGoal: this.reachedGoal,
      hp: this.hp,
      enemiesAlive: this.enemies.filter((e) => e.alive).length,
    };
  }

  /** Recomeça a fase do zero. Instância nova seria mais limpa, mas o
   *  palco e as luzes já estão montados na cena — reusar evita reconstruir
   *  geometria a cada morte, que é o custo caro. */
  restart(): void {
    this.deaths = 0;
    this.reachedGoal = false;
    this.frame = 0;
    this.hp = MAX_HP;
    this.invulnMs = 0;
    for (const e of this.enemies) {
      e.alive = true;
      e.state = "patrol";
      e.charge = 0;
      e.deathT = 0;
    }
    this.player.teleportTo(this.level.data.spawn.x, this.level.data.spawn.y);
    this.rigs.camera?.snapTo({ x: this.player.x, y: this.player.y, vx: 0, grounded: true });
  }

  update(dtMs: number): void {
    // Hitstop: o mundo inteiro congela por alguns quadros no acerto. É o
    // que dá peso ao golpe — sem isso o inimigo só some. O combate segue
    // recebendo update pra descontar o congelamento, e o teclado NÃO tem a
    // borda consumida, senão o próximo golpe nunca dispara.
    this.combat.update(this.keys, this.player.x, this.player.y, this.player.facing, this.enemies);
    if (this.combat.frozen) return;

    this.frame++;
    this.player.update(dtMs, this.keys);
    this.keys.endFrame();

    // Pulo e pouso por TRANSIÇÃO: tocar por estado dispararia o som todo
    // quadro em que o pé está no chão.
    if (this.wasGrounded && !this.player.grounded && this.player.vy > 0) sfx.jump();
    if (!this.wasGrounded && this.player.grounded) sfx.land();
    this.wasGrounded = this.player.grounded;

    for (const e of this.enemies) e.update(dtMs, this.player.x, this.player.y);

    this.invulnMs = Math.max(0, this.invulnMs - dtMs);
    if (this.hitFx) {
      this.hitFx.t -= dtMs / 320;
      if (this.hitFx.t <= 0) this.hitFx = null;
    }

    // Dano por encostar em inimigo vivo.
    if (this.invulnMs === 0 && !PHOTO_MODE) {
      const b = this.player.box;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const eb = e.box;
        if (b.x < eb.x + eb.w && b.x + b.w > eb.x && b.y < eb.y + eb.h && b.y + b.h > eb.y) {
          this.hp--;
          this.invulnMs = IFRAMES_MS;
          sfx.hurt();
          // Empurrão pra longe: sem isso o jogador fica preso dentro do
          // inimigo e perde os três corações numa sequência de iframes.
          this.player.vx = (this.player.x < e.x ? -1 : 1) * 9;
          this.player.vy = 7;
          break;
        }
      }
    }

    // Morte por queda ou por encostar no Rot. Respawn no início: a fase 1
    // é curta de propósito e checkpoint aqui esconderia se ela é ou não
    // atravessável de uma vez.
    if (this.player.fellOff || (!PHOTO_MODE && this.level.touchesHazard(this.player.box)) || this.hp <= 0) {
      this.deaths++;
      this.hp = MAX_HP;
      this.invulnMs = 0;
      this.player.teleportTo(this.level.data.spawn.x, this.level.data.spawn.y);
      this.rigs.camera?.snapTo({ x: this.player.x, y: this.player.y, vx: 0, grounded: true });
    }

    if (!this.reachedGoal && Math.abs(this.player.x - this.level.data.goal.x) < 1.5) {
      this.reachedGoal = true;
      sfx.goal();
    }

    const target = {
      x: this.player.x,
      y: this.player.y,
      vx: this.player.vx,
      grounded: this.player.grounded,
    };
    this.rigs.camera?.update(target, dtMs);
    this.rigs.stage?.update(this.frame);
    this.rigs.atmosphere?.update(this.frame);
    this.rigs.atmosphere?.followShadow(this.player.x, this.player.y);
    this.rigs.hero?.update(this.player.anim, this.player.facing, this.player.speed01, dtMs);
  }
}
