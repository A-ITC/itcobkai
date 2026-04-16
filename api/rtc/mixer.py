import asyncio
import numpy as np
from logging import getLogger
from .state import (
    SAMPLE_RATE,
    NUM_CHANNELS,
    FRAME_SAMPLES,
    FRAME_DURATION_S,
    UserSession,
    active_sessions,
    current_islands,
    muted_users,
    audio_tasks,
)
from asyncio import CancelledError, current_task, get_event_loop, sleep
from livekit.rtc import AudioFrame, AudioStream, Track

logger = getLogger(__name__)

# キューの最大積算フレーム数（20ms × 10 = 200ms 分を上限とする）
_MAX_QUEUE_SIZE = 10

# ミキシングループ用事前確保バッファ
# asyncio は単一スレッドで動作するため、ループ内で順番に使用する限り安全に再利用できる
_island_sum = np.empty(
    FRAME_SAMPLES, dtype=np.int32
)  # 島ごとの合計音声（read-only for per-user loop）
_user_mix = np.empty(FRAME_SAMPLES, dtype=np.int32)  # ユーザーごとの差分計算バッファ
_user_mix16 = np.empty(FRAME_SAMPLES, dtype=np.int16)  # int16 変換用出力バッファ
_silence_bytes = np.zeros(
    FRAME_SAMPLES, dtype=np.int16
).tobytes()  # 無音フレーム（定数）


async def process_user_audio(session: UserSession, track: Track):
    """受信した音声を FRAME_SAMPLES サイズに揃えてキューに詰める（受信側の処理）

    LiveKit から届くフレームサイズは送信側に依存するため、
    内部バッファで FRAME_SAMPLES サンプルに切り揃えてからキューに積む。
    リスト型バッファを使い、フレームサイズが一致する場合の不要な配列アロケーションを削減する。
    """
    audio_stream = AudioStream(
        track, sample_rate=SAMPLE_RATE, num_channels=NUM_CHANNELS
    )
    buf_chunks: list[np.ndarray] = []
    buf_total = 0
    try:
        async for event in audio_stream:
            chunk = np.frombuffer(event.frame.data, dtype=np.int16)
            buf_chunks.append(chunk)
            buf_total += len(chunk)
            # FRAME_SAMPLES 単位で切り出してキューに積む
            while buf_total >= FRAME_SAMPLES:
                if len(buf_chunks[0]) >= FRAME_SAMPLES:
                    # 高速パス: 先頭チャンクから直接切り出す（新規配列アロケーション不要）
                    c = buf_chunks[0]
                    frame_data = c[:FRAME_SAMPLES].copy()
                    remainder = c[FRAME_SAMPLES:]
                    if len(remainder) > 0:
                        buf_chunks[0] = remainder
                    else:
                        buf_chunks.pop(0)
                else:
                    # 低速パス: 複数の小チャンクを結合してから切り出す
                    combined = np.concatenate(buf_chunks)
                    frame_data = combined[:FRAME_SAMPLES].copy()
                    remainder = combined[FRAME_SAMPLES:]
                    buf_chunks = [remainder] if len(remainder) > 0 else []
                    buf_total = len(remainder)
                    # while 条件に反映させるため buf_total は既にセット済み → continue で再判定
                    while session.audio_queue.qsize() >= _MAX_QUEUE_SIZE:
                        try:
                            session.audio_queue.get_nowait()
                        except asyncio.QueueEmpty:
                            break
                    await session.audio_queue.put(frame_data)
                    continue
                buf_total -= FRAME_SAMPLES
                # キューが溢れないよう古いものは捨てる（最大 200ms 分）
                while session.audio_queue.qsize() >= _MAX_QUEUE_SIZE:
                    try:
                        session.audio_queue.get_nowait()
                    except asyncio.QueueEmpty:
                        break
                await session.audio_queue.put(frame_data)
    except CancelledError:
        # シャットダウン時に FFI キュー購読を event loop が閉じる前に解除する
        await audio_stream.aclose()
        raise
    finally:
        audio_tasks.discard(current_task())


