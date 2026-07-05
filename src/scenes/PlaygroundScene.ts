import Phaser from "phaser";
import { ARCHETYPES, type MovementArchetype } from "../config/archetypes";
import { PlayerController } from "../entities/PlayerController";
import { CombatController } from "../entities/CombatController";
import { Dummy } from "../entities/Dummy";
import { RESOLUTIONS } from "../config/resolution";

const WORLD_WIDTH = 480;
const WORLD_HEIGHT = 240;
const SPAWN = { x: 40, y: 190 };
const PIT_RESPAWN_Y = WORLD_HEIGHT + 60;

interface RectSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
}

// Mapa hardcoded: chão A/B com um pit entre elas, 3 alturas de plataforma,
// uma parede alta. Tudo retângulo colorido — sem tileset ainda (Sessão 2).
const GEOMETRY: RectSpec[] = [
  { x: 0, y: 208, w: 190, h: 32, color: 0x3cbc3c }, // chão A
  { x: 250, y: 208, w: 230, h: 32, color: 0x3cbc3c }, // chão B (pit: 190-250)
  { x: 270, y: 180, w: 48, h: 12, color: 0xa85400 }, // plataforma baixa
  { x: 330, y: 158, w: 48, h: 12, color: 0x0058f8 }, // plataforma média
  { x: 390, y: 132, w: 48, h: 12, color: 0xd82800 }, // plataforma alta
  { x: 452, y: 100, w: 18, h: 140, color: 0x585858 }, // parede alta
];

// Alvos de teste: um normal (vulnerável a tudo) em cima do chão B, um
// spiky (imune a stomp) em cima da plataforma alta — ver DESIGN.md §1.2.
const DUMMY_SPECS: { x: number; y: number; spiky: boolean }[] = [
  { x: 300, y: 200, spiky: false },
  { x: 414, y: 124, spiky: true },
];

const ARCHETYPE_KEYS: { code: number; id: MovementArchetype["id"] }[] = [
  { code: Phaser.Input.Keyboard.KeyCodes.ONE, id: "precise" },
  { code: Phaser.Input.Keyboard.KeyCodes.TWO, id: "momentum" },
  { code: Phaser.Input.Keyboard.KeyCodes.THREE, id: "heavy" },
  { code: Phaser.Input.Keyboard.KeyCodes.FOUR, id: "floaty" },
  { code: Phaser.Input.Keyboard.KeyCodes.FIVE, id: "slippery" },
];

export class PlaygroundScene extends Phaser.Scene {
  private player!: PlayerController;
  private combat!: CombatController;
  private dummies: Dummy[] = [];
  private hud!: Phaser.GameObjects.Text;
  private archetypeKeys: { key: Phaser.Input.Keyboard.Key; id: MovementArchetype["id"] }[] = [];
  private switchSceneKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super("playground");
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x5c94fc);
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, PIT_RESPAWN_Y + 40);

    const platforms = this.physics.add.staticGroup();
    for (const spec of GEOMETRY) {
      const rect = this.add.rectangle(
        spec.x + spec.w / 2,
        spec.y + spec.h / 2,
        spec.w,
        spec.h,
        spec.color,
      );
      this.physics.add.existing(rect, true);
      platforms.add(rect);
    }

    this.player = new PlayerController(this, SPAWN.x, SPAWN.y, ARCHETYPES.floaty);
    this.physics.add.collider(this.player.gameObject, platforms);

    this.dummies = DUMMY_SPECS.map((spec) => new Dummy(this, spec.x, spec.y, spec.spiky));
    this.combat = new CombatController(this, this.player, this.dummies);

    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.startFollow(this.player.gameObject, true, 0.15, 0.15);
    this.cameras.main.setDeadzone(60, 40);

    const viewportWidth = this.scale.width;
    const viewportHeight = this.scale.height;

    this.hud = this.add
      .text(4, 4, "", {
        fontFamily: "monospace",
        fontSize: "9px",
        color: "#ffffff",
        backgroundColor: "#000000aa",
        padding: { x: 4, y: 3 },
        lineSpacing: 2,
        wordWrap: { width: viewportWidth - 12 },
      })
      .setScrollFactor(0)
      .setDepth(100);

    this.add
      .text(
        4,
        viewportHeight - 4,
        "1-5 arquetipo dev  setas mover  Z pular  6-8 ataque  X/C atacar  9 carga  +/- zoom  T jogo",
        {
          fontFamily: "monospace",
          fontSize: "8px",
          color: "#f8f8f8",
          backgroundColor: "#000000aa",
          padding: { x: 3, y: 2 },
          wordWrap: { width: viewportWidth - 12 },
        },
      )
      .setScrollFactor(0)
      .setDepth(100)
      .setOrigin(0, 1);

    const keyboard = this.input.keyboard!;
    this.archetypeKeys = ARCHETYPE_KEYS.map(({ code, id }) => ({
      key: keyboard.addKey(code),
      id,
    }));
    this.switchSceneKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.T);
  }

  update(_time: number, delta: number): void {
    if (Phaser.Input.Keyboard.JustDown(this.switchSceneKey)) {
      this.scene.start("tilemap");
      return;
    }

    for (const { key, id } of this.archetypeKeys) {
      if (Phaser.Input.Keyboard.JustDown(key)) {
        this.player.setArchetype(ARCHETYPES[id]);
      }
    }

    this.player.update(delta);
    this.combat.update(delta);

    if (this.player.gameObject.y > PIT_RESPAWN_Y) {
      this.player.teleportTo(SPAWN.x, SPAWN.y);
    }

    this.refreshHud();
  }

  private currentResolutionLabel(): string {
    const preset = Object.values(RESOLUTIONS).find(
      (r) => r.width === this.scale.width && r.height === this.scale.height,
    );
    return preset ? preset.label : `${this.scale.width}x${this.scale.height}`;
  }

  private refreshHud(): void {
    const a = this.player.currentArchetype;
    const v = this.player.velocity;
    const lines = [
      `res: ${this.currentResolutionLabel()}  zoom: ${this.scale.zoom}x`,
      `[${ARCHETYPE_KEYS.findIndex((k) => k.id === a.id) + 1}] ${a.label} — ${a.description}`,
      `accel ${a.accel}  fricG ${a.frictionGround}  fricA ${a.frictionAir}  maxSpd ${a.maxSpeed}  airCtl ${a.airControl}`,
      `jump ${a.jumpForce}${a.speedJumpBonus ? `(+${a.speedJumpBonus})` : ""}  gravUp ${a.gravityUp}  gravDn ${a.gravityDown}  cutoff ${a.jumpCutoffMultiplier}`,
      `coyote ${a.coyoteTimeMs}ms  buffer ${a.jumpBufferMs}ms`,
      `vx ${v.x.toFixed(0)}  vy ${v.y.toFixed(0)}  grounded ${this.player.isGrounded ? "yes" : "no"}`,
      `combate ativo: ${this.combat.activeTypes.join(", ") || "(nenhum — 6/7/8 pra ligar)"}  chargedAttacks: ${this.combat.chargedAttacks ? "ON" : "OFF"}`,
    ];
    this.hud.setText(lines.join("\n"));
  }
}
