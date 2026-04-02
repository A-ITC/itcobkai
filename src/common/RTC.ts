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
    await beep();

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
        const data: HostMessage = JSON.parse(new TextDecoder().decode(payload));
        this.dataFrom?.(data);
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

  public end() {
    if (this.room) {
      this.room.disconnect();
      this.room = null;
      this.dataTo = undefined;
    }
  }
}

export const sendData = async (payload: object) => {
  console.warn("sendData is deprecated. Use RTCClient.dataTo.write instead.");
};

export async function joinRoom(token: string, receiveData: (userId: string, payload: object) => void) {
  const room = new Room({ adaptiveStream: true, dynacast: true });
  await room.connect(`wss://${location.hostname}`, token);

  await room.localParticipant.setMicrophoneEnabled(true);

  room.on(
    RoomEvent.TrackSubscribed,
    (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      if (track.kind === Track.Kind.Audio) {
        const element = track.attach();
        document.body.appendChild(element);
        console.log(`Subscribed to audio from ${participant.identity}`);
      }
    }
  );

  room.on(
    RoomEvent.DataReceived,
    (payload: Uint8Array, participant?: RemoteParticipant, kind?: DataPacket_Kind, topic?: string) => {
      const decoder = new TextDecoder();
      const data = JSON.parse(decoder.decode(payload));
      receiveData(participant ? participant.identity : "unknown", data);
      console.log(`Message from ${participant?.identity}:`, data);
    }
  );
}
