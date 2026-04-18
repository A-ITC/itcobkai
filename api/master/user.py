import asyncio
from json import dump, load
from typing import Literal
from pathlib import Path
from pydantic import BaseModel, Field
from ..utils.config import USERS_JSON


class User(BaseModel):
    h: str = Field("", max_length=40)
    name: str = Field("", max_length=40)
    year: int = Field(-1, ge=-1, le=20)
    groups: list[Literal["dtm", "cg", "prog", "mv", "3dcg"]] = Field(
        default_factory=list
    )
    greeting: str = Field("", max_length=400)
    avatar: str = ""
    x: int = 0
    y: int = 0


class UserUpdateInput(BaseModel):
    """GuestCommand.UPDATE のバリデーション用"""

    h: str = Field(..., max_length=40)
    name: str = Field(..., min_length=1, max_length=40)
    year: int = Field(..., ge=1, le=20)
    groups: list[Literal["dtm", "cg", "prog", "mv", "3dcg"]]
    greeting: str = Field("", max_length=400)


class UserStore:
    def __init__(self):
        self._users: dict[str, "User"] = {}
        self._save_task: asyncio.Task[None] | None = None

    def upsert(self, user: "User") -> None:
        self._users[user.h] = user
        self._schedule_save()

    def _schedule_save(self) -> None:
        if self._save_task is None or self._save_task.done():
            try:
                loop = asyncio.get_running_loop()
                self._save_task = loop.create_task(self._delayed_flush())
            except RuntimeError:
                self._flush()

    async def _delayed_flush(self) -> None:
        await asyncio.sleep(5)
        self._flush()

    def _flush(self) -> None:
        """積み上がった変更をすぐにファイルへ書き込む（一時ファイル経由でアトミックに置換）"""
        if self._save_task and not self._save_task.done():
            self._save_task.cancel()
        self._save_task = None
        users = [u.model_dump(exclude={"x", "y"}) for u in self._users.values()]
        target = Path(USERS_JSON)
        tmp = target.with_suffix(".tmp")
        with open(tmp, "w") as f:
            dump(users, f, indent=2, ensure_ascii=False)
        tmp.replace(target)

    def get(self, h: str) -> "User | None":
        return self._users.get(h)

    def get_name(self, h: str) -> str:
        """ユーザー名を返す。未登録の場合はハッシュをそのまま返す。"""
        user = self._users.get(h)
        return user.name if user else h

    def set_position(self, h: str, x: int, y: int) -> None:
        if user := self._users.get(h):
            user.x = x
            user.y = y

    def all(self) -> list["User"]:
        """登録済みユーザーを全件返す"""
        return list(self._users.values())

    def load(self) -> None:
        """data/users.json からユーザーデータを読み込む"""
        with open(USERS_JSON) as f:
            users = load(f)
        for u in users:
            user = User.model_validate(u)
            self._users[user.h] = user


us = UserStore()
