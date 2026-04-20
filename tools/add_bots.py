"""テスト用ボット追加ツール（最適化版）。

users.json からランダムにユーザーを選び、LiveKit ルームに参加させます。
波形生成の効率化と、大量起動時の負荷分散（ジッター）を実装しています。
"""

import argparse
import asyncio
import json
import os
import random
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

# プロジェクトルートをパスに追加
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

load_dotenv()

import numpy as np
from livekit.api import AccessToken, VideoGrants
from livekit.rtc import AudioFrame, AudioSource, DataPacket, LocalAudioTrack, Room

from api.master.user import UserStore

# =========================================================================
# 音符設定
# =========================================================================
base_hz = [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88]
base_jp = ["ド", "レ", "ミ", "ファ", "ソ", "ラ", "シ"]
_NOTES_HZ = []
_NOTES_JP = []
for i in range(5):
    _NOTES_HZ.extend([round(hz * (2**i), 2) for hz in base_hz])
    _NOTES_JP.extend([f"{jp}{i}" for jp in base_jp])

SAMPLE_RATE: int = 48000
NUM_CHANNELS: int = 1
FRAME_SAMPLES: int = 960  # 20ms
FRAME_DURATION_S: float = 0.02
AMPLITUDE: int = 8000

APP_NAME: str = "itcobkai"


# =========================================================================
# HTTP ヘルパー
# =========================================================================
class ApiRequestError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code


def _post(base_url: str, payload: dict, secret: str) -> dict:
    body = json.dumps(payload).encode()
    req = Request(
        f"{base_url}/api/master",
        data=body,
        headers={"Content-Type": "application/json", "X-Secret-Key": secret},
        method="POST",
    )
    try:
        with urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except HTTPError as e:
        try:
            error_body = json.loads(e.read())
        except json.JSONDecodeError:
            error_body = {}
        raise ApiRequestError(e.code, error_body.get("error", f"HTTP {e.code}"))
    except URLError:
        print(f"エラー: API サーバーに接続できません ({base_url})", file=sys.stderr)
        sys.exit(1)


