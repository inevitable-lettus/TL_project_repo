from datetime import timedelta

from minio import Minio
from minio.datatypes import Object

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


def presigned_put_url(
    object_key: str, expires: timedelta = timedelta(minutes=15)
) -> str:
    # The size cap (architecture enforcement #2, content-length-range) is applied at the
    # upload-endpoint layer via a presigned POST policy — a plain PUT URL can't carry it.
    return client.presigned_put_object(
        settings.minio_bucket, object_key, expires=expires
    )
