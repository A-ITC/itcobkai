from time import time
from .rtc import create_token, init_room, mixing_loop, lkapi
from .auth import auth, encode, decode
from pathlib import Path
from logging import getLogger
from asyncio import create_task
from .config import AVATAR_DIR, MAP_DIR, TTL
from fastapi import FastAPI, APIRouter, Depends, Request, Body
from .discord import discord
from pydantic import BaseModel
from contextlib import asynccontextmanager
from fastapi.responses import JSONResponse, FileResponse

router = APIRouter()

logger = getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("start lifespan")
    create_task(mixing_loop())
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


@router.post("/api/master")
def master(post: dict = Body(...)):
    """マスタークライアント用のエンドポイント。管理者が現在の島の状態を確認したり、ユーザーを強制的に移動させたりするために使用します。"""
    print(post)
    return {"received": post}
