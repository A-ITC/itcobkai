# 概要
サークルのOB会を大人数で行うために作成したボイスチャットです

## 構築手順
### 事前準備
- Discord Developer Portalから新規アプリケーションを作成
  - Auth2のClient IDとClient Secretを入手
- Skywayで新規アカウントを作成
  - アプリケーションIDとシークレットキーを入手
- AWSでlambdaを作成
  - Lambdaの関数URLを有効化
  - タイムアウト設定を15秒程度に設定 (変更しないとログイン中にタイムアウトで500エラーになる)
- AWSでS3のバケットを作成

### デプロイ
```sh
# マップを解析/レンダリングしてアップロード
cd lambda
npm run build

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
                "s3:PutObject",
                "s3:GetObject"
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
