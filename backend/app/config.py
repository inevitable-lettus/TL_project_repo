from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)

    database_url: str

    minio_endpoint: str = "localhost:9000"
    minio_access_key: str
    minio_secret_key: str
    minio_secure: bool = False
    minio_bucket: str = "tinkerer-lab"

    # Placeholder default (2 GB). Real per-deploy value comes from the env.
    max_file_size: int = 2 * 1024**3


settings = Settings()
