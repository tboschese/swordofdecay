import Phaser from "phaser";
import type { MovementArchetype } from "../config/archetypes";

const PLAYER_WIDTH = 12;
const PLAYER_HEIGHT = 16;
const PLAYER_COLOR = 0xf8f8f8;

/**
 * Controlador de física do jogador, 100% orientado pelos parâmetros de um
 * MovementArchetype. Nenhum número de gameplay vive aqui — apenas a
 * integração (aceleração/fricção/gravidade/coyote/buffer/cutoff) que lê os
 * parâmetros do arquétipo ativo.
 */
export class PlayerController {
  readonly gameObject: Phaser.GameObjects.Rectangle;
  private readonly body: Phaser.Physics.Arcade.Body;

  private archetype: MovementArchetype;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private isJumpHeld = false;
  private facingDir: 1 | -1 = 1;

  private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private readonly jumpKey: Phaser.Input.Keyboard.Key;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    archetype: MovementArchetype,
    color: number = PLAYER_COLOR,
  ) {
    this.archetype = archetype;

    this.gameObject = scene.add.rectangle(x, y, PLAYER_WIDTH, PLAYER_HEIGHT, color);
    scene.physics.add.existing(this.gameObject, false);

    this.body = this.gameObject.body as Phaser.Physics.Arcade.Body;
    this.body.setSize(PLAYER_WIDTH, PLAYER_HEIGHT);
    this.body.setAllowGravity(false);
    this.body.setMaxVelocity(500, 2200);
    this.body.setCollideWorldBounds(false);

    const keyboard = scene.input.keyboard!;
    this.cursors = keyboard.createCursorKeys();
    this.jumpKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
  }

  get currentArchetype(): MovementArchetype {
    return this.archetype;
  }

  get velocity(): Phaser.Math.Vector2 {
    return this.body.velocity;
  }

  get isGrounded(): boolean {
    return this.body.blocked.down;
  }

  /** Direção pra onde o jogador está virado (1 = direita, -1 = esquerda). Usada por mira de ataque. */
  get facing(): 1 | -1 {
    return this.facingDir;
  }

  /** Aplica um impulso vertical pra cima (px/s), usado pelo recuo do stomp. */
  bounce(velocity: number): void {
    this.body.setVelocityY(-velocity);
  }

  setArchetype(archetype: MovementArchetype): void {
    this.archetype = archetype;
    // reseta timers pra troca de arquétipo no ar não conceder coyote/buffer grátis
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
  }

  teleportTo(x: number, y: number): void {
    this.gameObject.setPosition(x, y);
    this.body.setVelocity(0, 0);
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.isJumpHeld = false;
  }

  update(deltaMs: number): void {
    const a = this.archetype;
    const dt = deltaMs / 1000;
    const grounded = this.body.blocked.down;

    if (grounded) {
      this.coyoteTimer = a.coyoteTimeMs;
      this.isJumpHeld = false;
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - deltaMs);
    }

    if (Phaser.Input.Keyboard.JustDown(this.jumpKey)) {
      this.jumpBufferTimer = a.jumpBufferMs;
    } else {
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - deltaMs);
    }

    // horizontal: aceleração/fricção orientadas por dados
    const dir = (this.cursors.right.isDown ? 1 : 0) - (this.cursors.left.isDown ? 1 : 0);
    let vx = this.body.velocity.x;
    if (dir !== 0) {
      this.facingDir = dir as 1 | -1;
      const accel = grounded ? a.accel : a.accel * a.airControl;
      vx = Phaser.Math.Clamp(vx + dir * accel * dt, -a.maxSpeed, a.maxSpeed);
    } else {
      const friction = grounded ? a.frictionGround : a.frictionAir;
      const drop = friction * dt;
      vx = Math.abs(vx) <= drop ? 0 : vx - Math.sign(vx) * drop;
    }

    // vertical: pulo (com bônus de velocidade opcional) + cutoff + gravidade assimétrica
    let vy = this.body.velocity.y;
    const canJump = (grounded || this.coyoteTimer > 0) && this.jumpBufferTimer > 0;
    if (canJump) {
      const speedFrac = Math.abs(vx) / a.maxSpeed;
      vy = -(a.jumpForce + a.speedJumpBonus * speedFrac);
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      this.isJumpHeld = true;
    }

    if (this.isJumpHeld && !this.jumpKey.isDown && vy < 0) {
      vy *= a.jumpCutoffMultiplier;
      this.isJumpHeld = false;
    }

    const gravity = vy < 0 ? a.gravityUp : a.gravityDown;
    vy += gravity * dt;

    this.body.setVelocity(vx, vy);
  }
}
