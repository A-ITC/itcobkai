"""テスト用ボット追加ツール。

users.json からランダムにユーザーを選び、LiveKit ルームに参加させます。
ボットは方形波（1人目=ド、2人目=レ、以降順）の音声を送信し続け、
ランダムに前後左右へ移動します。Ctrl+C で全ボットを切断して終了します。

使用例:
  uv run tools/add_bots.py 3
  uv run tools/add_bots.py 5
"""

import argparse
import asyncio
import json
import os
import random
import sys
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen

# プロジェクトルートをパスに追加して api パッケージを import 可能にする
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

load_dotenv()

import numpy as np
from livekit.api import AccessToken, VideoGrants
from livekit.rtc import AudioFrame, AudioSource, DataPacket, LocalAudioTrack, Room

from api.master.user import UserStore

# =========================================================================
# 音符（C メジャースケール、方形波周波数）
# =========================================================================
_NOTES_HZ = [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88]
_NOTES_JP = ["ド", "レ", "ミ", "ファ", "ソ", "ラ", "シ"]

SAMPLE_RATE: int = 48000
NUM_CHANNELS: int = 1
FRAME_SAMPLES: int = 960  # 48000 Hz * 0.02 s (20ms)
FRAME_DURATION_S: float = 0.02
AMPLITUDE: int = 8000  # 方形波振幅（最大 32767、ミキシングでクリップしない程度）

APP_NAME: str = "itcobkai"


