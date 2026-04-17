import { RTCClient } from "../common/RTC";
import { GuestMessage, HostMessage } from "../common/Schema";

export default class RtcSession {
  private rtc: RTCClient;
  public onHostMessage = async (_data: HostMessage) => {};
  public onDisconnect = () => {};

  public constructor(rtc: RTCClient = new RTCClient()) {
    this.rtc = rtc;
  }

  public async connect(token: string, audio: HTMLAudioElement): Promise<void> {
    this.rtc.dataFrom = data => this.onHostMessage(data);
    this.rtc.onDisconnect = () => this.onDisconnect();
    await this.rtc.init(token, audio);
  }

  public send(data: GuestMessage): void {
    this.rtc.dataTo?.write(data);
  }

  public async setMuted(muted: boolean): Promise<void> {
    await this.rtc.mute(muted);
  }

  public async disconnect(): Promise<void> {
    await this.rtc.end();
  }
}
