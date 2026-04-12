from json import load
from logging import getLogger
from pydantic import BaseModel
from ..rtc.rtc import lkapi, init_room
from ..rtc.state import active_sessions
from livekit.api import RoomParticipantIdentity
from ..master.user import us
from ..rtc.adapter import (
    AlertCommand,
    MovedCommand,
    NewmapCommand,
    send_message,
    send_message_all,
)
from ..master.grid import MapRaw
from ..utils.config import MAPS_JSON
from ..utils.schema import MapMeta, Move
from ..master.mapper import mapper
from fastapi.responses import JSONResponse

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
        with open(MAPS_JSON) as f:
            data = load(f)
        map_data = data.get("maps", {}).get(post.map)
        if not map_data:
            return JSONResponse(content={"error": "Map not found"}, status_code=404)
        meta = MapMeta(
            name=post.map,
            top=map_data.get("top", ""),
            bottom=map_data.get("bottom", ""),
        )
        mapper.init(MapRaw(red=map_data["red"], black=map_data["black"]), meta)
        if mapper:
            moves: list[Move] = []
            for session_h in list(active_sessions.keys()):
                move = mapper.new_user(session_h)
                us.set_position(session_h, move.x, move.y)
                moves.append(move)
            await send_message_all(NewmapCommand(map=mapper.get_map_meta()))
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
