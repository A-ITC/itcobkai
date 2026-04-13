# itcobkai — プロジェクトガイドライン

## 概要

2Dタイルベースのマップを備えた、グループ向けボイスチャットアプリです。マップ上の距離（近接性）によって、どのユーザー間でオーディオミックスを共有するかを決定します。セットアップとデプロイの詳細については `README.md` を参照してください。

## 重要

- このドキュメントを最新に保つため、copilot-instructions.md の内容がプロジェクトの実装と常に一致していることを確認してください。コードの変更を加える際は、必要に応じてこのドキュメントも更新してください。

## アーキテクチャ

```
SolidJS フロントエンド ──HTTP/JWT──▶  FastAPI バックエンド (Python 3.12+)  ┐
                     ──WebRTC────▶  LiveKit サーバー (Docker)              ├ docker compose
                                    FastAPI + フロントエンド dist (Docker)  ┘
```

### Docker コンテナ構成

| サービス名 | イメージ / Dockerfile    | 説明                                                                                                       |
| :--------- | :----------------------- | :--------------------------------------------------------------------------------------------------------- |
| `livekit`  | `livekit/livekit-server` | LiveKit RTC サーバー。`network_mode: host` で稼働                                                          |
| `app`      | `./Dockerfile`           | FastAPI バックエンド。マルチステージビルドでフロントエンド (`dist/`) も同梱。`./data` をボリュームマウント |

**Dockerfile マルチステージビルド**:

1. `frontend` ステージ: `node:22-slim` + pnpm で `pnpm build` → `dist/`
2. `app` ステージ: `ghcr.io/astral-sh/uv:python3.12-bookworm-slim` で Python 依存インストール + `dist/` をコピー

**ビルド時 ARG**（`docker-compose.yml` の `build.args` から渡す）:

- `DOMAIN`, `VITE_DISCORD_CLIENT_ID`, `VITE_APP_NAME` — Vite ビルドに必要

| エリア               | 主要ファイル                | 内容                                                                                                              |
| :------------------- | :-------------------------- | :---------------------------------------------------------------------------------------------------------------- |
| APIルート            | `api/api/router.py`         | `/api/init`, `/api/discord`, `/api/token`, `/api/master`, `/api/users/@me`, `/api/users/{h}`                      |
| 認証                 | `api/api/auth.py`           | HMAC-SHA256 セッションCookie + HMAC-SHA256 short-lived トークン、LiveKit JWT                                      |
| Discord OAuth2       | `api/api/discord.py`        | サーバーホワイトリスト、アバターのキャッシュ                                                                      |
| マスターコマンド     | `api/api/master.py`         | ALERT / NEWMAP / LEAVE / USERS / BOTINIT ハンドラー                                                               |
| ライフサイクル       | `api/api/lifespan.py`       | 起動時マップ・ユーザー読込、ハンドラー登録（`register()`）、`mixing_loop` タスク管理                              |
| RTC / 音声ミックス   | `api/rtc/rtc.py`            | LiveKit ボット、10ms オーディオフレーム、アイランド（島）グルーピング                                             |
| コマンド定義         | `api/rtc/adapter.py`        | `HostCommand`/`GuestCommand` enum、`Command` 継承の payload dataclass、`send_message` ヘルパー                    |
| リアルタイムコマンド | `api/master/master.py`      | `register()` で登録する MOVE / UPDATE / MUTE ハンドラー。MOVE 受信時に即時 MOVED ブロードキャスト（イベント駆動） |
| グリッドデータ       | `api/master/grid.py`        | `MapRaw` dataclass、`Position` 型、`parse_grid()` / `label_islands()` 純粋関数                                    |
| 接続グラフ計算       | `api/master/connections.py` | `Connection` 型、`LastUpdated` dataclass、`calculate_connections()` / `connections_to_islands()`                  |
| マッパー             | `api/master/mapper.py`      | `Mapper` クラス（薄いオーケストレーター）、`mapper` シングルトン                                                  |
| ユーザーモデル       | `api/master/user.py`        | `User` Pydantic モデル、`UserStore` クラス (`us` シングルトン)                                                    |
| 共有スキーマ         | `api/utils/schema.py`       | `Move`, `MapMeta` — バックエンド全体で使う共有 dataclass                                                          |
| 設定                 | `api/utils/config.py`       | すべての環境変数をここで集約管理                                                                                  |
| UIエントリ           | `src/index.tsx`             | HashRouter: `/`(Main), `/login`(Login), `/setup`(Setup), `*`(404)                                                 |
| メインビュー         | `src/main/Main.tsx`         | `Manager.ts` と連携                                                                                               |
| マネージャー         | `src/main/Manager.ts`       | `Manager` クラス: HostCommand 処理・RTC 連携・Controller 管理                                                     |
| VoicePanel           | `src/main/VoicePanel.tsx`   | サイドパネル: 接続/退席ボタン・ユーザーリスト・接続島グルーピング表示                                             |
| 接続グラフ計算(UI)   | `src/main/Connections.ts`   | `labelIslands()` / `buildAdjacency()` / `getPlayerConnections()` — Python 側 connections.py と対称                |
| プロフィール設定     | `src/pages/Setup.tsx`       | 初回登録フォーム（name 設定済みなら `/` にリダイレクト）                                                          |
| RTCクライアント      | `src/common/RTC.ts`         | `RTCClient` クラス: LiveKit ルーム、データチャネル                                                                |
| 共有型定義           | `src/common/Schema.ts`      | `User`, `Map`, `MapRaw`, `HostCommand`, `GuestCommand`, `HostMessage`, `GuestMessage`                             |

