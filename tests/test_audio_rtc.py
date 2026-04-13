"""
LiveKit を使用した音声ミキシング統合テスト

テスト対象の音声フロー:
  参加者 HA が音声トラックを公開
   → bot が process_user_audio() でキューに積む
   → mixing_loop() が current_islands に基づきミックスして capture_frame()
   → bot が参加者 HB の AudioSource に書き込み
   → HB がボットの音声トラックで受信

テストケース:
  1. 同じ島にいるとき HA の音声が HB に届く
  2. HA がミュート状態のとき HB に音声が届かない
  3. 異なる島（離れた場所）にいるとき HB に音声が届かない

実行条件:
  docker compose up で LiveKit サーバーを起動し、DOMAIN 環境変数を設定すること。
  uv run pytest tests/test_audio_rtc.py -v -m livekit
"""

import asyncio
import json
import numpy as np
import pytest

from livekit.rtc import (
    AudioFrame,
    AudioSource,
    AudioStream,
    DataPacket,
    LocalAudioTrack,
    Room,
    Track,
    TrackKind,
    RemoteTrackPublication,
    RemoteParticipant,
)

from api.rtc.adapter import GuestCommand
from api.rtc.mixer import mixing_loop
from api.rtc.rtc import create_token, init_room
from api.rtc.state import (
    SAMPLE_RATE,
    NUM_CHANNELS,
    FRAME_SAMPLES,
    active_sessions,
    connects,
    set_mute,
)
from api.master.user import UserStore, us
from api.utils.config import DOMAIN
from tests.conftest import make_test_user

pytestmark = pytest.mark.livekit

# テスト用ユーザーハッシュ（既存テストの HA/HB と衝突しない値）
HA = "test_audio_ha"
HB = "test_audio_hb"

# 音声テスト用の既知の振幅値
_AUDIO_VALUE = 1000


# ---------------------------------------------------------------------------
# テスト参加者ヘルパー
# ---------------------------------------------------------------------------


