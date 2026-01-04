import { storage } from "../common/Common";
import { Map } from "../common/Schema";

export interface Crop {
  x: number;
  y: number;
  top: number;
  left: number;
}

// プレイヤーの存在するマス周辺を切り出すクラス
// プレイヤーの座標情報はこのクラスで管理
export default class Cropper {
  private left = 0;
  private top = 0;
  private x = 0;
  private y = 0;
  private map: Map;

  constructor(map: Map, x: number, y: number) {
    this.map = map;
    this.jump(x, y);
  }

  public canMove(x: number, y: number) {
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
    const range = Math.ceil(storage.outer / 2);
    this.x = x;
    this.y = y;
    this.top = this.y - range;
    this.left = this.x - range;
    this.updateRect();
  }

  private updateRect() {
    if (this.x - this.left >= storage.outer - storage.inner) this.left += 1;
    else if (this.x - this.left < storage.inner) this.left -= 1;
    if (this.y - this.top >= storage.outer - storage.inner) this.top += 1;
    else if (this.y - this.top < storage.inner) this.top -= 1;
    if (this.left < 0) this.left = 0;
    else if (this.left >= this.map.width - storage.outer) this.left = this.map.width - storage.outer;
    if (this.top < 0) this.top = 0;
    else if (this.top >= this.map.height - storage.outer) this.top = this.map.height - storage.outer;
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