## コーディング規約

### フロントエンド — SolidJS (React ではない)

- `createSignal`, `createMemo`, `createEffect` を使用してください。React hooks は**使用不可**です。
- DOM を必要とする副作用には `onMount` を使用してください。
- コンポーネントファイルは PascalCase (`Main.tsx`)、マネージャー/ユーティリティファイルは JSX なしの PascalCase (`Manager.ts`) を使用します。
- インデントはスペース2つ、末尾のカンマなし、ダブルクォートを使用、最大行幅 120 (`package.json` / Prettier 設定参照)。

### バックエンド — Python 3.12+

- Async-first: すべてのハンドラーと I/O 呼び出しは `async`/`await` である必要があります。
- リクエスト/レスポンスのバリデーションには Pydantic モデルを使用 (`api/master/user.py`)。
- 関数名/変数名は `snake_case`、モジュールレベルの定数は `UPPER_CASE` を使用。
- すべての設定は `api/utils/config.py` から読み取ります。環境変数名を他の場所にハードコードしないでください。
- LiveKit イベントハンドラーには `@on_message` / `@on_join` デコレータパターンを使用します。
- `dict` は極力使わず、`dataclasses` で型付けする。複数ファイルで使う型は `api/utils/schema.py` に定義する。送信直前に `dataclasses.asdict()` で dict 変換する。
- `USERS_JSON` を直接読み取るのは `api/master/user.py` の `UserStore` のみ。他のモジュール・ツールは `UserStore.load()` / `UserStore.all()` / `UserStore.get()` を介してアクセスする。

### リアルタイムメッセージプロトコル

- サーバー → クライアント: `HostCommand` enum (`INIT`, `UPDATED`, `MOVED`, `JOINED`, `LEFT`, `MUTED`, `ALERT`, `NEWMAP`)
- クライアント → サーバー: `GuestCommand` enum (`UPDATE`, `MOVE`, `MUTE`)
- HostCommand は過去形（JOINED, MOVED, UPDATED, LEFT, MUTED）で GuestCommand と区別する。INIT / ALERT / NEWMAP はディレクティブ的なため据え置き。
- JOIN/UPDATE/MUTE は `send_message_others` で送信者を除いた全員に送信。ただし UPDATE のみ `send_message_all` で送信者自身にも反映させる。LEAVE/MOVE/ALERT/NEWMAP は `send_message_all` で全員に送信。
- 両サイドとも `src/common/Schema.ts` で定義され、Python 側でもミラーリングされています。
- Python 側の `HostCommand` は `StrEnum` で uppercase 値（`"ALERT"` 等）、`GuestCommand` も `StrEnum` で lowercase 値（`"mute"`, `"move"`, `"update"`）を使用。
- フロントエンドの `HostCommand` は文字列 enum（uppercase）、`GuestCommand` は文字列 enum（lowercase）で Python 側と一致させる。

### Userモデル

バックエンド (`api/master/user.py`) とフロントエンド (`src/common/Schema.ts`) で共通のフィールド:

