import { Map } from "../common/Schema";
import { ViewportMetrics } from "./Viewport";

export interface Crop {
  x: number;
  y: number;
  top: number;
  left: number;
}

// プレイヤーの存在するマス周辺を切り出すクラス
export default class Cropper {
  private left = 0;
  private top = 0;
  private x = 0;
  private y = 0;
  private map: Map;
  private viewport: ViewportMetrics;

  constructor(map: Map, x: number, y: number, viewport: ViewportMetrics) {
    this.map = map;
    this.viewport = viewport;
    this.jump(x, y);
  }

  public setViewport(viewport: ViewportMetrics) {
    this.viewport = viewport;
    this.updateRect();
  }

  public canMove(dx: number, dy: number): boolean {
    const x = this.x + dx;
    const y = this.y + dy;
    if (x < 0 || this.map.width <= x) return false;
    else if (y < 0 || this.map.height <= y) return false;
    else if (this.map.noentry[y][x]) return false;
    else return true;
  }

  public move(dx: number, dy: number): Crop {
    this.x += dx;
    this.y += dy;
    this.updateRect();
    return this.get();
  }

  public jump(x: number, y: number) {
    const range = Math.ceil(this.viewport.outer / 2);
    this.x = x;
    this.y = y;
    this.top = this.y - range;
    this.left = this.x - range;
    this.updateRect();
  }

  private updateRect() {
    const outer = this.viewport.outer;
    const inner = this.viewport.inner;
    if (this.x - this.left >= outer - inner) this.left += 1;
    else if (this.x - this.left < inner) this.left -= 1;
    if (this.y - this.top >= outer - inner) this.top += 1;
    else if (this.y - this.top < inner) this.top -= 1;
    if (this.left < 0) this.left = 0;
    else if (this.left >= this.map.width - outer) this.left = this.map.width - outer;
    if (this.top < 0) this.top = 0;
    else if (this.top >= this.map.height - outer) this.top = this.map.height - outer;
  }

  public get(): Crop {
    return {
      x: this.x,
      y: this.y,
      left: this.left,
      top: this.top
    };
  }
}
