from json import load
from logging import getLogger
from asyncio import create_task, sleep, gather
from fastapi import FastAPI
from ..rtc.rtc import lkapi
from ..rtc.mixer import mixing_loop
from ..rtc.state import connects, active_sessions, audio_tasks
from contextlib import asynccontextmanager
from ..master.user import us
from ..rtc.adapter import HostCommand, MovedCommand, send_message
from ..utils.schema import MapMeta
from ..utils.logger import init_logger
from ..master.grid import MapRaw
from ..master.mapper import mapper
from ..master.connections import connections_to_islands
from api.utils.config import MAPS_JSON

logger = getLogger(__name__)


async def _position_ticker():
    """毎秒ユーザー位置を集計し、島グループと MOVE を更新する"""
    while True:
        await sleep(1)
        if not mapper:
            continue
        result = mapper.last_updated()
        islands = connections_to_islands(mapper.last_connections)
        connects(islands)
        if result.moves:
            # 自分自身の座標は送信しない（クライアント側の座標を優先）
            for recipient_h in list(active_sessions.keys()):
                others = [mv for mv in result.moves if mv.h != recipient_h]
                if others:
                    await send_message(
                        recipient_h, HostCommand.MOVED, MovedCommand(moves=others)
                    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_logger("app")
    logger.info("start lifespan")
    us.load()
    with open(MAPS_JSON) as f:
        data = load(f)
    maps = data.get("maps", {})
    if maps:
        map_name, map_data = next(iter(maps.items()))
        meta = MapMeta(
            name=map_name,
            top=map_data.get("top", ""),
            bottom=map_data.get("bottom", ""),
        )
        mapper.init(MapRaw(red=map_data["red"], black=map_data["black"]), meta)
        logger.info(f"map initialized: {map_name}")
    mixing_task = create_task(mixing_loop())
    ticker_task = create_task(_position_ticker())
    yield
    logger.info("end lifespan")
    mixing_task.cancel()
    ticker_task.cancel()
    await gather(mixing_task, ticker_task, return_exceptions=True)
    # _process_user_audio タスクをキャンセルし AudioStream.aclose() で FFI サブスクリプションを解除
    _audio_tasks = list(audio_tasks)
    for task in _audio_tasks:
        task.cancel()
    await gather(*_audio_tasks, return_exceptions=True)
    for session in list(active_sessions.values()):
        try:
            await session.room.disconnect()
        except Exception:
            pass
    active_sessions.clear()
    await lkapi.aclose()
    # LiveKit の FFI ネイティブスレッドが disconnect 後も teardown イベントを送出し続けるため、
    # イベントループが閉じる前に "error putting to queue: Event loop is closed" が出る。
    # 短い待機でコールバックを排出させることで警告を抑制する。
    await sleep(0.5)
