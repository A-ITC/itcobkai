from json import JSONDecodeError, loads
from .state import (
    SAMPLE_RATE,
    NUM_CHANNELS,
    UserSession,
    active_sessions,
    audio_tasks,
    handler,
)
from .mixer import process_user_audio
from typing import cast
from logging import getLogger
from asyncio import create_task, get_event_loop, sleep
from livekit.rtc import (
    AudioSource,
    DataPacket,
    LocalAudioTrack,
    RemoteParticipant,
    RemoteTrackPublication,
    Room,
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
from ..master.user import us
from ..utils.config import APP_NAME, DOMAIN, SECRET_KEY

logger = getLogger(__name__)


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


lkapi: LiveKitAPI = cast(LiveKitAPI, _LkApi())


def create_token(identity: str, room_name: str) -> str:
    token = (
        AccessToken(APP_NAME, SECRET_KEY)
        .with_identity(identity)
        .with_grants(VideoGrants(room_join=True, room=room_name))
    )
    return token.to_jwt()


async def init_room(name: str):
    """
    ルームを初期化する
    - 既存ルームがあれば削除して完全にリセット
    - botがルームに接続完了してから返す
    - 他ユーザの音声をサーバ側でミックスして送るためにユーザ専用のbotトラックを公開する

    注意: 30-40人規模のアプリのため、メッシュ型ではなくサーバ側でミキシングする構成にしている
        全員が1つの島に集まってしまう可能性があるので、subscribeを制御する方法は採用しない
    """
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


async def _setup_bot_in_room(room_name: str, username: str):
    room = Room()
    source = AudioSource(SAMPLE_RATE, NUM_CHANNELS)
    session = UserSession(username=username, room=room, audio_source=source)

    @room.on("track_subscribed")
    def on_track_subscribed(
        track: Track,
        publication: RemoteTrackPublication,
        participant: RemoteParticipant,
    ):
        if track.kind == TrackKind.KIND_AUDIO:
            task = create_task(process_user_audio(session, track))
            audio_tasks.add(task)

    @room.on("data_received")
    def on_data(data: DataPacket):
        if data.participant:
            try:
                msg = loads(data.data.decode())
                create_task(handler.on_message(data.participant.identity, msg))
            except (JSONDecodeError, UnicodeDecodeError):
                pass

    @room.on("participant_connected")
    def on_participant_connected(participant: RemoteParticipant):
        logger.info(f"JOIN - {us.get_name(participant.identity)}")
        create_task(handler.on_join(participant.identity))

    @room.on("participant_disconnected")
    def on_participant_disconnected(participant: RemoteParticipant):
        logger.info(f"LEAVE - {us.get_name(participant.identity)}")
        if s := active_sessions.pop(participant.identity, None):
            create_task(s.room.disconnect())
        create_task(handler.on_leave(participant.identity))

    bot_token = create_token("python-bot", room_name)
    await room.connect(f"wss://{DOMAIN}", bot_token)

    # ユーザ専用のBotのトラックを公開
    track = LocalAudioTrack.create_audio_track("bot-mix", source)
    await room.local_participant.publish_track(track)

    # Botがルームへの参加とトラック公開を完了してからセッションを登録する
    # （接続完了前に send_message が呼ばれても空振りになるよう invariant を保証する）
    active_sessions[username] = session
