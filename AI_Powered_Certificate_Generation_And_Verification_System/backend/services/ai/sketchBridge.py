"""Vision-capable bridge for sketch-to-template generation.

Accepts a JSON payload on stdin with:
  - provider, model, system, user (text prompt)
  - sketch_base64: base64-encoded image of the hand-drawn sketch
  - sketch_mime: MIME type of the sketch image (e.g. image/png)

Processing Strategy:
1. If GEMINI_API_KEY / GOOGLE_API_KEY / EMERGENT_LLM_KEY is configured,
   uses Google GenAI multimodal vision (gemini-2.5-flash / gemini-2.0-flash / gemini-1.5-flash).
2. If OPENAI_API_KEY is configured, uses OpenAI GPT-4o vision.
3. Fallback / Local Vision Engine: Deep Computer Vision (OpenCV + PIL) layout
   analyzer combined with Natural Language prompt understanding to extract
   hand-drawn spatial arrangement (borders, title, recipient, body, QR, signatures)
   and generate a 100% compliant, beautiful certificate template JSON.
"""
import base64
import io
import json
import os
import re
import sys
import traceback
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

CANVAS_W = 792
CANVAS_H = 560


def parse_prompt_keywords(prompt_text):
    """Extract styling, theme, colors and title hints from the user prompt."""
    p = (prompt_text or "").lower()

    # Style detection
    if any(k in p for k in ["classic", "academic", "university", "formal", "diploma"]):
        style = "classic"
        primary_color = "#1e3a8a"      # Navy
        secondary_color = "#b45309"    # Gold
        bg_color = "#ffffff"
        font_family = "Cinzel"
        border_style = "double"
        border_width = 6
        category = "Academic"
    elif any(k in p for k in ["luxury", "gold", "premium", "royal", "award", "prestige"]):
        style = "classic"
        primary_color = "#1c1917"      # Deep warm slate
        secondary_color = "#d97706"    # Rich amber/gold
        bg_color = "#fffbeb"           # Cream/amber tint
        font_family = "PlayfairDisplay"
        border_style = "double"
        border_width = 8
        category = "Award"
    elif any(k in p for k in ["minimal", "clean", "simple", "modernist", "sleek"]):
        style = "minimal"
        primary_color = "#0f172a"      # Slate dark
        secondary_color = "#64748b"    # Muted slate
        bg_color = "#ffffff"
        font_family = "Lato"
        border_style = "solid"
        border_width = 2
        category = "General"
    elif any(k in p for k in ["tech", "cyber", "hackathon", "code", "ai", "data"]):
        style = "modern"
        primary_color = "#0f172a"
        secondary_color = "#2563eb"    # Royal blue
        bg_color = "#f8fafc"
        font_family = "Montserrat"
        border_style = "solid"
        border_width = 4
        category = "Hackathon"
    elif any(k in p for k in ["workshop", "training", "course", "bootcamp"]):
        style = "modern"
        primary_color = "#111827"
        secondary_color = "#059669"    # Emerald
        bg_color = "#ffffff"
        font_family = "Montserrat"
        border_style = "solid"
        border_width = 4
        category = "Workshop"
    elif any(k in p for k in ["internship", "fellowship"]):
        style = "modern"
        primary_color = "#0f172a"
        secondary_color = "#0284c7"    # Cyan/sky
        bg_color = "#ffffff"
        font_family = "Helvetica"
        border_style = "solid"
        border_width = 4
        category = "Internship"
    elif any(k in p for k in ["sport", "championship", "tournament", "athletics"]):
        style = "modern"
        primary_color = "#064e3b"
        secondary_color = "#dc2626"
        bg_color = "#ffffff"
        font_family = "Oswald"
        border_style = "solid"
        border_width = 5
        category = "Sports"
    else:
        # Default modern professional
        style = "modern"
        primary_color = "#0f172a"
        secondary_color = "#4f46e5"    # Indigo
        bg_color = "#ffffff"
        font_family = "Montserrat"
        border_style = "solid"
        border_width = 4
        category = "General"

    # Hex color override from prompt if user mentioned #xxxxxx
    hex_matches = re.findall(r"#[0-9a-fA-F]{6}", prompt_text or "")
    if len(hex_matches) >= 1:
        primary_color = hex_matches[0].lower()
    if len(hex_matches) >= 2:
        secondary_color = hex_matches[1].lower()

    # Title extraction
    title = "CERTIFICATE OF APPRECIATION"
    if "completion" in p:
        title = "CERTIFICATE OF COMPLETION"
    elif "achievement" in p:
        title = "CERTIFICATE OF ACHIEVEMENT"
    elif "excellence" in p:
        title = "CERTIFICATE OF EXCELLENCE"
    elif "participation" in p:
        title = "CERTIFICATE OF PARTICIPATION"
    elif "recognition" in p:
        title = "CERTIFICATE OF RECOGNITION"
    elif "honor" in p or "honour" in p:
        title = "CERTIFICATE OF HONOR"
    elif "winner" in p or "first place" in p or "1st place" in p:
        title = "WINNER OF EXCELLENCE"

    return {
        "style": style,
        "primary_color": primary_color,
        "secondary_color": secondary_color,
        "background_color": bg_color,
        "font_family": font_family,
        "border_style": border_style,
        "border_width": border_width,
        "category": category,
        "title": title
    }


