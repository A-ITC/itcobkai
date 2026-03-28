"""
LiveKit を使用した HostCommand / GuestCommand 統合テスト

アーキテクチャ概要:
  各ユーザーは自分専用の LiveKit ルーム（名前 = ユーザーハッシュ）を持つ。
  ルーム内には Python ボット（identity="python-bot"）が常駐し、
  ユーザーからの GuestCommand を受け取り HostCommand を全ユーザーにブロードキャストする。

  ┌─────────────────────────────────────────────────────────┐
  │  TestParticipant("ha")          TestParticipant("hb")   │
  │      room "ha"                      room "hb"           │
  │  ┌──────────────┐              ┌──────────────┐         │
  │  │ bot "python" │              │ bot "python" │         │
  │  │ ← GuestCmd   │ send_all()→  │ HostCmd →    │         │
  │  └──────────────┘              └──────────────┘         │
  └─────────────────────────────────────────────────────────┘

実行条件:
  docker compose up で LiveKit サーバーを起動し、DOMAIN 環境変数を設定すること。
  未設定の場合は全テストがスキップされます。

  uv run pytest tests/test_host_guest_commands.py -v -m livekit
"""

import asyncio
import json
import pytest

from livekit.rtc import DataPacket, Room

from api.adapter import GuestCommand, HostCommand
from api.config import APP_NAME, DOMAIN
from api.rtc import active_sessions, create_token, init_room
from api import mapper as mapper_module
from api.mapper import connections_to_islands
from api.rtc import connects
from api.adapter import send_message_all
from api.user import User, UserStore
from tests.conftest import make_test_user

pytestmark = pytest.mark.livekit

# テスト用ユーザーハッシュ（本番データと衝突しない一意な値）
HA = "test_lk_ha"
HB = "test_lk_hb"


# ---------------------------------------------------------------------------
# テスト参加者ヘルパー
# ---------------------------------------------------------------------------


class _TestParticipant:
    """LiveKit ルームに接続してデータを送受信するテスト用ヘルパー。

    各ユーザーは自分の名前と同じルームに接続する（identity = room = h）。
    サーバー側ボットが publish_data で送信したメッセージを
    data_received イベントで受け取り、内部キューに蓄積する。
    """

    def __init__(self, identity: str):
        self.identity = identity
        self.room = Room()
        self._received: asyncio.Queue[dict] = asyncio.Queue()

    async def connect(self):
        token = create_token(self.identity, self.identity)

        @self.room.on("data_received")
        def on_data(data: DataPacket):
            # livekit-rtc は同期コールバックのみ許可するため put_nowait で直接キューに追加する
            try:
                msg = json.loads(data.data.decode())
                self._received.put_nowait(msg)
            except Exception:
                pass

        await self.room.connect(f"wss://{DOMAIN}", token)

    async def disconnect(self):
        await self.room.disconnect()

    async def send(self, message: dict):
        await self.room.local_participant.publish_data(
            payload=json.dumps(message).encode()
        )

    async def wait_for_command(self, command: str, timeout: float = 6.0) -> dict:
        """指定コマンドのメッセージを待つ。不一致メッセージはキューに戻す。"""
        deadline = asyncio.get_event_loop().time() + timeout
        pending: list[dict] = []

        try:
            while asyncio.get_event_loop().time() < deadline:
                remaining = deadline - asyncio.get_event_loop().time()
                if remaining <= 0:
                    break
                try:
                    msg = await asyncio.wait_for(
                        self._received.get(), timeout=min(remaining, 0.2)
                    )
                    if msg.get("command") == command:
                        for p in pending:
                            await self._received.put(p)
                        return msg
                    pending.append(msg)
                except asyncio.TimeoutError:
                    pass
        finally:
            for p in pending:
                await self._received.put(p)

        raise TimeoutError(f"コマンド '{command}' の受信タイムアウト ({timeout}s)")

    async def drain(self, timeout: float = 0.5):
        """キュー内の全メッセージを消費して捨てる（テスト開始前の初期化用）"""
        deadline = asyncio.get_event_loop().time() + timeout
        while asyncio.get_event_loop().time() < deadline:
            try:
                await asyncio.wait_for(self._received.get(), timeout=0.05)
            except asyncio.TimeoutError:
                break


# ---------------------------------------------------------------------------
# フィクスチャ
# ---------------------------------------------------------------------------


