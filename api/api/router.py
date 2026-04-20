from time import time
from .auth import auth, encode, decode
from typing import Literal
from pathlib import Path
from logging import getLogger
from fastapi import APIRouter, Depends, Request, HTTPException
from .discord import discord, build_authorize_url
from pydantic import BaseModel, Field
from ..rtc.rtc import create_token, init_room
from ..rtc.adapter import UpdatedCommand, send_message_others
from ..master.user import us, User
from api.api.admin import MasterRequest, master_request
from ..utils.config import AVATAR_DIR, MAP_DIR, TTL, SECRET_KEY
from fastapi.responses import JSONResponse, FileResponse

router = APIRouter()

logger = getLogger(__name__)


class InitRequest(BaseModel):
    username: str


@router.post("/api/init")
async def init(h: str = Depends(auth)):
    await init_room(h)
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
async def get_me(h: str = Depends(auth)):
    user = us.get(h)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user.model_dump()


@router.get("/api/users/{target_h}")
async def get_user(target_h: str, h: str = Depends(auth)):
    user = us.get(target_h)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user.model_dump()


@router.post("/api/users/@me")
async def update_me(body: UserUpdateRequest, h: str = Depends(auth)):
    current = us.get(h)
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
    us.upsert(updated)
    await send_message_others(h, UpdatedCommand(user=updated))
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


def _get_image(base_dir: str, filename: str):
    headers = {"Cache-Control": "public, max-age=86400"}
    base = Path(base_dir).resolve()
    file_path = (base / filename).resolve()
    if not file_path.is_relative_to(base):
        return JSONResponse(content={"error": "Forbidden"}, status_code=403)
    if file_path.is_file():
        return FileResponse(str(file_path), headers=headers)
    return JSONResponse(content={"error": "Image not found"}, status_code=404)


@router.get("/dist/image/avatars/{hash:str}")
def get_avatar_image(hash: str):
    """アバター画像を返すエンドポイント"""
    return _get_image(AVATAR_DIR, f"{hash}.webp")


@router.get("/dist/image/maps/{hash:str}")
def get_map_image(hash: str):
    """マップ画像を返すエンドポイント"""
    return _get_image(MAP_DIR, f"{hash}.png")


def _check_secret_key(request: Request):
    key = request.headers.get("X-Secret-Key")
    if not key or key != SECRET_KEY:
        raise HTTPException(status_code=403, detail="Forbidden")


@router.post("/api/master")
async def master_endpoint(request: Request, post: MasterRequest):
    """管理者用エンドポイント（X-Secret-Key ヘッダーで認証）。"""
    _check_secret_key(request)
    return await master_request(post)
