from datetime import datetime, timedelta, timezone

from minio import Minio
from minio.datatypes import Object, PostPolicy

from .config import settings

client = Minio(
    settings.minio_endpoint,
    access_key=settings.minio_access_key,
    secret_key=settings.minio_secret_key,
    secure=settings.minio_secure,
)


def ensure_bucket() -> None:
    if not client.bucket_exists(settings.minio_bucket):
        client.make_bucket(settings.minio_bucket)


def stat_object(object_key: str) -> Object:
    return client.stat_object(settings.minio_bucket, object_key)


def remove_object(object_key: str) -> None:
    client.remove_object(settings.minio_bucket, object_key)


def presigned_get_url(
    object_key: str, expires: timedelta = timedelta(minutes=5)
) -> str:
    return client.presigned_get_object(
        settings.minio_bucket, object_key, expires=expires
    )


def presigned_post(
    object_key: str, max_size: int, expires: timedelta = timedelta(minutes=15)
) -> dict:
    """Presigned POST form. The content-length-range condition makes MinIO
    itself reject oversized uploads (architecture enforcement #2)."""
    policy = PostPolicy(
        settings.minio_bucket, datetime.now(timezone.utc) + expires
    )
    policy.add_equals_condition("key", object_key)
    policy.add_content_length_range_condition(1, max_size)
    fields = client.presigned_post_policy(policy)
    fields["key"] = object_key  # SDK returns only signature fields
    scheme = "https" if settings.minio_secure else "http"
    return {
        "url": f"{scheme}://{settings.minio_endpoint}/{settings.minio_bucket}",
        "fields": fields,
    }
