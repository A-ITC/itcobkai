import json
import numpy as np

from asyncio import Queue
from dataclasses import dataclass, field
from typing import Any, Final

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
    current_islands.clear()
    current_islands.extend(islands)


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
