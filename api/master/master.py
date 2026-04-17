from typing import Literal
from pydantic import BaseModel, StrictBool, StrictInt, ValidationError

from .user import User, UserUpdateInput, us
from logging import getLogger
from .connection_service import connection_service
from .position_store import position_store
from ..rtc.state import RoomContext
from ..utils.schema import Move

logger = getLogger(__name__)


class MoveMessageInput(BaseModel):
    command: Literal["move"]
    x: StrictInt
    y: StrictInt


class UpdateMessageInput(BaseModel):
    command: Literal["update"]
    user: UserUpdateInput


class MuteMessageInput(BaseModel):
    command: Literal["mute"]
    mute: StrictBool


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


def _validate_message(model: type[BaseModel], message: dict, error_message: str):
    try:
        return model.model_validate(message)
    except ValidationError as exc:
        raise ValueError(error_message) from exc


async def handle_move(
    ctx: RoomContext,
    h: str,
    message: MoveMessageInput,
    room_position_store,
    room_connection_service,
    room_user_store,
):
    logger.info(f"MOVE - {room_user_store.get_name(h)}: x={message.x}, y={message.y}")
    # 位置が実際に変化した場合のみ接続を更新してブロードキャストする（キャッシュ効果）
    if room_position_store.move(h, message.x, message.y):
        room_user_store.set_position(h, message.x, message.y)
        ctx.connects(
            room_connection_service.get_current_islands(
                room_position_store.get_all_positions()
            )
        )
        await send_message_all(
            ctx, MovedCommand(moves=[Move(h=h, x=message.x, y=message.y)])
        )


async def handle_update(
    ctx: RoomContext,
    h: str,
    message: UpdateMessageInput,
    room_position_store,
    room_user_store,
):
    if h != message.user.h:
        raise ValueError("Invalid user data")

    logger.info(f"UPDATE - {room_user_store.get_name(h)}")
    current_user = room_user_store.get(h)
    current_position = room_position_store.get_position(h)
    x, y = current_position if current_position else (0, 0)
    if current_position is None and current_user is not None:
        x, y = current_user.x, current_user.y

    user = User(
        h=h,
        name=message.user.name,
        year=message.user.year,
        groups=message.user.groups,
        greeting=message.user.greeting,
        avatar=current_user.avatar if current_user else "",
        x=x,
        y=y,
    )
    room_user_store.upsert(user)
    await send_message_all(ctx, UpdatedCommand(user=user.model_dump()))


async def handle_mute(
    ctx: RoomContext, h: str, message: MuteMessageInput, room_user_store
):
    logger.info(f"MUTE - {room_user_store.get_name(h)}: mute={message.mute}")
    ctx.set_mute(h, message.mute)
    await send_message_others(ctx, h, MutedCommand(h=h, mute=message.mute))


def register(ctx: RoomContext):
    """@on_message / @on_join / @on_leave ハンドラーを登録する。

    モジュールインポート時の副作用を排除するため、明示的な呼び出しが必要。
    lifespan 起動時と pytest conftest.py から呼ばれる。
    """

    room_position_store = ctx.position_store or position_store
    room_connection_service = ctx.connection_service or connection_service
    room_user_store = ctx.user_store or us

    @on_message(ctx)
    async def _(h: str, message: dict):
        match message.get("command"):
            case GuestCommand.MOVE:
                validated = _validate_message(
                    MoveMessageInput,
                    message,
                    "Invalid move data",
                )
                await handle_move(
                    ctx,
                    h,
                    validated,
                    room_position_store,
                    room_connection_service,
                    room_user_store,
                )
            case GuestCommand.UPDATE:
                validated = _validate_message(
                    UpdateMessageInput,
                    message,
                    "Invalid user data",
                )
                await handle_update(
                    ctx,
                    h,
                    validated,
                    room_position_store,
                    room_user_store,
                )
            case GuestCommand.MUTE:
                validated = _validate_message(
                    MuteMessageInput,
                    message,
                    "Invalid mute data",
                )
                await handle_mute(ctx, h, validated, room_user_store)
            case _:
                raise NotImplementedError("on_message handler is not implemented")

    @on_join(ctx)
    async def _(h: str):
        move = room_position_store.new_user(h)
        room_user_store.set_position(h, move.x, move.y)

        # 全ユーザーリスト（座標込み）を構築
        users = []
        for session_h in room_position_store.list_user_ids():
            user = room_user_store.get(session_h)
            if user:
                users.append(user.model_dump())

        # 自分自身がリストに含まれていない場合（us に未登録など）でも必ず追加する
        if not any(u["h"] == h for u in users):
            pos = room_position_store.get_position(h) or (move.x, move.y)
            users.append(User(h=h, x=pos[0], y=pos[1]).model_dump())

        # 新規ユーザーに INIT 送信
        await send_message(
            ctx,
            h,
            InitCommand(users=users, map=room_position_store.get_map_meta()),
        )

        # 既存ユーザーへ JOIN ブロードキャスト
        user = room_user_store.get(h)
        if user:
            await send_message_others(ctx, h, JoinedCommand(user=user.model_dump()))

        ctx.connects(
            room_connection_service.get_current_islands(
                room_position_store.get_all_positions()
            )
        )

    @on_leave(ctx)
    async def _(h: str):
        room_position_store.remove_user(h)
        ctx.connects(
            room_connection_service.get_current_islands(
                room_position_store.get_all_positions()
            )
        )
        await send_message_all(ctx, LeftCommand(h=h))
