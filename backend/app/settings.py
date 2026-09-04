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

    database_url: str = "sqlite:///./.data/zoo.sqlite"
    db_pool_size: int = 10
    db_max_overflow: int = 20
    redis_url: str = "redis://redis:6379/0"

    storage_backend: str = "local"
    storage_local_root: str = "/data/assets"

    openrouter_api_key: str = Field(default="", repr=False)
    openrouter_http_proxy: str = Field(default="", repr=False)
    openrouter_image_model: str = ""
    openrouter_image_provider: str = ""
    openrouter_profile_model: str = ""
    openrouter_profile_provider: str = ""

    elevenlabs_api_key: str = Field(default="", repr=False)
    elevenlabs_voice_id: str = ""
    elevenlabs_model_id: str = "eleven_multilingual_v2"

    meshy_api_key: str = Field(default="", repr=False)

    cors_origins: str = ""
    accounts_path: str = ""
    commerce_path: str = ""

    operator_token: str = Field(default="", repr=False)
    operator_login: str = ""
    operator_password: str = Field(default="", repr=False)
    admin_secret_key: str = Field(default="change-admin-secret", repr=False)

    tbank_terminal_key: str = ""
    tbank_password: str = Field(default="", repr=False)
    tbank_api_url: str = "https://securepay.tinkoff.ru/v2"
    tbank_taxation: str = "usn_income"
    tbank_item_tax: str = "none"
    tbank_company_email: str = ""
    public_site_url: str = "https://zooo.fun"


@lru_cache
def get_settings() -> Settings:
    return Settings()
