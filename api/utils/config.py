from dotenv import load_dotenv
from os import environ

load_dotenv()

APP_NAME = "itcobkai"
TTL = 60 * 60
LOG_LEVEL = 20

# ディレクトリ/ファイル関連
LOG_DIR = "data/log"
AVATAR_DIR = "data/avatars"
MAP_DIR = "data/maps"
USERS_JSON = "data/users.json"
MAPS_JSON = "data/maps.json"

# Discord OAuth2関連
DISCORD_CLIENT_ID = environ.get("VITE_DISCORD_CLIENT_ID")
DISCORD_CLIENT_SECRET = environ.get("DISCORD_CLIENT_SECRET")
DISCORD_ALLOWED_SERVERS = environ.get("DISCORD_ALLOWED_SERVERS")

# アプリケーション関連
SECRET_KEY = environ.get("SECRET_KEY")
TOKEN_EXPIRATION = int(environ.get("TOKEN_EXPIRATION", 1800))
DEV_PORT = int(environ.get("DEV_PORT", 41021))
API_PORT = int(environ.get("API_PORT", 41022))

# LiveKit関連
DOMAIN = environ.get("DOMAIN")
