from logging import getLogger
from asyncio import create_task, gather
from fastapi import FastAPI
from ..rtc.rtc import lkapi
from contextlib import asynccontextmanager
from ..rtc.mixer import mixing_loop
from ..rtc.state import create_room_context
from ..master.user import us
from ..utils.logger import init_logger
from ..master.connection_service import connection_service
from ..master.grid import prepare_map
from ..master.map_repository import map_repository
from ..master.position_store import position_store
from ..master.master import register

logger = getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_logger("app")
    room_context = create_room_context(
        position_store=position_store,
        connection_service=connection_service,
        user_store=us,
    )
    app.state.room_context = room_context
    # GuestCommand の各ハンドラーをモジュールインポート副作用ではなく明示的に登録する
    register(room_context)
    logger.info("start lifespan")
    us.load()
    meta = map_repository.load_map()
    prepared = prepare_map(meta)
    # ValueError は伝播させてアプリ起動を失敗させる
    position_store.initialize(prepared)
    connection_service.initialize(prepared)
    logger.info(f"map initialized: {meta.name}")
    mixing_task = create_task(mixing_loop(room_context))
    yield
    logger.info("end lifespan")
    mixing_task.cancel()
    await gather(mixing_task, return_exceptions=True)
    # _process_user_audio タスクをキャンセルし AudioStream.aclose() で FFI サブスクリプションを解除
    _audio_tasks = list(room_context.audio_tasks)
    for task in _audio_tasks:
        task.cancel()
    await gather(*_audio_tasks, return_exceptions=True)
    for session in list(room_context.active_sessions.values()):
        try:
            await session.room.disconnect()
        except Exception:
            pass
    room_context.audio_tasks.clear()
    room_context.active_sessions.clear()
    room_context.current_islands.clear()
    room_context.muted_users.clear()
    await lkapi.aclose()
