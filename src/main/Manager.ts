import { HostCommand, GuestCommand, User, HostMessage, GuestMessage } from "../common/Schema";
import { RTCClient } from "../common/RTC";
import Controller from "./Controller";
import request from "../common/Common";
import Toastify from "toastify-js";
import "toastify-js/src/toastify.css";

// Mainの肥大化を防ぐため処理部分を全てこちらに分離
export default class Manager {
  private mc = new Controller();
  private rtc = new RTCClient();
  private users: { [key: string]: User } = {};
  private playerId: string = "";
  public onUpdate = (_users: { [key: string]: User }) => {};
  public onUpdateMap = (_area: boolean[][]) => {};
  public onDisconnect = () => {};

  public onKeyDown(e: KeyboardEvent) {
    this.mc.onKeyDown(e);
  }

  public onResize() {
    this.mc.onResize();
  }

  public init(playerId: string) {
    this.playerId = playerId;
  }

  public async start(canvas: HTMLCanvasElement, audio: HTMLAudioElement, lkToken: string) {
    // Controller と dataFrom を先に初期化する。rtc.init() 内の room.connect() が解決した
    // 直後にサーバーから INIT が届くことがあり、dataFrom が未設定だと握りつぶされるため。
    this.mc.init(canvas, (data: GuestMessage) => {
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
          Toastify({ text: `${data.user.name} が参加しました`, duration: 3000 }).showToast();
          break;
        case HostCommand.MOVED:
          for (const move of data.moves) {
            if (!this.users[move.h]) {
              await this.fetchUser(move.h);
            }
            if (this.users[move.h]) {
              this.users[move.h].x = move.x;
              this.users[move.h].y = move.y;
            }
            if (move.h === this.playerId) {
              this.mc.jumpTo(move.x, move.y);
            }
          }
          this.mc.setUsers(this.users);
          break;
        case HostCommand.UPDATED:
          this.users[data.user.h] = data.user;
          this.mc.setUsers(this.users);
          break;
        case HostCommand.LEFT: {
          const leftName = this.users[data.h]?.name ?? data.h;
          delete this.users[data.h];
          this.mc.setUsers(this.users);
          Toastify({ text: `${leftName} が退出しました`, duration: 3000 }).showToast();
          break;
        }
        case HostCommand.MUTED:
          if (!this.users[data.h]) {
            await this.fetchUser(data.h);
          }
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
          this.onUpdateMap(data.map.red.split(",").map(row => row.split("").map(c => c === "1")));
          break;
        }
        case HostCommand.NEWMAP: {
          await this.mc.newMap(data.map);
          this.mc.setUsers(this.users, this.playerId);
          this.onUpdateMap(data.map.red.split(",").map(row => row.split("").map(c => c === "1")));
          break;
        }
      }
      this.onUpdate(this.users);
    };

    await this.rtc.init(lkToken, audio);
    this.rtc.onDisconnect = () => this.onDisconnect();
  }

  private send(data: GuestMessage) {
    console.log(data);
    this.rtc.dataTo?.write(data);
  }

  private async fetchUser(h: string): Promise<void> {
    const user = await request("GET", `/users/${h}`);
    if (user) {
      this.users[h] = user;
    }
  }

  public end() {
    this.rtc.end();
  }

  public mute() {
    const mute = !(this.users[this.playerId]?.mute ?? false);
    if (this.users[this.playerId]) {
      this.users[this.playerId] = { ...this.users[this.playerId], mute };
    }
    this.rtc.mute(mute);
    this.send({ command: GuestCommand.MUTE, mute });
    this.onUpdate(this.users);
    this.mc.refresh();
  }
}
