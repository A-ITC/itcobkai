from time import time
from .auth import auth, encode, decode
from pathlib import Path
from logging import getLogger
from fastapi import APIRouter, Depends, Request, HTTPException
from .discord import discord
from pydantic import BaseModel
from ..rtc.rtc import create_token, init_room
from ..master.user import us
from api.api.master import MasterRequest, master_request
from ..utils.config import AVATAR_DIR, MAP_DIR, TTL, APP_NAME
from fastapi.responses import JSONResponse, FileResponse

router = APIRouter()

logger = getLogger(__name__)


class InitRequest(BaseModel):
    username: str


@router.post("/api/init")
async def init(h=Depends(auth)):
    await init_room(h)
    return {"token": create_token(h, h), "h": h}


class SessionRequest(BaseModel):
    code: str
    redirect: str


@router.post("/api/discord")
async def discord_login(post: SessionRequest):
    user = await discord(post.code, post.redirect)
    us.upsert(user)
    response = JSONResponse(content={"ok": True})
    response.set_cookie(
        key="session",
        value=encode({"h": user.h}),
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


def _check_localhost(request: Request):
    host = request.client.host if request.client else None
    if host not in ("127.0.0.1", "::1"):
        raise HTTPException(status_code=403, detail="Forbidden")


@router.post("/api/master")
async def master_endpoint(request: Request, post: MasterRequest):
    """管理者用エンドポイント（localhost からのみ実行可能）。"""
    _check_localhost(request)
    return await master_request(post)
