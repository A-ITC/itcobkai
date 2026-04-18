from collections.abc import Awaitable, Callable
from json import dumps
import numpy as np
from typing import Any, Final
from asyncio import Queue, Task
from dataclasses import dataclass, field
from livekit.rtc import AudioSource, Room

SAMPLE_RATE: Final = 48000
NUM_CHANNELS: Final = 1
FRAME_SAMPLES: Final = 960  # 48000Hz * 0.02s (20ms)
FRAME_DURATION_S: Final = 0.02

type MessageHandler = Callable[[str, dict[str, Any]], Awaitable[None]]
type PresenceHandler = Callable[[str], Awaitable[None]]


async def _noop_message_handler(user: str, message: dict[str, Any]) -> None:
    return None


async def _noop_presence_handler(user: str) -> None:
    return None


@dataclass
class UserSession:
    username: str
    room: Room
    audio_source: AudioSource
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
    on_message: MessageHandler = field(default_factory=lambda: _noop_message_handler)
    on_join: PresenceHandler = field(default_factory=lambda: _noop_presence_handler)
    on_leave: PresenceHandler = field(default_factory=lambda: _noop_presence_handler)


active_sessions: dict[str, UserSession] = {}
current_islands: list[list[str]] = []
muted_users: set[str] = set()
audio_tasks: set[Task[None]] = set()
handler = Handler()


def connects(islands: list[list[str]]) -> None:
    current_islands.clear()
    current_islands.extend(islands)


def set_mute(h: str, muted: bool) -> None:
    if muted:
        muted_users.add(h)
    else:
        muted_users.discard(h)


def reset_runtime_state() -> None:
    active_sessions.clear()
    current_islands.clear()
    muted_users.clear()
    audio_tasks.clear()


def reset_handlers() -> None:
    handler.on_message = _noop_message_handler
    handler.on_join = _noop_presence_handler
    handler.on_leave = _noop_presence_handler


async def send_raw_message(user: str, message: dict[str, Any]) -> None:
    if session := active_sessions.get(user):
        await session.room.local_participant.publish_data(
            payload=dumps(message).encode("utf-8")
        )


async def send_raw_message_bytes(user: str, data: bytes) -> None:
    """あらかじめシリアライズ済みのバイト列を送信する（ブロードキャスト時に JSON 変換を 1 回に削減）"""
    if session := active_sessions.get(user):
        await session.room.local_participant.publish_data(payload=data)
