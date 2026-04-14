import asyncio
import numpy as np

from asyncio import CancelledError, current_task, get_event_loop, sleep
from livekit.rtc import AudioFrame, AudioStream, Track

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

# キューの最大積算フレーム数（20ms × 10 = 200ms 分を上限とする）
_MAX_QUEUE_SIZE = 10


async def process_user_audio(session: UserSession, track: Track):
    """受信した音声を FRAME_SAMPLES サイズに揃えてキューに詰める（受信側の処理）

    LiveKit から届くフレームサイズは送信側に依存するため、
    内部バッファで FRAME_SAMPLES サンプルに切り揃えてからキューに積む。
    """
    audio_stream = AudioStream(
        track, sample_rate=SAMPLE_RATE, num_channels=NUM_CHANNELS
    )
    buf = np.empty(0, dtype=np.int16)
    try:
        async for event in audio_stream:
            chunk = np.frombuffer(event.frame.data, dtype=np.int16)
            buf = np.concatenate((buf, chunk))
            # FRAME_SAMPLES 単位で切り出してキューに積む
            while len(buf) >= FRAME_SAMPLES:
                frame_data = buf[:FRAME_SAMPLES].copy()
                buf = buf[FRAME_SAMPLES:]
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
                pass

        # 島ごとのミキシング（capture_frame ごとの coroutine を収集して並列実行）
        capture_coros = []
        # current_islands のスナップショット（このループ中に connects() が呼ばれても安全）
        for island in list(current_islands):
            # ミュートしていないユーザーの音声フレームを収集（O(N)）
            # active_sessions.get() で確認と取得を一操作にまとめ KeyError を排除
            frames = {}
            for u in island:
                s = active_sessions.get(u)
                if s is not None and u not in muted_users:
                    frames[u] = s.last_frame

            # 全員の音声合計を int32 で一度だけ計算（O(N)）
            total_sum: np.ndarray | None = (
                np.sum(list(frames.values()), axis=0, dtype=np.int32)
                if frames
                else None
            )

            for target_user in island:
                session = active_sessions.get(target_user)
                if not session:
                    continue

                if total_sum is None:
                    # 非ミュートユーザーが誰もいない
                    mixed = np.zeros(FRAME_SAMPLES, dtype=np.int16)
                elif target_user in frames:
                    # Total Sum から自分の音声を引く（O(1)）
                    mixed_large = total_sum - frames[target_user].astype(np.int32)
                    mixed = np.clip(mixed_large, -32768, 32767).astype(np.int16)
                else:
                    # 自分がミュート中 → 自分の音声は total_sum に含まれていない
                    mixed = np.clip(total_sum, -32768, 32767).astype(np.int16)

                audio_frame = AudioFrame(
                    mixed.tobytes(), SAMPLE_RATE, NUM_CHANNELS, FRAME_SAMPLES
                )
                capture_coros.append(session.audio_source.capture_frame(audio_frame))

        # 全ユーザーへの送信を並列実行（逐次 await を排除）
        if capture_coros:
            await asyncio.gather(*capture_coros)

        # 絶対時刻ベースで 20ms 間隔を維持（ドリフト防止）
        await sleep(max(0.0, next_tick - loop.time()))
