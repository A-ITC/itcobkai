"""\nFastAPI エンドポイントテスト\n\n対象エンドポイント:\n  GET  /api/token   — セッション Cookie を検証して JWT を返す\n  POST /api/init    — LiveKit ルームを初期化してトークンを返す (@livekit のみ実接続)\n  GET  /api/auth/authorize — Discord OAuth 認証 URL を返す\n  POST /api/discord — Discord OAuth2 コールバック\n  POST /api/master  — 管理コマンド (localhost 限定)\n  GET  /dist/assets/{filename}\n  GET  /dist/image/avatars/{hash}\n  GET  /dist/image/maps/{hash}\n"""

import pytest
from time import time
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport

from api.api.auth import encode
from api.master.user import us
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
        """不正な Cookie は 401 を返す"""
        resp = await client.get(
            "/api/token", cookies={"session": "invalid.cookie.value"}
        )
        assert resp.status_code == 401

    async def test_missing_cookie_raises_error(self, client):
        """Cookie なしは 401 を返す"""
        resp = await client.get("/api/token")
        assert resp.status_code == 401


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
        self, client, valid_auth_header, mock_mapper, livekit_domain, room_context
    ):
        """有効なトークン + LiveKit 起動中 → 200 + LiveKit トークン返却"""
        resp = await client.post("/api/init", headers=valid_auth_header)
        assert resp.status_code == 200
        body = resp.json()
        assert "token" in body

        # クリーンアップ
        h = "testhash123"
        session = room_context.active_sessions.pop(h, None)
        if session:
            await session.room.disconnect()


# ---------------------------------------------------------------------------
# /api/auth/authorize
# ---------------------------------------------------------------------------


class TestApiAuthorize:
    async def test_authorize_returns_discord_url(self, client):
        """GET /api/auth/authorize が Discord OAuth URL を返す"""
        resp = await client.get("/api/auth/authorize")
        assert resp.status_code == 200
        data = resp.json()
        assert "url" in data
        url = data["url"]
        assert "discord.com/api/oauth2/authorize" in url
        assert "response_type=code" in url
        assert "scope=identify" in url


# ---------------------------------------------------------------------------
# /api/session (Discord OAuth2 コールバック)
# ---------------------------------------------------------------------------


class TestApiSession:
    async def test_discord_oauth_sets_session_cookie(self, client):
        """Discord OAuth が成功するとセッション Cookie がセットされる"""
        mock_user = make_test_user("discord_user_hash_abc", "Test User")

        with patch("api.api.router.discord", new=AsyncMock(return_value=mock_user)):
            resp = await client.post(
                "/api/discord",
                json={"code": "dummycode"},
            )

        assert resp.status_code == 200
        assert "session" in resp.cookies


# ---------------------------------------------------------------------------
# /api/master
# ---------------------------------------------------------------------------


class TestApiMaster:
    async def test_no_secret_key_raises_http_403(self, test_app):
        """X-Secret-Key ヘッダーなしのアクセスは 403"""
        async with AsyncClient(
            transport=ASGITransport(app=test_app),
            base_url="http://test",
        ) as c:
            resp = await c.post(
                "/api/master", json={"command": "ALERT", "text": "test"}
            )
        assert resp.status_code == 403

    async def test_alert_command(self, local_client):
        """ALERT コマンドは send_message_all を呼んで 200 を返す"""
        with patch("api.rtc.adapter.send_raw_message", new=AsyncMock()):
            resp = await local_client.post(
                "/api/master", json={"command": "ALERT", "text": "メンテナンス中"}
            )
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}

    async def test_newmap_existing_map(self, local_client, mock_mapper):
        """NEWMAP コマンドは存在するマップ名で 200 を返す"""
        with patch("api.rtc.adapter.send_raw_message", new=AsyncMock()):
            resp = await local_client.post(
                "/api/master", json={"command": "NEWMAP", "map": "map2"}
            )
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}

    async def test_leave_removes_participant(self, local_client):
        """LEAVE コマンドは LiveKit API を通じてユーザーを削除して 200 を返す"""
        mock_remove = AsyncMock()
        with patch("api.api.admin.lkapi") as mock_lkapi:
            mock_lkapi.room.remove_participant = mock_remove
            resp = await local_client.post(
                "/api/master", json={"command": "LEAVE", "h": "target_user_hash"}
            )
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}
        mock_remove.assert_called_once()

    async def test_users_returns_active_sessions(self, local_client, room_context):
        """USERS コマンドはアクティブセッション一覧を返す"""
        # active_sessions にダミーセッションを追加
        dummy = MagicMock()
        dummy.username = "user_abc"
        room_context.active_sessions["user_abc"] = dummy
        us._users["user_abc"] = make_test_user("user_abc", "Alice")

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