@pytest.fixture
async def two_participants(livekit_domain, mock_mapper):
    """2ユーザー分の LiveKit ルームとボットを初期化し、参加者を接続する。

    - HA, HB それぞれの UserStore を事前登録（JOIN ブロードキャストが機能するため）
    - 両ユーザーが接続し INIT を受け取った後に yield する
    """
    # UserStore に事前登録（on_join の JOIN ブロードキャストに必要）
    UserStore._users[HA] = make_test_user(HA, "User A")
    UserStore._users[HB] = make_test_user(HB, "User B")

    # ルーム+ボット初期化
    await init_room(HA)
    await init_room(HB)

    pa = _TestParticipant(HA)
    pb = _TestParticipant(HB)

    await pa.connect()
    # on_join(HA) が処理されるのを待つ（既存ルーム残留時の接続オーバーヘッドを考慮して長めに待つ）
    await pa.wait_for_command("INIT", timeout=15.0)

    await pb.connect()
    # on_join(HB) が処理されるのを待つ（同上）
    await pb.wait_for_command("INIT", timeout=15.0)

    # JOIN など初期メッセージを消化しておく
    await pa.drain()
    await pb.drain()

    yield pa, pb

    await pa.disconnect()
    await pb.disconnect()

    # ボットセッションのクリーンアップ
    for h in [HA, HB]:
        session = active_sessions.pop(h, None)
        if session:
            await session.room.disconnect()


# ---------------------------------------------------------------------------
# テスト: INIT
# ---------------------------------------------------------------------------


@pytest.mark.livekit
async def test_lk_init_received_on_join(livekit_domain, mock_mapper):
    """ユーザーが参加すると HostCommand.INIT を受け取る"""
    UserStore._users[HA] = make_test_user(HA)

    await init_room(HA)
    pa = _TestParticipant(HA)
    await pa.connect()

    # 既存ルーム残留時のボット接続オーバーヘッドを考慮して長めに待つ
    msg = await pa.wait_for_command("INIT", timeout=15.0)

    assert msg["command"] == "INIT"
    assert "users" in msg
    assert "map" in msg

    await pa.disconnect()
    session = active_sessions.pop(HA, None)
    if session:
        await session.room.disconnect()


# ---------------------------------------------------------------------------
# テスト: JOIN
# ---------------------------------------------------------------------------


@pytest.mark.livekit
async def test_lk_join_broadcast_when_new_user_connects(livekit_domain, mock_mapper):
    """新しいユーザーが参加すると既存ユーザーに HostCommand.JOIN がブロードキャストされる"""
    UserStore._users[HA] = make_test_user(HA, "User A")
    UserStore._users[HB] = make_test_user(HB, "User B")

    await init_room(HA)
    await init_room(HB)

    pa = _TestParticipant(HA)
    await pa.connect()
    # 既存ルーム残留時のボット接続オーバーヘッドを考慮して長めに待つ
    await pa.wait_for_command("INIT", timeout=15.0)  # HA の INIT を消費
    await pa.drain()  # JOIN (自分が既にいた場合) を消費

    # HB が参加 → HA は JOIN を受け取るはず
    pb = _TestParticipant(HB)
    await pb.connect()

    msg = await pa.wait_for_command("JOIN")

    assert msg["command"] == "JOIN"
    assert msg["user"]["h"] == HB
    assert msg["user"]["name"] == "User B"

    await pa.disconnect()
    await pb.disconnect()
    for h in [HA, HB]:
        session = active_sessions.pop(h, None)
        if session:
            await session.room.disconnect()


# ---------------------------------------------------------------------------
# テスト: UPDATE (GuestCommand → HostCommand ブロードキャスト)
# ---------------------------------------------------------------------------


@pytest.mark.livekit
async def test_lk_update_broadcasts_to_all_users(two_participants):
    """GuestCommand.UPDATE を送ると全ユーザーに HostCommand.UPDATE がブロードキャストされる"""
    pa, pb = two_participants

    await pa.send(
        {
            "command": GuestCommand.UPDATE,
            "user": {
                "h": HA,
                "name": "Updated Name",
                "year": 2,
                "groups": ["prog"],
                "avatar": "",
                "x": 0,
                "y": 0,
            },
        }
    )

    # 送信者自身にも届く
    msg_a = await pa.wait_for_command("UPDATE")
    # 他ユーザーにも届く
    msg_b = await pb.wait_for_command("UPDATE")

    assert msg_a["user"]["name"] == "Updated Name"
    assert msg_b["user"]["name"] == "Updated Name"
    assert msg_a["user"]["h"] == HA
    assert msg_b["user"]["h"] == HA


# ---------------------------------------------------------------------------
# テスト: MUTE (GuestCommand → HostCommand.UPDATE ブロードキャスト)
# ---------------------------------------------------------------------------


@pytest.mark.livekit
async def test_lk_mute_true_broadcasts_update_to_all(two_participants):
    """GuestCommand.MUTE (mute=True) を送ると全ユーザーに HostCommand.UPDATE が届く"""
    pa, pb = two_participants

    await pa.send(
        {
            "command": GuestCommand.MUTE,
            "mute": True,
        }
    )

    msg_a = await pa.wait_for_command("UPDATE")
    msg_b = await pb.wait_for_command("UPDATE")

    assert msg_a["mute"] is True
    assert msg_a["h"] == HA
    assert msg_b["mute"] is True
    assert msg_b["h"] == HA


