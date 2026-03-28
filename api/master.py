from . import mapper as mapper_module
from .rtc import set_mute
from .user import User, UserStore

from .adapter import (
    GuestCommand,
    HostCommand,
    send_message,
    send_message_all,
    on_message,
    on_join,
    on_leave,
)

us = UserStore()


@on_message
async def _(h: str, message: dict):
    match message["command"]:
        case GuestCommand.MOVE:
            m = mapper_module.mapper
            if m:
                m.move(h, int(message["x"]), int(message["y"]))
        case GuestCommand.UPDATE:
            try:
                user = User.model_validate(message["user"])
                assert h == user.h
                pos = us.get(h)
                if pos:
                    user.x, user.y = pos.x, pos.y
                us.upsert(user)
                await send_message_all(HostCommand.UPDATE, {"user": user.model_dump()})
            except Exception:
                raise ValueError("Invalid user data")
        case GuestCommand.MUTE:
            muted = bool(message["mute"])
            set_mute(h, muted)
            await send_message_all(HostCommand.UPDATE, {"h": h, "mute": muted})
        case _:
            raise NotImplementedError("on_message handler is not implemented")


@on_join
async def _(h: str):
    m = mapper_module.mapper
    if not m:
        return

    move = m.new_user(h)
    us.set_position(h, move.x, move.y)

    # 全ユーザーリスト（座標込み）を構築
    users = []
    for session_h in list(m.user_positions.keys()):
        user = us.get(session_h)
        if user:
            users.append(user.model_dump())

    # 新規ユーザーに INIT 送信
    await send_message(
        h,
        HostCommand.INIT,
        {
            "users": users,
            "map": m.get_map_meta(),
        },
    )

    # 既存ユーザーへ JOIN ブロードキャスト
    user = us.get(h)
    if user:
        await send_message_all(HostCommand.JOIN, {"user": user.model_dump()})


@on_leave
async def _(h: str):
    m = mapper_module.mapper
    if m:
        m.remove_user(h)
    await send_message_all(HostCommand.LEAVE, {"h": h})
