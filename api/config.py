from dotenv import load_env
from os import environ

load_env()

APP_NAME = "itcobkai"
TTL = 60 * 60

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

LOG_LEVEL = 20
LOG_DIR = "data/log"
