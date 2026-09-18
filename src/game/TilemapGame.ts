import { parseGrid } from "../level/gridParser";
import { LEVEL_1_GRID, LEVEL_1_MOOD } from "../levels/level1";
import * as music from "../engine/audio";
import { WARRIOR } from "../config/character";
import { ONE_WAY_GIDS, SOLID_GIDS, TILE_FRAMES, TILE_SIZE } from "../config/tileset";
import { Player } from "../core/Player";
import { Camera } from "../engine/camera";
import { Keyboard } from "../engine/input";
import { Combat, type Arrow, type CombatTarget } from "../core/Combat";
import { Enemy, enemyKindForSpawnIndex, type EnemyProjectile } from "../core/Enemy";
import { buildShooterSprite, buildWalkerSprite, enemyFrameIndex, SPRITE_SIZE, WALK_FRAMES, WALK_FRAME_MS } from "../render/EnemyArt";
import { Particles } from "../render/Particles";
import { KnightRenderer } from "../render/KnightRenderer";
import { PlayerAnimator } from "../core/PlayerAnimator";
import { Grade } from "../render/Grade";
import { Parallax } from "../render/Parallax";
import { Hud } from "../render/Hud";
import { Atmosphere } from "../render/Atmosphere";
import { Screens } from "../render/Screens";
import { buildSpikeSheet, buildTileSheet, SPIKE_CELL_W, SPIKE_VARIANT_COUNT, TILE_KIND, variantFor, WATER_PHASES, WATER_PHASE_MS } from "../render/TileArt";
import { ContactShadow } from "../render/ContactShadow";
import { GRADE_ROT } from "../config/grade";
import { rng } from "../engine/rng";

export const VIEWPORT_WIDTH = 384;
export const VIEWPORT_HEIGHT = 224;

const FALL_RESPAWN_BUFFER_TILES = 2;
const PLAYER_MAX_HP = 5;
const PLAYER_HIT_INVULNERABILITY_MS = 900;
/** Tamanho on-screen do buffer 100x100 do KnightRenderer — personagem "chibi" ocupa ~70% disso de altura. */
const KNIGHT_SIZE_PX = 60;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface Point {
  x: number;
  y: number;
}

