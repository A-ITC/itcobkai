import { Map, MapRaw, User } from "../common/Schema";
import { loadImage } from "../common/ImageLoader";
import { ViewportMetrics } from "./Viewport";

// Canvasにマップや人物を描画するクラス
export default class MapCreator {
  private canvas = document.createElement("canvas");
  private ctx: CanvasRenderingContext2D;
  private viewport: ViewportMetrics;
  public map: Map = { area: [], noentry: [], topImage: new Image(), bottomImage: new Image(), width: 0, height: 0 };

  constructor(viewport: ViewportMetrics) {
    this.ctx = this.canvas.getContext("2d")!;
    this.viewport = viewport;
  }

  public setViewport(viewport: ViewportMetrics) {
    this.viewport = viewport;
  }

  public setCanvas(canvas: HTMLCanvasElement) {
    // canvas を差し替える（init 直後に canvasRef をセットするために使用）
    this.canvas = canvas;
    this.ctx = this.canvas.getContext("2d")!;
    this.resize();
  }

  public async newMap(mapraw: MapRaw) {
    // 新しいマップを作成
    this.resize();
    this.map = await this.loadMap(mapraw);
  }

  public draw(users: User[], left: number, top: number, getAvatar: (user: User) => HTMLImageElement | undefined) {
    // 描画
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawBottom(left, top);
    this.drawUsers(users, left, top, getAvatar);
    this.drawTop(left, top);
  }

  private async loadMap(mapraw: MapRaw) {
    // マップ情報を取得
    const red = mapraw.red.split(",").map(row => row.split("").map(char => char === "1"));
    const black = mapraw.black.split(",").map(row => row.split("").map(char => char === "1"));
    const map: Map = {
      area: red,
      noentry: black,
      topImage: new Image(),
      bottomImage: new Image(),
      width: red[0].length,
      height: red.length
    };
    await Promise.all([loadImage("maps", mapraw.top, map.topImage), loadImage("maps", mapraw.bottom, map.bottomImage)]);
    return map;
  }

  private drawUsers(users: User[], left: number, top: number, getAvatar: (user: User) => HTMLImageElement | undefined) {
    const outer = this.viewport.outer;
    for (const user of users) {
      const i = user.x - left;
      const j = user.y - top;
      if (i < 0 || outer <= i) continue;
      if (j < 0 || outer <= j) continue;
      this.drawUser(user, i, j, getAvatar(user));
    }
  }

  private drawUser(user: User, i: number, j: number, avatar: HTMLImageElement | undefined) {
    const grid = this.canvas.width / this.viewport.outer;
    if (!avatar) return;
    this.ctx.beginPath();
    this.ctx.arc(i * grid + grid / 2, j * grid + grid / 2, grid / 2, 0, Math.PI * 2, false);
    this.ctx.save();
    this.ctx.clip();
    this.ctx.drawImage(avatar, i * grid, j * grid, grid, grid);
    if (user.mute) {
      this.ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      this.ctx.fillRect(i * grid, j * grid, grid, grid);
    }
    this.ctx.restore();
  }

  private drawTop(left: number, top: number) {
    const imgGrid = this.map.topImage.width / this.map.width;
    const outer = this.viewport.outer;
    this.ctx.drawImage(
      this.map.topImage,
      imgGrid * left,
      imgGrid * top,
      imgGrid * outer,
      imgGrid * outer,
      0,
      0,
      this.canvas.width,
      this.canvas.height
    );
    this.drawGrid();
  }

  private drawBottom(left: number, top: number) {
    const imgGrid = this.map.bottomImage.width / this.map.width;
    const outer = this.viewport.outer;
    this.ctx.drawImage(
      this.map.bottomImage,
      imgGrid * left,
      imgGrid * top,
      imgGrid * outer,
      imgGrid * outer,
      0,
      0,
      this.canvas.width,
      this.canvas.height
    );
  }

  private drawGrid() {
    this.ctx.strokeStyle = "rgba(200,200,200,0.2)";
    let grid = this.canvas.width / this.viewport.outer;
    for (let i = 0; i <= this.canvas.height / grid; ++i) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, grid * i);
      this.ctx.lineTo(this.canvas.width, grid * i);
      this.ctx.closePath();
      this.ctx.stroke();
    }
    for (let i = 0; i <= this.canvas.width / grid; ++i) {
      this.ctx.beginPath();
      this.ctx.moveTo(grid * i, 0);
      this.ctx.lineTo(grid * i, this.canvas.height);
      this.ctx.closePath();
      this.ctx.stroke();
    }
  }

  public resize(size: number = this.viewport.size) {
    if (this.canvas.width !== size) this.canvas.width = size;
    if (this.canvas.height !== size) this.canvas.height = size;
  }
}
