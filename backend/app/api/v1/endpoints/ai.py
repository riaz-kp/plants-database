from fastapi import APIRouter
from fastapi_cache.decorator import cache
from app.schemas.ai import PlantAIDetailsRequest, PlantAIDetailsResponse, PlantImageResponse
from app.services.ai_service import generate_plant_details
from app.services.image_service import fetch_inaturalist_images

router = APIRouter()

@router.post("/generate-plant-details", response_model=PlantAIDetailsResponse)
async def fetch_plant_details(request: PlantAIDetailsRequest):
    return await generate_plant_details(request.common_name, request.scientific_name, request.categories)

@router.get("/fetch-plant-images", response_model=PlantImageResponse)
@cache(expire=3600, namespace="ai")
async def fetch_images(plant_name: str, page: int = 1):
    image_urls = await fetch_inaturalist_images(plant_name, page)
    
    icon_url = None
    image_url = None
    
    if len(image_urls) >= 1:
        # First image in medium size
        icon_url = image_urls[0].replace("square", "medium")
        
    if len(image_urls) >= 2:
        # Second image in large size
        image_url = image_urls[1].replace("square", "large")
    elif len(image_urls) >= 1:
        # Fallback to the first image in large size if only one is found
        image_url = image_urls[0].replace("square", "large")
        
    return PlantImageResponse(icon_url=icon_url, image_url=image_url, page=page)