function centeredRect(x: number, y: number, size: number): Rect {
  return { x: x - size / 2, y: y - size / 2, width: size, height: size };
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

/**
 * Hash de posição no mundo. Escolhe variante de peça sem `rng`: peça
 * sorteada por índice de laço ou por aleatoriedade cintila quando a câmera
 * anda, porque o mesmo objeto recebe desenho diferente a cada frame.
 */
function hashPos(x: number, y: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}


/**
 * Substitui TilemapScene.ts (Phaser) — mesmo grid ASCII (`levels/level1.ts`),
 * mesmo parser (`level/gridParser.ts`), mesma física (`core/Player.ts`) e
 * mesmo combate/inimigos (`core/Combat.ts`, `core/Enemy.ts`), portados 1:1
 * das versões Phaser em `src/entities/`. M1 (movimento/colisão/câmera/
 * hazard) + M2 (combate, inimigos, pickups, HP) + M3 (sprites em pixel
 * art desenhados em código, partículas, screen shake, parallax/tile
 * shading procedurais — ver `render/`).
 */
export class TilemapGame {
  private readonly terrain: number[][];
  private readonly solidGids = new Set(SOLID_GIDS);
  private readonly oneWayGids = new Set(ONE_WAY_GIDS);
  private readonly hazards: Rect[];
  private readonly spikes: Point[];
  private readonly goal: Point | null;
  private readonly respawnPoint: Point;
  private readonly worldWidthPx: number;
  private readonly worldHeightPx: number;

  private readonly player: Player;
  private readonly camera: Camera;
  private readonly keyboard: Keyboard;
  private readonly combat: Combat;
  private readonly enemies: Enemy[];

  private coins: Point[];
  private coinCount = 0;
  private key: Point | null;
  private hasKey = false;
  private door: Point | null;
  private checkpoint: Point | null;
  private checkpointActive = false;

  private goalReached = false;
  private playerHp = PLAYER_MAX_HP;
  private playerInvulnerabilityTimer = 0;

  private readonly particles = new Particles();
  private readonly tileSheet = buildTileSheet();
  private readonly spikeSheet = buildSpikeSheet();
  private readonly contactShadow = new ContactShadow();
  private readonly atmosphere = new Atmosphere(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  private readonly hud = new Hud(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  private readonly screens = new Screens(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  /** Fluxo de produto: titulo -> jogo -> vitoria/derrota -> titulo. */
  private screen: "title" | "playing" | "victory" | "defeat" = "title";
  private screenMs = 0;
  private restartRequested = false;
  private readonly parallax = new Parallax(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  private readonly grade = new Grade(VIEWPORT_WIDTH, VIEWPORT_HEIGHT, GRADE_ROT);
  private readonly walkerSprite: HTMLCanvasElement;
  private readonly shooterSprite: HTMLCanvasElement;
  private readonly knightRenderer = new KnightRenderer();
  private readonly playerAnimator = new PlayerAnimator();
  private elapsedMs = 0;
  private shakeTimer = 0;
  private shakeMagnitude = 0;
  private viewX = 0;
  private viewY = 0;

  private constructor() {
    this.walkerSprite = buildWalkerSprite();
    this.shooterSprite = buildShooterSprite();

    const parsed = parseGrid(LEVEL_1_GRID);
    this.terrain = parsed.terrain;
    this.hazards = parsed.hazards;
    this.spikes = parsed.spikes;
    this.goal = parsed.goal;
    this.coins = [...parsed.coins];
    this.key = parsed.key;
    this.door = parsed.door;
    this.checkpoint = parsed.checkpoint;

    const spawn = parsed.playerSpawn ?? { x: TILE_SIZE * 2, y: TILE_SIZE * 2 };
    this.respawnPoint = { ...spawn };

    this.worldWidthPx = parsed.widthTiles * TILE_SIZE;
    this.worldHeightPx = parsed.heightTiles * TILE_SIZE;

    this.player = new Player(spawn.x, spawn.y, WARRIOR.archetype, WARRIOR.color);
    this.camera = new Camera(VIEWPORT_WIDTH, VIEWPORT_HEIGHT, 60, 40, 0.15);
    this.camera.snapTo(spawn.x, spawn.y, this.worldWidthPx, this.worldHeightPx);

    this.keyboard = new Keyboard(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyZ", "KeyX", "KeyC"]);

    // Baixa a faixa do mood da fase enquanto o jogador lê o título. Tocar
    // só acontece no Z (ver `update`), que é o gesto que libera autoplay.
    music.preload(LEVEL_1_MOOD);

    this.enemies = parsed.enemySpawns.map((spawn) => new Enemy(spawn.x, spawn.y, enemyKindForSpawnIndex(spawn.index)));
    this.combat = new Combat(this.player, this.enemies as unknown as CombatTarget[]);
  }

  static async create(): Promise<TilemapGame> {
    // O tileset PNG legado nao e mais lido: a arte de tile agora e gerada
    // por codigo em render/TileArt.ts (DESIGN.md 2.3 proibe geracao por
    // modelo de imagem, e o pack antigo era NES chapado). O await
    // permanece para manter o contrato assincrono de create().
    await Promise.resolve();
    return new TilemapGame();
  }

  /**
   * Estado observavel para o harness de captura (shots/). Existe pra que
   * cenarios possam ser desenhados contra posicoes REAIS de inimigo em vez
   * de frames chutados — o cenario "sword" da rodada 1 golpeava o ar
   * porque ninguem sabia onde os inimigos ficavam.
   */
  debugState(): {
    clock: number;
    anim: string;
    grounded: boolean;
    player: { x: number; y: number; hp: number };
    enemies: Array<{ x: number; y: number; kind: string; alive: boolean; charge: number }>;
    actors: Array<{ kind: string; x: number; y: number; w: number; h: number }>;
    floorLine: Array<number | null>;
  } {
    return {
      clock: this.elapsedMs,
      anim: this.playerAnimator.anim,
      grounded: this.player.isGrounded,
      player: { x: this.player.x, y: this.player.y, hp: this.playerHp },
      enemies: this.enemies.map((e) => ({ x: e.x, y: e.y, kind: e.kind, alive: e.isAlive, charge: e.fireCharge })),
      actors: this.debugActorBoxes(),
      floorLine: this.debugFloorLine(),
    };
  }

  /**
   * Para cada coluna de TELA, o y de tela do topo do piso — ou `null` onde
   * não há piso (buraco), que é informação tão útil quanto a outra.
   *
   * Existe porque a métrica `--edge` vinha INFERINDO a linha do piso a
   * partir dos pixels, e as três tentativas de inferir erraram de um jeito
   * diferente cada uma: pegar a maior descontinuidade da coluna misturava
   * duas transições reais (lábio y=192 e corpo y=197) em uma estatística
   * só; procurar "superfície clara" a partir de 0.72h achava a faixa de
   * névoa entre camadas de mata; e o limiar de 0.22 que eu disse ser o
   * vale entre as populações não separa o banco escuro do corpo do chão,
   * porque a variação por coluna é maior que a distância entre eles.
   *
   * A lição é a mesma da máscara de ator: **o jogo sabe, então o jogo
   * declara**. Inferir do pixel o que o tilemap já tem escrito é adivinhar
   * com passos extras, e cada palpite vira um limiar novo pra calibrar
   * errado.
   */
  private debugFloorLine(): Array<number | null> {
    const line: Array<number | null> = [];
    for (let sx = 0; sx < VIEWPORT_WIDTH; sx++) {
      const col = Math.floor((sx + this.viewX) / TILE_SIZE);
      let found: number | null = null;
      for (let row = 0; row < this.terrain.length; row++) {
        const gid = this.terrain[row]?.[col] ?? 0;
        if (gid > 0 && (this.solidGids.has(gid) || this.oneWayGids.has(gid))) {
          // Arredondado: `viewY` é fracionário (a câmera interpola), e um y
          // fracionário vira índice fora da grade no consumidor — a
          // primeira versão devolvia NaN em toda cena de câmera solta e
          // as métricas saíam com mediana NaN em vez de erro.
          const sy = Math.round(row * TILE_SIZE - this.viewY);
          // Só interessa piso dentro da tela: um tile muito acima do topo
          // não é a beirada que o jogador lê.
          if (sy >= 0 && sy < VIEWPORT_HEIGHT) found = sy;
          break;
        }
      }
      line.push(found);
    }
    return line;
  }

  /**
   * Caixas dos atores em espaço de TELA, para o `measure.mjs` mascarar as
   * colunas ocupadas por eles.
   *
   * Existe porque duas métricas de aprovação estavam reprovando cena por
   * ela estar cheia de ator (rodada 16): a `--layers` contava o detalhe do
   * guerreiro e dos inimigos como ruído de cenário — medido no `roster`,
   * as colunas dos três atores davam 0.442 cortes/px contra 0.357 do
   * cenário — e a `--edge` chegava a achar a "aresta do piso" na silhueta
   * do guerreiro (em x=140 apontava y=173, que é a perna dele).
   *
   * Mora AQUI e não no `measure.mjs` de propósito: o jogo é a autoridade
   * sobre onde desenhou. Reconstituir a caixa fora dele significaria
   * duplicar `KNIGHT_SIZE_PX`, a origem nos pés e o offset do buffer do
   * `KnightRenderer` — e essa cópia iria divergir na primeira vez que
   * alguém mexesse na arte.
   *
   * A caixa é a do BLIT, generosa de propósito. Ela inclui a margem vazia
   * do buffer, então exclui algumas colunas a mais do que o estrito
   * necessário. É a direção segura: uma coluna de cenário perdida só
   * diminui a amostra, enquanto um pixel de ator que escape contamina
   * justamente a medida de ruído que se quer tomar.
   */
  private debugActorBoxes(): Array<{ kind: string; x: number; y: number; w: number; h: number }> {
    const boxes: Array<{ kind: string; x: number; y: number; w: number; h: number }> = [];

    // Mesma geometria do blit em KnightRenderer.render: origem nos pés,
    // buffer lógico de 100 com o chão em y=74 e o centro em x=50.
    const scale = KNIGHT_SIZE_PX / 100;
    boxes.push({
      kind: "player",
      x: Math.round(this.player.x - this.viewX - 50 * scale),
      y: Math.round(this.player.y + this.player.height / 2 - this.viewY - 74 * scale),
      w: KNIGHT_SIZE_PX,
      h: KNIGHT_SIZE_PX,
    });

    for (const e of this.enemies) {
      if (!e.isAlive) continue;
      boxes.push({
        kind: e.kind,
        x: Math.round(e.x - e.width / 2 - this.viewX),
        y: Math.round(e.y - e.height / 2 - this.viewY),
        w: e.width,
        h: e.height,
      });
    }
    return boxes;
  }

  /**
   * Posiciona o jogador. Existe SO para o harness de captura montar
   * cenarios de combate: roteirizar 900px de travessia com buracos e
   * espinhos e sincronizar o golpe no frame certo e fragil demais — o
   * jogador morria e respawnava, e o cenario nunca conectava. Isto e
   * setup de teste controlado, nao atalho de gameplay.
   */
  debugPlaceAt(x: number, y: number): void {
    this.player.teleportTo(x, y);
    this.camera.snapTo(x, y, this.worldWidthPx, this.worldHeightPx);
  }

  /**
   * Traz um inimigo para perto do jogador. Mais robusto que teleportar o
   * jogador ate o inimigo: o spawn do jogador e chao comprovadamente
   * solido, enquanto posicoes arbitrarias no nivel caem em buraco e
   * disparam respawn — que foi o que aconteceu em duas tentativas.
   */
  debugSummonEnemy(index: number, dx: number): void {
    const e = this.enemies[index];
    if (!e) return;
    e.x = this.player.x + dx;
    e.y = this.player.y;
  }

  /** O harness precisa pular a tela de titulo — ver shots/capture_entry.ts. */
  debugSetScreen(screen: "title" | "playing"): void {
    this.screen = screen;
    this.screenMs = 0;
  }

  /** main.ts consulta pra reconstruir o jogo; instancia nova abre no titulo. */
  consumeRestartRequest(): boolean {
    const r = this.restartRequested;
    this.restartRequested = false;
    return r;
  }

  update(deltaMs: number): void {
    if (this.screen !== "playing") {
      this.screenMs += deltaMs;
      // 250ms de guarda: sem isso o mesmo toque que mata dispensa a tela
      // de derrota antes de ela ser lida.
      if (this.screenMs > 250 && this.keyboard.justDown("KeyZ")) {
        if (this.screen === "title") {
          this.screen = "playing";
          this.screenMs = 0;
          // A trilha começa AQUI e não no boot: este Z é o gesto de usuário
          // que o navegador exige pra liberar autoplay. Carregada no
          // construtor, tocada no gesto.
          music.play();
        } else {
          this.restartRequested = true;
        }
      }
      // endFrame OBRIGATORIO aqui — e o oposto exato do caminho do
      // hitstop, onde pular e que esta certo. Sem consumir a borda, o
      // justDown nunca fecha e a tela pisca; consumir tambem e o que
      // impede o Z do titulo de virar pulo no primeiro frame do jogo.
      this.keyboard.endFrame();
      return;
    }

    // HITSTOP. O m6 implementou a pausa dentro de Particles (mesma decisao
    // de design que escolhe o efeito escolhe o peso); aqui so se conecta.
    // beginFrame devolve o delta que o MUNDO deve usar e guarda o delta
    // real, pra que particulas e clarao continuem correndo enquanto tudo
    // o mais esta congelado — congelar o frame inteiro leria como
    // travamento, nao como impacto.
    //
    // NAO chamar this.keyboard.endFrame() neste caminho: o frame congelado
    // comeria a borda de justUp e o golpe carregado nunca dispararia. O
    // agente testou os dois jeitos. Pular o endFrame BUFFERIZA a entrada
    // atraves da pausa, que e o comportamento certo.
    const worldDelta = this.particles.beginFrame(deltaMs);
    if (worldDelta <= 0) {
      this.particles.update(0);
      return;
    }
    deltaMs = worldDelta;

    this.elapsedMs += deltaMs;
    this.player.update(deltaMs, this.keyboard, this.terrain, TILE_SIZE, this.solidGids, this.oneWayGids);
    this.combat.update(deltaMs, this.keyboard);
    for (const enemy of this.enemies) {
      enemy.update(deltaMs, this.player.x, this.player.y, this.terrain, TILE_SIZE, this.solidGids);
      if (enemy.consumeJustDied()) {
        this.particles.emit("enemyDeath", enemy.x, enemy.y);
      }
    }
    this.camera.follow(this.player.x, this.player.y, this.worldWidthPx, this.worldHeightPx);

    for (const hit of this.combat.consumeHitEvents()) {
      this.particles.emit(hit.charged ? "swordHitCharged" : "swordHit", hit.x, hit.y, {
        dirX: this.player.facing,
      });
      if (hit.charged) this.shake(4, 150);
    }

    for (const action of this.combat.consumeActionEvents()) {
      if (action.type === "sword") this.playerAnimator.trigger(action.charged ? "slash" : "thrust");
      else this.playerAnimator.trigger(action.charged ? "cshot" : "shot");
    }

    this.checkFallOffMap();
    this.checkHazards();
    this.checkGoal();
    this.updatePickups();
    this.updateEnemyDamage();

    const moving = Math.abs(this.player.velocity.x) > 10 && this.player.isGrounded;
    this.playerAnimator.update(deltaMs, moving, this.player.isGrounded);
    this.knightRenderer.tick(deltaMs);
    this.particles.update(deltaMs);
    this.atmosphere.update(deltaMs);

    this.playerInvulnerabilityTimer = Math.max(0, this.playerInvulnerabilityTimer - deltaMs);
    this.shakeTimer = Math.max(0, this.shakeTimer - deltaMs);

    this.keyboard.endFrame();
  }

  private shake(magnitude: number, durationMs: number): void {
    this.shakeMagnitude = magnitude;
    this.shakeTimer = durationMs;
  }

  private playerBounds(): Rect {
    return {
      x: this.player.x - this.player.width / 2,
      y: this.player.y - this.player.height / 2,
      width: this.player.width,
      height: this.player.height,
    };
  }

  private checkFallOffMap(): void {
    if (this.player.y > this.worldHeightPx + TILE_SIZE * FALL_RESPAWN_BUFFER_TILES) {
      this.player.teleportTo(this.respawnPoint.x, this.respawnPoint.y);
    }
  }

  private checkHazards(): void {
    const bounds = this.playerBounds();
    for (const hazard of this.hazards) {
      if (intersects(bounds, hazard)) {
        this.damagePlayer(1, true);
        return;
      }
    }
  }

  private checkGoal(): void {
    if (!this.goal) return;
    const bounds = this.playerBounds();

    if (!this.goalReached && intersects(bounds, centeredRect(this.goal.x, this.goal.y, TILE_SIZE))) {
      this.goalReached = true;
      this.screen = "victory";
      this.screenMs = 0;
    }
  }

  private updatePickups(): void {
    const bounds = this.playerBounds();

    this.coins = this.coins.filter((coin) => {
      if (!intersects(bounds, centeredRect(coin.x, coin.y, TILE_SIZE))) return true;
      this.coinCount += 1;
      this.particles.emit("pickup", coin.x, coin.y);
      return false;
    });

    if (this.key && intersects(bounds, centeredRect(this.key.x, this.key.y, TILE_SIZE))) {
      this.key = null;
      this.hasKey = true;
    }

    if (this.hasKey && this.door && intersects(bounds, centeredRect(this.door.x, this.door.y, TILE_SIZE))) {
      this.door = null;
    }

    if (this.checkpoint && intersects(bounds, centeredRect(this.checkpoint.x, this.checkpoint.y, TILE_SIZE))) {
      this.respawnPoint.x = this.checkpoint.x;
      this.respawnPoint.y = this.checkpoint.y;
      this.checkpointActive = true;
    }
  }

  private updateEnemyDamage(): void {
    if (this.playerInvulnerabilityTimer > 0) return;
    const bounds = this.playerBounds();

    for (const enemy of this.enemies) {
      if (enemy.isAlive && intersects(bounds, enemyBounds(enemy))) {
        this.damagePlayer(enemy.contactDamage, true);
        return;
      }

      for (const projectile of [...enemy.activeProjectiles]) {
        if (intersects(bounds, projectileBounds(projectile))) {
          enemy.removeProjectile(projectile);
          this.damagePlayer(projectile.damage, false);
          return;
        }
      }
    }
  }

  private damagePlayer(amount: number, respawn: boolean): void {
    if (this.playerInvulnerabilityTimer > 0) return;

    this.playerHp = Math.max(0, this.playerHp - amount);
    this.playerInvulnerabilityTimer = PLAYER_HIT_INVULNERABILITY_MS;
    this.particles.emit("playerHurt", this.player.x, this.player.y);
    this.shake(3, 180);
    this.playerAnimator.trigger("hurt");

    if (respawn || this.playerHp <= 0) {
      this.player.teleportTo(this.respawnPoint.x, this.respawnPoint.y);
    }

    if (this.playerHp <= 0) {
      this.screen = "defeat";
      this.screenMs = 0;
      return;
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    // Cartaz e opaco: nao ha cena por tras dele.
    if (this.screen === "title") {
      this.screens.renderTitle(ctx, this.screenMs);
      return;
    }

    const shakeX = this.shakeTimer > 0 ? (rng.random() * 2 - 1) * this.shakeMagnitude : 0;
    const shakeY = this.shakeTimer > 0 ? (rng.random() * 2 - 1) * this.shakeMagnitude : 0;
    this.viewX = this.camera.x + shakeX;
    this.viewY = this.camera.y + shakeY;

    this.parallax.render(ctx, this.viewX);
    this.atmosphere.renderBack(ctx, this.viewX, this.viewY);
    this.renderTilemap(ctx);
    this.renderSpikes(ctx);
    this.renderCoins(ctx);
    this.renderKey(ctx);
    this.renderDoor(ctx);
    this.renderCheckpoint(ctx);
    this.renderGoal(ctx);
    this.renderEnemies(ctx);
    this.renderCombatVisuals(ctx);
    this.renderPlayer(ctx);
    this.particles.render(ctx, this.viewX, this.viewY);
    // Primeiro plano DEPOIS do jogador: e ele que oclui e cria
    // profundidade por sobreposicao, nao so por escala.
    this.parallax.renderForeground(ctx, this.viewX);
    // Grade fecha o mundo. O HUD vem depois, sem grade — UI nao deve
    // receber vinheta nem grao (rubrica: HUD e produto, nao cena).
    this.atmosphere.renderFront(ctx, this.viewX, this.viewY);
    this.grade.apply(ctx);
    // HUD SO durante o jogo: pips e moedas flutuando sobre a tela de
    // desfecho denunciam a UI na hora.
    if (this.screen === "playing") this.renderHud(ctx);
    else if (this.screen === "victory") this.screens.renderVictory(ctx, this.screenMs, { coins: this.coinCount });
    else this.screens.renderDefeat(ctx, this.screenMs);
  }





  private renderTilemap(ctx: CanvasRenderingContext2D): void {
    const colStart = Math.max(0, Math.floor(this.viewX / TILE_SIZE));
    const colEnd = Math.min(
      (this.terrain[0]?.length ?? 0) - 1,
      Math.ceil((this.viewX + VIEWPORT_WIDTH) / TILE_SIZE),
    );
    const rowStart = Math.max(0, Math.floor(this.viewY / TILE_SIZE));
    const rowEnd = Math.min(this.terrain.length - 1, Math.ceil((this.viewY + VIEWPORT_HEIGHT) / TILE_SIZE));

    for (let row = rowStart; row <= rowEnd; row++) {
      const terrainRow = this.terrain[row];
      if (!terrainRow) continue;
      for (let col = colStart; col <= colEnd; col++) {
        const gid = terrainRow[col] ?? 0;
        if (gid <= 0) continue;
        const dx = col * TILE_SIZE - this.viewX;
        const dy = row * TILE_SIZE - this.viewY;
        this.drawTileFrame(ctx, gid - 1, dx, dy);
      }
    }
  }

  /** Mapeia o frame legado do pack antigo para o tipo do tilesheet procedural. */
  private kindForFrame(frame: number): number {
    switch (frame + 1) {
      case TILE_FRAMES.groundTop + 1: return TILE_KIND.groundTop;
      case TILE_FRAMES.groundFill + 1: return TILE_KIND.groundFill;
      case TILE_FRAMES.platform + 1: return TILE_KIND.platform;
      case TILE_FRAMES.waterTop + 1: return TILE_KIND.waterTop;
      case TILE_FRAMES.waterBody + 1: return TILE_KIND.waterBody;
      case TILE_FRAMES.door + 1: return TILE_KIND.door;
      case TILE_FRAMES.goalFlag + 1: return TILE_KIND.goalFlag;
      case TILE_FRAMES.checkpointFlag + 1: return TILE_KIND.checkpointFlag;
      default: return TILE_KIND.groundFill;
    }
  }

  private drawTileFrame(ctx: CanvasRenderingContext2D, frame: number, dx: number, dy: number): void {
    // Variante escolhida por posicao no mundo, nao por indice de frame:
    // e isso que impede o mesmo tile de repetir identico pela tela toda.
    const col = Math.round((dx + this.viewX) / TILE_SIZE);
    const row = Math.round((dy + this.viewY) / TILE_SIZE);
    // Agua nao usa variante por posicao: usa FASE POR TEMPO. E o color
    // cycling exigido pelo DESIGN.md 2.2.
    const kind = this.kindForFrame(frame);
    const isWater = kind === TILE_KIND.waterTop || kind === TILE_KIND.waterBody;
    const v = isWater
      ? Math.floor(this.elapsedMs / WATER_PHASE_MS) % WATER_PHASES
      : variantFor(col, row);
    const sx = v * TILE_SIZE;
    const sy = kind * TILE_SIZE;
    ctx.drawImage(this.tileSheet, sx, sy, TILE_SIZE, TILE_SIZE, Math.round(dx), Math.round(dy), TILE_SIZE, TILE_SIZE);
  }

  /**
   * Espinhos vêm da folha de pixel (`buildSpikeSheet`). A versão anterior
   * desenhava dois triângulos vetoriais por tile com `fill()`+`stroke()`,
   * em offset fixo e cor única — era o único elemento do jogo que não era
   * pixel art, e lia como plástico enfileirado. Ver o comentário da folha.
   *
   * A variante é escolhida por HASH DA POSIÇÃO NO MUNDO, não por índice do
   * laço: peça ligada ao mundo não cintila quando a câmera anda, e é a
   * mesma regra que o tileset e o parallax já seguem.
   */
  private renderSpikes(ctx: CanvasRenderingContext2D): void {
    const cell = SPIKE_CELL_W;
    for (const spike of this.spikes) {
      const x = Math.round(spike.x - this.viewX - TILE_SIZE / 2);
      const y = Math.round(spike.y - this.viewY - TILE_SIZE / 2);
      for (const offset of [0, TILE_SIZE / 2]) {
        const worldCol = Math.round((spike.x + offset) / cell);
        const v = Math.floor(hashPos(worldCol, Math.round(spike.y)) * SPIKE_VARIANT_COUNT);
        ctx.drawImage(
          this.spikeSheet,
          v * cell, 0, cell, TILE_SIZE,
          x + offset, y, cell, TILE_SIZE,
        );
      }
    }
  }

  private renderCoins(ctx: CanvasRenderingContext2D): void {
    for (const coin of this.coins) {
      const x = coin.x - this.viewX;
      const y = coin.y - this.viewY;
      ctx.fillStyle = "#f8d800";
      ctx.strokeStyle = "#a86800";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#fff2a8";
      ctx.beginPath();
      ctx.arc(x - 2, y - 2, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private renderKey(ctx: CanvasRenderingContext2D): void {
    if (!this.key) return;
    const x = this.key.x - this.viewX - TILE_SIZE / 2;
    const y = this.key.y - this.viewY - TILE_SIZE / 2;
    ctx.strokeStyle = "#f8d800";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + 5, y + 5, 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 7, y + 7);
    ctx.lineTo(x + 13, y + 13);
    ctx.moveTo(x + 11, y + 9);
    ctx.lineTo(x + 13, y + 11);
    ctx.moveTo(x + 9, y + 11);
    ctx.lineTo(x + 11, y + 13);
    ctx.stroke();
  }

  private renderDoor(ctx: CanvasRenderingContext2D): void {
    if (!this.door) return;
    this.drawTileFrame(ctx, TILE_FRAMES.door, this.door.x - TILE_SIZE / 2 - this.viewX, this.door.y - TILE_SIZE / 2 - this.viewY);
  }

  private renderCheckpoint(ctx: CanvasRenderingContext2D): void {
    if (!this.checkpoint) return;
    const dx = this.checkpoint.x - TILE_SIZE / 2 - this.viewX;
    const dy = this.checkpoint.y - TILE_SIZE / 2 - this.viewY;
    this.drawTileFrame(ctx, TILE_FRAMES.checkpointFlag, dx, dy);
    if (this.checkpointActive) {
      ctx.fillStyle = "#3cbc3c";
      ctx.fillRect(dx + 6, dy + 12, 4, 4);
    }
  }

  private renderGoal(ctx: CanvasRenderingContext2D): void {
    if (!this.goal) return;
    const dx = this.goal.x - TILE_SIZE / 2 - this.viewX;
    const dy = this.goal.y - TILE_SIZE / 2 - this.viewY;
    this.drawTileFrame(ctx, TILE_FRAMES.goalFlag, dx, dy);
  }

  private renderEnemies(ctx: CanvasRenderingContext2D): void {
    for (const enemy of this.enemies) {
      const x = Math.round(
        enemy.x -
          enemy.width / 2 -
          this.viewX +
          // Deslocamento de impacto: resolve DEPOIS da pausa, nunca durante,
          // e e so de desenho — nao encosta em hitbox.
          this.particles.impactShiftX(enemy.x, enemy.y, Math.sign(enemy.x - this.player.x) || 1),
      );
      const y = Math.round(enemy.y - enemy.height / 2 - this.viewY);
      const sprite = enemy.kind === "walker" ? this.walkerSprite : this.shooterSprite;

      // Frame de caminhada por TEMPO, defasado pela posicao do inimigo:
      // um offset por individuo impede que dois inimigos na tela pisem
      // em sincronia, que le como marionete.
      const phase = Math.floor((this.elapsedMs + enemy.x * 7) / WALK_FRAME_MS) % WALK_FRAMES;
      // A folha agora tem 13 frames em blocos (andar / dano / morte /
      // telegrafo). enemyFrameIndex escolhe a partir do estado que JA
      // existia no gameplay — isHitFlashing e fireCharge — entao pose de
      // morte, flash de dano e telegrafo entram sem estado novo.
      const sx =
        enemyFrameIndex({
          alive: enemy.isAlive,
          walkPhase: phase,
          hurt: enemy.isHitFlashing,
          // Os dois telegrafam agora: o shooter a recarga, o walker o
          // recuo antes de investir. A folha do m2 ja tinha o par
          // recolher->soltar pronto pros dois.
          tell: enemy.kind === "shooter" ? enemy.fireCharge : enemy.lungeCharge,
        }) * SPRITE_SIZE;

      // Telegrafo do tiro: o shooter acende antes de disparar. Sem isso o
      // jogador leva dano sem ter tido como reagir.
      const charge = enemy.isAlive ? enemy.fireCharge : 0;
      if (charge > 0.02) {
        const r = 3 + charge * 5;
        ctx.globalAlpha = 0.16 + charge * 0.4;
        ctx.fillStyle = "#9ab06a";
        ctx.beginPath();
        ctx.arc(x + enemy.width / 2, y + enemy.height * 0.28, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Sem alpha e sem "lighter": o alpha 0.2 tornava o cadaver
      // literalmente invisivel contra o fundo escuro (provado — zero pixel
      // do corpo em sword_f100), e o aditivo estourava a silhueta. Agora a
      // morte tem pose propria e o dano e troca de paleta na folha.
      ctx.drawImage(sprite, sx, 0, SPRITE_SIZE, SPRITE_SIZE, x, y, enemy.width, enemy.height);


      for (const projectile of enemy.activeProjectiles) {
        // Era um fillRect magenta chapado — cor saturada fora da paleta,
        // o elemento mais quebrado da tela. Agora e um bolo de praga:
        // nucleo quente, corpo, halo e rastro. Projetil precisa ler
        // contra fundo claro E escuro em qualquer ponto do trajeto.
        const px = projectile.x - this.viewX;
        const py = projectile.y - this.viewY;
        const dir = Math.sign(projectile.vx || -1);

        ctx.fillStyle = "rgba(122,138,74,0.20)";
        for (let i = 1; i <= 4; i++) {
          ctx.fillRect(Math.round(px - dir * i * 2.4), Math.round(py - 0.5), 2, 1);
        }
        ctx.fillStyle = "rgba(122,138,74,0.30)";
        ctx.fillRect(Math.round(px - 2.5), Math.round(py - 2.5), 5, 5);
        ctx.fillStyle = "#5d6c42";
        ctx.fillRect(Math.round(px - 1.5), Math.round(py - 1.5), 3, 3);
        ctx.fillStyle = "#c9d0a2";
        ctx.fillRect(Math.round(px - 0.5), Math.round(py - 0.5), 1, 1);
      }
    }
  }

  private renderCombatVisuals(ctx: CanvasRenderingContext2D): void {
    // o golpe de espada em si (estocada/corte, com rastro/crescente de
    // energia) é desenhado pelo KnightRenderer como parte da própria
    // animação do personagem — ver renderPlayer.
    for (const arrow of this.combat.activeArrows) {
      this.renderWorldArrow(ctx, arrow);
    }

    const charge = this.combat.chargeProgress;
    if (charge) {
      const gaugeWidth = 16;
      const x = Math.round(this.player.x - gaugeWidth / 2 - this.viewX);
      const y = Math.round(this.player.y - 26 - this.viewY);
      ctx.fillStyle = "#000000aa";
      ctx.fillRect(x - 1, y - 1, gaugeWidth + 2, 5);
      ctx.fillStyle = charge.charged ? "#f8d820" : "#f8f8f8";
      ctx.fillRect(x, y, gaugeWidth * charge.progress, 3);
    }
  }

  /** Flecha em voo desenhada como flecha de verdade (haste+ponta+penas), não um retângulo. */
  private renderWorldArrow(ctx: CanvasRenderingContext2D, arrow: Arrow): void {
    const x = Math.round(arrow.x - this.viewX);
    const y = Math.round(arrow.y - this.viewY);
    const dir = arrow.vx >= 0 ? 1 : -1;
    const len = arrow.width;

    ctx.strokeStyle = "#8a5a2a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - dir * len * 0.5, y);
    ctx.lineTo(x + dir * (len * 0.5 - 3), y);
    ctx.stroke();

    ctx.fillStyle = cssColor(arrow.color);
    ctx.beginPath();
    ctx.moveTo(x + dir * len * 0.5, y);
    ctx.lineTo(x + dir * (len * 0.5 - 4), y - arrow.height / 2);
    ctx.lineTo(x + dir * (len * 0.5 - 4), y + arrow.height / 2);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "#d8d8d8";
    ctx.beginPath();
    ctx.moveTo(x - dir * len * 0.5, y);
    ctx.lineTo(x - dir * (len * 0.5 - 3), y - 2);
    ctx.moveTo(x - dir * len * 0.5, y);
    ctx.lineTo(x - dir * (len * 0.5 - 3), y + 2);
    ctx.stroke();
  }

  /** Topo do primeiro tile solido abaixo de (worldX, worldY), em coordenada de mundo. */
  private groundBelow(worldX: number, worldY: number): number | null {
    const col = Math.floor(worldX / TILE_SIZE);
    const startRow = Math.floor(worldY / TILE_SIZE);
    for (let row = startRow; row < this.terrain.length; row++) {
      const gid = this.terrain[row]?.[col] ?? 0;
      if (gid > 0 && (this.solidGids.has(gid) || this.oneWayGids.has(gid))) return row * TILE_SIZE;
    }
    return null;
  }

  private renderPlayer(ctx: CanvasRenderingContext2D): void {
    const feetX = this.player.x - this.viewX;
    const feetY = this.player.y + this.player.height / 2 - this.viewY;

    const groundWorldY = this.groundBelow(this.player.x, this.player.y + this.player.height / 2);
    if (groundWorldY !== null) {
      this.contactShadow.render(ctx, feetX, feetY, groundWorldY - this.viewY);
    }

    ctx.globalAlpha = this.playerInvulnerabilityTimer > 0 ? 0.45 : 1;
    this.knightRenderer.render(
      ctx,
      feetX,
      feetY,
      this.player.facing,
      this.playerAnimator.anim,
      this.playerAnimator.t,
      KNIGHT_SIZE_PX,
    );
    ctx.globalAlpha = 1;
  }

  private renderHud(ctx: CanvasRenderingContext2D): void {
    const a = this.player.currentArchetype;
    const v = this.player.velocity;
    const ch = this.combat.chargeProgress;

    this.hud.render(
      ctx,
      {
        hp: this.playerHp,
        maxHp: PLAYER_MAX_HP,
        coins: this.coinCount,
        hasKey: this.hasKey,
        charge: ch ? ch.progress : null,
        invulnerable: this.playerInvulnerabilityTimer > 0,
      },
      { accel: a.accel, maxSpeed: a.maxSpeed, vx: v.x, vy: v.y, grounded: this.player.isGrounded },
    );


  }


}

function enemyBounds(enemy: Enemy): Rect {
  return { x: enemy.x - enemy.width / 2, y: enemy.y - enemy.height / 2, width: enemy.width, height: enemy.height };
}

function projectileBounds(p: EnemyProjectile): Rect {
  return { x: p.x - p.width / 2, y: p.y - p.height / 2, width: p.width, height: p.height };
}
