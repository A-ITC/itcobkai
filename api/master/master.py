from .user import User, UserUpdateInput, us
from logging import getLogger
from .mapper import mapper
from ..rtc.state import set_mute, connects
from ..utils.schema import Move

logger = getLogger(__name__)

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


def register():
    """@on_message / @on_join / @on_leave ハンドラーを登録する。

    モジュールインポート時の副作用を排除するため、明示的な呼び出しが必要。
    lifespan 起動時と pytest conftest.py から呼ばれる。
    """

    @on_message
    async def _(h: str, message: dict):
        match message["command"]:
            case GuestCommand.MOVE:
                x, y = int(message["x"]), int(message["y"])
                logger.info(f"MOVE - {us.get_name(h)}: x={x}, y={y}")
                # 位置が実際に変化した場合のみ接続を更新してブロードキャストする（キャッシュ効果）
                if mapper.move(h, x, y):
                    connects(mapper.get_current_islands())
                    await send_message_all(MovedCommand(moves=[Move(h=h, x=x, y=y)]))
            case GuestCommand.UPDATE:
                try:
                    validated = UserUpdateInput.model_validate(message["user"])
                    if h != str(message["user"].get("h", "")):
                        raise ValueError("Invalid user data")
                    logger.info(f"UPDATE - {us.get_name(h)}")
                    pos = us.get(h)
                    user = User(
                        h=h,
                        name=validated.name,
                        year=validated.year,
                        groups=validated.groups,
                        greeting=validated.greeting,
                        avatar=pos.avatar if pos else "",
                        x=pos.x if pos else 0,
                        y=pos.y if pos else 0,
                    )
                    us.upsert(user)
                    await send_message_all(UpdatedCommand(user=user.model_dump()))
                except Exception:
                    raise ValueError("Invalid user data")
            case GuestCommand.MUTE:
                muted = bool(message["mute"])
                logger.info(f"MUTE - {us.get_name(h)}: mute={muted}")
                set_mute(h, muted)
                await send_message_others(h, MutedCommand(h=h, mute=muted))
            case _:
                raise NotImplementedError("on_message handler is not implemented")

    @on_join
    async def _(h: str):
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
            InitCommand(users=users, map=m.get_map_meta()),
        )

        # 既存ユーザーへ JOIN ブロードキャスト
        user = us.get(h)
        if user:
            await send_message_others(h, JoinedCommand(user=user.model_dump()))

        connects(m.get_current_islands())

    @on_leave
    async def _(h: str):
        mapper.remove_user(h)
        connects(mapper.get_current_islands())
        await send_message_all(LeftCommand(h=h))
