import {
  Room,
  RoomEvent,
  RemoteTrack,
  RemoteTrackPublication,
  RemoteParticipant,
  Track,
  DataPacket_Kind
} from "livekit-client";
import { HostMessage, GuestMessage } from "./Schema";
import { beep } from "./Common";

export class RTCClient {
  private room: Room | null = null;
  public dataFrom?: (data: HostMessage) => Promise<void>;
  public dataTo?: { write: (data: GuestMessage) => void };
  public onDisconnect?: () => void;

  public async init(token: string, _audio: HTMLAudioElement) {
    beep();

    this.room = new Room({
      adaptiveStream: true,
      dynacast: true
    });

    this.room.on(
      RoomEvent.TrackSubscribed,
      (track: RemoteTrack, _publication: RemoteTrackPublication, _participant: RemoteParticipant) => {
        if (track.kind === Track.Kind.Audio) {
          const element = track.attach();
          document.body.appendChild(element);
        }
      }
    );

    this.room.on(
      RoomEvent.DataReceived,
      (payload: Uint8Array, _participant?: RemoteParticipant, _kind?: DataPacket_Kind, _topic?: string) => {
        try {
          const data: HostMessage = JSON.parse(new TextDecoder().decode(payload));
          this.dataFrom?.(data)?.catch(e => console.error("dataFrom error:", e));
        } catch (e) {
          console.error("Failed to parse RTC data:", e);
        }
      }
    );

    this.room.on(RoomEvent.Disconnected, () => {
      this.dataTo = undefined;
      this.onDisconnect?.();
    });

    await this.room.connect(`wss://${location.hostname}`, token);
    await this.room.localParticipant.setMicrophoneEnabled(true);

    const room = this.room;
    this.dataTo = {
      write: (data: GuestMessage) => {
        const encoded = new TextEncoder().encode(JSON.stringify(data));
        room.localParticipant.publishData(encoded, { reliable: true });
      }
    };
  }

  public async mute(muted: boolean) {
    if (this.room) {
      await this.room.localParticipant.setMicrophoneEnabled(!muted);
    }
  }

  public async end() {
    if (this.room) {
      await this.room.disconnect();
      this.room = null;
      this.dataTo = undefined;
    }
  }
}
