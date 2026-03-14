import json
import numpy as np

from asyncio import Queue, create_task, get_event_loop, sleep
from dataclasses import dataclass, field
from typing import Final
from livekit.rtc import (
    AudioFrame,
    AudioStream,
    DataPacket,
    LocalAudioTrack,
    RemoteParticipant,
    RemoteTrackPublication,
    Room,
    AudioSource,
    Track,
    TrackKind,
)
from livekit.api import (
    LiveKitAPI,
    AccessToken,
    VideoGrants,
    ListRoomsRequest,
    ListParticipantsRequest,
    RoomParticipantIdentity,
    CreateRoomRequest,
)
from .config import APP_NAME, DOMAIN, SECRET_KEY

SAMPLE_RATE: Final = 48000
NUM_CHANNELS: Final = 1
SAMPLES_10MS: Final = 480  # 48000Hz * 0.01s


@dataclass
class UserSession:
    username: str
    room: Room
    audio_source: AudioSource
    # ユーザーからの音声を一時保存するバッファ（スレッドセーフなQueueを利用）
    audio_queue: Queue[np.ndarray] = field(default_factory=Queue)
    # 直近の音声データを保持（ミキシング時にデータが足りない場合の補完用）
    last_frame: np.ndarray = field(
        default_factory=lambda: np.zeros(SAMPLES_10MS, dtype=np.int16)
    )


# グローバル管理
active_sessions: dict[str, UserSession] = {}
current_islands: list[list[str]] = []

lkapi = LiveKitAPI(f"wss://{DOMAIN}", APP_NAME, SECRET_KEY)


def create_token(identity: str, room_name: str) -> str:
    token = (
        AccessToken(APP_NAME, SECRET_KEY)
        .with_identity(identity)
        .with_grants(VideoGrants(room_join=True, room=room_name))
    )
    return token.to_jwt()


# --- イベントハンドラ ---
def on_message(user: str, message: dict):
    print(f"Message from {user}: {message}")


def on_join(user: str):
    print(f"User joined: {user}")


async def send_message(user: str, message: dict):
    if session := active_sessions.get(user):
        await session.room.local_participant.publish_data(
            payload=json.dumps(message).encode("utf-8")
        )


# --- コアロジック ---
async def process_user_audio(session: UserSession, track: Track):
    """受信した音声をキューに詰める（受信側の処理）"""
    audio_stream = AudioStream(track)
    async for event in audio_stream:
        frame_data = np.frombuffer(event.frame.data, dtype=np.int16)
        # キューが溢れないよう古いものは捨てる（最大200ms分程度）
        if session.audio_queue.qsize() > 20:
            await session.audio_queue.get()
        await session.audio_queue.put(frame_data)


async def _setup_bot_in_room(room_name: str, username: str):
    room = Room()
    source = AudioSource(SAMPLE_RATE, NUM_CHANNELS)
    session = UserSession(username=username, room=room, audio_source=source)
    active_sessions[username] = session

    @room.on("track_subscribed")
    def on_track_subscribed(
        track: Track,
        publication: RemoteTrackPublication,
        participant: RemoteParticipant,
    ):
        if track.kind == TrackKind.KIND_AUDIO:
            create_task(process_user_audio(session, track))

    @room.on("data_received")
    def on_data(data: DataPacket):
        if data.participant:
            try:
                msg = json.loads(data.data.decode())
                on_message(data.participant.identity, msg)
            except (json.JSONDecodeError, UnicodeDecodeError):
                pass

    @room.on("participant_connected")
    def on_participant_connected(participant: RemoteParticipant):
        on_join(participant.identity)

    bot_token = create_token("python-bot", room_name)
    await room.connect(f"wss://{DOMAIN}", bot_token)

    # Botのトラックを公開
    track = LocalAudioTrack.create_audio_track("bot-mix", source)
    await room.local_participant.publish_track(track)


# --- ミキシングエンジン ---
async def mixing_loop():
    """10msごとに各島の音声を合成して送信"""
    while True:
        start_time = get_event_loop().time()

        # 各ユーザーの最新10ms分の音声をキューから取り出しておく
        for session in active_sessions.values():
            try:
                if not session.audio_queue.empty():
                    session.last_frame = await session.audio_queue.get()
                else:
                    # データがない場合はフェードアウトするか無音にする
                    session.last_frame = np.zeros(SAMPLES_10MS, dtype=np.int16)
            except Exception:
                pass

        # 島ごとのミキシング
        for island in current_islands:
            for target_user in island:
                session = active_sessions.get(target_user)
                if not session:
                    continue

                # 自分以外の音声を合成
                others = [
                    active_sessions[u].last_frame
                    for u in island
                    if u != target_user and u in active_sessions
                ]

                if not others:
                    mixed = np.zeros(SAMPLES_10MS, dtype=np.int16)
                else:
                    # 複数人の音声を加算 (int32で計算してクリッピング防止)
                    mixed_large = np.sum(others, axis=0, dtype=np.int32)
                    mixed = np.clip(mixed_large, -32768, 32767).astype(np.int16)

                # フレームの送信
                audio_frame = AudioFrame(
                    mixed.tobytes(), SAMPLE_RATE, NUM_CHANNELS, SAMPLES_10MS
                )
                await session.audio_source.capture_frame(audio_frame)

        # 10ms間隔を維持するための精密な待機
        elapsed = get_event_loop().time() - start_time
        await sleep(max(0, 0.01 - elapsed))


async def init_room(name: str):
    # 既存ルームの確認とキック
    # api.room 経由で RoomServiceClient の機能にアクセスできます
    res = await lkapi.room.list_rooms(ListRoomsRequest(names=[name]))
    if res.rooms:
        # 接続者をキック
        p_res = await lkapi.room.list_participants(ListParticipantsRequest(room=name))
        for p in p_res.participants:
            await lkapi.room.remove_participant(
                RoomParticipantIdentity(room=name, identity=p.identity)
            )
        await sleep(0.5)

    # ルーム作成
    await lkapi.room.create_room(CreateRoomRequest(name=name))

    create_task(_setup_bot_in_room(name, name))
    return {"token": create_token(name, name)}


def connects(islands: list[list[str]]):
    global current_islands
    current_islands = islands