class TestDistImage:
    async def test_avatar_image_route_returns_file(self, client, tmp_path):
        avatar_dir = tmp_path / "avatars"
        avatar_dir.mkdir()
        (avatar_dir / "avatar-hash.webp").write_bytes(b"avatar")

        with patch("api.api.router.AVATAR_DIR", str(avatar_dir)):
            resp = await client.get("/dist/image/avatars/avatar-hash")

        assert resp.status_code == 200
        assert resp.content == b"avatar"
        assert resp.headers["cache-control"] == "public, max-age=86400"

    async def test_map_image_route_returns_file(self, client, tmp_path):
        map_dir = tmp_path / "maps"
        map_dir.mkdir()
        (map_dir / "map-hash.png").write_bytes(b"map")

        with patch("api.api.router.MAP_DIR", str(map_dir)):
            resp = await client.get("/dist/image/maps/map-hash")

        assert resp.status_code == 200
        assert resp.content == b"map"
        assert resp.headers["cache-control"] == "public, max-age=86400"

    async def test_avatar_image_route_returns_404_for_missing_file(
        self, client, tmp_path
    ):
        avatar_dir = tmp_path / "avatars"
        avatar_dir.mkdir()

        with patch("api.api.router.AVATAR_DIR", str(avatar_dir)):
            resp = await client.get("/dist/image/avatars/missing")

        assert resp.status_code == 404

    async def test_map_image_route_returns_404_for_missing_file(self, client, tmp_path):
        map_dir = tmp_path / "maps"
        map_dir.mkdir()

        with patch("api.api.router.MAP_DIR", str(map_dir)):
            resp = await client.get("/dist/image/maps/missing")

        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# /api/users/@me
# ---------------------------------------------------------------------------


