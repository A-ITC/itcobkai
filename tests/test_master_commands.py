"""
api/master.py のコマンドハンドラースモークテスト（LiveKit 不要）

細かいバリデーションや内部実装の検証は LiveKit 統合テストに寄せ、
ここでは GuestCommand / join / leave の代表的な副作用だけを確認する。
"""

import json
from unittest.mock import MagicMock, patch

import pytest

from api.master.position import position_store
from api.master.user import us
from api.rtc.adapter import GuestCommand
from tests.conftest import make_test_user

HA = "handler_test_ha"
HB = "handler_test_hb"


@pytest.fixture
def handlers(room_context):
    return room_context.handlers


def _add_session(room_context, h: str):
    dummy = MagicMock()
    dummy.username = h
    room_context.active_sessions[h] = dummy


class TestOnMessageSmoke:
    async def test_move_updates_position_and_broadcasts_moved(
        self, mock_mapper, room_context, handlers
    ):
        _add_session(room_context, HA)
        _add_session(room_context, HB)
        move = mock_mapper.new_user(HA)
        target_x = 0 if move.x != 0 else 1
        target_y = 0 if move.y != 0 else 1

        sent_messages: list[dict] = []

        async def capture(user: str, data: bytes):
            sent_messages.append({"to": user, "msg": json.loads(data)})

        with patch("api.rtc.adapter.send_raw_message_bytes", new=capture):
            await handlers.on_message(
                HA,
                {"command": GuestCommand.MOVE, "x": target_x, "y": target_y},
            )

        assert position_store.user_positions.get(HA) == (target_x, target_y)
        assert {message["to"] for message in sent_messages} == {HA, HB}
        assert all(message["msg"]["command"] == "MOVED" for message in sent_messages)

    async def test_update_persists_user_and_broadcasts_updated(
        self, mock_mapper, room_context, handlers
    ):
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
                        "name": "New Name",
                        "year": 3,
                        "groups": ["dtm"],
                        "greeting": "hello",
                        "avatar": "",
                        "x": 0,
                        "y": 0,
                    },
                },
            )

        stored = us.get(HA)
        assert stored is not None
        assert stored.name == "New Name"
        assert stored.year == 3
        assert stored.groups == ["dtm"]
        assert stored.greeting == "hello"
        assert {message["to"] for message in sent_messages} == {HA, HB}
        assert all(message["msg"]["command"] == "UPDATED" for message in sent_messages)

    async def test_mute_updates_runtime_state_and_notifies_other_users(
        self, room_context, handlers
    ):
        _add_session(room_context, HA)
        _add_session(room_context, HB)

        sent_messages: list[dict] = []

        async def capture(user: str, data: bytes):
            sent_messages.append({"to": user, "msg": json.loads(data)})

        with patch("api.rtc.adapter.send_raw_message_bytes", new=capture):
            await handlers.on_message(HA, {"command": GuestCommand.MUTE, "mute": True})

        assert HA in room_context.muted_users
        assert {message["to"] for message in sent_messages} == {HB}
        assert sent_messages[0]["msg"] == {"command": "MUTED", "h": HA, "mute": True}

    async def test_unknown_command_raises_not_implemented(self, handlers):
        with pytest.raises(NotImplementedError):
            await handlers.on_message(HA, {"command": "totally_unknown_cmd"})


class TestPresenceSmoke:
    async def test_join_sends_init_to_joiner_and_joined_to_others(
        self, mock_mapper, room_context, handlers
    ):
        _add_session(room_context, HA)
        _add_session(room_context, HB)
        us._users[HA] = make_test_user(HA, "Alice")
        us._users[HB] = make_test_user(HB, "Bob")

        raw_messages: list[dict] = []
        broadcast_messages: list[dict] = []

        async def capture_raw(user: str, message: dict):
            raw_messages.append({"to": user, "msg": message})

        async def capture_bytes(user: str, data: bytes):
            broadcast_messages.append({"to": user, "msg": json.loads(data)})

        with (
            patch("api.rtc.adapter.send_raw_message", new=capture_raw),
            patch("api.rtc.adapter.send_raw_message_bytes", new=capture_bytes),
        ):
            await handlers.on_join(HA)

        assert HA in position_store.user_positions
        init_messages = [
            message for message in raw_messages if message["msg"]["command"] == "INIT"
        ]
        joined_messages = [
            message
            for message in broadcast_messages
            if message["msg"]["command"] == "JOINED"
        ]

        assert len(init_messages) == 1
        assert init_messages[0]["to"] == HA
        assert "users" in init_messages[0]["msg"]
        assert "map" in init_messages[0]["msg"]
        assert {message["to"] for message in joined_messages} == {HB}

    async def test_leave_removes_user_and_broadcasts_left(
        self, mock_mapper, room_context, handlers
    ):
        _add_session(room_context, HA)
        _add_session(room_context, HB)
        mock_mapper.new_user(HA)

        sent_messages: list[dict] = []

        async def capture(user: str, data: bytes):
            sent_messages.append({"to": user, "msg": json.loads(data)})

        with patch("api.rtc.adapter.send_raw_message_bytes", new=capture):
            await handlers.on_leave(HA)

        assert HA not in position_store.user_positions
        assert {message["to"] for message in sent_messages} == {HA, HB}
        assert all(
            message["msg"] == {"command": "LEFT", "h": HA} for message in sent_messages
        )
