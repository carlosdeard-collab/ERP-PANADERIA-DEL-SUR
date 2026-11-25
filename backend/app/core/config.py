from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    app_name: str = "ERP Panadería"
    secret_key: str = "CAMBIAR_ESTA_CLAVE_EN_PRODUCCION"
    access_token_expire_minutes: int = 480
    database_url: str = "sqlite:///../data/panaderia.db"
    allowed_origins: str = ""
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
