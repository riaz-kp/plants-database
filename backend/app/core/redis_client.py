import redis.asyncio as redis
from app.core.config import settings

def get_redis_client() -> redis.Redis:
    """
    Returns an async Redis client instance.
    """
    return redis.from_url(
        settings.REDIS_URL,
        encoding="utf8",
        decode_responses=True
    )