async def mixing_loop():
    """20ms ごとに各島の音声を合成して送信

    改善点:
    - 絶対時刻ベースのループ（ドリフトしない）
    - capture_frame() を asyncio.gather() で並列化（ループ内レイテンシ削減）
    - ジッターバッファ: 2 フレーム以上溜まるまでは last_frame（無音）を使用
    - キューが空のときはゼロ埋めではなく直前フレームを継続（音途切れ防止）
    - 事前確保バッファで numpy 中間配列の生成を削減（_island_sum / _user_mix / _user_mix16）
    """
    loop = get_event_loop()
    next_tick = loop.time()

    while True:
        next_tick += FRAME_DURATION_S

        # 各ユーザーの最新 20ms 分の音声をキューから取り出しておく
        # スナップショットを取ることで、await 中に active_sessions が変更されても
        # RuntimeError: dictionary changed size during iteration を防ぐ
        for session in list(active_sessions.values()):
            try:
                # ジッターバッファ: キューに 2 フレーム以上貯まるまで読み始めない
                if not session.primed:
                    if session.audio_queue.qsize() >= 2:
                        session.primed = True
                    else:
                        continue

                if not session.audio_queue.empty():
                    session.last_frame = await session.audio_queue.get()
                # キューが空の場合は last_frame を維持（ゼロ埋めしない）
            except Exception:
                logger.exception("mixing_loop: failed to read audio queue")

        # 島ごとのミキシング（capture_frame ごとの coroutine を収集して並列実行）
        capture_coros = []
        # current_islands のスナップショット（このループ中に connects() が呼ばれても安全）
        for island in list(current_islands):
            # ミュートしていないユーザーの音声フレームを収集（O(N)）
            # active_sessions.get() で確認と取得を一操作にまとめ KeyError を排除
            frames: dict[str, np.ndarray] = {}
            for u in island:
                s = active_sessions.get(u)
                if s is not None and u not in muted_users:
                    frames[u] = s.last_frame

            # 全員の音声合計を事前確保バッファに in-place で計算（中間配列の生成を回避）
            if frames:
                _island_sum[:] = 0
                for f in frames.values():
                    np.add(_island_sum, f, out=_island_sum, casting="unsafe")

            for target_user in island:
                session = active_sessions.get(target_user)
                if not session:
                    continue

                if not frames:
                    # 非ミュートユーザーが誰もいない → 無音（事前計算済み定数バイト列を使用）
                    audio_frame = AudioFrame(
                        _silence_bytes, SAMPLE_RATE, NUM_CHANNELS, FRAME_SAMPLES
                    )
                elif target_user in frames:
                    # Total Sum から自分の音声を引く（O(1)）、事前確保バッファを再利用
                    np.subtract(
                        _island_sum,
                        frames[target_user],
                        out=_user_mix,
                        casting="unsafe",
                    )
                    np.clip(_user_mix, -32768, 32767, out=_user_mix)
                    np.copyto(_user_mix16, _user_mix, casting="unsafe")
                    audio_frame = AudioFrame(
                        _user_mix16.tobytes(), SAMPLE_RATE, NUM_CHANNELS, FRAME_SAMPLES
                    )
                else:
                    # 自分がミュート中 → 自分の音声は _island_sum に含まれていない
                    np.clip(_island_sum, -32768, 32767, out=_user_mix)
                    np.copyto(_user_mix16, _user_mix, casting="unsafe")
                    audio_frame = AudioFrame(
                        _user_mix16.tobytes(), SAMPLE_RATE, NUM_CHANNELS, FRAME_SAMPLES
                    )

                capture_coros.append(session.audio_source.capture_frame(audio_frame))

        # 全ユーザーへの送信を並列実行（逐次 await を排除）
        if capture_coros:
            results = await asyncio.gather(*capture_coros, return_exceptions=True)
            for result in results:
                if isinstance(result, Exception):
                    logger.exception(
                        "mixing_loop: capture_frame failed", exc_info=result
                    )

        # 絶対時刻ベースで 20ms 間隔を維持（ドリフト防止）
        await sleep(max(0.0, next_tick - loop.time()))
