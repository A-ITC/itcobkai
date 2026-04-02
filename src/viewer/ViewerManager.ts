import { HostCommand, GuestCommand, User, HostMessage, GuestMessage } from "../common/Schema";
import { RTCClient } from "../common/RTC";
import Controller from "./Controller";

// Viewerの肥大化を防ぐため処理部分を全てこちらに分離
export default class Manager {
  private mc = new Controller();
  private rtc = new RTCClient();
  private users: { [key: string]: User } = {};
  private playerId: string = "";
  public onUpdate = (_users: { [key: string]: User }) => {};
  public onDisconnect = () => {};

  public onKeyDown(e: KeyboardEvent) {
    this.mc.onKeyDown(e);
  }

  public onResize(e: UIEvent) {
    this.mc.onResize(e);
  }

  public init(playerId: string) {
    this.playerId = playerId;
  }

  public async start(canvas: HTMLCanvasElement, audio: HTMLAudioElement, lkToken: string) {
    await this.rtc.init(lkToken, audio);
    this.rtc.onDisconnect = () => this.onDisconnect();
    this.mc.init(canvas, (data: GuestMessage) => {
      console.log(data);
      this.send(data);
    });

    this.rtc.dataFrom = async (data: HostMessage) => {
      console.log(data);
      switch (data.command) {
        case HostCommand.ALERT:
          window.alert(data.text);
          if (data.reload) location.reload();
          break;
        case HostCommand.JOINED:
          this.users[data.user.h] = data.user;
          this.mc.setUsers(this.users);
          break;
        case HostCommand.MOVED:
          data.moves.forEach(move => {
            if (this.users[move.h]) {
              this.users[move.h].x = move.x;
              this.users[move.h].y = move.y;
            }
            if (move.h === this.playerId) {
              this.mc.jumpTo(move.x, move.y);
            }
          });
          this.mc.setUsers(this.users);
          break;
        case HostCommand.UPDATED:
          this.users[data.user.h] = data.user;
          this.mc.setUsers(this.users);
          break;
        case HostCommand.LEFT:
          delete this.users[data.h];
          this.mc.setUsers(this.users);
          break;
        case HostCommand.MUTED:
          if (this.users[data.h]) {
            this.users[data.h].mute = data.mute;
            this.mc.setUsers(this.users);
          }
          break;
        case HostCommand.INIT: {
          const usersMap: { [key: string]: User } = {};
          for (const user of data.users) {
            usersMap[user.h] = user;
          }
          this.users = usersMap;
          await this.mc.newMap(data.map);
          this.mc.setUsers(this.users, this.playerId);
          break;
        }
        case HostCommand.NEWMAP:
          await this.mc.newMap(data.map);
          this.mc.setUsers(this.users, this.playerId);
          break;
      }
      this.onUpdate(this.users);
    };
  }

  private send(data: GuestMessage) {
    this.rtc.dataTo?.write(data);
  }

  public end() {
    this.rtc.end();
  }

  public mute() {
    const mute = !(this.users[this.playerId]?.mute ?? false);
    if (this.users[this.playerId]) {
      this.users[this.playerId].mute = mute;
    }
    this.rtc.mute(mute);
    this.send({ command: GuestCommand.MUTE, mute });
  }
}
