import asyncio
import sys
import os

# Add the backend directory to sys.path to import app
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from app.core.redis_client import get_redis_client

async def test_redis():
    print("Testing Redis connection...")
    client = get_redis_client()
    try:
        # PING
        response = await client.ping()
        print(f"Redis PING response: {response}")
        
        # SET / GET
        await client.set("test_key", "test_value")
        value = await client.get("test_key")
        print(f"Redis SET/GET test: {value}")
        
        if value == "test_value":
            print("Redis verification successful!")
            await client.delete("test_key")
        else:
            print("Redis verification failed: Value mismatch.")
            
    except Exception as e:
        print(f"Redis connection failed: {e}")
    finally:
        await client.close()

if __name__ == "__main__":
    asyncio.run(test_redis())
