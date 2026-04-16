import { Map, MapRaw, User } from "../common/Schema";
import { IMAGE_URL, loadImage, storage } from "../common/Common";

// Canvasにマップや人物を描画するクラス
export default class MapCreator {
  private canvas = document.createElement("canvas");
  private ctx: CanvasRenderingContext2D;
  public map: Map = { area: [], noentry: [], topImage: new Image(), bottomImage: new Image(), width: 0, height: 0 };
  public avatars: { [key: string]: HTMLImageElement } = {};

  constructor() {
    this.ctx = this.canvas.getContext("2d")!;
    // コンストラクタ時点では this.canvas はダミー要素のため storage だけ更新する
    MapCreator.updateStorage();
  }

  /** canvas を差し替える（init 直後に canvasRef をセットするために使用） */
  public setCanvas(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = this.canvas.getContext("2d")!;
    this.resize();
  }

  public async newMap(mapraw: MapRaw, canvas: HTMLCanvasElement) {
    // 新しいマップを作成
    this.canvas = canvas;
    this.ctx = this.canvas.getContext("2d")!;
    this.resize();
    this.map = await this.loadMap(mapraw);
  }

  public async preloadAvatars(users: User[]): Promise<void> {
    await Promise.all(
      users.map(async user => {
        const avatarUrl = user.avatar ? `${IMAGE_URL}/${user.avatar}` : "";
        if (!this.avatars[user.h] || (!!avatarUrl && !this.avatars[user.h].src.endsWith(avatarUrl))) {
          const img = new Image();
          await loadImage(avatarUrl, img);
          this.avatars[user.h] = img;
        }
      })
    );
  }

  public draw(users: User[], left: number, top: number) {
    // 描画
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawBottom(left, top);
    this.drawUsers(users, left, top);
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
    await Promise.all([
      loadImage(`${IMAGE_URL}/${mapraw.top}`, map.topImage),
      loadImage(`${IMAGE_URL}/${mapraw.bottom}`, map.bottomImage)
    ]);
    return map;
  }

  private drawUsers(users: User[], left: number, top: number) {
    for (const user of users) {
      const i = user.x - left;
      const j = user.y - top;
      if (i < 0 || storage.outer <= i) continue;
      if (j < 0 || storage.outer <= j) continue;
      this.drawUser(user, i, j);
    }
  }

  private drawUser(user: User, i: number, j: number) {
    const grid = this.canvas.width / storage.outer;
    const avatarUrl = user.avatar ? `${IMAGE_URL}/${user.avatar}` : "";
    const avatar = this.avatars[user.h];
    if (!avatar || (!!avatarUrl && !avatar.src.endsWith(avatarUrl))) return; // 未キャッシュはスキップ（preloadAvatars済みなら発生しない）
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
    this.ctx.drawImage(
      this.map.topImage,
      imgGrid * left,
      imgGrid * top,
      imgGrid * storage.outer,
      imgGrid * storage.outer,
      0,
      0,
      this.canvas.width,
      this.canvas.height
    );
    this.drawGrid();
  }

  private drawBottom(left: number, top: number) {
    const imgGrid = this.map.bottomImage.width / this.map.width;
    this.ctx.drawImage(
      this.map.bottomImage,
      imgGrid * left,
      imgGrid * top,
      imgGrid * storage.outer,
      imgGrid * storage.outer,
      0,
      0,
      this.canvas.width,
      this.canvas.height
    );
  }

  private drawGrid() {
    this.ctx.strokeStyle = "rgba(200,200,200,0.2)";
    let grid = this.canvas.width / storage.outer;
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

  /** ウィンドウサイズから canvas の一辺サイズを計算し storage を更新して返す */
  public static updateStorage(): number {
    const portrait = window.matchMedia("(orientation: portrait)").matches;
    // Portrait : 外側 p-0(0px)  + canvas 側 p-6(48px)                           =  48px
    // Landscape: 外側 p-4(32px) + canvas 側 p-6(48px) + VoicePanel w-72(288px) = 368px
    const maxWidth = portrait ? window.innerWidth - 48 : window.innerWidth - 368;
    // Portrait : 外側 p-0 + canvas 側 p-6(48px) + ヘッダー(~52px) + VoicePanel(~297px) = 397px
    // Landscape: 外側 p-4(32px) + canvas 側 p-6(48px) + ヘッダー(~48px)                = 128px
    const maxHeight = portrait ? window.innerHeight - 397 : window.innerHeight - 128;
    const size = Math.max(120, Math.min(maxWidth, maxHeight));
    // Portrait: マス目を1段階大きく（outer を小さく = 1マスあたりのピクセルが大きくなる）
    storage.outer = portrait
      ? Math.max(4, Math.min(10, Math.round(size / 48)))
      : Math.max(8, Math.min(20, Math.round(size / 40)));
    storage.inner = Math.max(1, Math.floor(storage.outer / 3));
    return size;
  }

  public resize() {
    const size = MapCreator.updateStorage();
    if (this.canvas.width !== size) this.canvas.width = size;
    if (this.canvas.height !== size) this.canvas.height = size;
  }

  public touchAction(move: Function) {
    let touching = false;
    let direction = [0, 0];

    function touched(e: TouchEvent) {
      touching = false;
      if (!e.target) return;
      const dom = e.target as HTMLElement;
      if (dom.dataset.id !== "map") return;
      e.preventDefault();
      touching = true;
      const rect = dom.getClientRects()[0];
      const client = e.changedTouches[0];
      const x = client.clientX - (rect.right + rect.left) / 2;
      const y = client.clientY - (rect.bottom + rect.top) / 2;
      if (Math.abs(x) <= y)
        direction = [0, 1]; // 下
      else if (Math.abs(y) <= x)
        direction = [1, 0]; // 右
      else if (Math.abs(x) <= -y)
        direction = [0, -1]; // 上
      else if (Math.abs(y) <= -x) direction = [-1, 0]; // 左
    }

    setInterval(() => {
      if (touching) move(...direction);
    }, 100);
    window.addEventListener("touchstart", e => touched(e));
    window.addEventListener("touchmove", e => touched(e));
    window.addEventListener("touchend", () => (touching = false));
    this.canvas.oncontextmenu = function (e) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    };
  }
}
