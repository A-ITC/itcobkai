from json import dumps, loads
from time import time
from typing import TypedDict
from base64 import b64decode, b64encode
from hashlib import sha256
from hmac import compare_digest, new
from fastapi import Header, HTTPException
from urllib.parse import quote, unquote
from ..utils.config import SECRET_KEY, TTL


class Session(TypedDict):
    h: str
    iat: int


def encode(payload: Session) -> str:
    b64 = b64encode(dumps(payload).encode("utf-8")).decode("utf-8")
    signature = _create_hash(b64)
    return quote(f"{b64}.{signature}")


def decode(token: str) -> Session:
    try:
        b64_str, signature = unquote(token).split(".", 1)
    except ValueError:
        raise ValueError("Invalid token format")
    if not compare_digest(_create_hash(b64_str), signature):
        raise PermissionError("Invalid signature")
    return loads(b64decode(b64_str).decode("utf-8"))


def _create_hash(text: str) -> str:
    digest = new(SECRET_KEY.encode("utf-8"), text.encode("utf-8"), sha256).digest()
    return b64encode(digest).decode("utf-8")


async def auth(authorization: str = Header(None)) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    token = authorization.split()[-1]
    try:
        payload = decode(token)
    except (ValueError, PermissionError):
        raise HTTPException(status_code=401, detail="Invalid token")
    if time() - payload["iat"] > TTL:
        raise HTTPException(status_code=401, detail="Token expired")
    return payload["h"]