class TestApiUsersMe:
    # ── GET ──────────────────────────────────────────────────────────────

    async def test_get_me_without_auth_returns_401(self, client):
        """Authorization ヘッダーなしは 401"""
        resp = await client.get("/api/users/@me")
        assert resp.status_code == 401

    async def test_get_me_returns_user(self, client, valid_auth_header):
        """有効なトークンがあれば自分のユーザー情報を返す"""
        us._users["testhash123"] = make_test_user("testhash123", "Alice")
        resp = await client.get("/api/users/@me", headers=valid_auth_header)
        assert resp.status_code == 200
        body = resp.json()
        assert body["h"] == "testhash123"
        assert body["name"] == "Alice"
        assert "greeting" in body

    async def test_get_me_user_not_found_returns_404(self, client, valid_auth_header):
        """UserStore に存在しないユーザーは 404"""
        # reset_state で _users はクリア済み
        resp = await client.get("/api/users/@me", headers=valid_auth_header)
        assert resp.status_code == 404

    # ── POST ─────────────────────────────────────────────────────────────

    async def test_post_me_without_auth_returns_401(self, client):
        """Authorization ヘッダーなしは 401"""
        resp = await client.post(
            "/api/users/@me",
            json={"name": "Alice", "year": 3, "groups": ["dtm"], "greeting": "hi"},
        )
        assert resp.status_code == 401

    async def test_post_me_updates_user(self, client, valid_auth_header):
        """正常なリクエストでユーザー情報が更新される"""
        us._users["testhash123"] = make_test_user("testhash123", "Old Name")

        with patch("api.rtc.adapter.send_raw_message", new=AsyncMock()):
            resp = await client.post(
                "/api/users/@me",
                headers=valid_auth_header,
                json={
                    "name": "New Name",
                    "year": 5,
                    "groups": ["cg", "prog"],
                    "greeting": "こんにちは",
                },
            )

        assert resp.status_code == 200
        body = resp.json()
        assert body["name"] == "New Name"
        assert body["year"] == 5
        assert body["groups"] == ["cg", "prog"]
        assert body["greeting"] == "こんにちは"
        assert body["h"] == "testhash123"

    async def test_post_me_user_not_found_returns_404(self, client, valid_auth_header):
        """UserStore に存在しないユーザーは 404"""
        resp = await client.post(
            "/api/users/@me",
            headers=valid_auth_header,
            json={"name": "Ghost", "year": 1, "groups": [], "greeting": ""},
        )
        assert resp.status_code == 404

    async def test_post_me_empty_name_returns_422(self, client, valid_auth_header):
        """空の name は Pydantic バリデーションエラー (422)"""
        us._users["testhash123"] = make_test_user("testhash123")
        resp = await client.post(
            "/api/users/@me",
            headers=valid_auth_header,
            json={"name": "", "year": 1, "groups": [], "greeting": ""},
        )
        assert resp.status_code == 422

    async def test_post_me_name_too_long_returns_422(self, client, valid_auth_header):
        """41文字の name は 422"""
        us._users["testhash123"] = make_test_user("testhash123")
        resp = await client.post(
            "/api/users/@me",
            headers=valid_auth_header,
            json={"name": "a" * 41, "year": 1, "groups": [], "greeting": ""},
        )
        assert resp.status_code == 422

    async def test_post_me_year_zero_returns_422(self, client, valid_auth_header):
        """year=0 は 422 (ge=1)"""
        us._users["testhash123"] = make_test_user("testhash123")
        resp = await client.post(
            "/api/users/@me",
            headers=valid_auth_header,
            json={"name": "Alice", "year": 0, "groups": [], "greeting": ""},
        )
        assert resp.status_code == 422

    async def test_post_me_year_21_returns_422(self, client, valid_auth_header):
        """year=21 は 422 (le=20)"""
        us._users["testhash123"] = make_test_user("testhash123")
        resp = await client.post(
            "/api/users/@me",
            headers=valid_auth_header,
            json={"name": "Alice", "year": 21, "groups": [], "greeting": ""},
        )
        assert resp.status_code == 422

    async def test_post_me_invalid_group_returns_422(self, client, valid_auth_header):
        """無効な group 値は 422"""
        us._users["testhash123"] = make_test_user("testhash123")
        resp = await client.post(
            "/api/users/@me",
            headers=valid_auth_header,
            json={
                "name": "Alice",
                "year": 1,
                "groups": ["invalid_group"],
                "greeting": "",
            },
        )
        assert resp.status_code == 422

    async def test_post_me_greeting_too_long_returns_422(
        self, client, valid_auth_header
    ):
        """401文字の greeting は 422"""
        us._users["testhash123"] = make_test_user("testhash123")
        resp = await client.post(
            "/api/users/@me",
            headers=valid_auth_header,
            json={"name": "Alice", "year": 1, "groups": [], "greeting": "g" * 401},
        )
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# /api/users/{h}
# ---------------------------------------------------------------------------


class TestApiUsersH:
    async def test_get_user_without_auth_returns_401(self, client):
        """Authorization ヘッダーなしは 401"""
        resp = await client.get("/api/users/testhash123")
        assert resp.status_code == 401

    async def test_get_user_returns_user(self, client, valid_auth_header):
        """有効なトークンと存在するユーザーなら情報を返す"""
        us._users["otherhash456"] = make_test_user("otherhash456", "Bob")
        resp = await client.get("/api/users/otherhash456", headers=valid_auth_header)
        assert resp.status_code == 200
        body = resp.json()
        assert body["h"] == "otherhash456"
        assert body["name"] == "Bob"

    async def test_get_user_not_found_returns_404(self, client, valid_auth_header):
        """UserStore に存在しないユーザーは 404"""
        resp = await client.get(
            "/api/users/nonexistent_hash_xyz", headers=valid_auth_header
        )
        assert resp.status_code == 404
