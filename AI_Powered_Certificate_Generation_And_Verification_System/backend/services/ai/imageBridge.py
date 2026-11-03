"""AI Certificate Background & Frame Generator (Nano Banana / Google GenAI / Procedural Engine).

Generates high-resolution decorative certificate borders, guilloche patterns,
and background textures based on text prompts.

1. Uses Google Imagen 3 / Gemini image generation ('imagen-3.0-generate-002')
   when GEMINI_API_KEY or GOOGLE_API_KEY is configured.
2. Uses OpenAI DALL-E 3 when OPENAI_API_KEY is configured.
3. Fallback / Local Engine: Generates crisp, high-resolution procedural
   certificate frames with ornate multi-line borders, corner rosettes, and
   delicate guilloche patterns using Pillow and NumPy.
"""
import base64
import io
import json
import math
import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

W, H = 1584, 1120  # High resolution (2x landscape canvas of 792x560)


def create_procedural_background(prompt_text, style_hint=""):
    """
    Generates an ornate, elegant, high-res certificate background
    tailored to the prompt keywords (gold luxury, academic navy, cyber tech, minimal, etc.)
    """
    from PIL import Image, ImageDraw, ImageFilter
    import numpy as np

    p = (prompt_text + " " + style_hint).lower()

    # Determine theme palette
    if any(k in p for k in ["luxury", "gold", "royal", "award", "vintage"]):
        bg_col = (255, 253, 245)       # Warm ivory parchment
        p_col = (28, 25, 23)           # Dark charcoal/slate
        s_col = (194, 137, 24)         # Rich metallic gold (#c28918)
        t_col = (229, 184, 76)         # Bright gold accent
        style = "luxury"
    elif any(k in p for k in ["academic", "classic", "university", "diploma"]):
        bg_col = (254, 254, 254)       # Pure crisp white
        p_col = (30, 58, 138)          # Deep Oxford navy
        s_col = (180, 83, 9)           # Antique bronze gold
        t_col = (217, 119, 6)          # Amber
        style = "academic"
    elif any(k in p for k in ["cyber", "tech", "modern", "hackathon", "code"]):
        bg_col = (248, 250, 252)       # Ultra pale slate
        p_col = (15, 23, 42)           # Midnight slate
        s_col = (37, 99, 235)          # Vibrant cyber blue
        t_col = (99, 102, 241)         # Indigo
        style = "modern"
    elif any(k in p for k in ["corporate", "executive", "business"]):
        bg_col = (255, 255, 255)
        p_col = (15, 76, 92)           # Deep teal
        s_col = (15, 118, 110)         # Emerald teal
        t_col = (202, 138, 4)          # Brass
        style = "corporate"
    else:
        # Minimalist / General
        bg_col = (255, 255, 255)
        p_col = (30, 41, 59)
        s_col = (100, 116, 139)
        t_col = (148, 163, 184)
        style = "minimal"

    img = Image.new("RGB", (W, H), color=bg_col)
    draw = ImageDraw.Draw(img)

    # 1. Subtle guilloche wave pattern along top and bottom headers
    try:
        for phase in [0, math.pi / 4]:
            for x in range(80, W - 80, 4):
                rad = (x / (W - 160)) * 6 * math.pi + phase
                offset_y1 = int(math.sin(rad) * 8)
                offset_y2 = int(math.cos(rad) * 8)
                # Top delicate wave
                draw.line([(x, 68 + offset_y1), (x + 4, 68 + offset_y1)], fill=t_col, width=1)
                # Bottom delicate wave
                draw.line([(x, H - 68 + offset_y2), (x + 4, H - 68 + offset_y2)], fill=t_col, width=1)
    except Exception:
        pass

    # 2. Multi-line ornate borders
    if style in ["luxury", "academic"]:
        # Outer heavy boundary
        draw.rectangle([36, 32, W - 36, H - 32], outline=p_col, width=6)
        # Inner accent line
        draw.rectangle([50, 46, W - 50, H - 46], outline=s_col, width=3)
        # Fine hairline
        draw.rectangle([68, 64, W - 68, H - 64], outline=p_col, width=1)
        # Corner rosette decorative emblems
        corners = [(68, 64), (W - 68, 64), (68, H - 64), (W - 68, H - 64)]
        for cx, cy in corners:
            # Concentric rings
            draw.ellipse([cx - 26, cy - 26, cx + 26, cy + 26], outline=s_col, width=2)
            draw.ellipse([cx - 18, cy - 18, cx + 18, cy + 18], fill=p_col)
            draw.ellipse([cx - 8, cy - 8, cx + 8, cy + 8], fill=t_col)
            # Cross accents
            draw.line([(cx - 36, cy), (cx + 36, cy)], fill=s_col, width=2)
            draw.line([(cx, cy - 36), (cx, cy + 36)], fill=s_col, width=2)

    elif style == "modern":
        # Tech cut-corners frame
        draw.rectangle([32, 28, W - 32, H - 28], outline=p_col, width=4)
        draw.rectangle([46, 42, W - 46, H - 42], outline=s_col, width=2)
        # Top-left and bottom-right corner accent bars
        draw.line([(32, 28), (140, 28)], fill=s_col, width=8)
        draw.line([(32, 28), (32, 140)], fill=s_col, width=8)
        draw.line([(W - 140, H - 28), (W - 32, H - 28)], fill=s_col, width=8)
        draw.line([(W - 32, H - 140), (W - 32, H - 28)], fill=s_col, width=8)

    else:
        # Minimalist refined double hairline
        draw.rectangle([36, 32, W - 36, H - 32], outline=p_col, width=2)
        draw.rectangle([48, 44, W - 48, H - 44], outline=s_col, width=1)
        corners = [(48, 44), (W - 48, 44), (48, H - 44), (W - 48, H - 44)]
        for cx, cy in corners:
            draw.ellipse([cx - 10, cy - 10, cx + 10, cy + 10], outline=p_col, width=1)
            draw.ellipse([cx - 4, cy - 4, cx + 4, cy + 4], fill=s_col)

    # 3. Save to PNG and return base64 data URL
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{b64}"


