import json
import numpy as np

from asyncio import Queue, create_task, get_event_loop, sleep
from dataclasses import dataclass, field
from typing import Any, Final
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
    CreateRoomRequest,
    DeleteRoomRequest,
)
from ..utils.config import APP_NAME, DOMAIN, SECRET_KEY

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
muted_users: set[str] = set()


class _LkApi:
    """LiveKitAPI の遅延初期化プロキシ。

    import 時点ではイベントループが存在しないため、aiohttp.ClientSession の生成を
    最初のアクセス時まで遅らせる。既存の `lkapi.room.xxx` / `lkapi.aclose()` の
    呼び出しは変更不要。
    テスト等でイベントループが変わった場合は自動的に再生成する。
    """

    def __init__(self):
        self._api: "LiveKitAPI | None" = None
        self._loop = None

    def _get(self) -> "LiveKitAPI":
        try:
            current_loop = get_event_loop()
        except RuntimeError:
            current_loop = None
        # イベントループが変わった場合は古いAPIを破棄して再生成する
        if self._api is None or self._loop is not current_loop:
            self._api = LiveKitAPI(f"wss://{DOMAIN}", APP_NAME, SECRET_KEY)
            self._loop = current_loop
        return self._api

    def __getattr__(self, name: str):
        return getattr(self._get(), name)

    async def aclose(self):
        if self._api:
            await self._api.aclose()
            self._api = None
            self._loop = None


lkapi = _LkApi()


def create_token(identity: str, room_name: str) -> str:
    token = (
        AccessToken(APP_NAME, SECRET_KEY)
        .with_identity(identity)
        .with_grants(VideoGrants(room_join=True, room=room_name))
    )
    return token.to_jwt()


def connects(islands: list[list[str]]):
    global current_islands
    current_islands = islands


def set_mute(h: str, muted: bool):
    if muted:
        muted_users.add(h)
    else:
        muted_users.discard(h)


async def send_raw_message(user: str, message: dict):
    if session := active_sessions.get(user):
        await session.room.local_participant.publish_data(
            payload=json.dumps(message).encode("utf-8")
        )


@dataclass
class Handler:
    on_message: Any = field(default_factory=lambda: lambda user, message: None)
    on_join: Any = field(default_factory=lambda: lambda user: None)
    on_leave: Any = field(default_factory=lambda: lambda user: None)


handler = Handler()


async def _process_user_audio(session: UserSession, track: Track):
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
            create_task(_process_user_audio(session, track))

    @room.on("data_received")
    def on_data(data: DataPacket):
        if data.participant:
            try:
                msg = json.loads(data.data.decode())
                print(data.participant.identity, msg)
                create_task(handler.on_message(data.participant.identity, msg))
            except (json.JSONDecodeError, UnicodeDecodeError):
                pass

    @room.on("participant_connected")
    def on_participant_connected(participant: RemoteParticipant):
        create_task(handler.on_join(participant.identity))

    @room.on("participant_disconnected")
    def on_participant_disconnected(participant: RemoteParticipant):
        active_sessions.pop(participant.identity, None)
        create_task(handler.on_leave(participant.identity))

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

                # 自分以外のミュートしていないユーザーの音声を合成
                others = [
                    active_sessions[u].last_frame
                    for u in island
                    if u != target_user
                    and u in active_sessions
                    and u not in muted_users
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
    # 既存ルームを削除して完全にリセット（前回の接続状態が残らないようにする）
    res = await lkapi.room.list_rooms(ListRoomsRequest(names=[name]))
    if res.rooms:
        await lkapi.room.delete_room(DeleteRoomRequest(room=name))
        await sleep(0.5)

    # ルーム作成
    await lkapi.room.create_room(CreateRoomRequest(name=name))

    # ボットがルームに接続完了してから返す（ユーザー接続前にボットが確実に存在するようにする）
    await _setup_bot_in_room(name, name)
    return {"token": create_token(name, name)}
