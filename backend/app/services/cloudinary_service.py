import asyncio

import cloudinary
import cloudinary.uploader
import httpx
from fastapi import UploadFile
from app.core.config import settings

def init_cloudinary():
    if not settings.CLOUDINARY_API_KEY:
        print("Cloudinary not configured. Image uploads will fail.")
        return
        
    cloudinary.config( 
        cloud_name=settings.CLOUDINARY_CLOUD_NAME, 
        api_key=settings.CLOUDINARY_API_KEY, 
        api_secret=settings.CLOUDINARY_API_SECRET,
        secure=True
    )

async def upload_image(file: UploadFile, folder: str = "plants") -> str:
    """
    Uploads an image to Cloudinary and returns the secure URL.
    """
    if not settings.CLOUDINARY_API_KEY:
        raise ValueError("Cloudinary is not configured.")
        
    try:
        # Read the file content
        contents = await file.read()
        
        # Upload using cloudinary (the SDK is blocking, so keep it off the event loop)
        upload_result = await asyncio.to_thread(
            cloudinary.uploader.upload,
            contents,
            folder=folder,
            resource_type="image"
        )
        
        # Reset file pointer just in case
        await file.seek(0)
        
        return upload_result.get("secure_url")
    except Exception as e:
        raise Exception(f"Failed to upload image: {str(e)}")

async def upload_image_from_url(url: str, folder: str = "plants") -> str:
    """
    Fetches an image from a remote URL and uploads it to Cloudinary.
    Returns the Cloudinary secure URL.
    """
    if not settings.CLOUDINARY_API_KEY:
        raise ValueError("Cloudinary is not configured.")

    try:
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (X11; Linux x86_64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0.0.0 Safari/537.36"
            ),
            "Referer": "https://commons.wikimedia.org/",
            "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
        }
        async with httpx.AsyncClient(follow_redirects=True, timeout=20.0) as http:
            response = await http.get(url, headers=headers)
            response.raise_for_status()
            image_bytes = response.content

        upload_result = await asyncio.to_thread(
            cloudinary.uploader.upload,
            image_bytes,
            folder=folder,
            resource_type="image"
        )
        return upload_result.get("secure_url")
    except Exception as e:
        raise Exception(f"Failed to upload image from URL: {str(e)}")
