"""
api/master.py のコマンドハンドラーテスト（LiveKit 不要）

on_message / on_join / on_leave ハンドラーを room_context.handlers から取得して
await し、GuestCommand の入力に対して期待される副作用（UserStore 更新、
send_message_all 呼び出し、Mapper 操作）を検証する。

send_raw_message はモックするため LiveKit サーバー接続不要。
"""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from pydantic import ValidationError
from api.rtc.adapter import GuestCommand
from api.master.user import us
from api.master.position_store import position_store
from tests.conftest import make_test_user

HA = "handler_test_ha"
HB = "handler_test_hb"


@pytest.fixture
def handlers(room_context):
    return room_context.handlers


def _add_session(room_context, h: str):
    """active_sessions にダミーセッションを追加する"""
    dummy = MagicMock()
    dummy.username = h
    room_context.active_sessions[h] = dummy


# ---------------------------------------------------------------------------
# on_message: GuestCommand.MOVE
# ---------------------------------------------------------------------------


class TestOnMessageMove:
    async def test_move_calls_mapper_move(self, mock_mapper, handlers):
        """MOVE コマンドは mapper.move(h, x, y) を呼ぶ"""
        mock_mapper.new_user(HA)

        await handlers.on_message(HA, {"command": GuestCommand.MOVE, "x": 3, "y": 2})

        assert position_store.user_positions.get(HA) == (3, 2)

    async def test_move_to_noentry_cell_is_ignored(self, mock_mapper, handlers):
        """noentry セルへの移動は無視される"""
        mock_mapper.new_user(HA)
        original_pos = mock_mapper.user_positions[HA]

        await handlers.on_message(
            HA, {"command": GuestCommand.MOVE, "x": 9999, "y": 9999}
        )

        assert mock_mapper.user_positions.get(HA) == original_pos

    async def test_move_rejects_non_integer_coordinates(self, handlers):
        """MOVE コマンドは数値以外の座標を ValidationError で拒否する"""
        with pytest.raises(ValidationError):
            await handlers.on_message(
                HA, {"command": GuestCommand.MOVE, "x": "3", "y": 2}
            )

    async def test_move_requires_json_object_message(self, handlers):
        """dict 以外の message は TypeError"""
        with pytest.raises(TypeError):
            await handlers.on_message(HA, "not-a-json-object")


# ---------------------------------------------------------------------------
# on_message: GuestCommand.UPDATE
# ---------------------------------------------------------------------------


