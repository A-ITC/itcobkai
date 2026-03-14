import {
  Room,
  RoomEvent,
  RemoteTrack,
  RemoteTrackPublication,
  RemoteParticipant,
  Track,
  DataPacket_Kind
} from "livekit-client";

const room = new Room({
  adaptiveStream: true,
  dynacast: true
});

export const sendData = async (payload: object) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(payload));
  await room.localParticipant.publishData(data, {
    reliable: true,
    topic: "chat"
  });
};

export async function joinRoom(token: string, receiveData: (userId: string, payload: object) => void) {
  await room.connect(`wss://${location.hostname}`, token);
  console.log("Connected to room:", room.name);

  await room.localParticipant.setMicrophoneEnabled(true);
  console.log("Microphone published");

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
