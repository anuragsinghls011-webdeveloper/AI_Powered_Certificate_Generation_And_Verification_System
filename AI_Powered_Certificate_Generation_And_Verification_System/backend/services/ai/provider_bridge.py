"""Private Node-to-Python adapter for streaming/direct LLM integration with Google GenAI & OpenAI."""
import json
import os
import re
import sys

from dotenv import load_dotenv

load_dotenv()


def generate_fallback_design(user_payload_raw):
    """Fallback generator when external API keys are unavailable."""
    prompt_text = user_payload_raw
    current_design = {}
    try:
        data = json.loads(user_payload_raw)
        prompt_text = data.get("request", user_payload_raw)
        current_design = data.get("current_design", {})
    except Exception:
        pass

    p = (prompt_text or "").lower()
    current_fields = current_design.get("fields", []) if isinstance(current_design, dict) else []
    has_existing_fields = len(current_fields) > 0

    # Style detection
    if any(k in p for k in ["classic", "academic", "university"]):
        style = "classic"
        primary = "#1e3a8a"
        secondary = "#b45309"
        font = "Cinzel"
        border_style = "double"
        category = "Academic"
    elif any(k in p for k in ["luxury", "gold", "premium"]):
        style = "classic"
        primary = "#1c1917"
        secondary = "#d97706"
        font = "PlayfairDisplay"
        border_style = "double"
        category = "Award"
    elif any(k in p for k in ["minimal", "clean"]):
        style = "minimal"
        primary = "#0f172a"
        secondary = "#64748b"
        font = "Lato"
        border_style = "solid"
        category = "General"
    else:
        style = "modern"
        primary = "#0f172a"
        secondary = "#4f46e5"
        font = "Montserrat"
        border_style = "solid"
        category = "General"

    # Hex color override from prompt if user mentioned #xxxxxx
    hex_matches = re.findall(r"#[0-9a-fA-F]{6}", prompt_text or "")
    if len(hex_matches) >= 1:
        primary = hex_matches[0].lower()
    if len(hex_matches) >= 2:
        secondary = hex_matches[1].lower()

    # 1. Check if request is variation
    if "variation" in p or "3 " in p or "three" in p:
        return {
            "intent": "variation",
            "summary": "Generated three unique design variations: Minimal, Luxury, and Modern.",
            "variants": [
                {
                    "name": "Minimal",
                    "design": {
                        "intent": "style",
                        "summary": "Clean minimal aesthetic with refined typography",
                        "template_changes": {"style": "minimal", "primary_color": "#0f172a", "secondary_color": "#64748b", "border_style": "solid", "border_width": 2},
                        "field_operations": [{"type": "update_field", "field_type": "recipient_name", "properties": {"fontFamily": "Lato", "fontSize": 34}}] if any(f.get("type") == "recipient_name" for f in current_fields) else [],
                        "design_notes": [], "warnings": [], "replace_existing_fields": False
                    }
                },
                {
                    "name": "Luxury",
                    "design": {
                        "intent": "style",
                        "summary": "Elegant luxury aesthetic with gold accents",
                        "template_changes": {"style": "classic", "primary_color": "#1c1917", "secondary_color": "#d97706", "border_style": "double", "border_width": 6},
                        "field_operations": [{"type": "update_field", "field_type": "recipient_name", "properties": {"fontFamily": "PlayfairDisplay", "fontSize": 38, "color": "#1c1917"}}] if any(f.get("type") == "recipient_name" for f in current_fields) else [],
                        "design_notes": [], "warnings": [], "replace_existing_fields": False
                    }
                },
                {
                    "name": "Modern",
                    "design": {
                        "intent": "style",
                        "summary": "Contemporary bold design with vibrant indigo accents",
                        "template_changes": {"style": "modern", "primary_color": "#0f172a", "secondary_color": "#4f46e5", "border_style": "solid", "border_width": 4},
                        "field_operations": [{"type": "update_field", "field_type": "recipient_name", "properties": {"fontFamily": "Montserrat", "fontSize": 36}}] if any(f.get("type") == "recipient_name" for f in current_fields) else [],
                        "design_notes": [], "warnings": [], "replace_existing_fields": False
                    }
                }
            ]
        }

    # 2. Check if user has existing fields and wants specific incremental modifications
    if has_existing_fields and not any(k in p for k in ["create from prompt", "create a full", "create fresh", "from scratch"]):
        # Specific: Name size change
        if any(k in p for k in ["name larger", "larger name", "increase name", "bigger name", "name size"]):
            if any(f.get("type") == "recipient_name" for f in current_fields):
                return {
                    "intent": "modify",
                    "summary": "Increased the recipient name font size for stronger visual prominence.",
                    "template_changes": {},
                    "field_operations": [
                        {"type": "update_field", "field_type": "recipient_name", "properties": {"fontSize": 42}}
                    ],
                    "design_notes": ["Enlarged recipient name typography"],
                    "warnings": [],
                    "replace_existing_fields": False
                }

        # Specific: Add QR code
        if "qr" in p:
            if not any(f.get("type") == "certificate_qr" for f in current_fields):
                return {
                    "intent": "add",
                    "summary": "Added a scannable verification QR code to the bottom right.",
                    "template_changes": {},
                    "field_operations": [
                        {"type": "add_field", "field_type": "certificate_qr", "properties": {"x": 648, "y": 420, "width": 84, "height": 84}}
                    ],
                    "design_notes": ["Added verification QR code"],
                    "warnings": [],
                    "replace_existing_fields": False
                }
            else:
                return {
                    "intent": "modify",
                    "summary": "Repositioned QR code verification box.",
                    "template_changes": {},
                    "field_operations": [
                        {"type": "update_field", "field_type": "certificate_qr", "properties": {"x": 648, "y": 420, "width": 84, "height": 84}}
                    ],
                    "design_notes": [], "warnings": [], "replace_existing_fields": False
                }

        # Specific: Fix alignment / Spacing
        if any(k in p for k in ["alignment", "align", "spacing", "fix layout"]):
            ops = []
            for f in current_fields:
                f_type = f.get("type")
                if f_type in ["recipient_name", "custom_text", "event_title", "organization_name"]:
                    ops.append({"type": "update_field", "field_type": f_type, "properties": {"textAlign": "center"}})
            return {
                "intent": "rearrange",
                "summary": "Aligned and centered certificate elements for improved visual balance.",
                "template_changes": {},
                "field_operations": ops[:6] if ops else [],
                "design_notes": ["Centered text elements across the canvas"],
                "warnings": [],
                "replace_existing_fields": False
            }

        # Specific: Restyle / Make premium / Academic on existing template
        if any(k in p for k in ["restyle", "premium", "academic", "modern", "minimal", "luxury", "gold"]):
            ops = []
            for f in current_fields:
                f_type = f.get("type")
                if f_type == "recipient_name":
                    ops.append({"type": "update_field", "field_type": f_type, "properties": {"fontFamily": font, "color": primary}})
                elif f_type in ["custom_text", "organization_name", "event_title"]:
                    ops.append({"type": "update_field", "field_type": f_type, "properties": {"color": secondary if f_type != "custom_text" else primary}})
            return {
                "intent": "style",
                "summary": f"Restyled certificate with a cohesive {style} palette and {font} typography.",
                "template_changes": {
                    "style": style,
                    "primary_color": primary,
                    "secondary_color": secondary,
                    "border_style": border_style,
                    "border_width": 4
                },
                "field_operations": ops[:6],
                "design_notes": [f"Applied {style} theme and typography"],
                "warnings": [],
                "replace_existing_fields": False
            }

    # 3. Default: Create a complete comprehensive certificate template
    return {
        "intent": "create",
        "summary": f"Designed a comprehensive {style} {category} certificate with {font} typography and balanced layout.",
        "template_changes": {
            "name": f"{category} Certificate",
            "style": style,
            "category": category,
            "primary_color": primary,
            "secondary_color": secondary,
            "background_color": "#ffffff",
            "border_style": border_style,
            "border_width": 4,
            "corner_radius": 0,
            "accent_ring": False,
            "gradient_enabled": False,
            "issuer_name": "Authorized Signatory",
            "issuer_title": "Program Director"
        },
        "field_operations": [
            {"type": "add_field", "field_type": "organization_name", "properties": {"x": 96, "y": 48, "width": 600, "height": 30, "fontSize": 14, "fontFamily": font, "fontWeight": "bold", "textAlign": "center", "color": secondary, "letterSpacing": 2, "textTransform": "uppercase"}},
            {"type": "add_field", "field_type": "custom_text", "properties": {"x": 64, "y": 82, "width": 664, "height": 52, "text": "CERTIFICATE OF EXCELLENCE", "fontSize": 32, "fontFamily": font, "fontWeight": "bold", "textAlign": "center", "color": primary, "letterSpacing": 3, "textTransform": "uppercase"}},
            {"type": "add_field", "field_type": "custom_text", "properties": {"x": 96, "y": 142, "width": 600, "height": 26, "text": "This certificate is proudly awarded to", "fontSize": 13, "fontFamily": "Helvetica", "fontStyle": "italic", "textAlign": "center", "color": "#4b5563"}},
            {"type": "add_field", "field_type": "recipient_name", "properties": {"x": 64, "y": 174, "width": 664, "height": 56, "fontSize": 38, "fontFamily": font, "fontWeight": "bold", "textAlign": "center", "color": primary}},
            {"type": "add_field", "field_type": "text_block", "properties": {"x": 84, "y": 240, "width": 624, "height": 48, "text": "for demonstrating outstanding commitment, exemplary leadership, and exceptional mastery of core competencies.", "fontSize": 13, "fontFamily": "Helvetica", "textAlign": "center", "color": "#374151"}},
            {"type": "add_field", "field_type": "event_title", "properties": {"x": 96, "y": 298, "width": 600, "height": 34, "fontSize": 18, "fontFamily": font, "fontWeight": "bold", "textAlign": "center", "color": secondary}},
            {"type": "add_field", "field_type": "issue_date", "properties": {"x": 64, "y": 352, "width": 240, "height": 24, "fontSize": 11, "fontFamily": "Helvetica", "textAlign": "left", "color": "#6b7280"}},
            {"type": "add_field", "field_type": "certificate_id", "properties": {"x": 488, "y": 352, "width": 240, "height": 24, "fontSize": 11, "fontFamily": "Helvetica", "textAlign": "right", "color": "#6b7280"}},
            {"type": "add_field", "field_type": "certificate_qr", "properties": {"x": 648, "y": 420, "width": 84, "height": 84}},
            {"type": "add_field", "field_type": "divider", "properties": {"x": 84, "y": 462, "width": 180, "height": 12, "lineColor": primary, "lineThickness": 1.5}},
            {"type": "add_field", "field_type": "issuer_name", "properties": {"x": 64, "y": 476, "width": 220, "height": 22, "fontSize": 12, "fontFamily": "Helvetica", "fontWeight": "bold", "textAlign": "center", "color": primary}},
            {"type": "add_field", "field_type": "issuer_title", "properties": {"x": 64, "y": 498, "width": 220, "height": 20, "fontSize": 10, "fontFamily": "Helvetica", "textAlign": "center", "color": "#6b7280"}}
        ],
        "design_notes": ["Created complete certificate layout based on design instructions."],
        "warnings": [],
        "replace_existing_fields": True
    }


