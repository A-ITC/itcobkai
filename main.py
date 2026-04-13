from uvicorn import run
from fastapi import FastAPI
from api.api.router import router
from api.utils.config import API_PORT
from api.api.lifespan import lifespan

app = FastAPI(lifespan=lifespan)
app.include_router(router)

if __name__ == "__main__":
    run(app, host="0.0.0.0", port=API_PORT)
