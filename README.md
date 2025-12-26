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

### ビルド
ビルドとデプロイを同時に行う場合
```sh
npm install
npm run deploy
```

ビルドのみ行う場合
```sh
npm install
npm run build

cd lambda
npm run build
```
ビルド後に`dist`をS3に、`lambda/dist`をlambdaにアップロードする

### 環境変数
プロジェクト直下に`.env`を作成してください

```sh
# AWS関連
FUNCTION_NAME="[lambdaの関数名]"
VITE_API_URL="https://[lambdaの関数URLのアドレス]/"
S3_BUCKET="[HTMLやJavascript/CSSを格納するS3のバケット名]"

# Discord OAuth2関連
VITE_DISCORD_CLIENT_ID="[DiscordのClient ID]"
DISCORD_CLIENT_SECRET="[DiscordのSecretキー]"
DISCORD_ALLOWED_SERVERS="サーバ名1:サーバID1(数字18桁),サーバ名2:サーバID2,..."

# SkyWay関連
VITE_SKYWAY_ID="[SKYWAYのID]"
VITE_SKYWAY_SECRET="[SKYWAYのシークレットキー]"
 
# 認証関連
SESSION_PASSWORD="[任意のランダムな文字列]"
TOKEN_PASSWORD="[任意のランダムな文字列]"
TOKEN_EXPIRATION=1800
```

# その他
マップの素材は[ドット絵世界](http://yms.main.jp)さんからお借りしています。
