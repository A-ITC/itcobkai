from json import load as json_load
from ..rtc.rtc import mixing_loop, lkapi, connects, active_sessions
from logging import getLogger
from asyncio import create_task, sleep, gather
from ..master.mapper import MapRaw, mapper, connections_to_islands
from ..utils.schema import MapMeta
from ..rtc.adapter import (
    HostCommand,
    MovedCommand,
    send_message,
)
from fastapi import FastAPI
from ..master.user import us
from contextlib import asynccontextmanager

logger = getLogger(__name__)

_DATA_JSON = "data/itcobkai.json"


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
    logger.info("start lifespan")
    us.load()
    with open(_DATA_JSON) as f:
        data = json_load(f)
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
    for session in list(active_sessions.values()):
        try:
            await session.room.disconnect()
        except Exception:
            pass
    active_sessions.clear()
    await lkapi.aclose()
