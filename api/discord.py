from httpx import AsyncClient
from .utils import id7
from asyncio import gather
from fastapi import HTTPException
from .config import DISCORD_ALLOWED_SERVERS, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET
from dataclasses import dataclass, field


@dataclass(frozen=True)
class DiscordInfo:
    id: str
    hash: str
    name: str | None
    avatar: str | None
    guild: list[str] = field(default_factory=list)


async def discord(code: str | None = None, redirect: str | None = None) -> DiscordInfo:
    if not code or not redirect:
        raise HTTPException(400, "code and redirect are required")
    async with AsyncClient() as client:
        try:
            access_token = await _auth_discord(client, code, redirect)
            info, guilds = await gather(
                _get_avatar_data(client, access_token),
                _check_joined(client, access_token),
            )
            return DiscordInfo(
                id=info["id"],
                hash=info["hash"],
                name=info["name"],
                avatar=info["avatar"],
                guild=guilds,
            )
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


async def _get_avatar_data(client: AsyncClient, access_token: str) -> dict:
    """内部処理用。dataclass生成前の生データを辞書で返す"""
    url = "https://discordapp.com/api/users/@me"
    headers = {"Authorization": f"Bearer {access_token}"}

    response = await client.get(url, headers=headers)
    body = response.json()

    user_id = str(body.get("id"))
    return {
        "id": user_id,
        "hash": id7(user_id),
        "name": body.get("global_name") or body.get("username"),
        "avatar": body.get("avatar"),
    }


async def _check_joined(client: AsyncClient, access_token: str) -> list[str]:
    url = "https://discordapp.com/api/users/@me/guilds"
    headers = {"Authorization": f"Bearer {access_token}"}

    response = await client.get(url, headers=headers)
    body = response.json()

    # Allowed Servers のパース (辞書内包表記)
    allowed_servers: dict[str, str] = {
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
