import { Action, MapRaw, User } from "../common/Schema";
import MapCreater from "./MapCreater";
import Cropper from "./Cropper";

export default class MapController {
  public canvas: HTMLCanvasElement = document.createElement("canvas");
  private mc = new MapCreater();
  private cropper = new Cropper(this.mc.map, 0, 0);
  private message = (data: any) => {};
  private inThrottle = false;
  private resizeHandler?: () => void;
  private keydownHandler?: (e: KeyboardEvent) => void;
  private moveIntervalId = 0;
  private previousPosition = { x: 0, y: 0 };
  private users: { [key: string]: User } = {};
  private player: User | undefined;

  public init(canvas: HTMLCanvasElement, message: (data: any) => void) {
    // 初期化処理
    if (this.resizeHandler && this.keydownHandler) {
      // 以前のイベントリスナーを削除
      this.canvas.removeEventListener("resize", this.resizeHandler);
      this.canvas.removeEventListener("keydown", this.keydownHandler);
      clearInterval(this.moveIntervalId);
    }
    this.message = message;
    this.canvas = canvas;
    this.mc = new MapCreater();
    this.cropper = new Cropper(this.mc.map, 0, 0);

    this.resizeHandler = () => {
      this.mc.resize();
      this.refresh();
    };

    this.keydownHandler = (e: KeyboardEvent) => {
      if (e.key === "a" || e.key === "ArrowLeft") this.move(-1, 0);
      else if (e.key === "w" || e.key === "ArrowUp") this.move(0, -1);
      else if (e.key === "s" || e.key === "ArrowDown") this.move(0, 1);
      else if (e.key === "d" || e.key === "ArrowRight") this.move(1, 0);
    };

    this.moveIntervalId = window.setInterval(() => {
      // 位置が変わっていたらサーバーに送信
      const now = this.cropper.get();
      if (now.x === this.previousPosition.x && now.y === this.previousPosition.y) return;
      this.message({ action: Action.MOVE, x: now.x, y: now.y });
      this.previousPosition = now;
    }, 500);

    this.canvas.addEventListener("resize", this.resizeHandler);
    this.canvas.addEventListener("keydown", this.keydownHandler);
  }

  public async newMap(mapraw: MapRaw) {
    // 新しいマップを作成
    await this.mc.newMap(mapraw, this.canvas);
  }

  public setUsers(users: { [key: string]: User }, playerId?: string) {
    this.users = users;
    if (playerId) this.player = users[playerId];
    this.refresh();
  }

  private move(dx: number, dy: number) {
    if (this.inThrottle) return false;
    this.inThrottle = true;
    setTimeout(() => (this.inThrottle = false), 100);
    if (!this.cropper.canMove(dx, dy)) return false;
    const { x, y } = this.cropper.move(dx, dy);
    this.player!.x = x;
    this.player!.y = y;
    this.refresh();
  }

  public refresh() {
    const { top, left } = this.cropper.get();
    this.mc.draw([...Object.values(this.users), this.player!], left, top);
  }
}