# =========================================================================
# HTTP ヘルパー
# =========================================================================
def _post(base_url: str, payload: dict) -> dict:
    body = json.dumps(payload).encode()
    req = Request(
        f"{base_url}/api/master",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except URLError as e:
        print(f"エラー: API サーバーに接続できません ({base_url})", file=sys.stderr)
        print(f"  詳細: {e.reason}", file=sys.stderr)
        sys.exit(1)


# =========================================================================
# BotClient
# =========================================================================
class BotClient:
    """1体のボットを管理するクラス。

    connect() で LiveKit ルームに接続し、INIT 受信後に
    _audio_loop() と _move_loop() を並行実行する。
    """

    def __init__(
        self,
        user: dict,
        frequency: float,
        note_name: str,
        domain: str,
        secret: str,
    ):
        self.user = user
        self.h: str = user["h"]
        self.name: str = user.get("name", self.h)
        self.frequency = frequency
        self.note_name = note_name
        self._domain = domain
        self._secret = secret

        # マップ情報（INIT で設定される）
        self.x = 0
        self.y = 0
        self.map_width = 0
        self.map_height = 0
        self.black: list[list[bool]] = []

        self._room = Room()
        self._audio_source = AudioSource(SAMPLE_RATE, NUM_CHANNELS)
        self._init_event = asyncio.Event()
        self._sample_offset = 0

    def _make_token(self) -> str:
        return (
            AccessToken(APP_NAME, self._secret)
            .with_identity(self.h)
            .with_grants(VideoGrants(room_join=True, room=self.h))
            .to_jwt()
        )

    def _on_data(self, data: DataPacket):
        """data_received イベントハンドラ（同期）"""
        try:
            msg = json.loads(data.data.decode())
        except (json.JSONDecodeError, UnicodeDecodeError):
            return

        if msg.get("command") != "INIT":
            return

        # 自分の座標を取得
        for u in msg.get("users", []):
            if u.get("h") == self.h:
                self.x = u.get("x", 0)
                self.y = u.get("y", 0)
                break

        # black グリッドを解析（移動可否の判定用）
        black_raw: str = msg.get("map", {}).get("black", "")
        if black_raw:
            self.black = [[c == "1" for c in row] for row in black_raw.split(",")]
            self.map_height = len(self.black)
            self.map_width = len(self.black[0]) if self.map_height > 0 else 0

        self._init_event.set()

    async def connect(self) -> bool:
        """LiveKit ルームへ接続し、INIT を受信するまで待機する。"""
        self._room.on("data_received", self._on_data)

        try:
            await self._room.connect(f"wss://{self._domain}", self._make_token())
        except Exception as e:
            print(f"[{self.name}] 接続失敗: {e}", file=sys.stderr)
            return False

        # UPDATE: ユーザー情報をサーバーへ通知
        await self._room.local_participant.publish_data(
            payload=json.dumps({"command": "update", "user": self.user}).encode()
        )

        # INIT 受信待機
        try:
            await asyncio.wait_for(self._init_event.wait(), timeout=10.0)
        except asyncio.TimeoutError:
            print(
                f"[{self.name}] INIT タイムアウト"
                "（サーバーにマップが読み込まれているか確認してください）",
                file=sys.stderr,
            )
            return False

        # 音声トラックを公開
        track = LocalAudioTrack.create_audio_track(f"bot-{self.h}", self._audio_source)
        await self._room.local_participant.publish_track(track)

        return True

    async def _audio_loop(self):
        """20msごとに方形波を送信し続ける。絶対時刻ベースでドリフトを防ぐ。"""
        loop = asyncio.get_event_loop()
        next_tick = loop.time()
        while True:
            next_tick += FRAME_DURATION_S

            t = np.arange(self._sample_offset, self._sample_offset + FRAME_SAMPLES)
            period_samples = SAMPLE_RATE / self.frequency
            wave = np.where(
                (t % period_samples) < period_samples / 2, AMPLITUDE, -AMPLITUDE
            ).astype(np.int16)

            frame = AudioFrame(wave.tobytes(), SAMPLE_RATE, NUM_CHANNELS, FRAME_SAMPLES)
            await self._audio_source.capture_frame(frame)
            self._sample_offset += FRAME_SAMPLES

            await asyncio.sleep(max(0.0, next_tick - loop.time()))

    async def _move_loop(self):
        """2〜5秒ごとにランダムに前後左右へ移動する。"""
        dirs = [(0, 1), (0, -1), (1, 0), (-1, 0)]
        while True:
            await asyncio.sleep(random.uniform(2.0, 5.0))
            random.shuffle(dirs)
            for dx, dy in dirs:
                nx, ny = self.x + dx, self.y + dy
                if (
                    0 <= nx < self.map_width
                    and 0 <= ny < self.map_height
                    and self.black
                    and not self.black[ny][nx]
                ):
                    self.x, self.y = nx, ny
                    await self._room.local_participant.publish_data(
                        payload=json.dumps(
                            {"command": "move", "x": nx, "y": ny}
                        ).encode()
                    )
                    break

    async def run(self):
        """音声送信と移動を並行実行する。"""
        await asyncio.gather(self._audio_loop(), self._move_loop())

    async def disconnect(self):
        try:
            await self._room.disconnect()
        except Exception:
            pass


# =========================================================================
# エントリポイント
# =========================================================================
async def _amain(args: argparse.Namespace):
    domain: str = os.environ.get("DOMAIN", "")
    secret: str = os.environ.get("SECRET_KEY", "")
    api_port: int = int(os.environ.get("API_PORT", "41022"))

    if not domain:
        print(
            "エラー: DOMAIN が設定されていません (.env を確認してください)",
            file=sys.stderr,
        )
        sys.exit(1)
    if not secret:
        print(
            "エラー: SECRET_KEY が設定されていません (.env を確認してください)",
            file=sys.stderr,
        )
        sys.exit(1)

    # UserStore を通じてユーザーを取得（USERS_JSON を直接読まない）
    store = UserStore()
    store.load()
    all_users = store.all()

    if not all_users:
        print(
            "エラー: ユーザーが見つかりません (data/users.json を確認してください)",
            file=sys.stderr,
        )
        sys.exit(1)

    count = min(args.count, len(all_users))
    if count < args.count:
        print(
            f"警告: ユーザーが {len(all_users)} 人しかいないため {count} 人のボットを起動します"
        )

    selected = random.sample(all_users, count)
    base_url = f"http://127.0.0.1:{api_port}"

    # サーバー側でルームを初期化（BOTINIT）
    print(f"{count} 台のボットのルームを初期化中...")
    for user in selected:
        result = _post(base_url, {"command": "BOTINIT", "h": user.h})
        if not result.get("ok"):
            print(f"  [{user.name}] BOTINIT 失敗: {result}", file=sys.stderr)

    # BotClient を生成
    bots = [
        BotClient(
            user=u.model_dump(),
            frequency=_NOTES_HZ[i % len(_NOTES_HZ)],
            note_name=_NOTES_JP[i % len(_NOTES_JP)],
            domain=domain,
            secret=secret,
        )
        for i, u in enumerate(selected)
    ]

    # 全ボットを接続
    print("LiveKit に接続中...")
    results = await asyncio.gather(*[b.connect() for b in bots], return_exceptions=True)
    connected = [b for b, r in zip(bots, results) if r is True]

    if not connected:
        print("エラー: 接続できたボットがいません", file=sys.stderr)
        sys.exit(1)

    print(f"\n{len(connected)} 台のボットが接続しました:")
    for b in connected:
        print(f"  [{b.note_name}] {b.name} (@{b.h})  座標=({b.x}, {b.y})")
    print("\nCtrl+C で終了します\n")

    try:
        await asyncio.gather(*[b.run() for b in connected])
    except (KeyboardInterrupt, asyncio.CancelledError):
        pass
    finally:
        print("\n切断中...")
        await asyncio.gather(
            *[b.disconnect() for b in connected], return_exceptions=True
        )
        print("完了")


def main():
    parser = argparse.ArgumentParser(
        description="テスト用ボットを追加します。ランダムに移動し方形波音声を送信します。",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="例:\n  uv run tools/add_bots.py 3",
    )
    parser.add_argument("count", type=int, help="追加するボットの人数")
    args = parser.parse_args()

    if args.count < 1:
        print("エラー: count は 1 以上の整数を指定してください", file=sys.stderr)
        sys.exit(1)

    try:
        asyncio.run(_amain(args))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
