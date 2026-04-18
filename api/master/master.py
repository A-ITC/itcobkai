from .user import User, us
from typing import Annotated, Any, Literal
from logging import getLogger
from pydantic import Field, StrictBool, StrictInt, validate_call
from ..rtc.state import connects, set_mute
from ..rtc.adapter import (
    GuestCommand,
    InitCommand,
    JoinedCommand,
    LeftCommand,
    MutedCommand,
    MovedCommand,
    UpdatedCommand,
    send_message,
    send_message_all,
    send_message_others,
    on_message,
    on_join,
    on_leave,
)
from ..utils.schema import Move
from .position_store import position_store
from .position_store import PositionStore
from .connection_service import connection_service

logger = getLogger(__name__)

type UserGroup = Literal["dtm", "cg", "prog", "mv", "3dcg"]
Coordinate = Annotated[StrictInt, Field()]


@validate_call
async def _handle_move(h: str, x: Coordinate, y: Coordinate) -> None:
    logger.info(f"MOVE - {us.get_name(h)}: x={x}, y={y}")
    # 位置が実際に変化した場合のみ接続を更新してブロードキャストする（キャッシュ効果）
    if position_store.move(h, x, y):
        us.set_position(h, x, y)
        connects(
            connection_service.get_current_islands(position_store.get_all_positions())
        )
        await send_message_all(MovedCommand(moves=[Move(h=h, x=x, y=y)]))


@validate_call
async def _handle_update(
    h: str,
    user_h: str = Field(max_length=40),
    name: str = Field(min_length=1, max_length=40),
    year: StrictInt = Field(ge=1, le=20),
    groups: list[Literal["dtm", "cg", "prog", "mv", "3dcg"]] = Field(),
    greeting: str = Field(max_length=400),
) -> None:
    if h != user_h:
        raise ValueError("Invalid user data")

    logger.info(f"UPDATE - {us.get_name(h)}")
    current_user = us.get(h)
    current_position = position_store.get_position(h)
    x, y = current_position if current_position else (0, 0)
    if current_position is None and current_user is not None:
        x, y = current_user.x, current_user.y

    user = User(
        h=h,
        name=name,
        year=year,
        groups=groups,
        greeting=greeting,
        avatar=current_user.avatar if current_user else "",
        x=x,
        y=y,
    )
    us.upsert(user)
    await send_message_all(UpdatedCommand(user=user))


@validate_call
async def _handle_mute(h: str, mute: StrictBool) -> None:
    logger.info(f"MUTE - {us.get_name(h)}: mute={mute}")
    set_mute(h, mute)
    await send_message_others(h, MutedCommand(h=h, mute=mute))


async def _handle_join(h: str, room_position_store: PositionStore) -> None:
    move = room_position_store.new_user(h)
    us.set_position(h, move.x, move.y)

    users = [
        user
        for session_h in room_position_store.list_user_ids()
        if (user := us.get(session_h)) is not None
    ]

    if not any(user.h == h for user in users):
        pos = room_position_store.get_position(h) or (move.x, move.y)
        users.append(User(h=h, x=pos[0], y=pos[1]))

    await send_message(
        h, InitCommand(users=users, map=room_position_store.get_map_meta())
    )

    if user := us.get(h):
        await send_message_others(h, JoinedCommand(user=user))

    connects(
        connection_service.get_current_islands(room_position_store.get_all_positions())
    )


async def _handle_leave(h: str, room_position_store: PositionStore) -> None:
    room_position_store.remove_user(h)
    connects(
        connection_service.get_current_islands(room_position_store.get_all_positions())
    )
    await send_message_all(LeftCommand(h=h))


def register() -> None:
    """@on_message / @on_join / @on_leave ハンドラーを登録する。

    モジュールインポート時の副作用を排除するため、明示的な呼び出しが必要。
    lifespan 起動時と pytest conftest.py から呼ばれる。
    """

    @on_message()
    async def _(h: str, message: dict) -> None:
        match message["command"]:
            case GuestCommand.MOVE:
                await _handle_move(h, x=message["x"], y=message["y"])
            case GuestCommand.UPDATE:
                user = message["user"]
                await _handle_update(
                    h,
                    user_h=user["h"],
                    name=user["name"],
                    year=user["year"],
                    groups=user["groups"],
                    greeting=user.get("greeting", ""),
                )
            case GuestCommand.MUTE:
                await _handle_mute(h, mute=message["mute"])
            case _:
                raise NotImplementedError("on_message handler is not implemented")

    @on_join()
    async def _(h: str) -> None:
        await _handle_join(h, position_store)

    @on_leave()
    async def _(h: str) -> None:
        await _handle_leave(h, position_store)