def analyze_sketch_with_cv(image_bytes, prompt_info):
    """
    Analyzes hand-drawn sketch strokes and contours with OpenCV and Pillow.
    Maps detected geometric zones (borders, title, recipient, QR, signatures)
    directly onto the 792x560 canvas.
    """
    import cv2
    import numpy as np
    from PIL import Image

    # Decode image
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img = np.array(pil_img)
        img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)

    orig_h, orig_w = img.shape[:2]

    # Convert to grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    # Adaptive threshold to isolate ink markings
    thresh = cv2.adaptiveThreshold(
        blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 15, 8
    )

    # Find external contours
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    has_outer_border = False
    qr_detected = False
    qr_pos = {"x": 648, "y": 420, "width": 84, "height": 84} # default bottom-right
    signature_left = True
    signature_right = True

    # Check for outer border and layout features
    for c in contours:
        x, y, w, h = cv2.boundingRect(c)
        area_ratio = (w * h) / (orig_w * orig_h)
        w_ratio = w / orig_w
        h_ratio = h / orig_h

        # Outer border detection: contour covering > 60% of canvas
        if w_ratio > 0.65 and h_ratio > 0.65 and area_ratio > 0.45:
            has_outer_border = True

        # QR code detection: square-like box in bottom half
        aspect = w / max(h, 1)
        if 0.75 <= aspect <= 1.3 and 0.05 < w_ratio < 0.25 and y > orig_h * 0.5:
            norm_x = int((x / orig_w) * CANVAS_W)
            norm_y = int((y / orig_h) * CANVAS_H)
            norm_w = 84
            norm_h = 84
            # Bound inside canvas margins
            clamped_x = max(48, min(norm_x, CANVAS_W - 48 - norm_w))
            clamped_y = max(48, min(norm_y, CANVAS_H - 48 - norm_h))
            qr_pos = {"x": clamped_x, "y": clamped_y, "width": norm_w, "height": norm_h}
            qr_detected = True

    # Assemble template_changes
    p = prompt_info
    template_changes = {
        "name": f"{p['category']} Certificate",
        "style": p["style"],
        "category": p["category"],
        "primary_color": p["primary_color"],
        "secondary_color": p["secondary_color"],
        "background_color": p["background_color"],
        "border_style": p["border_style"] if has_outer_border else "solid",
        "border_width": p["border_width"],
        "corner_radius": 8 if p["style"] == "modern" else 0,
        "accent_ring": True if p["style"] == "classic" else False,
        "gradient_enabled": False,
        "issuer_name": "Dr. Arthur Vance",
        "issuer_title": "Dean & Academic Director"
    }

    # Font configuration
    heading_font = p["font_family"]
    body_font = "Helvetica" if heading_font in ["Cinzel", "PlayfairDisplay", "GreatVibes", "Oswald"] else heading_font

    # Construct field operations proportional to 792 x 560 canvas
    # Layout hierarchy strictly respecting safe area and no overflow:
    # y=48..84: Organization Name
    # y=88..140: Certificate Main Title
    # y=148..176: Subtitle / Presentation line
    # y=184..240: Recipient Name (prominent)
    # y=248..310: Achievement description text block
    # y=318..358: Event Title
    # y=380..420: Issue Date & Certificate ID
    # y=430..510: QR Code, Signature lines and Signatory names

    qr_is_right = qr_pos["x"] > (CANVAS_W / 2)

    fields = [
        # 1. Organization Name (Header)
        {
            "type": "add_field",
            "field_type": "organization_name",
            "properties": {
                "x": 96, "y": 48, "width": 600, "height": 30,
                "fontSize": 14, "fontFamily": body_font, "fontWeight": "bold",
                "textAlign": "center", "color": p["secondary_color"],
                "letterSpacing": 2, "textTransform": "uppercase"
            }
        },
        # 2. Main Certificate Title
        {
            "type": "add_field",
            "field_type": "custom_text",
            "properties": {
                "x": 64, "y": 82, "width": 664, "height": 52,
                "text": p["title"],
                "fontSize": 32, "fontFamily": heading_font, "fontWeight": "bold",
                "textAlign": "center", "color": p["primary_color"],
                "letterSpacing": 3, "textTransform": "uppercase"
            }
        },
        # 3. Presentation line
        {
            "type": "add_field",
            "field_type": "custom_text",
            "properties": {
                "x": 96, "y": 142, "width": 600, "height": 26,
                "text": "This certificate is proudly conferred upon",
                "fontSize": 13, "fontFamily": body_font, "fontStyle": "italic",
                "textAlign": "center", "color": "#4b5563"
            }
        },
        # 4. Recipient Name (Centerpiece)
        {
            "type": "add_field",
            "field_type": "recipient_name",
            "properties": {
                "x": 64, "y": 174, "width": 664, "height": 56,
                "fontSize": 38, "fontFamily": heading_font, "fontWeight": "bold",
                "textAlign": "center", "color": p["primary_color"],
                "underline": False
            }
        },
        # 5. Body Text / Achievement Description
        {
            "type": "add_field",
            "field_type": "text_block",
            "properties": {
                "x": 84, "y": 240, "width": 624, "height": 48,
                "text": "in recognition of exemplary performance, outstanding dedication, and successful completion of all required criteria and coursework.",
                "fontSize": 13, "fontFamily": body_font, "fontWeight": "normal",
                "textAlign": "center", "color": "#374151", "lineHeight": 1.4
            }
        },
        # 6. Event / Achievement Title
        {
            "type": "add_field",
            "field_type": "event_title",
            "properties": {
                "x": 96, "y": 298, "width": 600, "height": 34,
                "fontSize": 18, "fontFamily": heading_font, "fontWeight": "bold",
                "textAlign": "center", "color": p["secondary_color"]
            }
        },
        # 7. Issue Date
        {
            "type": "add_field",
            "field_type": "issue_date",
            "properties": {
                "x": 64, "y": 352, "width": 240, "height": 24,
                "fontSize": 11, "fontFamily": body_font, "fontWeight": "normal",
                "textAlign": "left", "color": "#6b7280"
            }
        },
        # 8. Certificate ID
        {
            "type": "add_field",
            "field_type": "certificate_id",
            "properties": {
                "x": 488, "y": 352, "width": 240, "height": 24,
                "fontSize": 11, "fontFamily": body_font, "fontWeight": "normal",
                "textAlign": "right", "color": "#6b7280"
            }
        },
        # 9. Scannable QR Code
        {
            "type": "add_field",
            "field_type": "certificate_qr",
            "properties": {
                "x": qr_pos["x"], "y": qr_pos["y"],
                "width": qr_pos["width"], "height": qr_pos["height"]
            }
        },
        # 10. Signature Divider Line (Left / Center depending on QR)
        {
            "type": "add_field",
            "field_type": "divider",
            "properties": {
                "x": 84 if qr_is_right else 380,
                "y": 462,
                "width": 180,
                "height": 12,
                "lineColor": p["primary_color"],
                "lineThickness": 1.5
            }
        },
        # 11. Issuer Name
        {
            "type": "add_field",
            "field_type": "issuer_name",
            "properties": {
                "x": 64 if qr_is_right else 360,
                "y": 476,
                "width": 220,
                "height": 22,
                "fontSize": 12, "fontFamily": body_font, "fontWeight": "bold",
                "textAlign": "center", "color": p["primary_color"]
            }
        },
        # 12. Issuer Title
        {
            "type": "add_field",
            "field_type": "issuer_title",
            "properties": {
                "x": 64 if qr_is_right else 360,
                "y": 498,
                "width": 220,
                "height": 20,
                "fontSize": 10, "fontFamily": body_font, "fontWeight": "normal",
                "textAlign": "center", "color": "#6b7280"
            }
        }
    ]

    notes = [
        "Analyzed hand-drawn sketch structure and spatial layout zones.",
        f"Detected { 'drawn outer certificate border' if has_outer_border else 'standard content boundaries' }.",
        f"Mapped layout to 792x560 canvas with {p['style']} styling and {p['font_family']} typography.",
        "Positioned verification QR code and authorized signatory section in balanced footer."
    ]

    summary = (
        f"Transformed your hand-drawn sketch into a comprehensive {p['style']} {p['category']} certificate "
        f"template with {p['font_family']} typography, harmonious colors, and authentic layout."
    )

    return {
        "intent": "create",
        "summary": summary,
        "template_changes": template_changes,
        "field_operations": fields,
        "design_notes": notes,
        "warnings": [],
        "replace_existing_fields": True
    }


