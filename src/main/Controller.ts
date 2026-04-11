import { GuestCommand, MapRaw, User } from "../common/Schema";
import { ticker } from "../common/Common";
import MapCreater from "./MapCreator";
import Cropper from "./Cropper";

export default class Controller {
  public canvas: HTMLCanvasElement = document.createElement("canvas");
  private mc = new MapCreater();
  private cropper = new Cropper(this.mc.map, 0, 0);
  private message = (data: any) => {};
  private inThrottle = false;
  private previousPosition = { x: 0, y: 0 };
  private users: { [key: string]: User } = {};
  private player: User | undefined;
  private drawing = false;
  private drawQueued = false;

  public onKeyDown(e: KeyboardEvent) {
    if (e.key === "a" || e.key === "ArrowLeft") this.move(-1, 0);
    else if (e.key === "w" || e.key === "ArrowUp") this.move(0, -1);
    else if (e.key === "s" || e.key === "ArrowDown") this.move(0, 1);
    else if (e.key === "d" || e.key === "ArrowRight") this.move(1, 0);
  }

  public onResize() {
    this.mc.resize();
    const { x, y } = this.cropper.get();
    this.cropper.jump(x, y);
    this.refresh();
  }

  public init(canvas: HTMLCanvasElement, message: (data: any) => void) {
    // 初期化処理
    this.message = message;
    this.canvas = canvas;
    this.mc = new MapCreater();
    // canvasRef を mc に設定しておくことで、newMap前のresizeでも実canvasにサイズが反映される
    this.mc.setCanvas(canvas);
    this.cropper = new Cropper(this.mc.map, 0, 0);
    ticker.move = () => {
      // 位置が変わっていたらサーバーに送信
      const now = this.cropper.get();
      if (now.x === this.previousPosition.x && now.y === this.previousPosition.y) return;
      this.message({ command: GuestCommand.MOVE, x: now.x, y: now.y });
      this.previousPosition = now;
    };
  }

  public async newMap(mapraw: MapRaw) {
    // 新しいマップを作成
    await this.mc.newMap(mapraw, this.canvas);
    // マップ差し替え後に Cropper を新しいマップで再初期化
    this.cropper = new Cropper(this.mc.map, this.cropper.get().x, this.cropper.get().y);
  }

  public setUsers(users: { [key: string]: User }, playerId?: string) {
    this.users = users;
    if (playerId) {
      this.player = users[playerId];
      if (this.player) {
        this.cropper.jump(this.player.x, this.player.y);
      }
    }
    this.refresh();
  }

  private move(dx: number, dy: number) {
    if (this.inThrottle) return false;
    this.inThrottle = true;
    setTimeout(() => (this.inThrottle = false), 100);
    if (!this.cropper.canMove(dx, dy)) return false;
    const { x, y } = this.cropper.move(dx, dy);
    if (this.player) {
      this.player.x = x;
      this.player.y = y;
    }
    this.refresh();
  }

  public async refresh() {
    if (this.drawing) {
      this.drawQueued = true;
      return;
    }
    this.drawing = true;
    do {
      this.drawQueued = false;
      const { top, left } = this.cropper.get();
      const allUsers: User[] = [...Object.values(this.users)];
      if (this.player) allUsers.push(this.player);
      await this.mc.draw(allUsers, left, top);
    } while (this.drawQueued);
    this.drawing = false;
  }

  // サーバが確定した位置にCropperをジャンプ（初期配置など thisPlayerがない場合のみ）
  public jumpTo(x: number, y: number) {
    if (!this.player) {
      this.cropper.jump(x, y);
      this.refresh();
    }
  }
}
