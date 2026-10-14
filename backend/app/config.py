from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)

    environment: str = "development"  # development | test | production
    public_url: str = "http://localhost"

    database_url: str

    minio_endpoint: str = "localhost:9000"
    minio_access_key: str
    minio_secret_key: str
    minio_secure: bool = False
    minio_bucket: str = "tinkerer-lab"
    # Host the *browser* reaches MinIO through (nginx S3 route). Presigned
    # URLs are signed for this host. Empty = fall back to minio_endpoint.
    minio_public_endpoint: str = ""
    minio_public_secure: bool = False

    # Placeholder default (2 GB). Real per-deploy value comes from the env.
    max_file_size: int = 2 * 1024**3
    # Per-user total storage across all their projects (20 GB placeholder).
    max_user_storage: int = 20 * 1024**3
    # Cleanup sweep: how often it runs / how old a pending upload may get.
    cleanup_interval_seconds: int = 600
    pending_max_age_seconds: int = 3600
    # Landing slider slot count (pinned first, random public fill).
    slider_size: int = 8

    google_client_id: str
    google_client_secret: str
    google_hosted_domain: str
    jwt_secret: str
    session_ttl_seconds: int = 7 * 24 * 3600
    # Comma-separated emails that get the staff role on login (bootstrap only;
    # after that staff manage roles via the admin UI).
    staff_emails: str = ""
    # Enables the Playwright login endpoint. Only legal when environment=test.
    auth_test_mode: bool = False

    # Borrowing log (Google Sheet behind an Apps Script web app). Empty URL
    # = borrowing disabled; URL and secret must be set together.
    loans_script_url: str = ""
    loans_script_secret: str = ""
    # Furthest allowed return-by date, in days from today.
    loan_max_days: int = 30
    # Byte cap per loan photo (photos are downscaled client-side).
    loan_photo_max_size: int = 15 * 1024**2

    @property
    def loans_enabled(self) -> bool:
        return bool(self.loans_script_url)

    @property
    def staff_email_set(self) -> set[str]:
        return {e.strip().lower() for e in self.staff_emails.split(",") if e.strip()}

    @model_validator(mode="after")
    def _test_mode_only_in_test_env(self) -> "Settings":
        if self.auth_test_mode and self.environment != "test":
            raise ValueError("AUTH_TEST_MODE requires ENVIRONMENT=test")
        return self

    @model_validator(mode="after")
    def _jwt_secret_long_enough(self) -> "Settings":
        # RFC 7518: HS256 keys must be >= 32 bytes.
        if len(self.jwt_secret.encode()) < 32:
            raise ValueError("JWT_SECRET must be at least 32 bytes")
        return self

    @model_validator(mode="after")
    def _loans_script_all_or_nothing(self) -> "Settings":
        if bool(self.loans_script_url) != bool(self.loans_script_secret):
            raise ValueError(
                "LOANS_SCRIPT_URL and LOANS_SCRIPT_SECRET must be set together"
            )
        return self

    @model_validator(mode="after")
    def _loan_limits_positive(self) -> "Settings":
        if self.loan_max_days < 1:
            raise ValueError("LOAN_MAX_DAYS must be at least 1")
        if self.loan_photo_max_size < 1:
            raise ValueError("LOAN_PHOTO_MAX_SIZE must be at least 1")
        return self


settings = Settings()
