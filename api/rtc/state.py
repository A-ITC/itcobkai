import json
import numpy as np

from asyncio import Queue
from dataclasses import dataclass, field
from typing import Any, Final

SAMPLE_RATE: Final = 48000
NUM_CHANNELS: Final = 1
SAMPLES_10MS: Final = 480  # 48000Hz * 0.01s


@dataclass
class UserSession:
    username: str
    room: Any  # livekit.rtc.Room
    audio_source: Any  # livekit.rtc.AudioSource
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
audio_tasks: set = set()


@dataclass
class Handler:
    on_message: Any = field(default_factory=lambda: lambda user, message: None)
    on_join: Any = field(default_factory=lambda: lambda user: None)
    on_leave: Any = field(default_factory=lambda: lambda user: None)


handler = Handler()


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
