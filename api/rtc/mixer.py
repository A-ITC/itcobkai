import numpy as np

from asyncio import CancelledError, current_task, get_event_loop, sleep
from livekit.rtc import AudioFrame, AudioStream, Track

from .state import (
    SAMPLE_RATE,
    NUM_CHANNELS,
    SAMPLES_10MS,
    UserSession,
    active_sessions,
    current_islands,
    muted_users,
    audio_tasks,
)


async def process_user_audio(session: UserSession, track: Track):
    """受信した音声をキューに詰める（受信側の処理）"""
    audio_stream = AudioStream(track)
    try:
        async for event in audio_stream:
            frame_data = np.frombuffer(event.frame.data, dtype=np.int16)
            # キューが溢れないよう古いものは捨てる（最大200ms分程度）
            if session.audio_queue.qsize() > 20:
                await session.audio_queue.get()
            await session.audio_queue.put(frame_data)
    except CancelledError:
        # シャットダウン時に FFI キュー購読を event loop が閉じる前に解除する
        await audio_stream.aclose()
        raise
    finally:
        audio_tasks.discard(current_task())


async def mixing_loop():
    """10msごとに各島の音声を合成して送信"""
    while True:
        start_time = get_event_loop().time()

        # 各ユーザーの最新10ms分の音声をキューから取り出しておく
        for session in active_sessions.values():
            try:
                if not session.audio_queue.empty():
                    session.last_frame = await session.audio_queue.get()
                else:
                    # データがない場合はフェードアウトするか無音にする
                    session.last_frame = np.zeros(SAMPLES_10MS, dtype=np.int16)
            except Exception:
                pass

        # 島ごとのミキシング
        for island in current_islands:
            for target_user in island:
                session = active_sessions.get(target_user)
                if not session:
                    continue

                # 自分以外のミュートしていないユーザーの音声を合成
                others = [
                    active_sessions[u].last_frame
                    for u in island
                    if u != target_user
                    and u in active_sessions
                    and u not in muted_users
                ]

                if not others:
                    mixed = np.zeros(SAMPLES_10MS, dtype=np.int16)
                else:
                    # 複数人の音声を加算 (int32で計算してクリッピング防止)
                    mixed_large = np.sum(others, axis=0, dtype=np.int32)
                    mixed = np.clip(mixed_large, -32768, 32767).astype(np.int16)

                # フレームの送信
                audio_frame = AudioFrame(
                    mixed.tobytes(), SAMPLE_RATE, NUM_CHANNELS, SAMPLES_10MS
                )
                await session.audio_source.capture_frame(audio_frame)

        # 10ms間隔を維持するための精密な待機
        elapsed = get_event_loop().time() - start_time
        await sleep(max(0, 0.01 - elapsed))