| フィールド | 型                        | 説明                                             |
| :--------- | :------------------------ | :----------------------------------------------- |
| `h`        | string                    | ユーザーハッシュ（Discord ID から生成）          |
| `name`     | string                    | 表示名                                           |
| `year`     | int / number              | 学年 (0–20)                                      |
| `groups`   | list[str] / string[]      | 所属グループ ("dtm", "cg", "prog", "mv", "3dcg") |
| `greeting` | string                    | 一言自己紹介（省略可、最大400文字）              |
| `avatar`   | string                    | アバターハッシュ（`/dist/images/{hash}` で参照） |
| `x`, `y`   | int / number              | マップ座標                                       |
| `mute`     | bool / boolean (optional) | ミュート状態（フロントで管理、保存対象外）       |

| HostCommand | 用途                                                                                          |
| :---------- | :-------------------------------------------------------------------------------------------- |
| `INIT`      | LiveKit接続時にユーザに投げられるコマンド, クライアントは初期化処理を実行する                 |
| `UPDATED`   | ユーザ情報がアップデートされた際に**送信者以外**に送信されるコマンド                          |
| `MOVED`     | ユーザが移動した時に全ユーザに送信するコマンド                                                |
| `MUTED`     | ユーザがミュート状態を変更した時に**送信者以外**に送信されるコマンド                          |
| `JOINED`    | 新しいユーザが参加した際に**既存ユーザ（参加者除く）**に送信されるコマンド                    |
| `LEFT`      | ユーザが退出した際に全ユーザに送信されるコマンド                                              |
| `NEWMAP`    | masterが送信するコマンド, クライアントは新しいマップを読み込む。座標は続いて MOVED で受信する |
| `ALERT`     | 重大なトラブルが発生した際にmasterが送信するコマンド, クライアントは画面をリロードする        |

| GuestCommand | 用途                                                        |
| :----------- | :---------------------------------------------------------- |
| `UPDATE`     | ユーザ情報がアップデートされた/される際に送信されるコマンド |
| `MOVE`       | ユーザが移動した時に送信するコマンド                        |
| `MUTE`       | ユーザのミュート状態を変更するコマンド                      |

### 音声接続ルール

`api/master/connections.py` と `src/main/Connections.ts` に同じロジックを実装。

1. **同じ島にいる** → 距離不問で接続
2. **両方が島の外にいる** → チェビシェフ距離 1 で接続。A-B, B-C が繋がっていれば A-C も推移的に接続
3. **片方が島の中、片方が島の外** → 隣接していても接続しない

### マップレイヤー (Tiled .tmx)

- 描画レイヤー: 接頭辞 `t_` / `top` / `上` (最前面)、`b_` / `bottom` / `下` (背面)
- 衝突判定レイヤー: `黒` / `black` — 移動不可エリア
- 接続性レイヤー: `赤` / `red` — 音声共有グループ（アイランド）の定義

## 環境変数

プロジェクトのルートに `.env` を作成してください。以下のシークレットが必須です。

| 変数名                    | 用途                                      |
| :------------------------ | :---------------------------------------- |
| `DOMAIN`                  | TLS/TURN 用の公開ドメイン                 |
| `SECRET_KEY`              | LiveKit API キー + JWT 署名用             |
| `VITE_DISCORD_CLIENT_ID`  | Discord OAuth アプリ ID (フロントエンド)  |
| `DISCORD_CLIENT_SECRET`   | Discord OAuth シークレット (バックエンド) |
| `DISCORD_ALLOWED_SERVERS` | `label:id,label:id` 形式のホワイトリスト  |

オプション: `API_PORT`, `DEV_PORT`, `WS_PORT`, `TCP_PORT`, `UDP_PORT_RANGE_*`, `VITE_APP_NAME`（フロントエンド localStorage キー名）

## 静的データパス

| パス              | 内容                               |
| :---------------- | :--------------------------------- |
| `data/users.json` | ユーザー一覧 (x/y 座標を除く)      |
| `data/maps.json`  | マップ設定（red/black/top/bottom） |
| `data/avatars/`   | キャッシュされた Discord アバター  |
| `data/maps/`      | レンダリング済みマップ PNG         |
| `data/log/`       | 実行ログ                           |

## テスト

テストはバックエンド (`tests/`) とフロントエンド (`tests/ui/`) に分かれています。

### バックエンドテスト

