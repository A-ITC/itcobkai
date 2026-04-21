import { GuestCommand, GuestMessage, MapRaw, User } from "../common/Schema";
import { loadImage } from "../common/ImageLoader";
import RenderQueue from "./RenderQueue";
import MapCreator from "./MapCreator";
import Cropper from "./Cropper";
import TouchMoveController from "./TouchMoveController";
import { DEFAULT_VIEWPORT_METRICS, ViewportMetrics } from "./Viewport";

export default class Controller {
  public canvas: HTMLCanvasElement = document.createElement("canvas");
  private viewport = DEFAULT_VIEWPORT_METRICS;
  private mc = new MapCreator(this.viewport);
  private cropper = new Cropper(this.mc.map, 0, 0, this.viewport);
  private avatars: Record<string, HTMLImageElement> = {};
  private pendingAvatarLoads = new Map<string, Promise<HTMLImageElement>>();
  private renderQueue = new RenderQueue(async () => this.renderFrame());
  private message = (_data: GuestMessage) => {};
  private inThrottle = false;
  private previousPosition = { x: 0, y: 0 };
  private users: { [key: string]: User } = {};
  private player: User | undefined;
  private moveTickerId: number | undefined;
  private readonly onPointerDown = (event: PointerEvent) => {
    if (!this.isTouchPointer(event.pointerType)) return;
    const point = this.toCanvasPoint(this.canvas, event);
    if (!this.touchMoveController.start(event.pointerId, point)) return;
    event.preventDefault();
    this.canvas.setPointerCapture?.(event.pointerId);
  };
  private readonly onPointerMove = (event: PointerEvent) => {
    if (!this.isTouchPointer(event.pointerType)) return;
    const point = this.toCanvasPoint(this.canvas, event);
    if (!this.touchMoveController.update(event.pointerId, point)) return;
    event.preventDefault();
  };
  private readonly onPointerUp = (event: PointerEvent) => {
    this.finishPointer(event);
  };
  private readonly onPointerCancel = (event: PointerEvent) => {
    this.finishPointer(event);
  };
  private touchMoveController = new TouchMoveController(
    (dx: number, dy: number) => this.moveBy(dx, dy),
    () => void this.refresh(),
    100,
    18,
    this.viewport.size / this.viewport.outer
  );

  public onResize(viewport: ViewportMetrics = this.viewport) {
    this.viewport = viewport;
    this.mc.setViewport(viewport);
    this.mc.resize(viewport.size);
    this.cropper.setViewport(viewport);
    this.touchMoveController.setTileSize(this.getTileSize(viewport));
    this.refresh();
  }

  public init(canvas: HTMLCanvasElement, message: (data: any) => void) {
    // 初期化処理
    this.message = message;
    this.detachPointerListeners();
    this.canvas = canvas;
    this.mc = new MapCreator(this.viewport);
    this.avatars = {};
    this.pendingAvatarLoads = new Map();
    // canvasRef を mc に設定しておくことで、newMap前のresizeでも実canvasにサイズが反映される
    this.mc.setCanvas(canvas);
    this.cropper = new Cropper(this.mc.map, 0, 0, this.viewport);
    this.renderQueue = new RenderQueue(async () => this.renderFrame());
    this.touchMoveController.setTileSize(this.getTileSize());
    this.attachPointerListeners();
    if (this.moveTickerId !== undefined) {
      window.clearInterval(this.moveTickerId);
    }
    this.moveTickerId = window.setInterval(() => {
      // 位置が変わっていたらサーバーに送信
      const now = this.cropper.get();
      if (now.x === this.previousPosition.x && now.y === this.previousPosition.y) return;
      this.message({ command: GuestCommand.MOVE, x: now.x, y: now.y });
      this.previousPosition = now;
    }, 1000);
  }

  public async newMap(mapraw: MapRaw) {
    // 新しいマップを作成
    await this.mc.newMap(mapraw);
    // マップ差し替え後に Cropper を新しいマップで再初期化
    this.cropper = new Cropper(this.mc.map, this.cropper.get().x, this.cropper.get().y, this.viewport);
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
    this.detachPointerListeners();
    this.touchMoveController.destroy();
    if (this.moveTickerId !== undefined) {
      window.clearInterval(this.moveTickerId);
      this.moveTickerId = undefined;
    }
  }

  private async renderFrame() {
    const { top, left } = this.cropper.get();
    const allUsers: User[] = Object.values(this.users).filter(u => !this.player || u.h !== this.player.h);
    if (this.player) allUsers.push(this.player);
    await Promise.all(allUsers.map(user => this.ensureAvatarLoaded(user)));
    this.mc.draw(allUsers, left, top, user => this.avatars[user.h]);
    const ctx = this.canvas.getContext("2d");
    if (ctx) {
      this.touchMoveController.draw(ctx);
    }
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

  private finishPointer(event: PointerEvent) {
    const handled = this.touchMoveController.end(event.pointerId);
    if (!handled) return;
    event.preventDefault();
    this.canvas.releasePointerCapture?.(event.pointerId);
  }

  private isTouchPointer(pointerType: string) {
    return pointerType === "touch" || pointerType === "pen";
  }

  private toCanvasPoint(canvas: HTMLCanvasElement, event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  private attachPointerListeners() {
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerCancel);
  }

  private detachPointerListeners() {
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerCancel);
  }

  private getTileSize(viewport: ViewportMetrics = this.viewport) {
    return viewport.size / viewport.outer;
  }
}