@pytest.mark.livekit
async def test_lk_mute_false_broadcasts_update_to_all(two_participants):
    """GuestCommand.MUTE (mute=False) を送ると全ユーザーに HostCommand.UPDATE が届く"""
    pa, pb = two_participants

    # まずミュートにする
    await pa.send({"command": GuestCommand.MUTE, "mute": True})
    await pa.wait_for_command("UPDATE")
    await pb.wait_for_command("UPDATE")

    # ミュート解除
    await pa.send({"command": GuestCommand.MUTE, "mute": False})

    msg_a = await pa.wait_for_command("UPDATE")
    msg_b = await pb.wait_for_command("UPDATE")

    assert msg_a["mute"] is False
    assert msg_b["mute"] is False


# ---------------------------------------------------------------------------
# テスト: MOVE (GuestCommand → positionティッカー → HostCommand.MOVE)
# ---------------------------------------------------------------------------


@pytest.mark.livekit
async def test_lk_move_broadcasts_move_after_tick(two_participants):
    """GuestCommand.MOVE を送り、ポジションティッカーをトリガーすると
    全ユーザーに HostCommand.MOVE がブロードキャストされる。

    ティッカー（毎秒実行）を直接トリガーして 1 秒の待機を省く。
    """
    pa, pb = two_participants

    target_x, target_y = 2, 2
    await pa.send(
        {
            "command": GuestCommand.MOVE,
            "x": target_x,
            "y": target_y,
        }
    )

    # ボットが on_message を処理するのを待つ
    await asyncio.sleep(0.3)

    # ポジションティッカーのロジックを手動トリガー（1 秒待機を省略）
    m = mapper_module.mapper
    result = m.last_updated()
    islands = connections_to_islands(m.last_connections)
    connects(islands)
    if result["moves"]:
        moves = [{"h": mv.h, "x": mv.x, "y": mv.y} for mv in result["moves"]]
        await send_message_all(HostCommand.MOVE, {"moves": moves})

    msg_a = await pa.wait_for_command("MOVE")
    msg_b = await pb.wait_for_command("MOVE")

    # HA が target_x, target_y に移動したことを確認
    ha_move_a = next((mv for mv in msg_a["moves"] if mv["h"] == HA), None)
    ha_move_b = next((mv for mv in msg_b["moves"] if mv["h"] == HA), None)

    assert ha_move_a is not None, "MOVE メッセージに HA の移動が含まれていない"
    assert ha_move_b is not None, "MOVE メッセージに HA の移動が含まれていない"
    assert ha_move_a["x"] == target_x
    assert ha_move_a["y"] == target_y


# ---------------------------------------------------------------------------
# テスト: LEAVE
# ---------------------------------------------------------------------------


@pytest.mark.livekit
async def test_lk_leave_broadcasts_to_remaining_users(livekit_domain, mock_mapper):
    """ユーザーが退出すると残りのユーザーに HostCommand.LEAVE がブロードキャストされる"""
    UserStore._users[HA] = make_test_user(HA, "User A")
    UserStore._users[HB] = make_test_user(HB, "User B")

    await init_room(HA)
    await init_room(HB)

    pa = _TestParticipant(HA)
    pb = _TestParticipant(HB)

    await pa.connect()
    # 既存ルーム残留時のボット接続オーバーヘッドを考慮して長めに待つ
    await pa.wait_for_command("INIT", timeout=15.0)

    await pb.connect()
    # 同上
    await pb.wait_for_command("INIT", timeout=15.0)
    await pa.wait_for_command("JOIN")  # HB JOIN を消費

    # HB が退出
    await pb.disconnect()

    # HA は LEAVE を受け取るはず
    msg = await pa.wait_for_command("LEAVE")

    assert msg["command"] == "LEAVE"
    assert msg["h"] == HB

    await pa.disconnect()
    session = active_sessions.pop(HA, None)
    if session:
        await session.room.disconnect()


# ---------------------------------------------------------------------------
# テスト: 複数コマンド連続送信の整合性
# ---------------------------------------------------------------------------


@pytest.mark.livekit
async def test_lk_update_preserves_position_from_server(two_participants):
    """GuestCommand.UPDATE で送ったユーザーデータのうち、座標はサーバー管理の値が
    維持される（クライアントが古い座標を送っても上書きされない）。
    """
    pa, pb = two_participants

    # サーバー側の現在座標を取得
    server_x = UserStore._users[HA].x if UserStore._users.get(HA) else 0
    server_y = UserStore._users[HA].y if UserStore._users.get(HA) else 0

    # 異なる座標を含む UPDATE を送信
    await pa.send(
        {
            "command": GuestCommand.UPDATE,
            "user": {
                "h": HA,
                "name": "Position Test",
                "year": 1,
                "groups": [],
                "avatar": "",
                "x": 999,  # クライアントが送ったデタラメな座標
                "y": 999,
            },
        }
    )

    msg = await pa.wait_for_command("UPDATE")

    # サーバー管理の座標が維持されていること
    assert msg["user"]["x"] == server_x
    assert msg["user"]["y"] == server_y
    assert msg["user"]["name"] == "Position Test"