def try_gemini_image_generation(api_key, prompt_text):
    """Generates a high-quality certificate background via Google GenAI / Imagen 3 (Nano Banana)."""
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)

    # Enhance prompt specifically for certificate backgrounds
    enhanced_prompt = (
        f"A magnificent, highly detailed certificate border frame and decorative background: {prompt_text}. "
        "Landscape 4:3 orientation. Symmetrical ornate borders, elegant guilloche filigree and gold trim. "
        "IMPORTANT: Completely clean, empty blank space in the central body with NO text and NO words, "
        "designed specifically for inserting certificate typography. Highest graphic design quality."
    )

    models_to_try = ["imagen-3.0-generate-002", "imagen-3.0-generate-001"]

    for model_name in models_to_try:
        try:
            result = client.models.generate_images(
                model=model_name,
                prompt=enhanced_prompt,
                config=types.GenerateImagesConfig(
                    number_of_images=1,
                    output_mime_type="image/png",
                    aspect_ratio="4:3",
                    person_generation="DONT_ALLOW",
                )
            )
            if result.generated_images and len(result.generated_images) > 0:
                raw_bytes = result.generated_images[0].image.image_bytes
                b64 = base64.b64encode(raw_bytes).decode("utf-8")
                return f"data:image/png;base64,{b64}"
        except Exception as e:
            sys.stderr.write(f"[Nano Banana Imagen warning: {model_name} failed: {e}]\n")
            continue

    raise RuntimeError("All Gemini image generation models failed")


def try_openai_image_generation(api_key, prompt_text):
    """Generates certificate background via OpenAI DALL-E."""
    import requests

    enhanced_prompt = (
        f"Certificate frame border and background: {prompt_text}. "
        "Landscape orientation, elegant ornate borders, completely blank and empty in the center with no text, "
        "clean central area for certificate layout."
    )
    resp = requests.post(
        "https://api.openai.com/v1/images/generations",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": "dall-e-3",
            "prompt": enhanced_prompt,
            "n": 1,
            "size": "1792x1024",
            "response_format": "b64_json"
        },
        timeout=60
    )
    resp.raise_for_status()
    b64 = resp.json()["data"][0]["b64_json"]
    return f"data:image/png;base64,{b64}"


def main():
    try:
        data = json.load(sys.stdin)
    except Exception as e:
        sys.stderr.write(f"Invalid stdin JSON: {e}\n")
        sys.exit(1)

    prompt = data.get("prompt", "Luxury gold ornate certificate border").strip()
    style = data.get("style", "")

    gemini_key = (
        os.environ.get("GEMINI_API_KEY")
        or os.environ.get("GOOGLE_API_KEY")
        or os.environ.get("NANO_BANANA_API_KEY")
        or os.environ.get("EMERGENT_LLM_KEY")
    )
    openai_key = os.environ.get("OPENAI_API_KEY")

    data_url = None
    provider_used = "procedural"

    # 1. Try Gemini / Nano Banana
    if gemini_key:
        try:
            data_url = try_gemini_image_generation(gemini_key, prompt)
            provider_used = "gemini-nano-banana"
        except Exception as e:
            sys.stderr.write(f"Gemini image generation fallback to procedural: {e}\n")

    # 2. Try OpenAI
    if not data_url and openai_key:
        try:
            data_url = try_openai_image_generation(openai_key, prompt)
            provider_used = "openai"
        except Exception as e:
            sys.stderr.write(f"OpenAI image generation fallback to procedural: {e}\n")

    # 3. Fallback to high-res procedural certificate frame engine
    if not data_url:
        data_url = create_procedural_background(prompt, style)
        provider_used = "procedural"

    output = {
        "success": True,
        "image": data_url,
        "prompt": prompt,
        "provider": provider_used
    }
    print(json.dumps(output))


if __name__ == "__main__":
    main()
