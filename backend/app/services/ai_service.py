import json
import re
from typing import Optional
from openai import AsyncOpenAI
from fastapi import HTTPException
from app.core.config import settings
from app.schemas.ai import PlantAIDetailsResponse, TaxonomyDetails

async def generate_plant_details(
    common_name: Optional[str] = None, 
    scientific_name: Optional[str] = None,
    valid_categories: Optional[list[str]] = None
) -> PlantAIDetailsResponse:
    if not settings.GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="Groq API Key is not configured")

    client = AsyncOpenAI(
        api_key=settings.GROQ_API_KEY,
        base_url="https://api.groq.com/openai/v1"
    )

    plant_query = ""
    if scientific_name and common_name:
        plant_query = f'scientific name "{scientific_name}" (also known as "{common_name}")'
    elif scientific_name:
        plant_query = f'scientific name "{scientific_name}"'
    elif common_name:
        plant_query = f'common name "{common_name}"'
    else:
        raise HTTPException(status_code=400, detail="Must provide at least one name")

    categories_list = ", ".join(valid_categories) if valid_categories else "Tree, Shrub, Palm, Creeper, Groundcover, Climber, Fern, Grass, Succulent, Aquatic, or Other"

    prompt = f"""
    You are an expert botanist and horticulturist.
    Please provide detailed information for the plant with the {plant_query}.
    Your response must be in valid JSON format exactly matching this structure, returning null for values you are uncertain about:
    {{
      "common_name": "String (the most widely used English common name for this plant)",
      "category": "String (best matching one of: {categories_list})",
      "planting_place": "String (must be exactly one of: 'Indoor', 'Outdoor', 'Indoor & Outdoor')",
      "description": "String (a short, simple, and very concise description using plain language)",
      "common_diseases": "String (a short, simple bulleted list of common diseases and pests, using '•')",
      "care_data": {{
        "water": "String (concise instructions in simple language, formatted as short bullet points using '•')",
        "sunlight": "String (concise instructions in simple language, formatted as short bullet points using '•')",
        "soil": "String (concise instructions in simple language, formatted as short bullet points using '•')",
        "maintenance": "String (concise instructions in simple language, formatted as short bullet points using '•')"
      }},
      "taxonomy": {{
        "kingdom": "String",
        "division": "String (Phylum/Division)",
        "class_name": "String",
        "order": "String",
        "family": "String",
        "genus": "String",
        "species": "String (Just the species epithet if possible, e.g. 'monstera' in Monstera deliciosa, or the full binomial name)"
      }}
    }}
    ONLY return the JSON object, do not include any other text or explanation. Ensure all strings are properly escaped.
    """
    
    try:
        response = await client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert botanist and horticulturist. Respond ONLY with valid raw JSON matching the requested structure."
                },
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
            model="qwen/qwen3.6-27b",
            temperature=0.2,
            max_tokens=8192,
            top_p=0.95
        )
        
        response_text = response.choices[0].message.content.strip()
        
        # Remove reasoning <think>...</think> tags if present
        response_text = re.sub(r'<think>.*?</think>', '', response_text, flags=re.DOTALL).strip()
        
        # Strip potential markdown formatting
        if response_text.startswith("```json"):
            response_text = response_text[7:-3].strip()
        elif response_text.startswith("```"):
            response_text = response_text[3:-3].strip()
            
        # Extract JSON object from first '{' to last '}'
        start_idx = response_text.find("{")
        end_idx = response_text.rfind("}")
        if start_idx != -1 and end_idx != -1:
            response_text = response_text[start_idx:end_idx + 1]

        data = json.loads(response_text)
        
        tax_data = data.get("taxonomy", {})
        taxonomy = TaxonomyDetails(
            kingdom=tax_data.get("kingdom"),
            division=tax_data.get("division"),
            class_name=tax_data.get("class_name"),
            order=tax_data.get("order"),
            family=tax_data.get("family"),
            genus=tax_data.get("genus"),
            species=tax_data.get("species"),
        )
        
        return PlantAIDetailsResponse(
            common_name=data.get("common_name"),
            category=data.get("category"),
            planting_place=data.get("planting_place"),
            description=data.get("description"),
            common_diseases=data.get("common_diseases"),
            care_data=data.get("care_data"),
            taxonomy=taxonomy
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate AI details: {str(e)}")