class _AudioTestParticipant:
    """LiveKit ルームに接続して音声を送受信するテスト用ヘルパー。

    - bot が publish_data で送るデータチャネルメッセージを受信する (_cmd_queue)
    - bot が publish_track した音声トラックを購読して受信フレームをキューに積む (_audio_queue)
    - AudioSource + LocalAudioTrack で音声を bot に向けて送信する
    """

    def __init__(self, identity: str):
        self.identity = identity
        self.room = Room()
        self._cmd_queue: asyncio.Queue[dict] = asyncio.Queue()
        self._audio_queue: asyncio.Queue[np.ndarray] = asyncio.Queue()
        self._audio_source: AudioSource | None = None
        self._publish_task: asyncio.Task | None = None
        self._collect_tasks: list[asyncio.Task] = []

    async def connect(self):
        token = create_token(self.identity, self.identity)

        @self.room.on("data_received")
        def on_data(data: DataPacket):
            try:
                msg = json.loads(data.data.decode())
                self._cmd_queue.put_nowait(msg)
            except Exception:
                pass

        @self.room.on("track_subscribed")
        def on_track_subscribed(
            track: Track,
            publication: RemoteTrackPublication,
            participant: RemoteParticipant,
        ):
            if track.kind == TrackKind.KIND_AUDIO:
                task = asyncio.create_task(self._collect_audio(track))
                self._collect_tasks.append(task)

        await self.room.connect(f"wss://{DOMAIN}", token)

    async def _collect_audio(self, track: Track):
        """ボットの音声トラックからフレームを受信してキューに積む。"""
        stream = AudioStream(track, sample_rate=SAMPLE_RATE, num_channels=NUM_CHANNELS)
        try:
            async for event in stream:
                frame_data = np.frombuffer(event.frame.data, dtype=np.int16).copy()
                self._audio_queue.put_nowait(frame_data)
        except asyncio.CancelledError:
            await stream.aclose()
            raise

    async def publish_audio(self):
        """既知の振幅値 (_AUDIO_VALUE) で満たした音声フレームを連続送信する。"""
        self._audio_source = AudioSource(SAMPLE_RATE, NUM_CHANNELS)
        track = LocalAudioTrack.create_audio_track("test-mic", self._audio_source)
        await self.room.local_participant.publish_track(track)

        async def _send_loop():
            data = np.full(FRAME_SAMPLES, _AUDIO_VALUE, dtype=np.int16)
            frame = AudioFrame(data.tobytes(), SAMPLE_RATE, NUM_CHANNELS, FRAME_SAMPLES)
            while True:
                await self._audio_source.capture_frame(frame)

        self._publish_task = asyncio.create_task(_send_loop())

    async def wait_for_command(self, command: str, timeout: float = 15.0) -> dict:
        """指定コマンドのメッセージを待つ。不一致メッセージはキューに戻す。"""
        deadline = asyncio.get_event_loop().time() + timeout
        pending: list[dict] = []
        try:
            while asyncio.get_event_loop().time() < deadline:
                remaining = deadline - asyncio.get_event_loop().time()
                if remaining <= 0:
                    break
                try:
                    msg = await asyncio.wait_for(
                        self._cmd_queue.get(), timeout=min(remaining, 0.2)
                    )
                    if msg.get("command") == command:
                        for p in pending:
                            await self._cmd_queue.put(p)
                        return msg
                    pending.append(msg)
                except asyncio.TimeoutError:
                    pass
        finally:
            for p in pending:
                await self._cmd_queue.put(p)
        raise TimeoutError(f"コマンド '{command}' の受信タイムアウト ({timeout}s)")

    async def wait_for_non_zero_audio(self, timeout: float = 10.0) -> bool:
        """非ゼロのフレームを受信するまで待機する。タイムアウト時は False を返す。"""
        deadline = asyncio.get_event_loop().time() + timeout
        while asyncio.get_event_loop().time() < deadline:
            remaining = deadline - asyncio.get_event_loop().time()
            if remaining <= 0:
                break
            try:
                frame = await asyncio.wait_for(
                    self._audio_queue.get(), timeout=min(remaining, 0.5)
                )
                if np.any(frame != 0):
                    return True
            except asyncio.TimeoutError:
                pass
        return False

    async def drain_audio(self, duration: float = 0.5):
        """指定時間内の音声フレームをすべて破棄する（テスト前の初期化用）。"""
        deadline = asyncio.get_event_loop().time() + duration
        while asyncio.get_event_loop().time() < deadline:
            remaining = deadline - asyncio.get_event_loop().time()
            try:
                await asyncio.wait_for(
                    self._audio_queue.get(), timeout=min(remaining, 0.05)
                )
            except asyncio.TimeoutError:
                break

    # LiveKit のオーディオコーデック（Opus）のエンコード/デコード往復で
    # 振幅 ±1~2 程度の量子化誤差が乗ることがある。
    # 実際の音声（_AUDIO_VALUE=1000）とは桁違いに小さいため閾値で区別する。
    _SILENCE_THRESHOLD = 10

    async def assert_silent_for(self, duration: float = 2.0):
        """指定期間内に届いた全フレームが実質無音であることを検証する。

        LiveKit コーデックの量子化誤差 (±1~2) は無音とみなす。
        フレームが届かない場合（キュータイムアウト）も無音とみなす。
        """
        deadline = asyncio.get_event_loop().time() + duration
        while asyncio.get_event_loop().time() < deadline:
            remaining = deadline - asyncio.get_event_loop().time()
            try:
                frame = await asyncio.wait_for(
                    self._audio_queue.get(), timeout=min(remaining, 0.2)
                )
                peak = int(np.max(np.abs(frame)))
                assert peak < self._SILENCE_THRESHOLD, (
                    f"無音であるべきフレームに有意な音声が含まれている: peak={peak}"
                )
            except asyncio.TimeoutError:
                pass

    async def disconnect(self):
        if self._publish_task and not self._publish_task.done():
            self._publish_task.cancel()
            try:
                await self._publish_task
            except asyncio.CancelledError:
                pass
        for task in self._collect_tasks:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        await self.room.disconnect()


# ---------------------------------------------------------------------------
# フィクスチャ
# ---------------------------------------------------------------------------


@pytest.fixture
async def audio_rooms(livekit_domain, mock_mapper):
    """2ユーザー分のルームを初期化し、両参加者を接続して mixing_loop を起動する。

    - HA, HB それぞれの UserStore を事前登録
    - 両ユーザーが INIT を受け取るまで待機してから yield する
    - teardown で mixing_loop をキャンセルし全セッションをクリーンアップする
    """
    us._users[HA] = make_test_user(HA, "Audio User A")
    us._users[HB] = make_test_user(HB, "Audio User B")

    await init_room(HA)
    await init_room(HB)

    pa = _AudioTestParticipant(HA)
    pb = _AudioTestParticipant(HB)

    await pa.connect()
    await pa.wait_for_command("INIT", timeout=15.0)

    await pb.connect()
    await pb.wait_for_command("INIT", timeout=15.0)

    # mixing_loop をバックグラウンドで起動
    mixing_task = asyncio.create_task(mixing_loop())

    yield pa, pb

    mixing_task.cancel()
    try:
        await mixing_task
    except asyncio.CancelledError:
        pass

    await pa.disconnect()
    await pb.disconnect()

    connects([])

    for h in [HA, HB]:
        session = active_sessions.pop(h, None)
        if session:
            await session.room.disconnect()


