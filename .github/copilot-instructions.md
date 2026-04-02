# itcobkai — プロジェクトガイドライン

## 概要

2Dタイルベースのマップを備えた、グループ向けボイスチャットアプリです。マップ上の距離（近接性）によって、どのユーザー間でオーディオミックスを共有するかを決定します。セットアップとデプロイの詳細については `README.md` を参照してください。

## 重要

- このドキュメントを最新に保つため、copilot-instructions.md の内容がプロジェクトの実装と常に一致していることを確認してください。コードの変更を加える際は、必要に応じてこのドキュメントも更新してください。

## アーキテクチャ

```
SolidJS フロントエンド ──HTTP/JWT──▶  FastAPI バックエンド (Python 3.12+)
                     ──WebRTC────▶  LiveKit サーバー (Docker)
```

| エリア               | 主要ファイル            | 内容                                                                    |
| :------------------- | :---------------------- | :---------------------------------------------------------------------- |
| APIルート            | `api/api.py`            | `/api/init`, `/api/discord`, `/api/session`, `/api/token`               |
| 認証                 | `api/auth.py`           | HMAC-SHA256 セッションCookie + JWT LiveKit トークン                     |
| RTC / 音声ミックス   | `api/rtc.py`            | LiveKit ボット、10ms オーディオフレーム、アイランド（島）グルーピング   |
| リアルタイムコマンド | `api/master.py`         | MOVE / UPDATE / MUTE ハンドラー、`send_message_others` による送信者除外 |
| マップ解析           | `api/mapper.py`         | TMXレイヤーからのシードフィルによるアイランドのラベリング               |
| Discord OAuth2       | `api/discord.py`        | サーバーホワイトリスト、アバターのキャッシュ                            |
| UIエントリ           | `src/index.tsx`         | 4つのルート: `/`, `/login`, `/test`, `/master`                          |
| メインビュー         | `src/viewer/Viewer.tsx` | `ViewerManager.ts` と連携                                               |
| RTCクライアント      | `src/common/RTC.ts`     | `RTCClient` クラス: LiveKit ルーム、データチャネル                      |
| 共有型定義           | `src/common/Schema.ts`  | `User`, `Map`, `HostCommand`, `GuestCommand`                            |
| 設定                 | `api/config.py`         | すべての環境変数をここで集約管理                                        |

## ビルドと実行

```bash
# バックエンド
uv run main.py     # $API_PORT（デフォルト 41022）で FastAPI を起動

# フロントエンド
npm install
npm run start      # $DEV_PORT で Vite 開発サーバーを起動

# LiveKit サーバー
docker compose up  # RTC機能を利用するために必須

# マップ処理（Tiled の .tmx ファイルが必要）
uv run create_map.py /path/to/map.tmx

# バックエンドテスト実行
uv run pytest tests/ -v                   # 全テスト（LiveKit テストは DOMAIN 未設定でスキップ）
uv run pytest tests/ -v -m "not livekit"  # LiveKit 不要なテストのみ
uv run pytest tests/ -v -m livekit        # LiveKit 統合テストのみ（docker compose up が必要）

# フロントエンド（UI）テスト実行
npm run test:ui                            # 一回実行（CI/サーバー向け）
npm run test:ui:watch                      # ウォッチモード（開発時）
```

## コーディング規約

### フロントエンド — SolidJS (React ではない)

- `createSignal`, `createMemo`, `createEffect` を使用してください。React hooks は**使用不可**です。
- DOM を必要とする副作用には `onMount` を使用してください。
- コンポーネントファイルは PascalCase (`Viewer.tsx`)、マネージャー/ユーティリティファイルは JSX なしの PascalCase (`ViewerManager.ts`) を使用します。
- インデントはスペース2つ、末尾のカンマなし、ダブルクォートを使用、最大行幅 120 (`package.json` / Prettier 設定参照)。

### バックエンド — Python 3.12+

- Async-first: すべてのハンドラーと I/O 呼び出しは `async`/`await` である必要があります。
- リクエスト/レスポンスのバリデーションには Pydantic モデルを使用 (`api/user.py`)。
- 関数名/変数名は `snake_case`、モジュールレベルの定数は `UPPER_CASE` を使用。
- すべての設定は `api/config.py` から読み取ります。環境変数名を他の場所にハードコードしないでください。
- LiveKit イベントハンドラーには `@on_message` / `@on_join` デコレータパターンを使用します。

### リアルタイムメッセージプロトコル

- サーバー → クライアント: `HostCommand` enum (`INIT`, `UPDATED`, `MOVED`, `JOINED`, `LEFT`, `MUTED`, `ALERT`, `NEWMAP`)
- クライアント → サーバー: `GuestCommand` enum (`UPDATE`, `MOVE`, `MUTE`)
- HostCommand は過去形（JOINED, MOVED, UPDATED, LEFT, MUTED）で GuestCommand と区別する。INIT / ALERT / NEWMAP はディレクティブ的なため据え置き。
- JOIN/UPDATE/MUTE は `send_message_others` で送信者を除いた全員に送信。LEAVE/MOVE/ALERT/NEWMAP は `send_message_all` で全員に送信。
- 両サイドとも `src/common/Schema.ts` で定義され、Python 側でもミラーリングされています。
- Python 側の `HostCommand` は `StrEnum` で uppercase 値（`"ALERT"` 等）、`GuestCommand` も `StrEnum` で lowercase 値（`"mute"`, `"move"`, `"update"`）を使用。
- フロントエンドの `HostCommand` は文字列 enum（uppercase）、`GuestCommand` は文字列 enum（lowercase）で Python 側と一致させる。