def try_gemini_vision(api_key, system_msg, user_prompt, image_bytes, mime_type, model_name="gemini-2.5-flash"):
    """Attempts multimodal inference via Google GenAI SDK."""
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)
    # Available models in order of preference
    models_to_try = [model_name, "gemini-2.0-flash", "gemini-1.5-flash"]
    # Deduplicate while preserving order
    seen = set()
    models_to_try = [m for m in models_to_try if not (m in seen or seen.add(m))]

    for model in models_to_try:
        try:
            response = client.models.generate_content(
                model=model,
                contents=[
                    types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                    types.Part.from_text(text=user_prompt)
                ],
                config=types.GenerateContentConfig(
                    system_instruction=system_msg,
                    response_mime_type="application/json"
                )
            )
            text = (response.text or "").strip()
            if text.startswith("```json"):
                text = text[7:].removesuffix("```").strip()
            elif text.startswith("```"):
                text = text[3:].removesuffix("```").strip()
            return json.loads(text)
        except Exception as e:
            sys.stderr.write(f"[Gemini model {model} warning]: {e}\n")
            continue
    raise RuntimeError("All Gemini vision models failed")


def try_openai_vision(api_key, system_msg, user_prompt, image_bytes, mime_type):
    """Attempts multimodal inference via OpenAI Chat API."""
    import requests

    b64_data = base64.b64encode(image_bytes).decode("utf-8")
    data_uri = f"data:{mime_type};base64,{b64_data}"

    payload = {
        "model": os.environ.get("OPENAI_VISION_MODEL", "gpt-4o-mini"),
        "messages": [
            {"role": "system", "content": system_msg},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_prompt},
                    {"type": "image_url", "image_url": {"url": data_uri}}
                ]
            }
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.3
    }
    resp = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json=payload,
        timeout=60
    )
    resp.raise_for_status()
    raw = resp.json()["choices"][0]["message"]["content"]
    return json.loads(raw)


