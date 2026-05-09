import os


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "fleet-crisis-dev-secret")
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL",
        "sqlite:///" + os.path.join(os.path.dirname(__file__), "data", "fleet_command.db"),
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    FLEET_JSON_PATH = os.environ.get(
        "FLEET_JSON_PATH",
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "fleet.json")),
    )
    TICK_HZ = float(os.environ.get("TICK_HZ", "4"))
    CORS_ORIGINS = [
        x.strip()
        for x in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")
        if x.strip()
    ]
    GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
    GROQ_MODEL = os.environ.get("GROQ_MODEL", "llama-3.1-70b-versatile")
    OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
    OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
    AI_PROVIDER = os.environ.get("AI_PROVIDER", "auto")
    SOCKETIO_MESSAGE_QUEUE = os.environ.get("SOCKETIO_MESSAGE_QUEUE", "")
    OPEN_METEO_MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"
    HISTORY_RETENTION_SECONDS = 3600
    HISTORY_SAMPLE_INTERVAL_SECONDS = 30


def mkdir_data_dir(uri: str) -> None:
    try:
        from sqlalchemy.engine.url import make_url

        url = make_url(uri)
        if url.drivername != "sqlite" or not url.database:
            return
        db_path = url.database
        if db_path in {":memory:", ""}:
            return
        abs_path = os.path.abspath(db_path)
        folder = os.path.dirname(abs_path)
        if folder:
            os.makedirs(folder, exist_ok=True)
    except Exception:
        return
