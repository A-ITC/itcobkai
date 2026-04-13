from httpx import AsyncClient
from psutil import CONN_LISTEN, AccessDenied, NoSuchProcess, net_connections
from pathlib import Path
from asyncio import gather
from hashlib import sha256
from fastapi import HTTPException
from contextlib import suppress
from dataclasses import dataclass
from urllib.parse import quote
from ..master.user import User
from ..utils.utils import id7
from ..utils.config import (
    AVATAR_DIR,
    DEV_PORT,
    DISCORD_ALLOWED_SERVERS,
    DISCORD_CLIENT_ID,
    DISCORD_CLIENT_SECRET,
    DOMAIN,
)


@dataclass
class DiscordUserInfo:
    id: str
    hash: str
    name: str
    avatar: str | None


def _build_redirect_uri() -> str:
    """DEV_PORTが実際にLISTEN状態にあるかを確認して開発環境(/dev)か本番環境(/dist)のリダイレクトURIを生成する。"""
    if DEV_PORT:
        with suppress(AccessDenied, NoSuchProcess):
            for conn in net_connections():
                if conn.status == CONN_LISTEN and conn.laddr.port == DEV_PORT:
                    return f"https://{DOMAIN}/dev#/login"
    return f"https://{DOMAIN}/dist#/login"


def build_authorize_url() -> str:
    redirect_uri = _build_redirect_uri()
    return (
        "https://discord.com/api/oauth2/authorize"
        f"?client_id={DISCORD_CLIENT_ID}"
        f"&redirect_uri={quote(redirect_uri, safe='')}"
        "&response_type=code"
        "&scope=identify"
    )


async def discord(code: str | None = None) -> User:
    if not code:
        raise HTTPException(400, "code is required")
    redirect = _build_redirect_uri()
    async with AsyncClient() as client:
        try:
            access_token = await _auth_discord(client, code, redirect)
            info, _ = await gather(
                _get_avatar_data(client, access_token),
                _check_joined(client, access_token),
            )
            avatar = await _get_avatar_base64(client, info.id, info.avatar)
            return User(h=info.hash, name=info.name, avatar=avatar)
        except HTTPException:
            raise
        except Exception as err:
            raise HTTPException(401, str(err))


async def _auth_discord(client: AsyncClient, code: str, redirect: str) -> str:
    url = "https://discord.com/api/oauth2/token"
    data = {
        "client_id": DISCORD_CLIENT_ID,
        "client_secret": DISCORD_CLIENT_SECRET,
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect,
        "scope": "identify",
    }
    response = await client.post(url, data=data)
    try:
        body = response.json()
    except Exception:
        raise HTTPException(401, "invalid response from token endpoint")
    if response.is_error or "access_token" not in body:
        raise HTTPException(401, str(body.get("error_description", body)))
    return body["access_token"]


async def _get_avatar_data(client: AsyncClient, access_token: str) -> DiscordUserInfo:
    """内部処理用。Discord APIからユーザー情報を取得して返す"""
    url = "https://discordapp.com/api/users/@me"
    headers = {"Authorization": f"Bearer {access_token}"}

    response = await client.get(url, headers=headers)
    body = response.json()

    user_id = str(body.get("id"))
    return DiscordUserInfo(
        id=user_id,
        hash=id7(user_id),
        name=body.get("global_name") or body.get("username"),
        avatar=body.get("avatar"),
    )


async def _check_joined(client: AsyncClient, access_token: str) -> list[str]:
    url = "https://discordapp.com/api/users/@me/guilds"
    headers = {"Authorization": f"Bearer {access_token}"}

    response = await client.get(url, headers=headers)
    body = response.json()

    allowed_servers: dict[str, str] = {}
    if DISCORD_ALLOWED_SERVERS:
        allowed_servers = {
            s_id: label
            for item in DISCORD_ALLOWED_SERVERS.split(",")
            if ":" in item
            for label, s_id in [item.split(":", 1)]
        }

    server_names: list[str] = []
    if isinstance(body, list):
        for guild in body:
            g_id = str(guild.get("id"))
            if g_id in allowed_servers:
                server_names.append(allowed_servers[g_id])

    if server_names:
        return server_names

    raise HTTPException(401, "server not allowed")


async def _get_avatar_base64(client: AsyncClient, id: str, avatar: str) -> str:
    url = f"https://cdn.discordapp.com/avatars/{id}/{avatar}.webp"
    response = await client.get(url)
    response.raise_for_status()
    content = response.content
    hash = sha256(content).hexdigest()
    avatar_dir = Path(AVATAR_DIR)
    avatar_dir.mkdir(parents=True, exist_ok=True)
    file_path = avatar_dir / f"{hash}.webp"
    file_path.write_bytes(content)
    return hash