def main():
    try:
        data = json.load(sys.stdin)
    except Exception as e:
        sys.stderr.write(f"Invalid stdin JSON: {e}\n")
        sys.exit(1)

    system_msg = data.get("system", "")
    user_msg = data.get("user", "")
    model_name = data.get("model", "gemini-2.5-flash")

    gemini_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or os.environ.get("EMERGENT_LLM_KEY")
    openai_key = os.environ.get("OPENAI_API_KEY")

    result = None

    if gemini_key:
        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=gemini_key)
            models_to_try = [model_name, "gemini-2.0-flash", "gemini-1.5-flash"]
            for m in models_to_try:
                try:
                    response = client.models.generate_content(
                        model=m,
                        contents=user_msg,
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
                    result = json.loads(text)
                    break
                except Exception:
                    continue
        except Exception as e:
            sys.stderr.write(f"Gemini API warning: {e}\n")

    if not result and openai_key:
        try:
            import requests

            resp = requests.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {openai_key}", "Content-Type": "application/json"},
                json={
                    "model": os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
                    "messages": [{"role": "system", "content": system_msg}, {"role": "user", "content": user_msg}],
                    "response_format": {"type": "json_object"},
                    "temperature": 0.2
                },
                timeout=45
            )
            resp.raise_for_status()
            raw = resp.json()["choices"][0]["message"]["content"]
            result = json.loads(raw)
        except Exception as e:
            sys.stderr.write(f"OpenAI API warning: {e}\n")

    if not result:
        result = generate_fallback_design(user_msg)

    print(json.dumps(result))


if __name__ == "__main__":
    main()