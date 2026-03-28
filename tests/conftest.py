"""
pytest 共通フィクスチャ

NOTE: 環境変数は api.* モジュールの import より先に設定する必要があります。
      SECRET_KEY は import 時に api/auth.py で参照されるためここで事前設定します。
"""

import os

# api.* を import する前に環境変数を設定する
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-testing-only!!")
os.environ.setdefault("DISCORD_CLIENT_ID", "test-discord-client-id")
os.environ.setdefault("DISCORD_CLIENT_SECRET", "test-discord-client-secret")

import pytest
from time import time
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

import api.master  # noqa: F401 — @on_message/@on_join/@on_leave ハンドラーを登録
from api.api import router, _check_localhost
from api.auth import encode
from api.rtc import active_sessions, muted_users
from api.user import User, UserStore
from api import mapper as mapper_module
from api.mapper import MapRaw, init_mapper


# ---------------------------------------------------------------------------
# 状態リセット（全テストで自動実行）
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def reset_state():
    """テスト間で共有グローバルステートをリセットする"""
    UserStore._users.clear()
    active_sessions.clear()
    muted_users.clear()
    mapper_module.mapper = None
    yield
    UserStore._users.clear()
    active_sessions.clear()
    muted_users.clear()
    mapper_module.mapper = None


# ---------------------------------------------------------------------------
# FastAPI テストクライアント
# ---------------------------------------------------------------------------


@pytest.fixture
def test_app():
    """lifespan なし（バックグラウンドタスク不起動）のテスト用 FastAPI アプリ"""
    app = FastAPI()
    app.include_router(router)
    return app


@pytest.fixture
async def client(test_app):
    """通常の API テスト用クライアント"""
    async with AsyncClient(
        transport=ASGITransport(app=test_app), base_url="http://test"
    ) as c:
        yield c


@pytest.fixture
async def local_client(test_app, monkeypatch):
    """localhost 認証をバイパスした master エンドポイント用クライアント"""
    monkeypatch.setattr("api.api._check_localhost", lambda request: None)
    async with AsyncClient(
        transport=ASGITransport(app=test_app), base_url="http://test"
    ) as c:
        yield c


# ---------------------------------------------------------------------------
# 認証ヘルパー
# ---------------------------------------------------------------------------


@pytest.fixture
def valid_session_cookie():
    """有効なセッション Cookie 文字列"""
    return encode({"h": "testhash123"})


@pytest.fixture
def valid_auth_header():
    """有効な Authorization ヘッダー辞書"""
    token = encode({"h": "testhash123", "iat": int(time())})
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# マッパー
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_mapper():
    """5x5 の単純グリッドでマッパーを初期化する（テスト用）"""
    red = "11111,11111,11111,11111,11111"  # 全セル island 対象
    black = "00000,00000,00000,00000,00000"  # 衝突なし
    init_mapper(
        MapRaw(red=red, black=black),
        {"name": "test_map", "top": "", "bottom": ""},
    )
    return mapper_module.mapper


# ---------------------------------------------------------------------------
# LiveKit 統合テスト用
# ---------------------------------------------------------------------------


@pytest.fixture
def livekit_domain():
    """DOMAIN 未設定の場合は LiveKit テストをスキップ"""
    domain = os.environ.get("DOMAIN", "")
    if not domain:
        pytest.skip(
            "DOMAIN 環境変数が未設定のため LiveKit テストをスキップ (docker compose up が必要)"
        )
    return domain


def make_test_user(h: str, name: str = "Test User") -> User:
    """テスト用 User オブジェクトを生成する"""
    return User(h=h, name=name, year=1, groups=[], avatar="", x=0, y=0)
