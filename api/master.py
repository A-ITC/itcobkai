from .user import User, UserStore

from .adapter import (
    GuestCommand,
    HostCommand,
    send_message,
    send_message_all,
    on_message,
    on_join,
)

us = UserStore()


@on_message
async def on_message(h: str, message: dict):
    match message["command"]:
        case GuestCommand.MOVE:
            # ユーザーの移動
            raise NotImplementedError("MOVE command handler is not implemented")
        case GuestCommand.UPDATE:
            # ユーザーデータの更新
            try:
                user = User.model_validate(message["user"])
                assert h == user.h
                us.upsert(user)
                await send_message_all(HostCommand.UPDATE, message["user"])
            except Exception:
                raise ValueError("Invalid user data")
        case GuestCommand.MUTE:
            raise NotImplementedError("MUTE command handler is not implemented")
        case _:
            raise NotImplementedError("on_message handler is not implemented")


@on_join
async def on_join(h: str):
    user = us.get(h)
    await send_message_all(HostCommand.UPDATE, user)
