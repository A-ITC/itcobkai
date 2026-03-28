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

| エリア               | 主要ファイル            | 内容                                                                  |
| :------------------- | :---------------------- | :-------------------------------------------------------------------- |
| APIルート            | `api/api.py`            | `/api/init`, `/api/session`, `/api/token`                             |
| 認証                 | `api/auth.py`           | HMAC-SHA256 セッションCookie + JWT LiveKit トークン                   |
| RTC / 音声ミックス   | `api/rtc.py`            | LiveKit ボット、10ms オーディオフレーム、アイランド（島）グルーピング |
| リアルタイムコマンド | `api/master.py`         | MOVE / UPDATE / MUTE ハンドラー                                       |
| マップ解析           | `api/mapper.py`         | TMXレイヤーからのシードフィルによるアイランドのラベリング             |
| Discord OAuth2       | `api/discord.py`        | サーバーホワイトリスト、アバターのキャッシュ                          |
| UIエントリ           | `src/index.tsx`         | 4つのルート: `/`, `/login`, `/test`, `/master`                        |
| メインビュー         | `src/viewer/Viewer.tsx` | `ViewerManager.ts` と連携                                             |
| RTCクライアント      | `src/common/RTC.ts`     | LiveKit ルーム、データチャネル                                        |
| 共有型定義           | `src/common/Schema.ts`  | `User`, `Map`, `HostCommand`, `GuestCommand`                          |
| 設定                 | `api/config.py`         | すべての環境変数をここで集約管理                                      |

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

# テスト実行
uv run pytest tests/ -v                   # 全テスト（LiveKit テストは DOMAIN 未設定でスキップ）
uv run pytest tests/ -v -m "not livekit"  # LiveKit 不要なテストのみ
uv run pytest tests/ -v -m livekit        # LiveKit 統合テストのみ（docker compose up が必要）
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

- サーバー → クライアント: `HostCommand` enum (`INIT`, `UPDATE`, `MOVE`, `JOIN`, `LEAVE`, `ALERT`, `NEWMAP`)
- クライアント → サーバー: `GuestCommand` enum (`UPDATE`, `MOVE`, `MUTE`)
- 両サイドとも `src/common/Schema.ts` で定義され、Python 側でもミラーリングされています。

| HostCommand | 用途                                                                                         |
| :---------- | :------------------------------------------------------------------------------------------- |
| `INIT`      | LiveKit接続時にユーザに投げられるコマンド, クライアントは初期化処理を実行する                |
| `UPDATE`    | ユーザ情報がアップデートされた際に全ユーザに送信されるコマンド                               |
| `MOVE`      | ユーザが移動した時に全ユーザに送信するコマンド                                               |
| `MUTE`      | ユーザがミュート状態を変更した時に全ユーザに送信するコマンド                                 |
| `JOIN`      | 新しいユーザが参加した際に既存のユーザに対して送信されるコマンド                             |
| `LEAVE`     | ユーザが退出した際に既存のユーザに対して送信されるコマンド                                   |
| `NEWMAP`    | masterが送信するコマンド, クライアントは新しいマップを読み込んで指定された位置にスポーンする |
| `ALERT`     | 重大なトラブルが発生した際にmasterが送信するコマンド, クライアントは画面をリロードする       |

| GuestCommand | 用途                                                        |
| :----------- | :---------------------------------------------------------- |
| `UPDATE`     | ユーザ情報がアップデートされた/される際に送信されるコマンド |
| `MOVE`       | ユーザが移動した時に送信するコマンド                        |
| `MUTE`       | ユーザのミュート状態を変更するコマンド                      |

### マップレイヤー (Tiled .tmx)

- 描画レイヤー: 接頭辞 `t_` / `top` / `上` (最前面)、`b_` / `bottom` / `下` (背面)
- 衝突判定レイヤー: `赤` / `red` — 移動不可エリア
- 接続性レイヤー: `黒` / `black` — 音声共有グループ（アイランド）の定義

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

オプション: `API_PORT`, `DEV_PORT`, `WS_PORT`, `TCP_PORT`, `UDP_PORT_RANGE_*`

## 静的データパス

| パス                 | 内容                              |
| :------------------- | :-------------------------------- |
| `data/itcobkai.json` | ユーザー + マップの設定構成       |
| `data/avatars/`      | キャッシュされた Discord アバター |
| `data/maps/`         | レンダリング済みマップ PNG        |
| `data/log/`          | 実行ログ                          |

## テスト

テストは `tests/` ディレクトリに配置されています。

| ファイル                        | 内容                                                        |
| :------------------------------ | :---------------------------------------------------------- |
| `tests/conftest.py`             | 共通フィクスチャ (reset_state, test_app, client 等)         |
| `tests/test_host_guest_commands.py` | LiveKit 統合テスト (全 HostCommand / GuestCommand フロー) |
| `tests/test_api.py`             | FastAPI エンドポイントテスト                                |
| `tests/test_master_commands.py` | `on_message` / `on_join` / `on_leave` ハンドラーテスト      |

### テスト戦略

- **ツール**: `pytest` + `pytest-asyncio` (asyncio_mode=auto) + `httpx.AsyncClient` + `pytest-mock`
- **LiveKit 統合テスト**: `@pytest.mark.livekit` でマーキング。`DOMAIN` 環境変数未設定時は自動スキップ（CI でも安全に動作）
- **Discord OAuth**: 全テストでモック（`unittest.mock.AsyncMock`）
- **バックグラウンドタスク**: `lifespan` を持たない `test_app` フィクスチャを使用し、`mixing_loop` / `_position_ticker` を起動しない
- **ハンドラー登録**: `api.master` は `main.py` 起動時に import されて登録される。テストでは `conftest.py` が明示的に `import api.master` する
- **LiveKit アーキテクチャ**: 各ユーザーは自分専用ルーム（名前 = ユーザーハッシュ）を持つ。ボット identity は `"python-bot"` で各ルームに 1 体常駐し、GuestCommand を受信して HostCommand をブロードキャストする

テスト用オプション依存は `pyproject.toml` の `[project.optional-dependencies] test` セクションに定義:

```bash
uv sync --extra test
```