# =========================================================================
# BotClient
# =========================================================================
class BotClient:
    def __init__(
        self, user: dict, frequency: float, note_name: str, domain: str, secret: str
    ):
        self.user = user
        self.h: str = user["h"]
        self.name: str = user.get("name", self.h)
        self.frequency = frequency
        self.note_name = note_name
        self._domain = domain
        self._secret = secret

        self.x, self.y = 0, 0
        self.map_width, self.map_height = 0, 0
        self.black: list[list[bool]] = []

        self._room = Room()
        self._audio_source = AudioSource(SAMPLE_RATE, NUM_CHANNELS)
        self._init_event = asyncio.Event()

        # --- 効率化: 波形の事前生成 ---
        # 1周期分のサンプル数を計算
        self._period_samples = int(SAMPLE_RATE / self.frequency)
        # 1周期分の方形波を pre-compute
        one_period = np.where(
            np.arange(self._period_samples) < self._period_samples / 2,
            AMPLITUDE,
            -AMPLITUDE,
        ).astype(np.int16)
        # ループ参照用に少し多めに持っておく（FRAME_SAMPLESより長く）
        self._cached_wave = np.tile(one_period, (FRAME_SAMPLES // len(one_period)) + 2)
        self._current_phase = 0

    def _make_token(self) -> str:
        return (
            AccessToken(APP_NAME, self._secret)
            .with_identity(self.h)
            .with_grants(VideoGrants(room_join=True, room=self.h))
            .to_jwt()
        )

    def _on_data(self, data: DataPacket):
        try:
            msg = json.loads(data.data.decode())
        except:
            return
        if msg.get("command") != "INIT":
            return

        for u in msg.get("users", []):
            if u.get("h") == self.h:
                self.x, self.y = u.get("x", 0), u.get("y", 0)
                break

        black_raw: str = msg.get("map", {}).get("black", "")
        if black_raw:
            self.black = [[c == "1" for c in row] for row in black_raw.split(",")]
            self.map_height = len(self.black)
            self.map_width = len(self.black[0]) if self.map_height > 0 else 0
        self._init_event.set()

    async def connect(self):
        self._room.on("data_received", self._on_data)
        try:
            await self._room.connect(f"wss://{self._domain}", self._make_token())
            await self._room.local_participant.publish_data(
                payload=json.dumps({"command": "update", "user": self.user}).encode()
            )
            await asyncio.wait_for(self._init_event.wait(), timeout=10.0)
            track = LocalAudioTrack.create_audio_track(
                f"bot-{self.h}", self._audio_source
            )
            await self._room.local_participant.publish_track(track)
            return True
        except Exception as e:
            print(f"[{self.name}] 接続失敗: {e}", file=sys.stderr)
            return False

    async def _audio_loop(self):
        """事前生成された波形をスライスして送信（高速）"""
        loop = asyncio.get_event_loop()
        next_tick = loop.time()

        while True:
            next_tick += FRAME_DURATION_S

            # キャッシュから現在の位相に合わせて切り出す
            wave = self._cached_wave[
                self._current_phase : self._current_phase + FRAME_SAMPLES
            ]

            frame = AudioFrame(wave.tobytes(), SAMPLE_RATE, NUM_CHANNELS, FRAME_SAMPLES)
            await self._audio_source.capture_frame(frame)

            # 位相の更新（1周期を超えないように丸める）
            self._current_phase = (
                self._current_phase + FRAME_SAMPLES
            ) % self._period_samples

            await asyncio.sleep(max(0.0, next_tick - loop.time()))

    async def _move_loop(self):
        dirs = [(0, 1), (0, -1), (1, 0), (-1, 0)]
        while True:
            await asyncio.sleep(
                random.uniform(2.0, 10.0)
            )  # 移動頻度を少し落として負荷軽減
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
        await asyncio.gather(self._audio_loop(), self._move_loop())

    async def disconnect(self):
        try:
            await self._room.disconnect()
        except:
            pass


# =========================================================================
# エントリポイント
# =========================================================================
async def _amain(args: argparse.Namespace):
    domain, secret = os.environ.get("DOMAIN"), os.environ.get("SECRET_KEY")
    api_port = int(os.environ.get("API_PORT", "41022"))
    if not domain or not secret:
        print("エラー: .env の設定を確認してください", file=sys.stderr)
        sys.exit(1)

    store = UserStore()
    store.load()
    all_users = store.all()
    if not all_users:
        print("エラー: ユーザーが見つかりません", file=sys.stderr)
        sys.exit(1)

    count = min(args.count, len(all_users))
    selected = list(all_users)
    random.shuffle(selected)
    base_url = f"http://127.0.0.1:{api_port}"

    connected: list[BotClient] = []
    print(f"{count} 台のボットを起動中...")
    try:
        for user in selected:
            if len(connected) >= count:
                break

            try:
                _post(base_url, {"command": "BOTINIT", "h": user.h}, secret)
            except ApiRequestError as e:
                if e.status_code == 409:
                    print(f"[{user.name}] 既に接続中のためスキップ")
                    continue
                print(f"[{user.name}] BOTINIT 失敗: {e}", file=sys.stderr)
                raise SystemExit(1) from e

            bot_index = len(connected)
            bot = BotClient(
                user.model_dump(),
                _NOTES_HZ[bot_index % len(_NOTES_HZ)],
                _NOTES_JP[bot_index % len(_NOTES_JP)],
                domain,
                secret,
            )

            if not await bot.connect():
                await bot.disconnect()
                continue

            connected.append(bot)
            print(f"[{bot.name}] 接続完了 ({len(connected)}/{count})")

        if len(connected) < count:
            print(
                f"エラー: {count} 台のボットを起動できませんでした ({len(connected)} 台のみ接続)",
                file=sys.stderr,
            )
            raise SystemExit(1)

        if args.auto_stop:
            print(f"\n{len(connected)} 台稼働中. 60秒後に自動停止します。")
        else:
            print(f"\n{len(connected)} 台稼働中. Ctrl+C で終了.")

        run_tasks = [asyncio.create_task(b.run()) for b in connected]
        try:
            if args.auto_stop:
                await asyncio.wait_for(asyncio.gather(*run_tasks), timeout=60)
            else:
                await asyncio.gather(*run_tasks)
        except asyncio.TimeoutError:
            print("60秒経過したため自動停止します。")
        except (KeyboardInterrupt, asyncio.CancelledError):
            pass
        finally:
            for task in run_tasks:
                task.cancel()
            await asyncio.gather(*run_tasks, return_exceptions=True)
    finally:
        await asyncio.gather(
            *[b.disconnect() for b in connected], return_exceptions=True
        )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("count", type=int)
    parser.add_argument(
        "--auto-stop",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="60秒後に自動停止する（既定: 有効。無効化は --no-auto-stop）",
    )
    args = parser.parse_args()
    try:
        asyncio.run(_amain(args))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
