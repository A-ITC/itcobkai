---
description: "Use when editing FastAPI, LiveKit, backend Python modules, realtime handlers, or files under api/. Covers backend architecture and implementation constraints."
name: "API Backend Guidelines"
applyTo: "api/**/*.py"
---

# API / Backend Guidelines

## 主要ファイル

| ファイル                           | 役割                                                                                                |
| :--------------------------------- | :-------------------------------------------------------------------------------------------------- |
| `api/api/router.py`                | `/api/init`, `/api/discord`, `/api/token`, `/api/master`, `/api/users/@me`, `/api/users/{h}` を定義 |
| `api/api/auth.py`                  | HMAC-SHA256 セッション Cookie、短命トークン、LiveKit JWT                                            |
| `api/api/discord.py`               | Discord OAuth2、許可サーバー判定、アバターキャッシュ                                                |
| `api/api/lifespan.py`              | 起動時のマップ・ユーザー読込、`register()`、`mixing_loop()` の管理                                  |
| `api/master/master.py`             | `MOVE` / `UPDATE` / `MUTE` ハンドラー登録、MOVE の即時ブロードキャスト                              |
| `api/master/grid.py`               | `PreparedMap`、`Position`、`parse_grid()`、`prepare_map()`、`label_islands()`                       |
| `api/master/connection_service.py` | 接続計算キャッシュと島グループ管理                                                                  |
| `api/master/connections.py`        | 接続グラフ計算と島グループ変換                                                                      |
| `api/master/user.py`               | `User` Pydantic モデル、`UserStore`、`us` シングルトン                                              |
| `api/rtc/adapter.py`               | `HostCommand` / `GuestCommand` enum、payload dataclass、送信ヘルパー                                |
| `api/rtc/rtc.py`                   | LiveKit ボット、10ms オーディオフレーム、アイランド単位の音声処理                                   |
| `api/rtc/state.py`                 | RTC の mutable state 集約                                                                           |
| `api/utils/config.py`              | 環境変数の集約ポイント                                                                              |
| `api/utils/schema.py`              | バックエンド共有 dataclass                                                                          |

## 実装規約

- Python は 3.12+ 前提です。
- Async-first を守り、ハンドラーと I/O は `async` / `await` に揃えてください。
- リクエストとレスポンスのバリデーションには Pydantic モデルを使ってください。
- 関数名と変数名は `snake_case`、モジュールレベル定数は `UPPER_CASE` を使います。
- 環境変数は必ず `api/utils/config.py` から取得し、他の場所に名前を直書きしません。
- RTC の mutable state は `api/rtc/state.py` に集約し、`init_room(...)`、`mixing_loop()`、`register()` から直接参照します。
- LiveKit / GuestCommand ハンドラー登録には `@on_message()`、`@on_join()`、`@on_leave()` のデコレータパターンを使います。
- `dict` の多用は避け、型が複数ファイルに跨る場合は `dataclasses` と `api/utils/schema.py` に寄せます。送信直前に `dataclasses.asdict()` で変換します。
- `USERS_JSON` を直接読むのは `api/master/user.py` の `UserStore` だけにします。他モジュールは `UserStore.load()`、`UserStore.all()`、`UserStore.get()` 経由で扱います。
- プロトコルや共有データを変えるときは、`src/common/Schema.ts` と対応テストも同時に揃えてください。