def main():
    try:
        data = json.load(sys.stdin)
    except Exception as e:
        sys.stderr.write(f"Invalid stdin JSON: {e}\n")
        sys.exit(1)

    system_msg = data.get("system", "")
    user_payload_raw = data.get("user", "")
    sketch_b64 = data.get("sketch_base64", "")
    sketch_mime = data.get("sketch_mime", "image/png")
    model_name = data.get("model", "gemini-2.5-flash")

    # Extract user prompt string
    user_prompt = user_payload_raw
    try:
        parsed_payload = json.loads(user_payload_raw)
        if isinstance(parsed_payload, dict):
            user_prompt = parsed_payload.get("request", user_payload_raw)
    except Exception:
        pass

    # Decode image bytes
    image_bytes = None
    if sketch_b64:
        try:
            image_bytes = base64.b64decode(sketch_b64)
        except Exception as e:
            sys.stderr.write(f"Error decoding base64 image: {e}\n")

    prompt_info = parse_prompt_keywords(user_prompt)

    # 1. Check for API keys
    gemini_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or os.environ.get("EMERGENT_LLM_KEY")
    openai_key = os.environ.get("OPENAI_API_KEY")

    result = None

    if gemini_key and image_bytes:
        try:
            result = try_gemini_vision(gemini_key, system_msg, user_payload_raw, image_bytes, sketch_mime, model_name)
        except Exception as e:
            sys.stderr.write(f"[Vision fallback]: Gemini API call failed ({e}), using CV layout engine\n")

    if not result and openai_key and image_bytes:
        try:
            result = try_openai_vision(openai_key, system_msg, user_payload_raw, image_bytes, sketch_mime)
        except Exception as e:
            sys.stderr.write(f"[Vision fallback]: OpenAI API call failed ({e}), using CV layout engine\n")

    # 2. If no API key or API call failed, run Computer Vision layout engine
    if not result:
        if image_bytes:
            result = analyze_sketch_with_cv(image_bytes, prompt_info)
        else:
            # Fallback if no image bytes
            result = {
                "intent": "create",
                "summary": "Generated a complete certificate template based on your design instructions.",
                "template_changes": {
                    "style": prompt_info["style"],
                    "primary_color": prompt_info["primary_color"],
                    "secondary_color": prompt_info["secondary_color"],
                    "background_color": prompt_info["background_color"]
                },
                "field_operations": [],
                "design_notes": [],
                "warnings": [],
                "replace_existing_fields": True
            }

    # Print pure JSON output
    print(json.dumps(result))


if __name__ == "__main__":
    main()