class TestOnMessageUpdate:
    async def test_update_upserts_user_in_store(
        self, mock_mapper, room_context, handlers
    ):
        """UPDATE コマンドはユーザー情報を UserStore に保存する"""
        _add_session(room_context, HA)
        mock_mapper.new_user(HA)

        with patch("api.rtc.adapter.send_raw_message_bytes", new=AsyncMock()):
            await handlers.on_message(
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

        stored = us._users.get(HA)
        assert stored is not None
        assert stored.name == "New Name"
        assert stored.year == 3
        assert "dtm" in stored.groups

    async def test_update_preserves_server_side_position(
        self, mock_mapper, room_context, handlers
    ):
        """UPDATE コマンドはサーバー管理の座標を維持する（クライアント送信座標を無視）"""
        _add_session(room_context, HA)
        mock_mapper.new_user(HA)
        mock_mapper.move(HA, 2, 3)
        us._users[HA] = make_test_user(HA)
        us._users[HA].x = 2
        us._users[HA].y = 3

        with patch("api.rtc.adapter.send_raw_message_bytes", new=AsyncMock()):
            await handlers.on_message(
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
                        "y": 999,
                    },
                },
            )

        stored = us._users.get(HA)
        assert stored.x == 2
        assert stored.y == 3

    async def test_update_hash_mismatch_raises_value_error(self, handlers):
        """h と user.h が一致しない場合は ValueError"""
        with pytest.raises(ValueError):
            await handlers.on_message(
                HA,
                {
                    "command": GuestCommand.UPDATE,
                    "user": {
                        "h": HB,
                        "name": "Attacker",
                        "year": 1,
                        "groups": [],
                        "avatar": "",
                        "x": 0,
                        "y": 0,
                    },
                },
            )

    async def test_update_requires_user_hash_key(self, handlers):
        """UPDATE の必須キー欠落は KeyError"""
        with pytest.raises(KeyError, match="h"):
            await handlers.on_message(
                HA,
                {
                    "command": GuestCommand.UPDATE,
                    "user": {
                        "name": "Missing Hash",
                        "year": 1,
                        "groups": [],
                    },
                },
            )

    async def test_update_broadcasts_host_update_to_all(
        self, mock_mapper, room_context, handlers
    ):
        """UPDATE コマンドは HostCommand.UPDATED を送信者以外にブロードキャストする"""
        _add_session(room_context, HA)
        _add_session(room_context, HB)
        mock_mapper.new_user(HA)

        sent_messages: list[dict] = []

        async def capture(user: str, data: bytes):
            sent_messages.append({"to": user, "msg": json.loads(data)})

        with patch("api.rtc.adapter.send_raw_message_bytes", new=capture):
            await handlers.on_message(
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
        assert HA in sent_to
        assert HB in sent_to

        commands = {m["msg"]["command"] for m in sent_messages}
        assert "UPDATED" in commands


# ---------------------------------------------------------------------------
# on_message: GuestCommand.MUTE
# ---------------------------------------------------------------------------


class TestOnMessageMute:
    async def test_mute_true_adds_to_muted_set(self, room_context, handlers):
        """MUTE True はユーザーを muted_users に追加する"""
        _add_session(room_context, HA)

        with patch("api.rtc.adapter.send_raw_message_bytes", new=AsyncMock()):
            await handlers.on_message(HA, {"command": GuestCommand.MUTE, "mute": True})

        assert HA in room_context.muted_users

    async def test_mute_false_removes_from_muted_set(self, room_context, handlers):
        """MUTE False はユーザーを muted_users から削除する"""
        room_context.muted_users.add(HA)
        _add_session(room_context, HA)

        with patch("api.rtc.adapter.send_raw_message_bytes", new=AsyncMock()):
            await handlers.on_message(HA, {"command": GuestCommand.MUTE, "mute": False})

        assert HA not in room_context.muted_users

    async def test_mute_broadcasts_update_with_mute_status(
        self, room_context, handlers
    ):
        """MUTE コマンドは HostCommand.MUTED を送信者以外にブロードキャストする"""
        _add_session(room_context, HA)
        _add_session(room_context, HB)

        sent_messages: list[dict] = []

        async def capture(user: str, data: bytes):
            sent_messages.append({"to": user, "msg": json.loads(data)})

        with patch("api.rtc.adapter.send_raw_message_bytes", new=capture):
            await handlers.on_message(HA, {"command": GuestCommand.MUTE, "mute": True})

        sent_to = {m["to"] for m in sent_messages}
        assert HA not in sent_to
        assert HB in sent_to

        for m in sent_messages:
            assert m["msg"]["command"] == "MUTED"
            assert m["msg"]["h"] == HA
            assert m["msg"]["mute"] is True

    async def test_mute_rejects_non_boolean_value(self, handlers):
        """MUTE コマンドは boolean 以外の mute 値を ValidationError で拒否する"""
        with pytest.raises(ValidationError):
            await handlers.on_message(
                HA, {"command": GuestCommand.MUTE, "mute": "false"}
            )

    async def test_mute_requires_key(self, handlers):
        """MUTE の必須キー欠落は KeyError"""
        with pytest.raises(KeyError, match="mute"):
            await handlers.on_message(HA, {"command": GuestCommand.MUTE})


# ---------------------------------------------------------------------------
# on_message: 未知コマンド
# ---------------------------------------------------------------------------


class TestOnMessageUnknown:
    async def test_unknown_command_raises_not_implemented(self, handlers):
        """未知のコマンドは NotImplementedError を送出する"""
        with pytest.raises(NotImplementedError):
            await handlers.on_message(HA, {"command": "totally_unknown_cmd"})


# ---------------------------------------------------------------------------
# on_join
# ---------------------------------------------------------------------------


class TestOnJoin:
    async def test_join_spawns_user_in_mapper(
        self, mock_mapper, room_context, handlers
    ):
        """on_join はマッパーにユーザーを登録してポジションを割り当てる"""
        _add_session(room_context, HA)
        us._users[HA] = make_test_user(HA)

        with (
            patch("api.rtc.adapter.send_raw_message", new=AsyncMock()),
            patch("api.rtc.adapter.send_raw_message_bytes", new=AsyncMock()),
        ):
            await handlers.on_join(HA)
        pos = position_store.user_positions[HA]
        assert isinstance(pos, tuple)
        assert len(pos) == 2

    async def test_join_sends_init_to_joining_user(
        self, mock_mapper, room_context, handlers
    ):
        """on_join は参加ユーザー自身に HostCommand.INIT を送る"""
        _add_session(room_context, HA)
        _add_session(room_context, HB)
        us._users[HA] = make_test_user(HA)

        sent_messages: list[dict] = []

        async def capture_raw(user: str, message: dict):
            sent_messages.append({"to": user, "msg": message})

        with (
            patch("api.rtc.adapter.send_raw_message", new=capture_raw),
            patch("api.rtc.adapter.send_raw_message_bytes", new=AsyncMock()),
        ):
            await handlers.on_join(HA)
        init_msgs = [m for m in sent_messages if m["msg"]["command"] == "INIT"]
        assert len(init_msgs) > 0
        assert any(m["to"] == HA for m in init_msgs)

        init_msg = init_msgs[0]["msg"]
        assert "users" in init_msg
        assert "map" in init_msg

    async def test_join_broadcasts_join_to_existing_users(
        self, mock_mapper, room_context, handlers
    ):
        """on_join は既存ユーザー全員に HostCommand.JOINED をブロードキャストする（参加者自身を除く）"""
        _add_session(room_context, HA)
        _add_session(room_context, HB)
        us._users[HA] = make_test_user(HA)
        us._users[HB] = make_test_user(HB)

        sent_messages: list[dict] = []

        async def capture_bytes(user: str, data: bytes):
            sent_messages.append({"to": user, "msg": json.loads(data)})

        with (
            patch("api.rtc.adapter.send_raw_message", new=AsyncMock()),
            patch("api.rtc.adapter.send_raw_message_bytes", new=capture_bytes),
        ):
            await handlers.on_join(HA)
        join_msgs = [m for m in sent_messages if m["msg"]["command"] == "JOINED"]
        assert len(join_msgs) > 0
        assert any(m["to"] == HB for m in join_msgs)
        assert not any(m["to"] == HA for m in join_msgs)


# ---------------------------------------------------------------------------
# on_leave
# ---------------------------------------------------------------------------


class TestOnLeave:
    async def test_leave_removes_user_from_mapper(
        self, mock_mapper, room_context, handlers
    ):
        """on_leave はマッパーからユーザーを削除する"""
        _add_session(room_context, HA)
        _add_session(room_context, HB)
        mock_mapper.new_user(HA)
        assert HA in position_store.user_positions

        with patch("api.rtc.adapter.send_raw_message_bytes", new=AsyncMock()):
            await handlers.on_leave(HA)

        assert HA not in position_store.user_positions

    async def test_leave_broadcasts_leave_to_all_users(
        self, mock_mapper, room_context, handlers
    ):
        """on_leave は HostCommand.LEFT を全ユーザーにブロードキャストする"""
        _add_session(room_context, HA)
        _add_session(room_context, HB)

        sent_messages: list[dict] = []

        async def capture(user: str, data: bytes):
            sent_messages.append({"to": user, "msg": json.loads(data)})

        with patch("api.rtc.adapter.send_raw_message_bytes", new=capture):
            await handlers.on_leave(HA)

        leave_msgs = [m for m in sent_messages if m["msg"]["command"] == "LEFT"]
        assert len(leave_msgs) > 0

        sent_to = {m["to"] for m in leave_msgs}
        assert HB in sent_to

        for m in leave_msgs:
            assert m["msg"]["h"] == HA
