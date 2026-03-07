import { HostCommand, GuestCommand, User, HostMessage, GuestMessage } from "../common/Schema";
import { SkywayViewer } from "../common/RTC";
import Controller from "./Controller";

// Viewerの肥大化を防ぐため処理部分を全てこちらに分離
export default class Manager {
  private mc = new Controller();
  private rtc = new SkywayViewer();
  private users: { [key: string]: User } = {};
  private playerId: string = "";
  public onUpdate = (_users: { [key: string]: User }) => {};

  public onKeyDown(e: KeyboardEvent) {
    this.mc.onKeyDown(e);
  }

  public onResize(e: UIEvent) {
    this.mc.onResize(e);
  }

  public init(playerId: string, users: { [key: string]: User }) {
    this.playerId = playerId;
    this.mc.setUsers(users, playerId);
  }

  public async start(canvas: HTMLCanvasElement, audio: HTMLAudioElement) {
    // 接続開始ボタン押下時の処理
    await this.rtc.init(this.playerId, audio);
    this.mc.init(canvas, (data: GuestMessage) => this.send(data));

    // this.rtc.dataTo!.write({ command: GuestCommand.INIT });

    this.rtc.dataFrom = async (data: HostMessage) => {
      switch (data.command) {
        case HostCommand.ALERT:
          window.alert(data.text);
          if (data.reload) location.reload();
          break;
        case HostCommand.JOIN:
          this.users[data.user.hash] = data.user;
          break;
        case HostCommand.MOVE:
          data.moves.forEach(move => {
            this.users[move.h].x = move.x;
            this.users[move.h].y = move.y;
          });
          break;
        case HostCommand.UPDATE:
          this.users[data.h] = data.user;
          break;
        case HostCommand.LEAVE:
          delete this.users[data.h];
          break;
        case HostCommand.INIT:
          for (const [hash, user] of Object.entries(data.users)) {
            if (hash === this.playerId) {
              await this.mc.newMap(data.map);
              this.mc.setUsers(data.users, this.playerId);
            } else {
              this.users[hash] = user;
            }
          }
          break;
        case HostCommand.NEWMAP:
          for (const move of data.moves) {
            this.users[move.h].x = move.x;
            this.users[move.h].y = move.y;
          }
          await this.mc.newMap(data.map);
          this.mc.setUsers(this.users, this.playerId);
          break;
      }
      this.onUpdate(this.users);
    };
  }

  private send(data: GuestMessage) {
    this.rtc.dataTo!.write(data);
  }

  public end() {
    //  退席ボタン押下時の処理
    this.rtc.end();
  }

  public mute() {
    const mute = !this.users[this.playerId].mute!;
    this.users[this.playerId].mute = mute;
    this.rtc.mute(mute);
    this.send({ command: GuestCommand.MUTE, mute });
  }
}
