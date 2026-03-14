import { HostCommand, GuestCommand, User, HostMessage, GuestMessage } from "../common/Schema";
import { SkywayMaster } from "../common/RTC";
import Mapper from "./Mapper";
import { request, ticker } from "../common/Common";
import Mixer from "./Mixer";

export default class Manager {
  private rtc = new SkywayMaster();
  private users: { [key: string]: User } = {};
  private mapper?: Mapper;
  private mixer = new Mixer();
  public onUpdate?: (users: { [key: string]: User }) => void;

  public init(playerId: string, users: { [key: string]: User }) {
    this.rtc.onAdd = async (hash, source, dest) => {
      this.mixer.addUser(hash, source, dest);
      // const audioTo = this.rtc.audioTo[hash];
      // audioTo.play().catch(console.error);
      if (!this.users[hash]) {
        const res = await request("GET", "/api/master");
        this.users[hash] = res.user;
      }
      this.rtc.dataTo[hash].write({ command: HostCommand.INIT, users: this.users, map: this.mapper!.getRaw() });
      this.sendAll({ command: HostCommand.JOIN, user: this.users[hash] });
    };

    this.rtc.onDisconnect = (hash: string) => {
      this.mixer.removeUser(hash);
      this.sendAll({ command: HostCommand.LEAVE, h: hash });
    };

    ticker.move = () => {
      const { moves, connects, disconnects } = this.mapper!.lastUpdated();
      this.mixer.update(connects, disconnects);
      this.sendAll({ command: HostCommand.MOVE, moves });
    };
  }

  public async start() {
    // 接続開始ボタン押下時の処理
    await this.rtc.init();
    this.rtc.dataFrom = (hash: string, data: GuestMessage) => {
      switch (data.command) {
        case GuestCommand.MOVE:
          this.mapper!.move(hash, data.x, data.y);
          break;
        case GuestCommand.MUTE:
          this.mixer.mute(hash, data.mute);
          this.users[hash].mute = data.mute;
          this.sendAll({ command: HostCommand.UPDATE, h: hash, user: this.users[hash] });
          break;
        case GuestCommand.UPDATE:
          data.user.x = data.user.y = -1;
          this.users[hash] = data.user;
          this.sendAll({ command: HostCommand.UPDATE, h: hash, user: data.user });
          break;
      }
    };
  }

  public sendAlert(text: string, reload: boolean) {
    this.sendAll({ command: HostCommand.ALERT, text, reload });
  }

  public sendMessage(text: string) {
    this.sendAll({ command: HostCommand.MESSAGE, text });
  }

  private sendAll(data: HostMessage) {
    for (const dataTo of Object.values(this.rtc.dataTo)) {
      dataTo.write(data);
    }
  }
}
