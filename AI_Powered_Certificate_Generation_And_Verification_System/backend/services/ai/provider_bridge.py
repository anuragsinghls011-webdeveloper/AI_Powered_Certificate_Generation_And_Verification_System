"""Private Node-to-Python adapter for the Emergent streaming LLM integration."""
import asyncio
import json
import os
import sys

from dotenv import load_dotenv

load_dotenv()


async def main():
    from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

    data = json.load(sys.stdin)
    chat = LlmChat(
        api_key=os.environ["EMERGENT_LLM_KEY"],
        session_id=os.urandom(12).hex(),
        system_message=data["system"],
    ).with_model(data["provider"], data["model"])
    chunks = []
    total = 0
    async for event in chat.stream_message(UserMessage(text=data["user"])):
        if isinstance(event, TextDelta):
            total += len(event.content)
            if total > 120000:
                raise ValueError("Model output too large")
            chunks.append(event.content)
        elif isinstance(event, StreamDone):
            break
    text = "".join(chunks).strip()
    # Allow fenced JSON, but never evaluate generated code.
    if text.startswith("```json"):
        text = text[7:].removesuffix("```").strip()
    print(json.dumps(json.loads(text)))


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception:
        print("AI provider unavailable", file=sys.stderr)
        sys.exit(1)