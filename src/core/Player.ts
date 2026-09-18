import type { MovementArchetype } from "../config/archetypes";
import { moveAndCollide } from "../engine/collision";
import type { Keyboard } from "../engine/input";

const PLAYER_WIDTH = 12;
const PLAYER_HEIGHT = 16;
const MAX_VX = 500;
const MAX_VY = 2200;

/**
 * Porte 1:1 de src/entities/PlayerController.ts (versão Phaser) — mesmas
 * fórmulas de aceleração/fricção/gravidade assimétrica/coyote/buffer/jump
 * cutoff, só trocando `Phaser.Physics.Arcade.Body` por integração manual
 * + `moveAndCollide` (engine/collision.ts). Nenhum número de gameplay novo
 * foi introduzido — só a casca mudou.
 */
export class Player {
  x: number;
  y: number;
  readonly width = PLAYER_WIDTH;
  readonly height = PLAYER_HEIGHT;
  vx = 0;
  vy = 0;

  private archetype: MovementArchetype;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private isJumpHeld = false;
  private facingDir: 1 | -1 = 1;
  private grounded = false;

  constructor(
    x: number,
    y: number,
    archetype: MovementArchetype,
    readonly color: number,
  ) {
    this.x = x;
    this.y = y;
    this.archetype = archetype;
  }

  get currentArchetype(): MovementArchetype {
    return this.archetype;
  }

  get isGrounded(): boolean {
    return this.grounded;
  }

  get facing(): 1 | -1 {
    return this.facingDir;
  }

  get velocity(): { x: number; y: number } {
    return { x: this.vx, y: this.vy };
  }

  bounce(velocity: number): void {
    this.vy = -velocity;
  }

  setArchetype(archetype: MovementArchetype): void {
    this.archetype = archetype;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
  }

  teleportTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.isJumpHeld = false;
  }

  update(
    deltaMs: number,
    keyboard: Keyboard,
    terrain: number[][],
    tileSize: number,
    solidGids: ReadonlySet<number>,
    oneWayGids: ReadonlySet<number>,
  ): void {
    const a = this.archetype;
    const dt = deltaMs / 1000;

    if (this.grounded) {
      this.coyoteTimer = a.coyoteTimeMs;
      this.isJumpHeld = false;
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - deltaMs);
    }

    if (keyboard.justDown("KeyZ")) {
      this.jumpBufferTimer = a.jumpBufferMs;
    } else {
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - deltaMs);
    }

    // horizontal: aceleração/fricção orientadas por dados
    const dir = (keyboard.isDown("ArrowRight") ? 1 : 0) - (keyboard.isDown("ArrowLeft") ? 1 : 0);
    let vx = this.vx;
    if (dir !== 0) {
      this.facingDir = dir as 1 | -1;
      const accel = this.grounded ? a.accel : a.accel * a.airControl;
      vx = clamp(vx + dir * accel * dt, -a.maxSpeed, a.maxSpeed);
    } else {
      const friction = this.grounded ? a.frictionGround : a.frictionAir;
      const drop = friction * dt;
      vx = Math.abs(vx) <= drop ? 0 : vx - Math.sign(vx) * drop;
    }

    // vertical: pulo (com bônus de velocidade opcional) + cutoff + gravidade assimétrica
    let vy = this.vy;
    const canJump = (this.grounded || this.coyoteTimer > 0) && this.jumpBufferTimer > 0;
    if (canJump) {
      const speedFrac = Math.abs(vx) / a.maxSpeed;
      vy = -(a.jumpForce + a.speedJumpBonus * speedFrac);
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      this.isJumpHeld = true;
    }

    if (this.isJumpHeld && !keyboard.isDown("KeyZ") && vy < 0) {
      vy *= a.jumpCutoffMultiplier;
      this.isJumpHeld = false;
    }

    const gravity = vy < 0 ? a.gravityUp : a.gravityDown;
    vy += gravity * dt;

    vx = clamp(vx, -MAX_VX, MAX_VX);
    vy = clamp(vy, -MAX_VY, MAX_VY);

    const result = moveAndCollide(
      { x: this.x, y: this.y, width: this.width, height: this.height },
      vx,
      vy,
      dt,
      terrain,
      tileSize,
      solidGids,
      oneWayGids,
    );

    this.x = result.x;
    this.y = result.y;
    this.vx = result.vx;
    this.vy = result.vy;
    this.grounded = result.grounded;
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
