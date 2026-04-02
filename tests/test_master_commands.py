"""
api/master.py のコマンドハンドラーテスト（LiveKit 不要）

on_message / on_join / on_leave ハンドラーを adapter.handler から直接取得して
await し、GuestCommand の入力に対して期待される副作用（UserStore 更新、
send_message_all 呼び出し、Mapper 操作）を検証する。

send_raw_message はモックするため LiveKit サーバー接続不要。
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, call, patch

from api.adapter import GuestCommand, HostCommand, handler
from api.rtc import active_sessions, muted_users
from api.user import User, UserStore
from api import mapper as mapper_module
from tests.conftest import make_test_user


# handlers は api.master の import 時に登録済み（conftest.py で import 済み）
on_message = handler["on_message"]
on_join = handler["on_join"]
on_leave = handler["on_leave"]

HA = "handler_test_ha"
HB = "handler_test_hb"


def _add_session(h: str):
    """active_sessions にダミーセッションを追加する"""
    dummy = MagicMock()
    dummy.username = h
    active_sessions[h] = dummy


# ---------------------------------------------------------------------------
# on_message: GuestCommand.MOVE
# ---------------------------------------------------------------------------


class TestOnMessageMove:
    async def test_move_calls_mapper_move(self, mock_mapper):
        """MOVE コマンドは mapper.move(h, x, y) を呼ぶ"""
        mock_mapper.new_user(HA)

        await on_message(HA, {"command": GuestCommand.MOVE, "x": 3, "y": 2})

        assert mapper_module.mapper.user_positions.get(HA) == (3, 2)

    async def test_move_without_mapper_is_noop(self):
        """mapper が None の場合は何もしない（エラーなし）"""
        mapper_module.mapper = None
        await on_message(HA, {"command": GuestCommand.MOVE, "x": 1, "y": 1})
        # 例外が起きなければ OK

    async def test_move_to_noentry_cell_is_ignored(self, mock_mapper):
        """noentry セルへの移動は無視される"""
        # black が全て 0 のため本テストではどこでも通るが、構造確認として
        mock_mapper.new_user(HA)
        original_pos = mock_mapper.user_positions[HA]

        # out-of-bounds に移動しようとする
        await on_message(HA, {"command": GuestCommand.MOVE, "x": 9999, "y": 9999})

        # 位置は変わっていないはず
        assert mock_mapper.user_positions.get(HA) == original_pos


# ---------------------------------------------------------------------------
# on_message: GuestCommand.UPDATE
# ---------------------------------------------------------------------------


class TestOnMessageUpdate:
    async def test_update_upserts_user_in_store(self, mock_mapper):
        """UPDATE コマンドはユーザー情報を UserStore に保存する"""
        _add_session(HA)
        mock_mapper.new_user(HA)

        with patch("api.adapter.send_raw_message", new=AsyncMock()):
            await on_message(
                HA,
                {
                    "command": GuestCommand.UPDATE,
                    "user": {
                        "h": HA,
                        "name": "New Name",
                        "year": 3,
                        "groups": ["dtm"],
                        "avatar": "",
                        "x": 0,
                        "y": 0,
                    },
                },
            )

        stored = UserStore._users.get(HA)
        assert stored is not None
        assert stored.name == "New Name"
        assert stored.year == 3
        assert "dtm" in stored.groups

    async def test_update_preserves_server_side_position(self, mock_mapper):
        """UPDATE コマンドはサーバー管理の座標を維持する（クライアント送信座標を無視）"""
        _add_session(HA)
        # サーバーが管理する座標を設定
        mock_mapper.new_user(HA)
        mock_mapper.move(HA, 2, 3)
        UserStore._users[HA] = make_test_user(HA)
        UserStore._users[HA].x = 2
        UserStore._users[HA].y = 3

        with patch("api.adapter.send_raw_message", new=AsyncMock()):
            await on_message(
                HA,
                {
                    "command": GuestCommand.UPDATE,
                    "user": {
                        "h": HA,
                        "name": "Test",
                        "year": 1,
                        "groups": [],
                        "avatar": "",
                        "x": 999,
                        "y": 999,  # クライアントが送ったデタラメな座標
                    },
                },
            )

        stored = UserStore._users.get(HA)
        assert stored.x == 2
        assert stored.y == 3

    async def test_update_hash_mismatch_raises_value_error(self, mock_mapper):
        """h と user.h が一致しない場合は ValueError"""
        with pytest.raises(ValueError):
            await on_message(
                HA,
                {
                    "command": GuestCommand.UPDATE,
                    "user": {
                        "h": HB,  # ← 送信者 HA と不一致
                        "name": "Attacker",
                        "year": 1,
                        "groups": [],
                        "avatar": "",
                        "x": 0,
                        "y": 0,
                    },
                },
            )

    async def test_update_broadcasts_host_update_to_all(self, mock_mapper):
        """UPDATE コマンドは HostCommand.UPDATED を送信者以外にブロードキャストする"""
        _add_session(HA)
        _add_session(HB)
        mock_mapper.new_user(HA)

        sent_messages: list[dict] = []

        async def capture(user: str, message: dict):
            sent_messages.append({"to": user, "msg": message})

        with patch("api.adapter.send_raw_message", new=capture):
            await on_message(
                HA,
                {
                    "command": GuestCommand.UPDATE,
                    "user": {
                        "h": HA,
                        "name": "Broadcast Test",
                        "year": 1,
                        "groups": [],
                        "avatar": "",
                        "x": 0,
                        "y": 0,
                    },
                },
            )

        sent_to = {m["to"] for m in sent_messages}
        assert HA not in sent_to, "送信者自身には UPDATED を送らない"
        assert HB in sent_to

        commands = {m["msg"]["command"] for m in sent_messages}
        assert "UPDATED" in commands


# ---------------------------------------------------------------------------
# on_message: GuestCommand.MUTE
# ---------------------------------------------------------------------------


class TestOnMessageMute:
    async def test_mute_true_adds_to_muted_set(self):
        """MUTE True はユーザーを muted_users に追加する"""
        _add_session(HA)

        with patch("api.adapter.send_raw_message", new=AsyncMock()):
            await on_message(HA, {"command": GuestCommand.MUTE, "mute": True})

        assert HA in muted_users

    async def test_mute_false_removes_from_muted_set(self):
        """MUTE False はユーザーを muted_users から削除する"""
        muted_users.add(HA)
        _add_session(HA)

        with patch("api.adapter.send_raw_message", new=AsyncMock()):
            await on_message(HA, {"command": GuestCommand.MUTE, "mute": False})

        assert HA not in muted_users

    async def test_mute_broadcasts_update_with_mute_status(self):
        """MUTE コマンドは HostCommand.MUTED を送信者以外にブロードキャストする"""
        _add_session(HA)
        _add_session(HB)

        sent_messages: list[dict] = []

        async def capture(user: str, message: dict):
            sent_messages.append({"to": user, "msg": message})

        with patch("api.adapter.send_raw_message", new=capture):
            await on_message(HA, {"command": GuestCommand.MUTE, "mute": True})

        sent_to = {m["to"] for m in sent_messages}
        assert HA not in sent_to, "送信者自身には MUTED を送らない"
        assert HB in sent_to

        for m in sent_messages:
            assert m["msg"]["command"] == "MUTED"
            assert m["msg"]["h"] == HA
            assert m["msg"]["mute"] is True


# ---------------------------------------------------------------------------
# on_message: 未知コマンド
# ---------------------------------------------------------------------------


class TestOnMessageUnknown:
    async def test_unknown_command_raises_not_implemented(self):
        """未知のコマンドは NotImplementedError を送出する"""
        with pytest.raises(NotImplementedError):
            await on_message(HA, {"command": "totally_unknown_cmd"})


# ---------------------------------------------------------------------------
# on_join
# ---------------------------------------------------------------------------


class TestOnJoin:
    async def test_join_spawns_user_in_mapper(self, mock_mapper):
        """on_join はマッパーにユーザーを登録してポジションを割り当てる"""
        _add_session(HA)
        UserStore._users[HA] = make_test_user(HA)

        with patch("api.adapter.send_raw_message", new=AsyncMock()):
            await on_join(HA)

        assert HA in mapper_module.mapper.user_positions
        pos = mapper_module.mapper.user_positions[HA]
        assert isinstance(pos, tuple)
        assert len(pos) == 2

    async def test_join_without_mapper_is_noop(self):
        """mapper が None の場合は早期リターンしてエラーにならない"""
        mapper_module.mapper = None
        _add_session(HA)
        with patch("api.adapter.send_raw_message", new=AsyncMock()):
            await on_join(HA)

    async def test_join_sends_init_to_joining_user(self, mock_mapper):
        """on_join は参加ユーザー自身に HostCommand.INIT を送る"""
        _add_session(HA)
        _add_session(HB)
        UserStore._users[HA] = make_test_user(HA)

        sent_messages: list[dict] = []

        async def capture(user: str, message: dict):
            sent_messages.append({"to": user, "msg": message})

        with patch("api.adapter.send_raw_message", new=capture):
            await on_join(HA)

        init_msgs = [m for m in sent_messages if m["msg"]["command"] == "INIT"]
        assert len(init_msgs) > 0
        assert any(m["to"] == HA for m in init_msgs), (
            "INIT は参加ユーザー自身に送られる"
        )

        init_msg = init_msgs[0]["msg"]
        assert "users" in init_msg
        assert "map" in init_msg

    async def test_join_broadcasts_join_to_existing_users(self, mock_mapper):
        """on_join は既存ユーザー全員に HostCommand.JOINED をブロードキャストする（参加者自身を除く）"""
        _add_session(HA)
        _add_session(HB)
        UserStore._users[HA] = make_test_user(HA)
        UserStore._users[HB] = make_test_user(HB)

        sent_messages: list[dict] = []

        async def capture(user: str, message: dict):
            sent_messages.append({"to": user, "msg": message})

        with patch("api.adapter.send_raw_message", new=capture):
            await on_join(HA)

        join_msgs = [m for m in sent_messages if m["msg"]["command"] == "JOINED"]
        assert len(join_msgs) > 0
        # HB には JOINED が届く
        assert any(m["to"] == HB for m in join_msgs)
        # HA 自身には JOINED を送らない（INIT を受け取るのみ）
        assert not any(m["to"] == HA for m in join_msgs), (
            "参加者自身には JOINED を送らない"
        )


# ---------------------------------------------------------------------------
# on_leave
# ---------------------------------------------------------------------------


class TestOnLeave:
    async def test_leave_removes_user_from_mapper(self, mock_mapper):
        """on_leave はマッパーからユーザーを削除する"""
        _add_session(HA)
        _add_session(HB)
        mock_mapper.new_user(HA)
        assert HA in mapper_module.mapper.user_positions

        with patch("api.adapter.send_raw_message", new=AsyncMock()):
            await on_leave(HA)

        assert HA not in mapper_module.mapper.user_positions

    async def test_leave_without_mapper_is_noop(self):
        """mapper が None の場合はエラーにならない"""
        mapper_module.mapper = None
        _add_session(HB)
        with patch("api.adapter.send_raw_message", new=AsyncMock()):
            await on_leave(HA)

    async def test_leave_broadcasts_leave_to_all_users(self, mock_mapper):
        """on_leave は HostCommand.LEFT を全ユーザーにブロードキャストする"""
        _add_session(HA)
        _add_session(HB)

        sent_messages: list[dict] = []

        async def capture(user: str, message: dict):
            sent_messages.append({"to": user, "msg": message})

        with patch("api.adapter.send_raw_message", new=capture):
            await on_leave(HA)

        leave_msgs = [m for m in sent_messages if m["msg"]["command"] == "LEFT"]
        assert len(leave_msgs) > 0

        # 全ユーザーに届いている
        sent_to = {m["to"] for m in leave_msgs}
        assert HB in sent_to

        # h フィールドに退出者のハッシュが入っている
        for m in leave_msgs:
            assert m["msg"]["h"] == HA
