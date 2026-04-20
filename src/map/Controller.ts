import { GuestCommand, GuestMessage, MapRaw, User } from "../common/Schema";
import { loadImage } from "../common/ImageLoader";
import RenderQueue from "./RenderQueue";
import MapCreator from "./MapCreator";
import Cropper from "./Cropper";

export default class Controller {
  public canvas: HTMLCanvasElement = document.createElement("canvas");
  private mc = new MapCreator();
  private cropper = new Cropper(this.mc.map, 0, 0);
  private avatars: Record<string, HTMLImageElement> = {};
  private pendingAvatarLoads = new Map<string, Promise<HTMLImageElement>>();
  private renderQueue = new RenderQueue(async () => this.renderFrame());
  private message = (_data: GuestMessage) => {};
  private inThrottle = false;
  private previousPosition = { x: 0, y: 0 };
  private users: { [key: string]: User } = {};
  private player: User | undefined;

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
    this.mc = new MapCreator();
    this.avatars = {};
    this.pendingAvatarLoads = new Map();
    // canvasRef を mc に設定しておくことで、newMap前のresizeでも実canvasにサイズが反映される
    this.mc.setCanvas(canvas);
    this.cropper = new Cropper(this.mc.map, 0, 0);
    this.renderQueue = new RenderQueue(async () => this.renderFrame());
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

  public moveBy(dx: number, dy: number): boolean {
    if (this.inThrottle) return false;
    this.inThrottle = true;
    setTimeout(() => (this.inThrottle = false), 100);
    if (!this.cropper.canMove(dx, dy)) return false;
    const { x, y } = this.cropper.move(dx, dy);
    if (this.player) {
      this.player.x = x;
      this.player.y = y;
    }
    void this.refresh();
    return true;
  }

  public async refresh() {
    return this.renderQueue.schedule();
  }

  // サーバが確定した位置にCropperをジャンプ（初期配置など thisPlayerがない場合のみ）
  public jumpTo(x: number, y: number) {
    if (!this.player) {
      this.cropper.jump(x, y);
      this.refresh();
    }
  }

  public destroy() {
    delete ticker.move;
  }

  private async renderFrame() {
    const { top, left } = this.cropper.get();
    const allUsers: User[] = Object.values(this.users).filter(u => !this.player || u.h !== this.player.h);
    if (this.player) allUsers.push(this.player);
    await Promise.all(allUsers.map(user => this.ensureAvatarLoaded(user)));
    this.mc.draw(allUsers, left, top, user => this.avatars[user.h]);
  }

  private ensureAvatarLoaded(user: User): Promise<HTMLImageElement> {
    const avatarUrl = user.avatar ? `/dist/image/avatars/${user.avatar}` : "";
    const current = this.avatars[user.h];
    if (current && (!avatarUrl || current.src.endsWith(avatarUrl))) {
      return Promise.resolve(current);
    }

    const loadKey = `${user.h}:${avatarUrl}`;
    const pending = this.pendingAvatarLoads.get(loadKey);
    if (pending) {
      return pending;
    }

    const image = new Image();
    const load = loadImage("avatars", user.avatar, image).then(loaded => {
      this.avatars[user.h] = loaded;
      this.pendingAvatarLoads.delete(loadKey);
      return loaded;
    });

    this.pendingAvatarLoads.set(loadKey, load);
    return load;
  }
}

const tickerFuncs: { [key: string]: () => void } = {};
setInterval(() => Object.values(tickerFuncs).forEach(f => f()), 1000);

const ticker = new Proxy(tickerFuncs, {
  set(target, key: string, value: () => void) {
    target[key] = value;
    return true;
  },
  deleteProperty(target, key: string) {
    delete target[key];
    return true;
  }
});
