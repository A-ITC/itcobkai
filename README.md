# 概要
サークルのOB会を大人数で行うために作成したボイスチャットです

## 構築手順
### 事前準備
- Discord
  - eveloper Portalで新規アプリケーションを作成
  - Auth2のClient IDとClient Secretを入手
- Skyway
  - 新規アカウントを作成
  - アプリケーションIDとシークレットキーを入手
- AWS Lambda
  - Lambdaの関数URLを有効化
  - タイムアウト設定を15秒程度に設定 (変更しないとログイン処理中にタイムアウトして500エラーになる)
- AWS S3
  - バケットを作成
- Google Slides API
  - 以下のサイトの手順を踏んでtoken.jsonを取得して`lambda/token.json`に配置する
  - Google Auth Platform / オーディエンス / 対象 で公開ステータスを「テスト」 から「本番環境」に変更しておく
  - https://developers.google.com/workspace/slides/api/quickstart/python?hl=ja
- Tiled
  - Tiledでマップを作成

### デプロイ
```sh
# マップをレンダリングしてアップロード
python3 create_map.py /path/to/map.tmx

# UIをビルドしてアップロード
npm install
npm run build

# Lambda用関数をビルドしてデプロイ
cd lambda
npm run build
```
ビルド後、`VITE_API_RUL`にアクセスする

### 環境変数
プロジェクト直下に`.env`を作成してください

```sh
# AWS関連
VITE_APP_NAME="[lambdaの関数名]"
VITE_API_URL="https://[lambdaの関数URLのアドレス]/"
VITE_S3_BUCKET="[HTMLやJavascript/CSSを格納するS3のバケット名]"
DATA_JSON="[ユーザ情報やマップ情報を格納しているJSONファイル]"

# Discord OAuth2関連
VITE_DISCORD_CLIENT_ID="[DiscordのClient ID]"
DISCORD_CLIENT_SECRET="[DiscordのSecretキー]"
DISCORD_ALLOWED_SERVERS="サーバ名1:サーバID1(数字18桁),サーバ名2:サーバID2,..."

# SkyWay関連
VITE_SKYWAY_ID="[SKYWAYのID]"
SKYWAY_SECRET="[SKYWAYのシークレットキー]"
 
# 認証関連
SESSION_PASSWORD="[任意のランダムな文字列]"
TOKEN_PASSWORD="[任意のランダムな文字列]"
TOKEN_EXPIRATION=1800
```

### マップの仕様
- 上下レイヤーの命名規則例:
  - 上層: t_、top、上
  - 下層: b_、bottom、下
- 赤・黒フラグレイヤーの命名規則例:
  - 赤(侵入禁止): 赤、red
  - 黒(繋がるエリア): 黒、black

### AWS ポリシー
lambda用
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "VisualEditor0",
            "Effect": "Allow",
            "Action": [
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:PutLogEvents"
            ],
            "Resource": "arn:aws:logs:REGION:ACCOUNT_ID:log-group:/aws/lambda/FUNCTION_NAME:*"
        },
        {
            "Sid": "VisualEditor1",
            "Effect": "Allow",
            "Action": [
                "s3:GetObject",
                "s3:PutObject",
                "s3:DeleteObject"
            ],
            "Resource": "arn:aws:s3:::S3_BUCKET/*"
        }
    ]
}
```

AWS CLI用
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "VisualEditor0",
            "Effect": "Allow",
            "Action": [
                "lambda:UpdateFunctionCode",
                "lambda:UpdateFunctionConfiguration"
            ],
            "Resource": [
                "arn:aws:lambda:REGION:ACCOUNT_ID:function:FUNCTION_NAME"
            ]
        },
        {
            "Sid": "VisualEditor1",
            "Effect": "Allow",
            "Action": [
                "s3:GetObject",
                "s3:PutObject",
                "s3:DeleteObject"
            ],
            "Resource": [
                "arn:aws:s3:::S3_BUCKET/*",
            ]
        }
    ]
}
```

# その他
マップの素材は[ドット絵世界](http://yms.main.jp)さんからお借りしています。
