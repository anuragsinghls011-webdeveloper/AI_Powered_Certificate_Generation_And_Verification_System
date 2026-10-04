"""Preview-only ASGI forwarding bridge: the application itself remains Express."""
import asyncio
import os
from pathlib import Path

import httpx

SOURCE = Path('/app/AI_Powered_Certificate_Generation_And_Verification_System/backend')
process = None


async def app(scope, receive, send):
    global process
    if scope['type'] == 'lifespan':
        while True:
            event = await receive()
            if event['type'] == 'lifespan.startup':
                try:
                    env = dict(os.environ, PORT='8002')
                    process = await asyncio.create_subprocess_exec('node', 'server.js', cwd=SOURCE, env=env)
                    async with httpx.AsyncClient() as client:
                        for _ in range(75):
                            if process.returncode is not None:
                                raise RuntimeError('Express backend did not start')
                            try:
                                res = await client.get('http://127.0.0.1:8002/api/health', timeout=0.25)
                                if res.status_code == 200:
                                    break
                            except (httpx.HTTPError, OSError):
                                pass
                            await asyncio.sleep(.2)
                        else:
                            raise RuntimeError('Express backend timed out')
                    await send({'type': 'lifespan.startup.complete'})
                except Exception as exc:
                    await send({'type': 'lifespan.startup.failed', 'message': str(exc)})
            elif event['type'] == 'lifespan.shutdown':
                if process and process.returncode is None:
                    process.terminate()
                    await process.wait()
                await send({'type': 'lifespan.shutdown.complete'})
                return
    elif scope['type'] == 'http':
        chunks = []
        while True:
            event = await receive()
            if event['type'] != 'http.request':
                break
            chunks.append(event.get('body', b''))
            if not event.get('more_body'):
                break
        path = scope['path']
        if scope.get('query_string'):
            path += '?' + scope['query_string'].decode()
        headers = [(k.decode(), v.decode()) for k, v in scope['headers'] if k.lower() != b'host']
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                result = await client.request(scope['method'], 'http://127.0.0.1:8002' + path,
                                              headers=headers, content=b''.join(chunks))
            await send({'type': 'http.response.start', 'status': result.status_code,
                        'headers': [(k.encode(), v.encode()) for k, v in result.headers.items()
                                    if k.lower() not in ('transfer-encoding', 'content-encoding')]})
            await send({'type': 'http.response.body', 'body': result.content})
        except httpx.HTTPError:
            await send({'type': 'http.response.start', 'status': 503,
                        'headers': [(b'content-type', b'application/json')]})
            await send({'type': 'http.response.body', 'body': b'{"error":"Service temporarily unavailable"}'})