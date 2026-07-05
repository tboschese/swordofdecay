import Phaser from "phaser";
import { PlayerController } from "../entities/PlayerController";
import { CombatController } from "../entities/CombatController";
import { Enemy, enemyKindForSpawnIndex } from "../entities/Enemy";
import { parseGrid } from "../level/gridParser";
import { LEVEL_1_GRID, LEVEL_1_MOOD } from "../levels/level1";
import { WARRIOR } from "../config/character";
import { MUSIC_TRACKS, MUSIC_VOLUME } from "../config/music";
import {
  ONE_WAY_GIDS,
  SOLID_GIDS,
  TILESET_KEY,
  TILESET_PATH,
  TILE_FRAMES,
  TILE_SIZE,
  WATER_CYCLE_INTERVAL_MS,
  WATER_CYCLE_TINTS,
  WATER_GIDS,
} from "../config/tileset";
import { FOREST_PARALLAX } from "../config/parallax";

const ATTACK_CONTROLS_HINT = "X espada (3, 5 carregada)  C flecha (1, 3 carregada)";

const MARKER_SPIKE_KEY = "marker-spike";
const MARKER_COIN_KEY = "marker-coin";
const MARKER_KEY_KEY = "marker-key";
const PARALLAX_MARGIN = 400;
const PLAYER_MAX_HP = 5;
const PLAYER_HIT_INVULNERABILITY_MS = 900;

export class TilemapScene extends Phaser.Scene {
  private player!: PlayerController;
  private combat!: CombatController;
  private hud!: Phaser.GameObjects.Text;
  private switchSceneKey!: Phaser.Input.Keyboard.Key;

  private hazards: { x: number; y: number; width: number; height: number }[] = [];
  private respawnPoint = { x: 0, y: 0 };
  private mapHeightPx = 0;
  private coinSprites: Phaser.GameObjects.Image[] = [];
  private coinCount = 0;
  private hasKey = false;
  private keySprite: Phaser.GameObjects.Image | null = null;
  private doorSprite: Phaser.GameObjects.Image | null = null;
  private checkpointSprite: Phaser.GameObjects.Image | null = null;
  private goalSprite: Phaser.GameObjects.Image | null = null;
  private goalReached = false;
  private goalText!: Phaser.GameObjects.Text;
  private waterTiles: Phaser.Tilemaps.Tile[] = [];
  private waterCycleTimer = 0;
  private waterCycleIndex = 0;
  private enemies: Enemy[] = [];
  private playerHp = PLAYER_MAX_HP;
  private playerInvulnerabilityTimer = 0;
  private music: Phaser.Sound.BaseSound | null = null;

  constructor() {
    super("tilemap");
  }

