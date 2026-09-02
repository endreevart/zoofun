from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: str = "development"
    log_level: str = "INFO"

    database_url: str = (
        "postgresql+asyncpg://virtual_zoo:virtual_zoo_local_only@postgres:5432/virtual_zoo"
    )
    redis_url: str = "redis://redis:6379/0"

    storage_backend: str = "local"
    storage_local_root: str = "/data/assets"

    openrouter_api_key: str = Field(default="", repr=False)
    openrouter_image_model: str = ""
    openrouter_image_provider: str = ""
    openrouter_profile_model: str = ""
    openrouter_profile_provider: str = ""

    elevenlabs_api_key: str = Field(default="", repr=False)
    elevenlabs_voice_id: str = ""
    elevenlabs_model_id: str = "eleven_multilingual_v2"


@lru_cache
def get_settings() -> Settings:
    return Settings()
