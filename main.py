from uvicorn import run
from fastapi import FastAPI
from api.api import router, lifespan
from api.config import API_PORT

app = FastAPI(lifespan=lifespan)
app.add_route(router)

if __name__ == "__main__":
    run(app, host="0.0.0.0", port=API_PORT)
