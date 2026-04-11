from .mapper import mapper
from ..rtc.state import set_mute
from .user import User, us

from ..rtc.adapter import (
    GuestCommand,
    HostCommand,
    InitCommand,
    JoinedCommand,
    LeftCommand,
    MutedCommand,
    UpdatedCommand,
    send_message,
    send_message_all,
    send_message_others,
    on_message,
    on_join,
    on_leave,
)


@on_message
async def _(h: str, message: dict):
    match message["command"]:
        case GuestCommand.MOVE:
            if mapper:
                mapper.move(h, int(message["x"]), int(message["y"]))
        case GuestCommand.UPDATE:
            try:
                user = User.model_validate(message["user"])
                assert h == user.h
                pos = us.get(h)
                if pos:
                    user.x, user.y = pos.x, pos.y
                us.upsert(user)
                await send_message_others(
                    h, HostCommand.UPDATED, UpdatedCommand(user=user.model_dump())
                )
            except Exception:
                raise ValueError("Invalid user data")
        case GuestCommand.MUTE:
            muted = bool(message["mute"])
            set_mute(h, muted)
            await send_message_others(
                h, HostCommand.MUTED, MutedCommand(h=h, mute=muted)
            )
        case _:
            raise NotImplementedError("on_message handler is not implemented")


@on_join
async def _(h: str):
    if not mapper:
        return
    m = mapper

    move = m.new_user(h)
    us.set_position(h, move.x, move.y)

    # 全ユーザーリスト（座標込み）を構築
    users = []
    for session_h in list(m.user_positions.keys()):
        user = us.get(session_h)
        if user:
            users.append(user.model_dump())

    # 自分自身がリストに含まれていない場合（us に未登録など）でも必ず追加する
    if not any(u["h"] == h for u in users):
        pos = m.user_positions.get(h, (move.x, move.y))
        users.append(User(h=h, x=pos[0], y=pos[1]).model_dump())

    # 新規ユーザーに INIT 送信
    await send_message(
        h,
        HostCommand.INIT,
        InitCommand(users=users, map=m.get_map_meta()),
    )

    # 既存ユーザーへ JOIN ブロードキャスト
    user = us.get(h)
    if user:
        await send_message_others(
            h, HostCommand.JOINED, JoinedCommand(user=user.model_dump())
        )


@on_leave
async def _(h: str):
    if mapper:
        mapper.remove_user(h)
    await send_message_all(HostCommand.LEFT, LeftCommand(h=h))
