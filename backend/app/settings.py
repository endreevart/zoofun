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
    # True in production compose: generations run in the Celery worker and
    # survive API deploys. False keeps the in-process path for dev and tests.
    use_celery: bool = False

    storage_backend: str = "local"  # "s3" once the Timeweb bucket is ready
    storage_local_root: str = "/data/assets"
    s3_endpoint: str = ""  # Timeweb: https://s3.twcstorage.ru
    s3_region: str = "ru-1"
    s3_bucket: str = ""
    s3_access_key: str = Field(default="", repr=False)
    s3_secret_key: str = Field(default="", repr=False)
    s3_public_base: str = ""  # optional CDN/virtual-host base for public links

    openrouter_api_key: str = Field(default="", repr=False)
    openrouter_http_proxy: str = Field(default="", repr=False)
    openrouter_image_model: str = ""
    openrouter_image_provider: str = ""
    openrouter_profile_model: str = ""
    openrouter_profile_provider: str = ""
    openrouter_moderation_model: str = ""

    elevenlabs_api_key: str = Field(default="", repr=False)
    elevenlabs_voice_id: str = ""
    elevenlabs_model_id: str = "eleven_multilingual_v2"

    meshy_api_key: str = Field(default="", repr=False)
    meshy_http_proxy: str = Field(default="", repr=False)
    tripo_api_key: str = Field(default="", repr=False)
    studio3d_api_key: str = Field(default="", repr=False)
    fal_api_key: str = Field(default="", repr=False)
    # Which 3D provider to use: tripo | meshy | studio3d | fal
    # Production default is Tripo 3.0 → 2.5, then Meshy 7 if both fail.
    mesh_provider: str = "tripo"

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