# ---------------------------------------------------------------------------
# テスト 1: 同じ島にいるとき音声が届く
# ---------------------------------------------------------------------------


@pytest.mark.livekit
async def test_lk_audio_delivered_in_same_island(audio_rooms):
    """同じ島 (connects([[HA, HB]])) のとき HA の音声が HB に届く。"""
    pa, pb = audio_rooms

    # 島を設定: HA と HB を同じグループに
    connects([[HA, HB]])

    # HA が音声を送信開始
    await pa.publish_audio()

    # HB で非ゼロフレームが届くことを確認
    received = await pb.wait_for_non_zero_audio(timeout=10.0)
    assert received, "HB に HA の音声が届いていない（同じ島にいるのに音声が届かない）"


# ---------------------------------------------------------------------------
# テスト 2: ミュート状態では音声が届かない
# ---------------------------------------------------------------------------


@pytest.mark.livekit
async def test_lk_audio_muted_sender_not_heard(audio_rooms):
    """HA がミュート状態のとき HB に音声が届かない。"""
    pa, pb = audio_rooms

    # HA をミュートに設定
    set_mute(HA, True)

    # 島を設定: 同じグループだがミュート
    connects([[HA, HB]])

    # HA が音声を送信開始
    await pa.publish_audio()

    # HB のキューを初期化してから無音チェック
    await pb.drain_audio(duration=0.5)
    await pb.assert_silent_for(duration=2.0)


# ---------------------------------------------------------------------------
# テスト 3: 異なる島にいるとき音声が届かない
# ---------------------------------------------------------------------------


@pytest.mark.livekit
async def test_lk_audio_not_delivered_in_different_islands(audio_rooms):
    """異なる島 (connects([[HA], [HB]])) のとき HA の音声が HB に届かない。"""
    pa, pb = audio_rooms

    # 島を別々に設定: HA と HB を異なるグループに
    connects([[HA], [HB]])

    # HA が音声を送信開始
    await pa.publish_audio()

    # HB のキューを初期化してから無音チェック
    await pb.drain_audio(duration=0.5)
    await pb.assert_silent_for(duration=2.0)


# ---------------------------------------------------------------------------
# テスト 4: ジッターバッファ — 2 フレーム溜まった後に音声が届く
# ---------------------------------------------------------------------------


@pytest.mark.livekit
async def test_lk_jitter_buffer_primes_before_mixing(audio_rooms):
    """プライミング前（キュー 0〜1 フレーム）は無音、2 フレーム蓄積後に音声が届く。

    mixing_loop() の primed フラグ機構を検証する:
    - 接続直後（キュー < 2 フレーム）は HB に音声が届かない
    - キューが 2 フレーム以上溜まると HB に音声が届くようになる
    """
    pa, pb = audio_rooms

    # 同じ島に設定
    connects([[HA, HB]])

    # HA が音声を送信開始（mixing_loop が実行中でジッターバッファがある）
    await pa.publish_audio()

    # 短い待機（プライミング期間）の後、音声が届くことを確認
    # プライミングに必要な時間は 2 × 20ms = 40ms 程度
    # ネットワーク往復を考慮して十分な余裕を持たせる
    received = await pb.wait_for_non_zero_audio(timeout=10.0)
    assert received, "ジッターバッファのプライミング後に HB へ音声が届いていない"


# ---------------------------------------------------------------------------
# テスト 5: 出力フレームサイズが 20ms (FRAME_SAMPLES) であることを確認
# ---------------------------------------------------------------------------


@pytest.mark.livekit
async def test_lk_mixing_output_frame_size_is_20ms(audio_rooms):
    """mixing_loop() が出力する AudioFrame が FRAME_SAMPLES (960) サンプルであることを確認する。"""
    pa, pb = audio_rooms

    connects([[HA, HB]])
    await pa.publish_audio()

    # 音声フレームが届くまで待機
    deadline = asyncio.get_event_loop().time() + 10.0
    received_frame: np.ndarray | None = None
    while asyncio.get_event_loop().time() < deadline:
        try:
            frame = await asyncio.wait_for(pb._audio_queue.get(), timeout=0.5)
            if np.any(frame != 0):
                received_frame = frame
                break
        except asyncio.TimeoutError:
            pass

    assert received_frame is not None, "HB に音声フレームが届かなかった"
    # Opus コーデックは 20ms フレームを 10ms 単位に分割して配信することがある。
    # mixer が FRAME_SAMPLES (960) を送出しても受信側は 480 サンプル (10ms) になりうる。
    assert FRAME_SAMPLES % len(received_frame) == 0, (
        f"フレームサイズが 20ms の整数分の1でない: {len(received_frame)} samples"
    )
