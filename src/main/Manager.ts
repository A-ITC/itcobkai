import { GuestCommand, User, HostMessage, GuestMessage } from "../common/Schema";
import Controller from "../map/Controller";
import HostMessageDispatcher from "./HostMessageDispatcher";
import { browserNotifications } from "../common/Toast";
import RtcSession from "./RtcSession";
import UserStore from "./UserStore";
import { ViewportMetrics } from "../map/Viewport";

// Mainの肥大化を防ぐため処理部分を全てこちらに分離
export default class Manager {
  private ctl = new Controller();
  private rtc = new RtcSession();
  private userStore = new UserStore();
  private dispatcher: HostMessageDispatcher;
  private playerId: string = "";
  public onUpdate = (_users: { [key: string]: User }) => {};
  public onUpdateMap = (_area: boolean[][]) => {};
  public onDisconnect = () => {};

  public constructor() {
    this.userStore.subscribe(users => {
      this.onUpdate(users);
    });
    this.dispatcher = new HostMessageDispatcher({
      controller: this.ctl,
      userStore: this.userStore,
      notifications: browserNotifications,
      getPlayerId: () => this.playerId,
      onUpdateMap: area => this.onUpdateMap(area)
    });
  }

  public moveBy(dx: number, dy: number) {
    this.ctl.moveBy(dx, dy);
  }

  public onResize(viewport: ViewportMetrics) {
    this.ctl.onResize(viewport);
  }

  public init(playerId: string) {
    this.playerId = playerId;
  }

  public async start(canvas: HTMLCanvasElement, audio: HTMLAudioElement, lkToken: string) {
    // Controller と dataFrom を先に初期化する。rtc.init() 内の room.connect() が解決した
    // 直後にサーバーから INIT が届くことがあり、dataFrom が未設定だと握りつぶされるため。
    this.ctl.init(canvas, (data: GuestMessage) => {
      this.send(data);
    });
    this.rtc.onHostMessage = async (data: HostMessage) => {
      console.log(data);
      try {
        await this.dispatcher.handle(data);
      } catch (e) {
        console.error("Error handling HostMessage:", data.command, e);
      }
    };
    this.rtc.onDisconnect = () => this.onDisconnect();

    await this.rtc.connect(lkToken, audio);
  }

  private send(data: GuestMessage) {
    console.log(data);
    this.rtc.send(data);
  }

  public async end() {
    this.ctl.destroy();
    await this.rtc.disconnect();
  }

  public mute() {
    const mute = !(this.userStore.get(this.playerId)?.mute ?? false);
    if (this.userStore.has(this.playerId)) {
      this.userStore.setMuted(this.playerId, mute);
    }
    void this.rtc.setMuted(mute);
    this.send({ command: GuestCommand.MUTE, mute });
    this.ctl.refresh();
  }
}
