from logging import getLogger
from pydantic import BaseModel
from ..rtc.rtc import lkapi, init_room
from ..rtc.state import active_sessions, connects
from livekit.api import RoomParticipantIdentity
from ..master.user import us
from ..rtc.adapter import (
    AlertCommand,
    MovedCommand,
    NewmapCommand,
    send_message,
    send_message_all,
)
from ..master.grid import prepare_map
from ..utils.schema import Move
from fastapi.responses import JSONResponse
from ..master.map import map_repository
from ..master.position import position_store
from ..master.connection_service import connection_service

logger = getLogger(__name__)


class MasterRequest(BaseModel):
    command: str
    map: str | None = None
    text: str | None = None
    reload: bool = False
    h: str | None = None


async def master_request(post: MasterRequest):
    if post.command == "ALERT":
        text = post.text or ""
        await send_message_all(AlertCommand(text=text, reload=post.reload))
        return {"ok": True}

    if post.command == "NEWMAP" and post.map:
        try:
            meta = map_repository.load_map(post.map)
        except KeyError:
            return JSONResponse(content={"error": "Map not found"}, status_code=404)
        try:
            prepared = prepare_map(meta)
            position_store.initialize(prepared)
            connection_service.initialize(prepared)
        except ValueError as e:
            return JSONResponse(content={"error": str(e)}, status_code=400)
        moves: list[Move] = []
        for session_h in list(active_sessions.keys()):
            move = position_store.new_user(session_h)
            us.set_position(session_h, move.x, move.y)
            moves.append(move)
        connects(
            connection_service.get_current_islands(position_store.get_all_positions())
        )
        await send_message_all(NewmapCommand(map=position_store.get_map_meta()))
        if moves:
            # 自分自身の座標は送信しない（クライアント側の座標を優先）
            for recipient_h in list(active_sessions.keys()):
                others = [mv for mv in moves if mv.h != recipient_h]
                if others:
                    await send_message(recipient_h, MovedCommand(moves=others))
        return {"ok": True}

    if post.command == "LEAVE" and post.h:
        try:
            await lkapi.room.remove_participant(
                RoomParticipantIdentity(room=post.h, identity=post.h)
            )
        except Exception as e:
            return JSONResponse(content={"error": str(e)}, status_code=400)
        return {"ok": True}

    if post.command == "USERS":
        users = []
        for session_h in list(active_sessions.keys()):
            user = us.get(session_h)
            users.append({"h": session_h, "name": user.name if user else ""})
        return {"users": users}

    if post.command == "BOTINIT" and post.h:
        h = post.h
        old = active_sessions.pop(h, None)
        if old:
            try:
                await old.room.disconnect()
            except Exception:
                pass
        await init_room(h)
        return {"ok": True}

    return JSONResponse(content={"error": "Unknown command"}, status_code=400)
