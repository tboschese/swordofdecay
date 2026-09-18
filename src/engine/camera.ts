/**
 * Câmera 2D com deadzone + lerp (porta o comportamento de
 * `cameras.main.startFollow(target, true, 0.15, 0.15)` +
 * `setDeadzone(60, 40)` do Phaser, sem depender do Phaser). `x`/`y` são o
 * canto superior-esquerdo da viewport em coordenadas de mundo.
 */
export class Camera {
  x = 0;
  y = 0;

  constructor(
    private readonly viewportWidth: number,
    private readonly viewportHeight: number,
    private readonly deadzoneWidth: number,
    private readonly deadzoneHeight: number,
    private readonly lerp: number,
  ) {}

  follow(targetX: number, targetY: number, worldWidth: number, worldHeight: number): void {
    const centerX = this.x + this.viewportWidth / 2;
    const centerY = this.y + this.viewportHeight / 2;

    const halfDzW = this.deadzoneWidth / 2;
    const halfDzH = this.deadzoneHeight / 2;

    let desiredCenterX = centerX;
    if (targetX < centerX - halfDzW) desiredCenterX = targetX + halfDzW;
    else if (targetX > centerX + halfDzW) desiredCenterX = targetX - halfDzW;

    let desiredCenterY = centerY;
    if (targetY < centerY - halfDzH) desiredCenterY = targetY + halfDzH;
    else if (targetY > centerY + halfDzH) desiredCenterY = targetY - halfDzH;

    const desiredX = desiredCenterX - this.viewportWidth / 2;
    const desiredY = desiredCenterY - this.viewportHeight / 2;

    this.x += (desiredX - this.x) * this.lerp;
    this.y += (desiredY - this.y) * this.lerp;

    const maxX = Math.max(0, worldWidth - this.viewportWidth);
    const maxY = Math.max(0, worldHeight - this.viewportHeight);
    this.x = clamp(this.x, 0, maxX);
    this.y = clamp(this.y, 0, maxY);
  }

  snapTo(targetX: number, targetY: number, worldWidth: number, worldHeight: number): void {
    const maxX = Math.max(0, worldWidth - this.viewportWidth);
    const maxY = Math.max(0, worldHeight - this.viewportHeight);
    this.x = clamp(targetX - this.viewportWidth / 2, 0, maxX);
    this.y = clamp(targetY - this.viewportHeight / 2, 0, maxY);
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
