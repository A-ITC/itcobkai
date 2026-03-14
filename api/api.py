from time import time
from .rtc import create_token, init_room, mixing_loop, lkapi
from .auth import auth, encode, decode
from logging import getLogger
from fastapi import FastAPI, APIRouter, Depends, Request
from .config import APP_NAME, TTL
from asyncio import create_task
from pydantic import BaseModel
from .discord import discord
from contextlib import asynccontextmanager
from fastapi.responses import JSONResponse

router = APIRouter(prefix=f"/{APP_NAME}/api")

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


@router.post("/init")
async def init(h=Depends(auth)):
    await init_room(h)
    return {"token": create_token(h, h)}


class SessionRequest(BaseModel):
    code: str
    redirect: str


@router.get("/session")
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


@router.get("/token")
def token(request: Request):
    session_cookie = request.cookies.get("session")
    session = decode(session_cookie)
    return {"token": encode({"h": session["h"], "iat": int(time())}), "ttl": TTL}


@router.get("/assets/{path:path}")
def assets(path: str):
    return JSONResponse(content={"path": path})