```bash
set -a && source .env && set +a && uv run pytest tests/ -v  # 全テスト（LiveKit テストは DOMAIN 未設定でスキップ）
set -a && source .env && set +a && uv run pytest tests/ -v -m "not livekit"  # LiveKit 不要なテストのみ
set -a && source .env && set +a && uv run pytest tests/ -v -m livekit  # LiveKit 統合テストのみ（docker compose up が必要）
```

| ファイル                            | 内容                                                                  |
| :---------------------------------- | :-------------------------------------------------------------------- |
| `tests/conftest.py`                 | 共通フィクスチャ (reset_state, test_app, client 等)                   |
| `tests/test_host_guest_commands.py` | LiveKit 統合テスト (全 HostCommand / GuestCommand フロー)             |
| `tests/test_api.py`                 | FastAPI エンドポイントテスト                                          |
| `tests/test_master_commands.py`     | `on_message` / `on_join` / `on_leave` ハンドラーテスト                |
| `tests/test_connections.py`         | `calculate_connections()` / `connections_to_islands()` ユニットテスト |

### フロントエンドテスト（UI）

```bash
pnpm test:ui
```

| ファイル                       | 内容                                                       |
| :----------------------------- | :--------------------------------------------------------- |
| `vitest.config.ts`             | Vitest 設定（happy-dom 環境、`import.meta.env` 定義）      |
| `tests/ui/setup.ts`            | `@testing-library/jest-dom` マッチャーのセットアップ       |
| `tests/ui/Login.test.tsx`      | Login コンポーネントのテスト（Discord OAuth フロー）       |
| `tests/ui/Setup.test.tsx`      | Setup コンポーネントのテスト（プロフィール設定フォーム）   |
| `tests/ui/Viewer.test.tsx`     | Main コンポーネント・VoicePanel・UserItem のテスト         |
| `tests/ui/Connections.test.ts` | `labelIslands()` / `getPlayerConnections()` ユニットテスト |

### テスト戦略

#### バックエンド

- **ツール**: `pytest` + `pytest-asyncio` (asyncio_mode=auto) + `httpx.AsyncClient` + `pytest-mock`
- **LiveKit 統合テスト**: `@pytest.mark.livekit` でマーキング。`DOMAIN` 環境変数未設定時はエラー終了（`conftest.py` で dotenv により`.env`を自動読み込み）
- **Discord OAuth**: 全テストでモック（`unittest.mock.AsyncMock`）
- **バックグラウンドタスク**: 通常テストは `lifespan` を持たない `test_app` フィクスチャを使用し `mixing_loop` / `_position_ticker` を起動しない。LiveKit 統合テスト（`test_lk_move_broadcasts_move_after_tick`）は `_position_ticker` を `asyncio.create_task` で起動して実際の 1 秒待機を検証する
- **ハンドラー登録**: `api.master.master` は `main.py` 起動時に import されて登録される。テストでは `conftest.py` が明示的に `import api.master.master` する
- **LiveKit アーキテクチャ**: 全ユーザーは共通の LiveKit ルーム (`APP_NAME`) に参加する。ボット identity は `"python-bot"` で常駐し、GuestCommand を受信して HostCommand をブロードキャストする

#### フロントエンド（UI）

- **ツール**: `Vitest` + `@solidjs/testing-library` + `@testing-library/jest-dom` + `@testing-library/user-event` + `happy-dom`
- **ブラウザ環境**: `happy-dom`（純粋 JS 実装、モニター/ネイティブ依存なし、Ubuntu Server で動作）
- **コンポーネントモック**: `vi.hoisted()` で変数を定義し `vi.mock()` ファクトリから参照する。`Manager`（`src/main/Manager.ts`）は `livekit-client` 依存を持つため必ずモック
- **モックコンストラクタ**: `vi.fn().mockImplementation(function() { return mockObj; })` — arrow function は `new` で使えないため通常関数を使用
- **ブラウザグローバル**: `window.alert` 等 happy-dom に存在しない API は `vi.stubGlobal()` でセットし、`afterEach` で `vi.unstubAllGlobals()` を呼ぶ
- **コンポーネント内関数の単体テストは不要**。ユーザーが見る振る舞い（表示/非表示・テキスト・クラス名）を検証する
- `afterEach` で必ず `cleanup()` を呼び SolidJS リアクティブルートを破棄する

バックエンドテスト用オプション依存は `pyproject.toml` の `[project.optional-dependencies] test` セクションに定義:

```bash
uv sync --extra test
```
