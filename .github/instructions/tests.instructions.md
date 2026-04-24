---
description: "Use when editing pytest, Vitest, UI tests, test fixtures, or test configuration. Covers backend and frontend testing strategy for files under tests/ and vitest config."
name: "Test Guidelines"
applyTo: "tests/**"
---

# Test Guidelines

## テストコマンド

```bash
set -a && source .env && set +a && uv run pytest tests/ -v
set -a && source .env && set +a && uv run pytest tests/ -v -m "not livekit"
set -a && source .env && set +a && uv run pytest tests/ -v -m livekit
pnpm test:ui
uv sync --extra test
```

## バックエンドテスト

| ファイル                            | 役割                                                       |
| :---------------------------------- | :--------------------------------------------------------- |
| `tests/conftest.py`                 | `reset_state`、`test_app`、`client` などの共通フィクスチャ |
| `tests/test_api.py`                 | FastAPI エンドポイントテスト                               |
| `tests/test_master_commands.py`     | `on_message` / `on_join` / `on_leave` のハンドラーテスト   |
| `tests/test_host_guest_commands.py` | HostCommand / GuestCommand の LiveKit 統合テスト           |
| `tests/test_connections.py`         | 接続島グループ計算のユニットテスト                         |

- ツールは `pytest`、`pytest-asyncio`、`httpx.AsyncClient`、`pytest-mock` を使います。
- LiveKit 統合テストは `@pytest.mark.livekit` で分け、`DOMAIN` が未設定なら失敗前提です。
- Discord OAuth は全テストでモックしてください。
- 通常テストは `lifespan` を持たない `test_app` を使い、`mixing_loop()` を起動しません。LiveKit 統合テストだけ必要に応じて `asyncio.create_task(mixing_loop())` を起動します。
- `api.master.master.register()` は lifespan 起動時と `tests/conftest.py` から明示的に呼びます。
- LiveKit は各ユーザーごとに自分のハッシュ値のルームへ参加し、`python-bot` が GuestCommand を受けて HostCommand をブロードキャストします。

## フロントエンドテスト

| ファイル                                 | 役割                                       |
| :--------------------------------------- | :----------------------------------------- |
| `tests/ui/setup.ts`                      | `@testing-library/jest-dom` のセットアップ |
| `tests/ui/Login.test.tsx`                | Discord OAuth ログインフローのテスト       |
| `tests/ui/Setup.test.tsx`                | プロフィール設定フォームのテスト           |
| `tests/ui/Main.test.tsx`                 | `Main` の表示と配線テスト                  |
| `tests/ui/Connections.test.ts`           | 接続ロジックのユニットテスト               |
| `tests/ui/UserStore.test.ts`             | `UserStore` の単体テスト                   |
| `tests/ui/HostMessageDispatcher.test.ts` | `HostMessageDispatcher` の単体テスト       |

- ツールは `Vitest`、`@solidjs/testing-library`、`@testing-library/jest-dom`、`@testing-library/user-event`、`happy-dom` を使います。
- ブラウザ環境は `happy-dom` です。モニターや OS 依存の前提は置かないでください。
- `Main.tsx` の UI テストでは `Manager` をモックして I/O を切り離し、表示と配線をまとめて検証します。
- `window.alert` など happy-dom にない API は `vi.stubGlobal()` で差し込み、`afterEach` で `vi.unstubAllGlobals()` を呼びます。
- コンポーネント内関数の実装詳細よりも、ユーザーに見える振る舞いを優先して検証します。
- `UserStore` や `HostMessageDispatcher` のような stateful な補助ロジックは、UI から分離した単体テストでカバーします。
- `afterEach` では必ず `cleanup()` を呼び、SolidJS のリアクティブルートを破棄します。
