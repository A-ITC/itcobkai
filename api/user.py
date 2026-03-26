from json import dump
from typing import Literal
from pathlib import Path
from .config import USERS_JSON
from pydantic import BaseModel, Field


class User(BaseModel):
    h: str = Field("", max_length=40)
    name: str = Field("", max_length=40)
    year: int = Field(0, ge=0, le=20)
    groups: list[Literal["dtm", "cg", "prog", "mv"]] = Field(default_factory=list)
    avatar: str


class UserStore:
    _users: dict[str, dict] = {}

    def upsert(self, user: User):
        self._users[user.h] = user.model_dump_json()
        users: list[dict] = []
        for user_join in self._users.values():
            users.append(user_join)
        with Path(USERS_JSON) as f:
            dump(users, f, indent=2, ensure_ascii=False)

    def get(self, h: str):
        return self._users.get(h)
