"""
FastAPI エンドポイントテスト

対象エンドポイント:
  GET  /api/token   — セッション Cookie を検証して JWT を返す
  POST /api/init    — LiveKit ルームを初期化してトークンを返す (@livekit のみ実接続)
  GET  /api/session — Discord OAuth2 コールバック
  POST /api/master  — 管理コマンド (localhost 限定)
  GET  /dist/assets/{filename}
  GET  /dist/images/{hash}
"""

import json
import pytest
from time import time
from unittest.mock import AsyncMock, MagicMock, patch

from api.auth import encode
from api.config import APP_NAME
from api.rtc import active_sessions
from api.user import UserStore
from tests.conftest import make_test_user


# ---------------------------------------------------------------------------
# /api/token
# ---------------------------------------------------------------------------


class TestApiToken:
    async def test_valid_session_cookie_returns_token(
        self, client, valid_session_cookie
    ):
        """有効なセッション Cookie があれば token と ttl が返る"""
        resp = await client.get("/api/token", cookies={"session": valid_session_cookie})
        assert resp.status_code == 200
        body = resp.json()
        assert "token" in body
        assert "ttl" in body
        assert isinstance(body["ttl"], int)

    async def test_invalid_cookie_raises_error(self, client):
        """不正な Cookie は decode 例外を送出する
        (token エンドポイントは例外をハンドリングしないため例外が伝播する)
        """
        with pytest.raises(Exception):
            await client.get("/api/token", cookies={"session": "invalid.cookie.value"})

    async def test_missing_cookie_raises_error(self, client):
        """Cookie なしは TypeError / AttributeError を送出する"""
        with pytest.raises(Exception):
            await client.get("/api/token")


# ---------------------------------------------------------------------------
# /api/init
# ---------------------------------------------------------------------------


class TestApiInit:
    async def test_missing_auth_header_returns_401(self, client):
        """Authorization ヘッダーなしは 401"""
        resp = await client.post("/api/init")
        assert resp.status_code == 401

    async def test_expired_token_returns_401(self, client):
        """期限切れトークンは 401"""
        expired = encode({"h": "testhash123", "iat": 0})
        resp = await client.post(
            "/api/init",
            headers={"Authorization": f"Bearer {expired}"},
        )
        assert resp.status_code == 401

    @pytest.mark.livekit
    async def test_valid_token_with_livekit_returns_token(
        self, client, valid_auth_header, mock_mapper, livekit_domain
    ):
        """有効なトークン + LiveKit 起動中 → 200 + LiveKit トークン返却"""
        resp = await client.post("/api/init", headers=valid_auth_header)
        assert resp.status_code == 200
        body = resp.json()
        assert "token" in body

        # クリーンアップ
        from api.rtc import active_sessions as sess

        h = "testhash123"
        session = sess.pop(h, None)
        if session:
            await session.room.disconnect()


# ---------------------------------------------------------------------------
# /api/session (Discord OAuth2 コールバック)
# ---------------------------------------------------------------------------


class TestApiSession:
    async def test_discord_oauth_sets_session_cookie(self, client):
        """Discord OAuth が成功するとセッション Cookie がセットされる
        (SessionRequest は BaseModel なので GET リクエストでも JSON body として送信)
        """
        mock_info = MagicMock()
        mock_info.id = "discord_user_hash_abc"

        with patch("api.api.discord", new=AsyncMock(return_value=mock_info)):
            resp = await client.request(
                "GET",
                "/api/session",
                json={"code": "dummycode", "redirect": "https://example.com/callback"},
            )

        assert resp.status_code == 200
        assert "session" in resp.cookies


# ---------------------------------------------------------------------------
# /api/master
# ---------------------------------------------------------------------------


