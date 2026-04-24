# itcobkai — プロジェクト共通ガイドライン

## 概要

2D タイルベースのマップを備えた、グループ向けボイスチャットアプリです。マップ上の距離によって、どのユーザー間でオーディオミックスを共有するかを決定します。
セットアップとデプロイの詳細は `README.md` を参照してください。

## 指示ファイルの分割

- このファイルは全体共通の前提だけを扱います。
- `api` 配下の実装規約は `.github/instructions/api.instructions.md` にあります。
- `src` 配下の実装規約は `.github/instructions/src.instructions.md` にあります。
- `tests` 配下とテスト設定の規約は `.github/instructions/tests.instructions.md` にあります。
- 実装を変えたら、該当する instruction ファイルも一緒に更新してください。

### Docker コンテナ構成

| サービス名 | イメージ / Dockerfile    | 説明                                                                                                           |
| :--------- | :----------------------- | :------------------------------------------------------------------------------------------------------------- |
| `livekit`  | `livekit/livekit-server` | LiveKit RTC サーバー。常に起動しているので、LiveKit不要なテスト以外ではLiveKitを含めてテストを実施してください |
| `app`      | `./Dockerfile`           | FastAPI バックエンド。マルチステージビルドでフロントエンドの `dist/` も同梱。`./data` をボリュームマウント     |

## 共有プロトコル

- サーバーからクライアントへは `HostCommand` enum (`INIT`, `UPDATED`, `MOVED`, `JOINED`, `LEFT`, `MUTED`, `ALERT`, `NEWMAP`) を送ります。
- クライアントからサーバーへは `GuestCommand` enum (`UPDATE`, `MOVE`, `MUTE`) を送ります。
- `HostCommand` は過去形を使って `GuestCommand` と区別します。`INIT`、`ALERT`、`NEWMAP` はディレクティブなのでそのままです。
- `JOIN`、`UPDATE`、`MUTE` は `send_message_others` が基本ですが、`UPDATE` だけは送信者自身にも反映させるため `send_message_all` を使います。`LEAVE`、`MOVE`、`ALERT`、`NEWMAP` は `send_message_all` で全員に送ります。
- 共有スキーマは `src/common/Schema.ts` と Python 側のミラー実装で一致させてください。
- Python 側の `HostCommand` は uppercase 値の `StrEnum`、`GuestCommand` は lowercase 値の `StrEnum` を使います。フロントエンド側も同じ値で揃えます。

## 音声接続ルール

`api/master/connections.py` と `src/main/Connections.ts` は同じロジックを保ってください。

1. 同じ島にいる場合は距離に関係なく接続します。
2. 両方が島の外にいる場合はチェビシェフ距離 1 で接続し、A-B と B-C が繋がっていれば A-C も推移的に接続します。
3. 片方が島の中で片方が島の外にいる場合は、隣接していても接続しません。

## 環境変数

プロジェクトルートの `.env` に次が設定されています。

| 変数名                    | 用途                                       |
| :------------------------ | :----------------------------------------- |
| `DOMAIN`                  | TLS / TURN 用の公開ドメイン                |
| `SECRET_KEY`              | LiveKit API キーと JWT 署名                |
| `DISCORD_CLIENT_ID`       | Discord OAuth アプリ ID                    |
| `DISCORD_CLIENT_SECRET`   | Discord OAuth シークレット                 |
| `DISCORD_ALLOWED_SERVERS` | `server_id,server_id` 形式のホワイトリスト |

オプション: `API_PORT`, `DEV_PORT`, `WS_PORT`, `TCP_PORT`, `UDP_PORT_RANGE_*`

## 静的データパス

| パス              | 内容                                     |
| :---------------- | :--------------------------------------- |
| `data/users.json` | ユーザー一覧（x / y 座標を除く）         |
| `data/maps.json`  | マップ設定（red / black / top / bottom） |
| `data/avatars/`   | キャッシュされた Discord アバター        |
| `data/maps/`      | レンダリング済みマップ PNG               |
| `data/log/`       | 実行ログ                                 |
