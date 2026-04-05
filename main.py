from uvicorn import run
from fastapi import FastAPI
from api.api.router import router
from api.utils.config import API_PORT
from api.api.lifespan import lifespan
import api.master.master  # noqa: F401 — @on_message/@on_join/@on_leave ハンドラーを登録

app = FastAPI(lifespan=lifespan)
app.include_router(router)

if __name__ == "__main__":
    run(app, host="0.0.0.0", port=API_PORT)
