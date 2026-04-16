"""
pytest 共通フィクスチャ

NOTE: 環境変数は api.* モジュールの import より先に設定する必要があります。
      SECRET_KEY は import 時に api/auth.py で参照されるためここで事前設定します。
"""

import os
from dotenv import load_dotenv

# .env ファイルから環境変数を読み込む（DOMAIN等 LiveKit テストに必要）
load_dotenv()

# api.* を import する前に環境変数を設定する
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-testing-only!!")
os.environ.setdefault("DISCORD_CLIENT_ID", "test-discord-client-id")
os.environ.setdefault("DISCORD_CLIENT_SECRET", "test-discord-client-secret")

import pytest
from time import time
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

from api.master.master import register

register()  # @on_message/@on_join/@on_leave ハンドラーを登録（副作用インポートの代替）
from api.api.router import router, _check_secret_key
from api.api.auth import encode
from api.rtc.rtc import lkapi
from api.rtc.state import active_sessions, muted_users, connects
from api.master.connection_service import connection_service
from api.master.grid import prepare_map
from api.master.user import User, UserStore, us
from api.master.position_store import position_store
from api.utils.schema import MapMeta


# ---------------------------------------------------------------------------
# 状態リセット（全テストで自動実行）
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def mock_users_json(tmp_path, monkeypatch):
    """テスト中の upsert/load による users.json への書き込み・読み込みをテンポラリファイルにリダイレクトする"""
    import api.master.user as user_module

    monkeypatch.setattr(user_module, "USERS_JSON", str(tmp_path / "users.json"))


@pytest.fixture(autouse=True)
def reset_state():
    """テスト間で共有グローバルステートをリセットする"""
    us._users.clear()
    if us._save_task and not us._save_task.done():
        us._save_task.cancel()
    us._save_task = None
    active_sessions.clear()
    muted_users.clear()
    connects([])
    position_store.reset()
    connection_service.reset()
    yield
    us._users.clear()
    if us._save_task and not us._save_task.done():
        us._save_task.cancel()
    us._save_task = None
    active_sessions.clear()
    muted_users.clear()
    connects([])
    position_store.reset()
    connection_service.reset()


@pytest.fixture(autouse=True)
async def _close_lkapi():
    """各テスト後に LiveKitAPI の aiohttp セッションをクローズする。
    lkapi が初期化されていない場合は何もしない（no-op）。
    """
    yield
    await lkapi.aclose()


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
    """SECRET_KEY 認証をバイパスした master エンドポイント用クライアント"""
    monkeypatch.setattr("api.api.router._check_secret_key", lambda request: None)
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
    prepared = prepare_map(
        MapMeta(name="test_map", top="", bottom="", red=red, black=black)
    )
    position_store.initialize(prepared)
    connection_service.initialize(prepared)
    return position_store


# ---------------------------------------------------------------------------
# LiveKit 統合テスト用
# ---------------------------------------------------------------------------


@pytest.fixture
def livekit_domain():
    """DOMAIN 未設定の場合は LiveKit テストをエラー終了する"""
    domain = os.environ.get("DOMAIN", "")
    if not domain:
        pytest.fail(
            "DOMAIN 環境変数が未設定です。.env を確認し docker compose up を実行してください。"
        )
    return domain


def make_test_user(h: str, name: str = "Test User") -> User:
    """テスト用 User オブジェクトを生成する"""
    return User(h=h, name=name, year=1, groups=[], avatar="", x=0, y=0)
