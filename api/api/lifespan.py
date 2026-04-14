from json import load
from logging import getLogger
from asyncio import create_task, gather
from fastapi import FastAPI
from ..rtc.rtc import lkapi
from contextlib import asynccontextmanager
from ..rtc.mixer import mixing_loop
from ..rtc.state import active_sessions, audio_tasks
from ..master.user import us
from ..master.grid import MapRaw
from ..utils.schema import MapMeta
from ..utils.config import MAPS_JSON
from ..utils.logger import init_logger
from ..master.mapper import mapper
from ..master.master import register

logger = getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_logger("app")
    # GuestCommand の各ハンドラーをモジュールインポート副作用ではなく明示的に登録する
    register()
    logger.info("start lifespan")
    us.load()
    with open(MAPS_JSON) as f:
        data = load(f)
    maps = data.get("maps", {})
    if not maps:
        raise RuntimeError(
            "maps.json にマップが定義されていません。アプリを起動できません。"
        )
    map_name, map_data = next(iter(maps.items()))
    meta = MapMeta(
        name=map_name,
        top=map_data.get("top", ""),
        bottom=map_data.get("bottom", ""),
    )
    # ValueError は伝播させてアプリ起動を失敗させる
    mapper.init(MapRaw(red=map_data["red"], black=map_data["black"]), meta)
    logger.info(f"map initialized: {map_name}")
    mixing_task = create_task(mixing_loop())
    yield
    logger.info("end lifespan")
    mixing_task.cancel()
    await gather(mixing_task, return_exceptions=True)
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
