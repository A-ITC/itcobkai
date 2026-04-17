from logging import getLogger
from pydantic import BaseModel
from ..rtc.rtc import lkapi, init_room
from ..rtc.state import RoomContext
from livekit.api import RoomParticipantIdentity
from ..master.user import us
from ..rtc.adapter import (
    AlertCommand,
    MovedCommand,
    NewmapCommand,
    send_message,
    send_message_all,
)
from ..utils.schema import Move
from ..master.connection_service import connection_service
from ..master.grid import prepare_map
from ..master.map_repository import map_repository
from ..master.position_store import position_store
from fastapi.responses import JSONResponse

logger = getLogger(__name__)


class MasterRequest(BaseModel):
    command: str
    map: str | None = None
    text: str | None = None
    reload: bool = False
    h: str | None = None


async def master_request(ctx: RoomContext, post: MasterRequest):
    room_position_store = ctx.position_store
    room_connection_service = ctx.connection_service
    room_user_store = ctx.user_store or us

    if post.command == "ALERT":
        text = post.text or ""
        await send_message_all(ctx, AlertCommand(text=text, reload=post.reload))
        return {"ok": True}

    if post.command == "NEWMAP" and post.map:
        try:
            meta = map_repository.load_map(post.map)
        except KeyError:
            return JSONResponse(content={"error": "Map not found"}, status_code=404)
        try:
            prepared = prepare_map(meta)
            room_position_store.initialize(prepared)
            room_connection_service.initialize(prepared)
        except ValueError as e:
            return JSONResponse(content={"error": str(e)}, status_code=400)
        moves: list[Move] = []
        for session_h in list(ctx.active_sessions.keys()):
            move = room_position_store.new_user(session_h)
            room_user_store.set_position(session_h, move.x, move.y)
            moves.append(move)
        ctx.connects(
            room_connection_service.get_current_islands(
                room_position_store.get_all_positions()
            )
        )
        await send_message_all(
            ctx, NewmapCommand(map=room_position_store.get_map_meta())
        )
        if moves:
            # 自分自身の座標は送信しない（クライアント側の座標を優先）
            for recipient_h in list(ctx.active_sessions.keys()):
                others = [mv for mv in moves if mv.h != recipient_h]
                if others:
                    await send_message(ctx, recipient_h, MovedCommand(moves=others))
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
        for session_h in list(ctx.active_sessions.keys()):
            user = room_user_store.get(session_h)
            users.append({"h": session_h, "name": user.name if user else ""})
        return {"users": users}

    if post.command == "BOTINIT" and post.h:
        h = post.h
        old = ctx.active_sessions.pop(h, None)
        if old:
            try:
                await old.room.disconnect()
            except Exception:
                pass
        await init_room(ctx, h)
        return {"ok": True}

    return JSONResponse(content={"error": "Unknown command"}, status_code=400)
