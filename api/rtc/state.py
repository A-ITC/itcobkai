from json import dumps
import numpy as np
from typing import Any, Final
from asyncio import Queue
from dataclasses import dataclass, field

SAMPLE_RATE: Final = 48000
NUM_CHANNELS: Final = 1
FRAME_SAMPLES: Final = 960  # 48000Hz * 0.02s (20ms)
FRAME_DURATION_S: Final = 0.02


@dataclass
class UserSession:
    username: str
    room: Any  # livekit.rtc.Room
    audio_source: Any  # livekit.rtc.AudioSource
    # ユーザーからの音声を一時保存するバッファ（スレッドセーフなQueueを利用）
    audio_queue: Queue[np.ndarray] = field(default_factory=Queue)
    # 直近の音声データを保持（ミキシング時にデータが足りない場合の補完用）
    last_frame: np.ndarray = field(
        default_factory=lambda: np.zeros(FRAME_SAMPLES, dtype=np.int16)
    )
    # ジッターバッファ: 2フレーム以上受信してからミキシングを開始する
    primed: bool = False


@dataclass
class Handler:
    on_message: Any = field(default_factory=lambda: lambda user, message: None)
    on_join: Any = field(default_factory=lambda: lambda user: None)
    on_leave: Any = field(default_factory=lambda: lambda user: None)


@dataclass
class RoomContext:
    active_sessions: dict[str, UserSession] = field(default_factory=dict)
    current_islands: list[list[str]] = field(default_factory=list)
    muted_users: set[str] = field(default_factory=set)
    audio_tasks: set[Any] = field(default_factory=set)
    handlers: Handler = field(default_factory=Handler)
    position_store: Any = None
    connection_service: Any = None
    user_store: Any = None

    def connects(self, islands: list[list[str]]):
        self.current_islands.clear()
        self.current_islands.extend(islands)

    def set_mute(self, h: str, muted: bool):
        if muted:
            self.muted_users.add(h)
        else:
            self.muted_users.discard(h)

    async def send_raw_message(self, user: str, message: dict):
        if session := self.active_sessions.get(user):
            await session.room.local_participant.publish_data(
                payload=dumps(message).encode("utf-8")
            )

    async def send_raw_message_bytes(self, user: str, data: bytes):
        """あらかじめシリアライズ済みのバイト列を送信する（ブロードキャスト時に JSON 変換を 1 回に削減）"""
        if session := self.active_sessions.get(user):
            await session.room.local_participant.publish_data(payload=data)


def create_room_context(
    *,
    position_store: Any = None,
    connection_service: Any = None,
    user_store: Any = None,
) -> RoomContext:
    return RoomContext(
        position_store=position_store,
        connection_service=connection_service,
        user_store=user_store,
    )


async def send_raw_message(ctx: RoomContext, user: str, message: dict):
    await ctx.send_raw_message(user, message)


async def send_raw_message_bytes(ctx: RoomContext, user: str, data: bytes):
    await ctx.send_raw_message_bytes(user, data)
