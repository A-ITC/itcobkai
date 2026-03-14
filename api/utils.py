#!/usr/bin/env python3

from json import dumps, loads
from base64 import b64decode, b64encode
from typing import TypedDict
from hashlib import sha256
from hashlib import blake2b
from .config import SECRET_KEY
from urllib.parse import quote, unquote


class Session(TypedDict):
    h: str
    iat: int


class Jwt:
    def encode(self, payload: Session) -> str:
        b64 = b64encode(dumps(payload).encode("utf-8")).decode("utf-8")
        signature = self._create_hash(b64 + SECRET_KEY)
        return quote(f"{b64}.{signature}")

    def decode(self, token: str) -> Session:
        try:
            b64_str, signature = unquote(token).split(".", 1)
        except ValueError:
            raise ValueError("Invalid token format")
        if self._create_hash(b64_str + SECRET_KEY) != signature:
            raise PermissionError("Invalid signature")
        return loads(b64decode(b64_str).decode("utf-8"))

    def _create_hash(self, text: str) -> str:
        digest = sha256(text.encode("utf-8")).digest()
        return b64encode(digest).decode("utf-8")


class CustomError(Exception):
    def __init__(self, code=200, arg=""):
        self.arg = arg
        self.code = code

    def __str__(self):
        return str(self.arg)

    def __int__(self):
        return self.code if isinstance(self.code, int) else 500


def id62(num):
    uid = ""
    A = [chr(i) for i in [*range(48, 58), *range(65, 91), *range(97, 123)]]
    while num:
        num, m = divmod(num, 62)
        uid = A[m] + uid
    return uid


def id7(num):
    return id62(int(blake2b(str(num).encode(), digest_size=5).hexdigest(), 16))


def blake(text):
    return id62(int(blake2b(text.encode(), digest_size=9).hexdigest(), 16))
