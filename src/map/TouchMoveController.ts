type TouchPoint = {
  x: number;
  y: number;
};

type Direction = {
  dx: number;
  dy: number;
};

function clampVector(dx: number, dy: number, maxLength: number) {
  const length = Math.hypot(dx, dy);
  if (length <= maxLength || length === 0) {
    return { x: dx, y: dy };
  }
  const scale = maxLength / length;
  return { x: dx * scale, y: dy * scale };
}

export default class TouchMoveController {
  private activePointerId: number | undefined;
  private dragAnchor: TouchPoint | undefined;
  private current: TouchPoint | undefined;
  private direction: Direction | undefined;
  private moveTimerId: number | undefined;
  private tileSize: number;

  constructor(
    private readonly requestMove: (dx: number, dy: number) => boolean,
    private readonly requestRender: () => void,
    private readonly moveInterval = 100,
    private readonly deadzone = 18,
    tileSize = 24
  ) {
    this.tileSize = tileSize;
  }

  public setTileSize(tileSize: number) {
    if (!Number.isFinite(tileSize) || tileSize <= 0) return;
    this.tileSize = tileSize;
  }

  public start(pointerId: number, point: TouchPoint) {
    if (this.activePointerId !== undefined) return false;
    this.activePointerId = pointerId;
    this.dragAnchor = { ...point };
    this.current = { ...point };
    this.direction = undefined;
    this.startTicker();
    this.requestRender();
    return true;
  }

  public update(pointerId: number, point: TouchPoint) {
    if (this.activePointerId !== pointerId || !this.dragAnchor) return false;
    this.current = { ...point };
    this.direction = this.quantizeDirection(point.x - this.dragAnchor.x, point.y - this.dragAnchor.y);
    if (this.direction) {
      this.requestMove(this.direction.dx, this.direction.dy);
    }
    this.requestRender();
    return true;
  }

  public end(pointerId: number) {
    if (this.activePointerId !== pointerId) return false;
    this.reset();
    this.requestRender();
    return true;
  }

  public destroy() {
    this.reset();
  }

  public draw(ctx: CanvasRenderingContext2D) {
    if (!this.dragAnchor || !this.current) return;

    const radius = Math.max(this.tileSize * 1.5, 36);
    const knobRadius = Math.max(this.tileSize * 0.5, 12);
    const lineWidth = Math.max(this.tileSize * 0.14, 3);
    const dragX = this.current.x - this.dragAnchor.x;
    const dragY = this.current.y - this.dragAnchor.y;
    const maxReach = radius - knobRadius - lineWidth;
    const knobOffset = clampVector(dragX, dragY, maxReach);

    const knobX = this.dragAnchor.x + knobOffset.x;
    const knobY = this.dragAnchor.y + knobOffset.y;

    ctx.save();
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
    ctx.beginPath();
    ctx.arc(this.dragAnchor.x, this.dragAnchor.y, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.beginPath();
    ctx.arc(knobX, knobY, knobRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private reset() {
    this.stopTicker();
    this.activePointerId = undefined;
    this.dragAnchor = undefined;
    this.current = undefined;
    this.direction = undefined;
  }

  private startTicker() {
    this.stopTicker();
    this.moveTimerId = window.setInterval(() => {
      if (!this.direction) return;
      this.requestMove(this.direction.dx, this.direction.dy);
      this.requestRender();
    }, this.moveInterval);
  }

  private stopTicker() {
    if (this.moveTimerId === undefined) return;
    window.clearInterval(this.moveTimerId);
    this.moveTimerId = undefined;
  }

  private quantizeDirection(dx: number, dy: number): Direction | undefined {
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (Math.max(absX, absY) < this.deadzone) {
      return undefined;
    }
    if (absX >= absY) {
      return { dx: dx < 0 ? -1 : 1, dy: 0 };
    }
    return { dx: 0, dy: dy < 0 ? -1 : 1 };
  }
}
