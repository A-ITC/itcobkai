import { SkywayViewer } from "../common/RTC";
import { Action, User } from "../common/Schema";
import MapController from "./MapController";

// Viewerの肥大化を防ぐため処理部分を全てこちらに分離
export default class Controller {
  private mc = new MapController();
  private rtc = new SkywayViewer();
  private users: { [key: string]: User } = {};

  public onUpdate = (users: { [key: string]: User }) => {};

  public async start(playerId: string, canvas: HTMLCanvasElement, audio: HTMLAudioElement) {
    // 接続開始ボタン押下時の処理
    await this.rtc.init(playerId, audio);
    this.mc.init(canvas, data => this.rtc.dataTo!.write(data));

    this.rtc.dataTo!.write({ action: Action.INIT });

    this.rtc.dataFrom = (data: { action: Action; data: any }) => {
      switch (data.action) {
        case Action.ALERT:
          window.alert(data.data.text);
          if (data.data.reload) location.reload();
          break;
        case Action.JOIN:
          this.users[data.data.user.id] = data.data.user;
          this.onUpdate(this.users);
          break;
        case Action.MOVE:
          this.users[data.data.user.id].x = data.data.user.x;
          this.users[data.data.user.id].y = data.data.user.y;
          this.onUpdate(this.users);
          break;
        case Action.MUTE:
          this.users[data.data.id].mute = data.data.mute;
          this.onUpdate(this.users);
          break;
        case Action.LEAVE:
          delete this.users[data.data.user.id];
          this.onUpdate(this.users);
          break;
        case Action.INIT:
          Object.keys(data.data.users).forEach((clientId: string) => {
            const user = data.data.users[clientId];
            if (clientId === playerId) {
              this.mc.newMap(data.data.mapId).then(() => {
                this.mc.setUsers(data.data.users, playerId);
                this.onUpdate(this.users);
              });
            } else {
              this.users[data.data.user.id] = data.data.user;
            }
          });
          this.onUpdate(this.users);
          break;
      }
    };
  }

  public end() {
    //  退席ボタン押下時の処理
    this.rtc.disconnect();
  }

  public mute() {}

  // public init(id: string, profiles: { [key: string]: Profile }, message: Function) {
  //   this.prs = new Persons(id, profiles);
  //   this.message = message;
  // }

  // public initSB(canvas: HTMLCanvasElement) {
  //   this.sb = new StageBuilder(canvas);
  //   this.sb!.touchAction((xx: number, yy: number) => this.move(xx, yy));
  //   window.addEventListener("resize", () => {
  //     this.sb!.resize();
  //     this.refresh();
  //   });
  // }

  // public async newMap() {
  //   this.mc = new MapCreater(this.canvas);
  //   await this.mc.fetchMap();
  //   this.cropper = new Cropper(this.mc.map, x, y);
  // }

  // public async start(x: number, y: number) {
  //   await this.newMap();
  //   document.addEventListener("keydown", e => {
  //     if (e.key === "a") this.move(-1, 0);
  //     else if (e.key === "w") this.move(0, -1);
  //     else if (e.key === "s") this.move(0, 1);
  //     else if (e.key === "d") this.move(1, 0);
  //     else if (e.key === "ArrowLeft") this.move(-1, 0);
  //     else if (e.key === "ArrowUp") this.move(0, -1);
  //     else if (e.key === "ArrowDown") this.move(0, 1);
  //     else if (e.key === "ArrowRight") this.move(1, 0);
  //   });
  //   setInterval(() => {
  //     const now = this.cropper.get();
  //     if (now.x === this.old.x && now.y === this.old.y) return;
  //     this.message!({ action: "move", x: now.x, y: now.y });
  //     this.old = now;
  //   }, 500);
  // }

  // public getConnection(): Connection | undefined {
  //   if (!this.prs?.persons) return;
  //   const now = this.cropper.get();
  //   const { isChange, state } = this.cn.update(now.x, now.y, this.prs!.persons);
  //   if (isChange || this.isPersonChange) {
  //     this.message!({
  //       action: "audio",
  //       connect: state.connect,
  //       disconnect: state.disconnect
  //     });
  //     state.all.sort((a, b) => {
  //       const to_a = (now.x - a.x) ** 2 + (now.y - a.y) ** 2;
  //       const to_b = (now.x - b.x) ** 2 + (now.y - b.y) ** 2;
  //       return to_a - to_b;
  //     });
  //     this.isPersonChange = false;
  //     return state;
  //   }
  // }

  // public move(dx: number, dy: number) {
  //   if (this.inThrottle) return false;
  //   this.inThrottle = true;
  //   setTimeout(() => (this.inThrottle = false), 100);
  //   const { x, y, top, left } = this.cropper.get();
  //   if (!this.cropper.canMove(x + xx, y + yy)) return false;
  //   else if (!this.sb!.canMove(x + xx, y + yy)) return false;
  //   return true;
  //   this.cropper.move(dx, dy);
  //   this.refresh();
  // }

  // public join(profile: Profile, id: string, x: number, y: number) {
  //   this.isPersonChange = true;
  //   this.prs!.add(profile, id, x, y);
  //   this.refresh();
  // }

  // public leave(id: string) {
  //   this.prs!.leave(id);
  //   this.refresh();
  //   this.isPersonChange = true;
  // }

  // public refresh() {
  //   const { x, y, top, left } = this.cropper.get();
  //   this.sb!.drawEnv(left, top);
  //   const players = this.prs!.persons.filter(x => this.cn.connectings.has(x.id));
  //   const others = this.prs!.persons.filter(x => !this.cn.connectings.has(x.id));
  //   this.sb!.drawOthers(players, left, top, true);
  //   this.sb!.drawOthers(others, left, top, false);
  //   this.sb!.drawPlayer(this.prs!.player, x - left, y - top);
  //   this.sb!.drawTop(left, top);
  // }

  // public moveOther(users: { [key: string]: { x: number; y: number } }) {
  //   this.prs!.moves(users);
  //   this.refresh();
  // }

  // public mute(enabled: boolean, clientId?: string) {
  //   if (!clientId) this.message!({ action: "mute", enabled: enabled });
  //   this.prs!.mute(enabled, clientId);
  //   this.refresh();
  // }

  // public alert(text: string, reload: boolean) {
  //   this.message!({ action: "alert", reload: reload, text: text });
  // }
}
