from json import dump, load as json_load
from typing import Literal
from pydantic import BaseModel, Field
from ..utils.config import USERS_JSON


class User(BaseModel):
    h: str = Field("", max_length=40)
    name: str = Field("", max_length=40)
    year: int = Field(-1, ge=-1, le=20)
    groups: list[Literal["dtm", "cg", "prog", "mv"]] = Field(default_factory=list)
    avatar: str = ""
    x: int = 0
    y: int = 0


class UserStore:
    _users: dict[str, "User"] = {}

    def upsert(self, user: "User"):
        self._users[user.h] = user
        users = [u.model_dump(exclude={"x", "y"}) for u in self._users.values()]
        with open(USERS_JSON, "w") as f:
            dump(users, f, indent=2, ensure_ascii=False)

    def get(self, h: str) -> "User | None":
        return self._users.get(h)

    def set_position(self, h: str, x: int, y: int):
        user = self._users.get(h)
        if user:
            user.x = x
            user.y = y

    def all(self) -> list["User"]:
        """登録済みユーザーを全件返す"""
        return list(self._users.values())

    def load(self):
        """data/users.json からユーザーデータを読み込む"""
        try:
            with open(USERS_JSON) as f:
                users = json_load(f)
            for u in users:
                user = User.model_validate(u)
                self._users[user.h] = user
        except (FileNotFoundError, ValueError):
            pass


us = UserStore()