class TestApiMaster:
    async def test_non_localhost_check_raises_http_403(self):
        """_check_localhost は非 localhost IP からのアクセスを 403 で拒否する
        (httpx ASGITransport は 127.0.0.1 を使うため HTTP 経由ではテスト不可)
        """
        from fastapi import HTTPException
        from api.api import _check_localhost

        mock_request = MagicMock()
        mock_request.client.host = "192.168.1.100"

        with pytest.raises(HTTPException) as exc_info:
            _check_localhost(mock_request)
        assert exc_info.value.status_code == 403

    async def test_non_localhost_none_client_raises_http_403(self):
        """client が None の場合も 403"""
        from fastapi import HTTPException
        from api.api import _check_localhost

        mock_request = MagicMock()
        mock_request.client = None

        with pytest.raises(HTTPException) as exc_info:
            _check_localhost(mock_request)
        assert exc_info.value.status_code == 403

    async def test_alert_command(self, local_client):
        """ALERT コマンドは send_message_all を呼んで 200 を返す"""
        with patch("api.rtc.send_raw_message", new=AsyncMock()):
            resp = await local_client.post(
                "/api/master", json={"command": "ALERT", "text": "メンテナンス中"}
            )
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}

    async def test_alert_with_reload_flag(self, local_client):
        """ALERT + reload フラグは 200 を返す"""
        with patch("api.rtc.send_raw_message", new=AsyncMock()):
            resp = await local_client.post(
                "/api/master",
                json={"command": "ALERT", "text": "再起動", "reload": True},
            )
        assert resp.status_code == 200

    async def test_newmap_existing_map(self, local_client, mock_mapper):
        """NEWMAP コマンドは存在するマップ名で 200 を返す"""
        with patch("api.rtc.send_raw_message", new=AsyncMock()):
            resp = await local_client.post(
                "/api/master", json={"command": "NEWMAP", "map": "map2"}
            )
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}

    async def test_newmap_unknown_map_returns_404(self, local_client):
        """NEWMAP コマンドは存在しないマップ名で 404 を返す"""
        resp = await local_client.post(
            "/api/master", json={"command": "NEWMAP", "map": "nonexistent_map_xyz"}
        )
        assert resp.status_code == 404

    async def test_leave_removes_participant(self, local_client):
        """LEAVE コマンドは LiveKit API を通じてユーザーを削除して 200 を返す"""
        mock_remove = AsyncMock()
        with patch("api.api.lkapi") as mock_lkapi:
            mock_lkapi.room.remove_participant = mock_remove
            resp = await local_client.post(
                "/api/master", json={"command": "LEAVE", "h": "target_user_hash"}
            )
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}
        mock_remove.assert_called_once()

    async def test_leave_livekit_error_returns_400(self, local_client):
        """LEAVE コマンドで LiveKit エラーが起きると 400 を返す"""
        with patch("api.api.lkapi") as mock_lkapi:
            mock_lkapi.room.remove_participant = AsyncMock(
                side_effect=Exception("Not found")
            )
            resp = await local_client.post(
                "/api/master", json={"command": "LEAVE", "h": "ghost_user"}
            )
        assert resp.status_code == 400

    async def test_users_returns_active_sessions(self, local_client):
        """USERS コマンドはアクティブセッション一覧を返す"""
        # active_sessions にダミーセッションを追加
        dummy = MagicMock()
        dummy.username = "user_abc"
        active_sessions["user_abc"] = dummy
        UserStore._users["user_abc"] = make_test_user("user_abc", "Alice")

        resp = await local_client.post("/api/master", json={"command": "USERS"})

        assert resp.status_code == 200
        body = resp.json()
        assert "users" in body
        user_entry = next((u for u in body["users"] if u["h"] == "user_abc"), None)
        assert user_entry is not None
        assert user_entry["name"] == "Alice"

    async def test_unknown_command_returns_400(self, local_client):
        """未知のコマンドは 400 を返す"""
        resp = await local_client.post(
            "/api/master", json={"command": "UNKNOWN_COMMAND"}
        )
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# 静的ファイル配信
# ---------------------------------------------------------------------------


class TestStaticFiles:
    async def test_asset_not_found_returns_404(self, client):
        """存在しないアセットは 404"""
        resp = await client.get("/dist/assets/nonexistent_file_xyz.js")
        assert resp.status_code == 404

    async def test_image_not_found_returns_404(self, client):
        """存在しない画像ハッシュは 404"""
        resp = await client.get("/dist/images/0000000000000000000000000000000000000000")
        assert resp.status_code == 404
