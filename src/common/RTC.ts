import {
  LocalAudioStream,
  LocalDataStream,
  LocalRoomMember,
  nowInSec,
  RemoteAudioStream,
  Room,
  RoomPublication,
  SkyWayAuthToken,
  SkyWayContext,
  SkyWayRoom,
  SkyWayStreamFactory,
  uuidV4
} from "@skyway-sdk/room";

class _Skyway {
  public context: SkyWayContext | null = null;
  public ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

  protected async initContext() {
    const token = new SkyWayAuthToken({
      jti: uuidV4(),
      iat: nowInSec(),
      exp: nowInSec() + 60 * 60 * 24,
      version: 3,
      scope: {
        appId: import.meta.env.VITE_SKYWAY_ID,
        rooms: [
          {
            name: "*",
            methods: ["create", "close", "updateMetadata"],
            member: {
              name: "*",
              methods: ["publish", "subscribe", "updateMetadata"]
            }
          }
        ]
      }
    }).encode(import.meta.env.VITE_SKYWAY_SECRET);
    this.context = await SkyWayContext.Create(token);
  }
}

export class SkywayMaster extends _Skyway {
  public publicationIds: string[] = [];
  public onAdd?: (name: string, source: MediaStreamAudioSourceNode, dest: MediaStreamAudioDestinationNode) => void;
  public onDisconnect = (_name: string) => {};

  public dataTo: { [member: string]: LocalDataStream } = {};
  public dataFrom = (_hash: string, _data: any) => {};

  public audioFrom: { [member: string]: HTMLAudioElement } = {};
  public audioTo: { [member: string]: HTMLAudioElement } = {};
  public sources: { [member: string]: MediaStreamAudioSourceNode } = {};
  public dests: { [member: string]: MediaStreamAudioDestinationNode } = {};

  public async init() {
    await this.initContext();
    const masterRoom = await SkyWayRoom.FindOrCreate(this.context!, { name: "master" });
    await masterRoom.join({ name: "master" });

    for (const member of masterRoom.members) {
      if (member.name === "master") continue;
      console.log("member waited:", member.name);
      await this.addMember(member.name!);
      await masterRoom.leave(member);
    }

    // master用のroomで待機
    masterRoom.onMemberJoined.add(async event => {
      console.log("member joined:", event.member.name);
      await this.addMember(event.member.name!);
      await masterRoom.leave(event.member);
    });

    masterRoom.onMemberLeft.add(event => {
      console.log("member left:", event.member.name);
    });
  }

  private async whenDisconnect(room: Room, member: any) {
    console.log("接続が切れたため退室させます:", member.name);
    try {
      await room.leave(member);
      await room.close();
    } catch (e) {}
    this.onDisconnect(member.name);
  }

  private async addMember(name: string) {
    // viewerは自分の名前のルーム名で待機している
    const room = await SkyWayRoom.FindOrCreate(this.context!, { name });
    console.log("joining to viewer room");
    const me = await room.join({ name: "master" });
    // viewerがpublishしているstreamをsubscribeする
    for (const publication of room.publications) {
      console.log("find:", publication.publisher.id);
      const { stream, subscription } = await me.subscribe(publication.id);
      subscription.onConnectionStateChanged.add(async state => {
        if (state === "disconnected") {
          await this.whenDisconnect(room, publication.publisher);
        }
      });
      if (stream.contentType === "data") {
        console.log("data stream subscribed:", name);
        stream.onData.add(data => {
          console.log("data from viewer:", name, data);
          this.dataFrom(name, data);
        });
      } else if (stream.contentType === "audio") {
        console.log("audio stream subscribed:", name);
        this.audioFrom[name] = document.createElement("audio");
        stream.attach(this.audioFrom[name]);
        this.sources[name] = this.ctx.createMediaStreamSource(new MediaStream([stream.track]));
      }
    }
    room.onMemberLeft.add(event => {
      if (event.member.id !== me.id) return;
      console.log("viewer onleft:", name);
    });
    // viewerにdata/audioをpublishする
    this.audioTo[name] = document.createElement("audio");
    this.dests[name] = this.ctx.createMediaStreamDestination();
    const stream = new LocalAudioStream(this.dests[name].stream.getAudioTracks()[0]);
    stream.attach(this.audioTo[name]);

    this.dataTo[name] = await SkyWayStreamFactory.createDataStream();
    console.log("publishing to viewer:", name);
    await me.publish(this.dataTo[name], { type: "p2p" });
    await me.publish(stream, { type: "p2p" });
    console.log("connection complete:", name);
    if (this.onAdd && this.sources[name] && this.dests[name]) {
      this.onAdd(name, this.sources[name], this.dests[name]);
    }
  }
}

export class SkywayViewer extends _Skyway {
  public publicationIds: string[] = [];
  public dataTo: LocalDataStream | null = null;
  public audioTo: LocalAudioStream | null = null;
  public dataFrom = (_data: any) => {};
  public audioFrom: RemoteAudioStream | null = null;
  private publication: RoomPublication<LocalAudioStream> | null = null;
  private myRoom: Room | null = null;
  private viewer: LocalRoomMember | null = null;

  public async init(name: string, audio: HTMLAudioElement) {
    // 自分のroomにpublish
    await this.initContext();
    this.myRoom = await SkyWayRoom.FindOrCreate(this.context!, { name });
    this.viewer = await this.myRoom.join();
    this.audioTo = await SkyWayStreamFactory.createMicrophoneAudioStream();
    this.publication = await this.viewer.publish(this.audioTo, { type: "p2p" });
    this.dataTo = await SkyWayStreamFactory.createDataStream();
    await this.viewer.publish(this.dataTo, { type: "p2p" });

    // masterからのstreamをsubscribe
    this.myRoom.onStreamPublished.add(async event => {
      if (event.publication.publisher.id === this.viewer!.id) return;
      console.log("new stream:", event.publication.id);
      const { stream, subscription } = await this.viewer!.subscribe(event.publication.id);
      subscription.onConnectionStateChanged.add(async state => {
        if (state === "disconnected") {
          console.log("masterとの接続が切れました。退室します。");
          try {
            // DataStreamとAudioStreamの両方で切断イベントが発生するため片方は必ず失敗する
            this.end();
            console.log("再接続を試みます");
            await this.init(name, audio);
          } catch (e) {}
        }
      });
      if (stream.contentType === "data") {
        stream.onData.add(data => {
          this.dataFrom(data);
        });
      } else if (stream.contentType === "audio") {
        this.audioFrom = stream;
        stream.attach(audio);
      }
    });

    // masterに知らせる
    const masterRoom = await SkyWayRoom.FindOrCreate(this.context!, { name: "master" });
    await masterRoom.join({ name });
  }

  public async mute(mute: boolean) {
    if (!this.publication) return;
    if (mute) this.publication.disable();
    else this.publication.enable();
  }

  public async end() {
    if (!this.myRoom || !this.viewer) return;
    await this.myRoom.leave(this.viewer);
    await this.myRoom.close();
  }
}
