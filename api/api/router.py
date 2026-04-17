from time import time
from .auth import auth, encode, decode
from typing import Literal
from pathlib import Path
from logging import getLogger
from fastapi import APIRouter, Depends, Request, HTTPException
from .discord import discord, build_authorize_url
from pydantic import BaseModel, Field
from ..rtc.rtc import create_token, init_room
from ..rtc.state import RoomContext
from ..rtc.adapter import UpdatedCommand, send_message_others
from ..master.user import us, User
from api.api.admin import MasterRequest, master_request
from ..utils.config import AVATAR_DIR, MAP_DIR, TTL, SECRET_KEY
from fastapi.responses import JSONResponse, FileResponse

router = APIRouter()

logger = getLogger(__name__)


def _get_room_context(request: Request) -> RoomContext:
    ctx = getattr(request.app.state, "room_context", None)
    if ctx is None:
        raise RuntimeError("RoomContext is not initialized")
    return ctx


class InitRequest(BaseModel):
    username: str


@router.post("/api/init")
async def init(request: Request, h=Depends(auth)):
    await init_room(_get_room_context(request), h)
    return {"token": create_token(h, h), "h": h}


# ---------------------------------------------------------------------------
# /api/users/@me
# ---------------------------------------------------------------------------


class UserUpdateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=40)
    year: int = Field(..., ge=1, le=20)
    groups: list[Literal["dtm", "cg", "prog", "mv", "3dcg"]]
    greeting: str = Field("", max_length=400)


@router.get("/api/users/@me")
async def get_me(request: Request, h=Depends(auth)):
    user_store = _get_room_context(request).user_store or us
    user = user_store.get(h)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user.model_dump()


@router.get("/api/users/{target_h}")
async def get_user(request: Request, target_h: str, h=Depends(auth)):
    user_store = _get_room_context(request).user_store or us
    user = user_store.get(target_h)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user.model_dump()


@router.post("/api/users/@me")
async def update_me(request: Request, body: UserUpdateRequest, h=Depends(auth)):
    room_context = _get_room_context(request)
    user_store = room_context.user_store or us
    current = user_store.get(h)
    if current is None:
        raise HTTPException(status_code=404, detail="User not found")
    updated = User(
        h=h,
        name=body.name,
        year=body.year,
        groups=body.groups,
        greeting=body.greeting,
        avatar=current.avatar,
        x=current.x,
        y=current.y,
    )
    user_store.upsert(updated)
    await send_message_others(
        room_context, h, UpdatedCommand(user=updated.model_dump())
    )
    return updated.model_dump()


class SessionRequest(BaseModel):
    code: str


@router.get("/api/auth/authorize")
async def authorize():
    return {"url": build_authorize_url()}


@router.post("/api/discord")
async def discord_login(post: SessionRequest):
    user = await discord(post.code)
    us.upsert(user)
    response = JSONResponse(content={"ok": True})
    response.set_cookie(
        key="session",
        value=encode({"h": user.h, "iat": int(time())}),
        httponly=True,
        samesite="strict",
        secure=True,
        max_age=365 * 24 * 60 * 60,
    )
    return response


@router.get("/api/token")
def token(request: Request):
    session_cookie = request.cookies.get("session")
    if not session_cookie:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        session = decode(session_cookie)
    except (ValueError, PermissionError):
        raise HTTPException(status_code=401, detail="Invalid session")
    return {"token": encode({"h": session["h"], "iat": int(time())}), "ttl": TTL}


@router.get("/dist")
def get_root():
    """index.htmlを返すエンドポイント"""
    return FileResponse("dist/index.html")


@router.get("/dist/assets/{filename:str}")
def get_asset(filename: str):
    """JS/CSSファイルを返すエンドポイント"""
    headers = {"Cache-Control": "public, max-age=86400"}
    base = Path("dist/assets").resolve()
    file_path = (base / filename).resolve()
    if not file_path.is_relative_to(base):
        return JSONResponse(content={"error": "Forbidden"}, status_code=403)
    if file_path.is_file():
        return FileResponse(str(file_path), headers=headers)
    return JSONResponse(content={"error": "File not found"}, status_code=404)


@router.get("/dist/images/{hash:str}")
def get_image(hash: str):
    """画像を返すエンドポイント"""
    headers = {"Cache-Control": "public, max-age=86400"}
    map_base = Path(MAP_DIR).resolve()
    avatar_base = Path(AVATAR_DIR).resolve()
    map_path = (map_base / f"{hash}.png").resolve()
    avatar_path = (avatar_base / f"{hash}.webp").resolve()
    if map_path.is_file() and map_path.is_relative_to(map_base):
        return FileResponse(str(map_path), headers=headers)
    if avatar_path.is_file() and avatar_path.is_relative_to(avatar_base):
        return FileResponse(str(avatar_path), headers=headers)
    return JSONResponse(content={"error": "Image not found"}, status_code=404)


def _check_secret_key(request: Request):
    key = request.headers.get("X-Secret-Key")
    if not key or key != SECRET_KEY:
        raise HTTPException(status_code=403, detail="Forbidden")


@router.post("/api/master")
async def master_endpoint(request: Request, post: MasterRequest):
    """管理者用エンドポイント（X-Secret-Key ヘッダーで認証）。"""
    _check_secret_key(request)
    return await master_request(_get_room_context(request), post)