  preload(): void {
    // spritesheet (não image) — precisamos de frames indexáveis tanto pro
    // Tilemap quanto pros sprites de entidade (porta, flags).
    this.load.spritesheet(TILESET_KEY, TILESET_PATH, { frameWidth: TILE_SIZE, frameHeight: TILE_SIZE });

    // Só a faixa do mood desta fase é carregada — não a biblioteca inteira
    // (ver DESIGN.md §3.1/§3.3, config/music.ts).
    const track = MUSIC_TRACKS[LEVEL_1_MOOD];
    this.load.audio(track.key, track.path);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(FOREST_PARALLAX.sky.color);
    this.createMarkerTextures();

    const parsed = parseGrid(LEVEL_1_GRID);
    this.hazards = parsed.hazards;

    const map = this.make.tilemap({ data: parsed.terrain, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
    const tileset = map.addTilesetImage(TILESET_KEY, TILESET_KEY, TILE_SIZE, TILE_SIZE)!;
    const layer = map.createLayer(0, tileset, 0, 0)!;
    layer.setCollision([...SOLID_GIDS, ...ONE_WAY_GIDS]);
    layer.forEachTile((tile) => {
      if (ONE_WAY_GIDS.includes(tile.index)) {
        // one-way: só colide vindo de cima (landing), nunca por baixo/lado
        tile.setCollision(false, false, true, false);
      }
      if (WATER_GIDS.includes(tile.index)) {
        this.waterTiles.push(tile);
      }
    });

    this.mapHeightPx = map.heightInPixels;
    this.createParallax(map.widthInPixels);

    const spawn = parsed.playerSpawn ?? { x: TILE_SIZE * 2, y: TILE_SIZE * 2 };
    this.respawnPoint = { ...spawn };

    this.player = new PlayerController(this, spawn.x, spawn.y, WARRIOR.archetype, WARRIOR.color);
    this.physics.add.collider(this.player.gameObject, layer);

    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels + 80);
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.startFollow(this.player.gameObject, true, 0.15, 0.15);
    this.cameras.main.setDeadzone(60, 40);

    this.spawnEntities(parsed, layer);
    this.combat = new CombatController(this, this.player, this.enemies, WARRIOR.combat, false);
    this.createHud();

    const keyboard = this.input.keyboard!;
    this.switchSceneKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.T);

    const track = MUSIC_TRACKS[LEVEL_1_MOOD];
    this.music = this.sound.add(track.key, { loop: true, volume: MUSIC_VOLUME });
    this.music.play();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.music?.stop());
  }

  /** Espinho/moeda/chave não existem no tileset atual — geradas por código (16x16). */
  private createMarkerTextures(): void {
    if (this.textures.exists(MARKER_SPIKE_KEY)) return;

    const spike = this.make.graphics({ x: 0, y: 0 }, false);
    spike.fillStyle(0x8a8a9a, 1);
    spike.fillTriangle(1, 15, 6, 4, 11, 15);
    spike.fillTriangle(6, 15, 11, 4, 16, 15);
    spike.lineStyle(1, 0x2a2a35, 1);
    spike.strokeTriangle(1, 15, 6, 4, 11, 15);
    spike.strokeTriangle(6, 15, 11, 4, 16, 15);
    spike.generateTexture(MARKER_SPIKE_KEY, TILE_SIZE, TILE_SIZE);
    spike.destroy();

    const coin = this.make.graphics({ x: 0, y: 0 }, false);
    coin.fillStyle(0xf8d800, 1);
    coin.fillCircle(8, 8, 6);
    coin.lineStyle(1, 0xa86800, 1);
    coin.strokeCircle(8, 8, 6);
    coin.fillStyle(0xfff2a8, 1);
    coin.fillCircle(6, 6, 1.5);
    coin.generateTexture(MARKER_COIN_KEY, TILE_SIZE, TILE_SIZE);
    coin.destroy();

    const key = this.make.graphics({ x: 0, y: 0 }, false);
    key.lineStyle(2, 0xf8d800, 1);
    key.strokeCircle(5, 5, 3);
    key.lineBetween(7, 7, 13, 13);
    key.lineBetween(11, 9, 13, 11);
    key.lineBetween(9, 11, 11, 13);
    key.generateTexture(MARKER_KEY_KEY, TILE_SIZE, TILE_SIZE);
    key.destroy();
  }

  private createParallax(worldWidth: number): void {
    const viewportHeight = this.scale.height;
    const left = -PARALLAX_MARGIN;
    const right = worldWidth + PARALLAX_MARGIN;

    const sky = FOREST_PARALLAX.sky;
    this.add
      .rectangle((left + right) / 2, viewportHeight / 2, right - left, viewportHeight, sky.color)
      .setScrollFactor(sky.scrollFactorX, 0)
      .setDepth(sky.depth);

    const hills = FOREST_PARALLAX.hills;
    const hillBaseline = viewportHeight * hills.baselineRatio;
    const hillsGfx = this.add.graphics().setScrollFactor(hills.scrollFactorX, 0).setDepth(hills.depth);
    hillsGfx.fillStyle(hills.color, 1);
    hillsGfx.beginPath();
    hillsGfx.moveTo(left, viewportHeight);
    hillsGfx.lineTo(left, hillBaseline);
    for (let x = left; x < right; x += hills.period) {
      hillsGfx.lineTo(x + hills.period / 2, hillBaseline - hills.amplitude);
      hillsGfx.lineTo(x + hills.period, hillBaseline);
    }
    hillsGfx.lineTo(right, viewportHeight);
    hillsGfx.closePath();
    hillsGfx.fillPath();

    const trees = FOREST_PARALLAX.trees;
    const treeBaseline = viewportHeight * trees.baselineRatio;
    const treesGfx = this.add.graphics().setScrollFactor(trees.scrollFactorX, 0).setDepth(trees.depth);
    treesGfx.fillStyle(trees.color, 1);
    treesGfx.fillRect(left, treeBaseline, right - left, viewportHeight - treeBaseline);
    for (let x = left; x < right; x += trees.spacing) {
      treesGfx.fillCircle(x, treeBaseline, trees.radius);
    }
  }

  private spawnEntities(parsed: ReturnType<typeof parseGrid>, layer: Phaser.Tilemaps.TilemapLayer): void {
    this.coinSprites = parsed.coins.map((p) => this.add.image(p.x, p.y, MARKER_COIN_KEY));

    for (const spike of parsed.spikes) {
      this.add.image(spike.x, spike.y, MARKER_SPIKE_KEY);
    }

    if (parsed.key) {
      this.keySprite = this.add.image(parsed.key.x, parsed.key.y, MARKER_KEY_KEY);
    }

    if (parsed.door) {
      this.doorSprite = this.add
        .image(parsed.door.x, parsed.door.y, TILESET_KEY, TILE_FRAMES.door)
        .setDisplaySize(TILE_SIZE, TILE_SIZE);
      this.physics.add.existing(this.doorSprite, true);
      this.physics.add.collider(this.player.gameObject, this.doorSprite);
    }

    if (parsed.checkpoint) {
      this.checkpointSprite = this.add
        .image(parsed.checkpoint.x, parsed.checkpoint.y, TILESET_KEY, TILE_FRAMES.checkpointFlag)
        .setDisplaySize(TILE_SIZE, TILE_SIZE);
    }

    if (parsed.goal) {
      this.goalSprite = this.add
        .image(parsed.goal.x, parsed.goal.y, TILESET_KEY, TILE_FRAMES.goalFlag)
        .setDisplaySize(TILE_SIZE, TILE_SIZE);
    }

    this.enemies = parsed.enemySpawns.map((enemy) => {
      const kind = enemyKindForSpawnIndex(enemy.index);
      return new Enemy(this, enemy.x, enemy.y, kind, layer);
    });

    this.goalText = this.add
      .text(this.scale.width / 2, this.scale.height / 2, "", {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#ffffff",
        backgroundColor: "#000000cc",
        padding: { x: 8, y: 6 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(200);
  }

  private createHud(): void {
    this.hud = this.add
      .text(4, 4, "", {
        fontFamily: "monospace",
        fontSize: "9px",
        color: "#ffffff",
        backgroundColor: "#000000aa",
        padding: { x: 4, y: 3 },
        lineSpacing: 2,
        wordWrap: { width: this.scale.width - 12 },
      })
      .setScrollFactor(0)
      .setDepth(100);

    this.add
      .text(
        4,
        this.scale.height - 4,
        `setas mover  Z pular  ${ATTACK_CONTROLS_HINT}  T playground (dev)`,
        {
          fontFamily: "monospace",
          fontSize: "8px",
          color: "#f8f8f8",
          backgroundColor: "#000000aa",
          padding: { x: 3, y: 2 },
          wordWrap: { width: this.scale.width - 12 },
        },
      )
      .setScrollFactor(0)
      .setDepth(100)
      .setOrigin(0, 1);
  }

  update(_time: number, delta: number): void {
    if (Phaser.Input.Keyboard.JustDown(this.switchSceneKey)) {
      this.scene.start("playground");
      return;
    }

    this.player.update(delta);
    this.playerInvulnerabilityTimer = Math.max(0, this.playerInvulnerabilityTimer - delta);
    for (const enemy of this.enemies) {
      enemy.update(delta, this.player);
    }
    this.combat.update(delta);

    this.updatePickups();
    this.updateEnemyDamage();
    this.updateHazards();
    this.updateWaterCycle(delta);
    this.refreshHud();
  }

  private updatePickups(): void {
    const playerBounds = this.player.gameObject.getBounds();

    this.coinSprites = this.coinSprites.filter((coin) => {
      if (!Phaser.Geom.Intersects.RectangleToRectangle(playerBounds, coin.getBounds())) return true;
      coin.destroy();
      this.coinCount += 1;
      return false;
    });

    if (this.keySprite && Phaser.Geom.Intersects.RectangleToRectangle(playerBounds, this.keySprite.getBounds())) {
      this.keySprite.destroy();
      this.keySprite = null;
      this.hasKey = true;
    }

    if (this.hasKey && this.doorSprite) {
      if (Phaser.Geom.Intersects.RectangleToRectangle(playerBounds, this.doorSprite.getBounds())) {
        this.doorSprite.destroy();
        this.doorSprite = null;
      }
    }

    if (
      this.checkpointSprite &&
      Phaser.Geom.Intersects.RectangleToRectangle(playerBounds, this.checkpointSprite.getBounds())
    ) {
      this.respawnPoint = { x: this.checkpointSprite.x, y: this.checkpointSprite.y };
      this.checkpointSprite.setTint(0x3cbc3c);
    }

    if (
      !this.goalReached &&
      this.goalSprite &&
      Phaser.Geom.Intersects.RectangleToRectangle(playerBounds, this.goalSprite.getBounds())
    ) {
      this.goalReached = true;
      this.goalText.setText("FASE CONCLUIDA!\nvoltando ao inicio...");
      this.time.delayedCall(1500, () => {
        this.goalText.setText("");
        this.goalReached = false;
        this.player.teleportTo(this.respawnPoint.x, this.respawnPoint.y);
      });
    }
  }

  private updateHazards(): void {
    // caiu fora do mapa (gap sem chão embaixo, ver src/level/chunk.ts) — o
    // corpo do jogador tem collideWorldBounds desligado, então sem essa
    // checagem ele cairia pra sempre em vez de respawnar como nos outros
    // hazards.
    if (this.player.gameObject.y > this.mapHeightPx + TILE_SIZE * 2) {
      this.player.teleportTo(this.respawnPoint.x, this.respawnPoint.y);
      return;
    }

    const playerBounds = this.player.gameObject.getBounds();
    for (const hazard of this.hazards) {
      const hazardRect = new Phaser.Geom.Rectangle(hazard.x, hazard.y, hazard.width, hazard.height);
      if (Phaser.Geom.Intersects.RectangleToRectangle(playerBounds, hazardRect)) {
        this.damagePlayer(1, true);
        return;
      }
    }
  }

  private updateEnemyDamage(): void {
    if (this.playerInvulnerabilityTimer > 0) return;

    const playerBounds = this.player.gameObject.getBounds();
    for (const enemy of this.enemies) {
      if (enemy.isAlive && Phaser.Geom.Intersects.RectangleToRectangle(playerBounds, enemy.gameObject.getBounds())) {
        this.damagePlayer(enemy.contactDamage, true);
        return;
      }

      for (const projectile of [...enemy.activeProjectiles]) {
        if (Phaser.Geom.Intersects.RectangleToRectangle(playerBounds, projectile.gameObject.getBounds())) {
          enemy.destroyProjectile(projectile);
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
    this.player.gameObject.setAlpha(0.45);
    this.time.delayedCall(PLAYER_HIT_INVULNERABILITY_MS, () => {
      if (this.player.gameObject.active) this.player.gameObject.setAlpha(1);
    });

    if (respawn || this.playerHp <= 0) {
      this.player.teleportTo(this.respawnPoint.x, this.respawnPoint.y);
    }

    if (this.playerHp <= 0) {
      this.playerHp = PLAYER_MAX_HP;
      this.goalText.setText("VOCE CAIU...\nrespawn");
      this.time.delayedCall(900, () => this.goalText.setText(""));
    }
  }

  private updateWaterCycle(deltaMs: number): void {
    this.waterCycleTimer += deltaMs;
    if (this.waterCycleTimer < WATER_CYCLE_INTERVAL_MS) return;
    this.waterCycleTimer = 0;
    this.waterCycleIndex = (this.waterCycleIndex + 1) % WATER_CYCLE_TINTS.length;
    const tint = WATER_CYCLE_TINTS[this.waterCycleIndex]!;
    for (const tile of this.waterTiles) {
      tile.tint = tint;
    }
  }

  private refreshHud(): void {
    const a = this.player.currentArchetype;
    const v = this.player.velocity;
    const lines = [
      `${WARRIOR.label} — vida: ${this.playerHp}/${PLAYER_MAX_HP}  moedas: ${this.coinCount}  chave: ${
        this.hasKey ? "sim" : "nao"
      }`,
      `accel ${a.accel}  maxSpd ${a.maxSpeed}  jump ${a.jumpForce}  coyote ${a.coyoteTimeMs}ms  buffer ${a.jumpBufferMs}ms`,
      `vx ${v.x.toFixed(0)}  vy ${v.y.toFixed(0)}  grounded ${this.player.isGrounded ? "yes" : "no"}`,
    ];
    this.hud.setText(lines.join("\n"));
  }
}