### Userモデル

バックエンド (`api/user.py`) とフロントエンド (`src/common/Schema.ts`) で共通のフィールド:

| フィールド | 型                        | 説明                                             |
| :--------- | :------------------------ | :----------------------------------------------- |
| `h`        | string                    | ユーザーハッシュ（Discord ID から生成）          |
| `name`     | string                    | 表示名                                           |
| `year`     | int / number              | 学年 (0–20)                                      |
| `groups`   | list[str] / string[]      | 所属グループ ("dtm", "cg", "prog", "mv")         |
| `avatar`   | string                    | アバターハッシュ（`/dist/images/{hash}` で参照） |
| `x`, `y`   | int / number              | マップ座標                                       |
| `mute`     | bool / boolean (optional) | ミュート状態（フロントで管理）                   |

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
| `SESSION_PASSWORD`        | Cookie 署名キー (ランダムな文字列)        |
| `TOKEN_PASSWORD`          | JWT 署名キー (ランダムな文字列)           |
| `TOKEN_EXPIRATION`        | JWT の有効期限 (秒) (デフォルト `1800`)   |

オプション: `API_PORT`, `DEV_PORT`, `WS_PORT`, `TCP_PORT`, `UDP_PORT_RANGE_*`, `VITE_APP_NAME`（フロントエンド localStorage キー名）

## 静的データパス

| パス                 | 内容                              |
| :------------------- | :-------------------------------- |
| `data/itcobkai.json` | ユーザー + マップの設定構成       |
| `data/avatars/`      | キャッシュされた Discord アバター |
| `data/maps/`         | レンダリング済みマップ PNG        |
| `data/log/`          | 実行ログ                          |

## テスト

テストはバックエンド (`tests/`) とフロントエンド (`tests/ui/`) に分かれています。

### バックエンドテスト

```bash
set -a && source .env && set +a && uv run pytest tests
```

| ファイル                            | 内容                                                      |
| :---------------------------------- | :-------------------------------------------------------- |
| `tests/conftest.py`                 | 共通フィクスチャ (reset_state, test_app, client 等)       |
| `tests/test_host_guest_commands.py` | LiveKit 統合テスト (全 HostCommand / GuestCommand フロー) |
| `tests/test_api.py`                 | FastAPI エンドポイントテスト                              |
| `tests/test_master_commands.py`     | `on_message` / `on_join` / `on_leave` ハンドラーテスト    |

### フロントエンドテスト（UI）

```bash
npm run test:ui
```

| ファイル                   | 内容                                                  |
| :------------------------- | :---------------------------------------------------- |
| `vitest.config.ts`         | Vitest 設定（happy-dom 環境、`import.meta.env` 定義） |
| `tests/ui/setup.ts`        | `@testing-library/jest-dom` マッチャーのセットアップ  |
| `tests/ui/Login.test.tsx`  | Login コンポーネントのテスト                          |
| `tests/ui/Viewer.test.tsx` | Viewer コンポーネント・VoicePanel・UserItem のテスト  |

### テスト戦略

#### バックエンド

- **ツール**: `pytest` + `pytest-asyncio` (asyncio_mode=auto) + `httpx.AsyncClient` + `pytest-mock`
- **LiveKit 統合テスト**: `@pytest.mark.livekit` でマーキング。`DOMAIN` 環境変数未設定時はエラー終了（`conftest.py` で dotenv により`.env`を自動読み込み）
- **Discord OAuth**: 全テストでモック（`unittest.mock.AsyncMock`）
- **バックグラウンドタスク**: 通常テストは `lifespan` を持たない `test_app` フィクスチャを使用し `mixing_loop` / `_position_ticker` を起動しない。LiveKit 統合テスト（`test_lk_move_broadcasts_move_after_tick`）は `_position_ticker` を `asyncio.create_task` で起動して実際の 1 秒待機を検証する
- **ハンドラー登録**: `api.master` は `main.py` 起動時に import されて登録される。テストでは `conftest.py` が明示的に `import api.master` する
- **LiveKit アーキテクチャ**: 各ユーザーは自分専用ルーム（名前 = ユーザーハッシュ）を持つ。ボット identity は `"python-bot"` で各ルームに 1 体常駐し、GuestCommand を受信して HostCommand をブロードキャストする

#### フロントエンド（UI）

- **ツール**: `Vitest` + `@solidjs/testing-library` + `@testing-library/jest-dom` + `@testing-library/user-event` + `happy-dom`
- **ブラウザ環境**: `happy-dom`（純粋 JS 実装、モニター/ネイティブ依存なし、Ubuntu Server で動作）
- **コンポーネントモック**: `vi.hoisted()` で変数を定義し `vi.mock()` ファクトリから参照する。`ViewerManager` は `livekit-client` 依存を持つため必ずモック
- **モックコンストラクタ**: `vi.fn().mockImplementation(function() { return mockObj; })` — arrow function は `new` で使えないため通常関数を使用
- **ブラウザグローバル**: `window.alert` 等 happy-dom に存在しない API は `vi.stubGlobal()` でセットし、`afterEach` で `vi.unstubAllGlobals()` を呼ぶ
- **コンポーネント内関数の単体テストは不要**。ユーザーが見る振る舞い（表示/非表示・テキスト・クラス名）を検証する
- `afterEach` で必ず `cleanup()` を呼び SolidJS リアクティブルートを破棄する

バックエンドテスト用オプション依存は `pyproject.toml` の `[project.optional-dependencies] test` セクションに定義:

```bash
uv sync --extra test
```
