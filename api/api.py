from time import time
from json import load as json_load
from .rtc import create_token, init_room, mixing_loop, lkapi, connects, active_sessions
from livekit.api import RoomParticipantIdentity
from .auth import auth, encode, decode
from pathlib import Path
from logging import getLogger
from asyncio import create_task, sleep
from .config import AVATAR_DIR, MAP_DIR, TTL, APP_NAME
from .mapper import MapRaw, init_mapper, connections_to_islands
from . import mapper as mapper_module
from .adapter import HostCommand, send_message_all
from fastapi import FastAPI, APIRouter, Depends, Request, HTTPException
from .discord import discord
from pydantic import BaseModel
from contextlib import asynccontextmanager
from fastapi.responses import JSONResponse, FileResponse

router = APIRouter()

logger = getLogger(__name__)

_DATA_JSON = "data/itcobkai.json"


async def _position_ticker():
    """毎秒ユーザー位置を集計し、島グループと MOVE を更新する"""
    while True:
        await sleep(1)
        m = mapper_module.mapper
        if m is None:
            continue
        result = m.last_updated()
        islands = connections_to_islands(m.last_connections)
        connects(islands)
        if result["moves"]:
            moves = [{"h": mv.h, "x": mv.x, "y": mv.y} for mv in result["moves"]]
            await send_message_all(HostCommand.MOVE, {"moves": moves})


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("start lifespan")
    with open(_DATA_JSON) as f:
        data = json_load(f)
    maps = data.get("maps", {})
    if maps:
        map_name, map_data = next(iter(maps.items()))
        meta = {
            "name": map_name,
            "top": map_data.get("top", ""),
            "bottom": map_data.get("bottom", ""),
        }
        init_mapper(MapRaw(red=map_data["red"], black=map_data["black"]), meta)
        logger.info(f"map initialized: {map_name}")
    create_task(mixing_loop())
    create_task(_position_ticker())
    yield
    logger.info("end lifespan")
    await lkapi.aclose()


class InitRequest(BaseModel):
    username: str


@router.post("/api/init")
async def init(h=Depends(auth)):
    await init_room(h)
    return {"token": create_token(h, h)}


class SessionRequest(BaseModel):
    code: str
    redirect: str


@router.get("/api/session")
async def session(post: SessionRequest):
    info = await discord(post.code, post.redirect)
    response = JSONResponse(content={"ok": True})
    response.set_cookie(
        key="session",
        value=encode({"h": info.id}),
        httponly=True,
        samesite="strict",
        secure=True,
        max_age=365 * 24 * 60 * 60,
    )
    return response


@router.get("/api/token")
def token(request: Request):
    session_cookie = request.cookies.get("session")
    session = decode(session_cookie)
    return {"token": encode({"h": session["h"], "iat": int(time())}), "ttl": TTL}


@router.get("/dist")
def get_root():
    """index.htmlを返すエンドポイント"""
    return FileResponse("dist/index.html")


@router.get("/dist/assets/{filename:str}")
def get_asset(filename: str):
    """JS/CSSファイルを返すエンドポイント"""
    headers = {"Cache-Control": "public, max-age=86400"}
    if (file_path := Path("dist/assets") / filename).is_file():
        return FileResponse(str(file_path), headers=headers)
    return JSONResponse(content={"error": "File not found"}, status_code=404)


@router.get("/dist/images/{hash:str}")
def get_image(hash: str):
    """画像を返すエンドポイント"""
    headers = {"Cache-Control": "public, max-age=86400"}
    if (file_path := Path(MAP_DIR) / f"{hash}.png").is_file():
        return FileResponse(str(file_path), headers=headers)
    if (file_path := Path(AVATAR_DIR) / f"{hash}.webp").is_file():
        return FileResponse(str(file_path), headers=headers)
    return JSONResponse(content={"error": "Image not found"}, status_code=404)


class MasterRequest(BaseModel):
    command: str
    map: str | None = None
    text: str | None = None
    reload: bool = False
    h: str | None = None


def _check_localhost(request: Request):
    host = request.client.host if request.client else None
    if host not in ("127.0.0.1", "::1"):
        raise HTTPException(status_code=403, detail="Forbidden")


@router.post("/api/master")
async def master_endpoint(request: Request, post: MasterRequest):
    """管理者用エンドポイント（localhost からのみ実行可能）。"""
    _check_localhost(request)

    if post.command == "ALERT":
        text = post.text or ""
        await send_message_all(HostCommand.ALERT, {"text": text, "reload": post.reload})
        return {"ok": True}

    if post.command == "NEWMAP" and post.map:
        with open(_DATA_JSON) as f:
            data = json_load(f)
        map_data = data.get("maps", {}).get(post.map)
        if not map_data:
            return JSONResponse(content={"error": "Map not found"}, status_code=404)
        meta = {
            "name": post.map,
            "top": map_data.get("top", ""),
            "bottom": map_data.get("bottom", ""),
        }
        init_mapper(MapRaw(red=map_data["red"], black=map_data["black"]), meta)
        m = mapper_module.mapper
        if m:
            moves = []
            for session_h in list(active_sessions.keys()):
                move = m.new_user(session_h)
                moves.append({"h": move.h, "x": move.x, "y": move.y})
            await send_message_all(HostCommand.NEWMAP, {"map": m.get_map_meta()})
            if moves:
                await send_message_all(HostCommand.MOVE, {"moves": moves})
        return {"ok": True}

    if post.command == "LEAVE" and post.h:
        target_h = post.h
        try:
            await lkapi.room.remove_participant(
                RoomParticipantIdentity(room=APP_NAME, identity=target_h)
            )
        except Exception as e:
            return JSONResponse(content={"error": str(e)}, status_code=400)
        return {"ok": True}

    if post.command == "USERS":
        from .adapter import us as user_store
        users = []
        for session_h in list(active_sessions.keys()):
            user = user_store.get(session_h)
            users.append({"h": session_h, "name": user.name if user else ""})
        return {"users": users}

    return JSONResponse(content={"error": "Unknown command"}, status_code=400)
