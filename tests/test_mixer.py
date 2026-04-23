import asyncio
from types import SimpleNamespace

import numpy as np
import pytest

from api.rtc.mixer import mixing_loop
from api.rtc.state import (
    FRAME_DURATION_S,
    FRAME_SAMPLES,
    active_sessions,
    connects,
    volumes,
)


class _CaptureSource:
    def __init__(self):
        self.frames: list[np.ndarray] = []

    async def capture_frame(self, frame):
        self.frames.append(np.frombuffer(frame.data, dtype=np.int16).copy())


def _make_session(last_frame: np.ndarray):
    return SimpleNamespace(
        audio_source=_CaptureSource(),
        audio_queue=asyncio.Queue(),
        last_frame=last_frame,
        primed=True,
    )


async def _run_until_captured(source: _CaptureSource) -> np.ndarray:
    task = asyncio.create_task(mixing_loop())
    deadline = asyncio.get_event_loop().time() + 1.0
    try:
        while asyncio.get_event_loop().time() < deadline:
            if source.frames:
                return source.frames[0]
            await asyncio.sleep(FRAME_DURATION_S / 2)
    finally:
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    raise AssertionError("mixing_loop did not produce an output frame in time")


@pytest.mark.asyncio
async def test_mixing_loop_uses_default_volume_one():
    sender = _make_session(np.full(FRAME_SAMPLES, 1000, dtype=np.int16))
    receiver = _make_session(np.zeros(FRAME_SAMPLES, dtype=np.int16))
    active_sessions["sender"] = sender
    active_sessions["receiver"] = receiver
    connects([["sender", "receiver"]])

    frame = await _run_until_captured(receiver.audio_source)

    assert np.max(np.abs(frame)) == 1000


@pytest.mark.asyncio
async def test_mixing_loop_applies_squared_volume_gain():
    sender = _make_session(np.full(FRAME_SAMPLES, 1000, dtype=np.int16))
    receiver = _make_session(np.zeros(FRAME_SAMPLES, dtype=np.int16))
    active_sessions["sender"] = sender
    active_sessions["receiver"] = receiver
    volumes["sender"] = 1.5
    connects([["sender", "receiver"]])

    frame = await _run_until_captured(receiver.audio_source)

    assert np.max(np.abs(frame)) == 2250


@pytest.mark.asyncio
async def test_mixing_loop_volume_zero_silences_sender():
    sender = _make_session(np.full(FRAME_SAMPLES, 1000, dtype=np.int16))
    receiver = _make_session(np.zeros(FRAME_SAMPLES, dtype=np.int16))
    active_sessions["sender"] = sender
    active_sessions["receiver"] = receiver
    volumes["sender"] = 0.0
    connects([["sender", "receiver"]])

    frame = await _run_until_captured(receiver.audio_source)

    assert np.max(np.abs(frame)) == 0
