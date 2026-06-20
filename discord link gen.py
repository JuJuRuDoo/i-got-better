import random
import string
import asyncio
import aiohttp
import re
import time
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from aiohttp_socks import ProxyConnector
from python_socks.async_.asyncio import Proxy
import uvicorn

app = FastAPI()

# ─── Config ────────────────────────────────────────────────────────────────────

INVITE_CHARS    = string.ascii_letters + string.digits
_CHARS          = tuple(INVITE_CHARS)
_INVITE_LENGTHS = [6,   7,   8,   9,   10]
_INVITE_WEIGHTS = [3,   10,  85,  1,   1]

DISCORD_API     = "https://discord.com/api/v10/invites/{code}?with_counts=true"
REQUEST_TIMEOUT = aiohttp.ClientTimeout(total=1.5, connect=0.8)  # Replit: low latency DC, be aggressive

_REQ_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
}

PROXY_SOURCES = {
    "raw": [
        # socks5
        "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt",
        "https://raw.githubusercontent.com/hookzof/socks5_list/master/proxy.txt",
        "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt",
        "https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS5_RAW.txt",
        "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/socks5.txt",
        "https://raw.githubusercontent.com/mmpx12/proxy-list/master/socks5.txt",
        "https://raw.githubusercontent.com/rdavydov/proxy-list/main/proxies/socks5.txt",
        "https://raw.githubusercontent.com/officialputuid/KangProxy/KangProxy/socks5/socks5.txt",
        "https://raw.githubusercontent.com/zloi-user/hideip.me/main/socks5.txt",
        "https://raw.githubusercontent.com/UptimerBot/proxy-list/main/proxies/socks5.txt",
        # socks4
        "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks4.txt",
        "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks4.txt",
        "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/socks4.txt",
        "https://raw.githubusercontent.com/mmpx12/proxy-list/master/socks4.txt",
        "https://raw.githubusercontent.com/rdavydov/proxy-list/main/proxies/socks4.txt",
        "https://raw.githubusercontent.com/officialputuid/KangProxy/KangProxy/socks4/socks4.txt",
        "https://raw.githubusercontent.com/zloi-user/hideip.me/main/socks4.txt",
        "https://raw.githubusercontent.com/UptimerBot/proxy-list/main/proxies/socks4.txt",
        # http
        "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt",
        "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt",
        "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt",
        "https://raw.githubusercontent.com/mmpx12/proxy-list/master/http.txt",
        "https://raw.githubusercontent.com/rdavydov/proxy-list/main/proxies/http.txt",
        "https://raw.githubusercontent.com/officialputuid/KangProxy/KangProxy/https/https.txt",
        "https://raw.githubusercontent.com/zloi-user/hideip.me/main/http.txt",
        "https://raw.githubusercontent.com/UptimerBot/proxy-list/main/proxies/http.txt",
        # misc combined lists
        "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/all/data.txt",
        "https://raw.githubusercontent.com/iplocate/free-proxy-list/main/all-proxies.txt",
        "https://raw.githubusercontent.com/ClearProxy/checked-proxy-list/main/socks5/raw/all.txt",
        "https://raw.githubusercontent.com/ClearProxy/checked-proxy-list/main/socks4/raw/all.txt",
        "https://raw.githubusercontent.com/ClearProxy/checked-proxy-list/main/http/raw/all.txt",
        "https://raw.githubusercontent.com/JuJuRuDoo/i-got-better/refs/heads/main/free-proxy-list.txt",
        "https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/proxies.txt",
        "https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt",
        "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies.txt",
        "https://raw.githubusercontent.com/prxchk/proxy-list/main/all.txt",
    ],
    "litport": [
        # 80 pages × 5000 proxies = up to 400,000 proxies from litport
        f"https://litport.net/api/free-proxy?limit=5000&sortBy=pingAt_desc&page={p}&format=txt"
        for p in range(1, 81)
    ],
    "geonode": [
        # 21 pages × 500 proxies = up to 10,500 proxies from geonode
        f"https://proxylist.geonode.com/api/proxy-list?page={p}&limit=500&sort_by=responseTime&sort_type=asc"
        for p in range(1, 22)
    ],
    "html": [
        "https://free-proxy-list.net/",
        "https://www.us-proxy.org/",
        "https://free-proxy-list.net/uk-proxy.html",
        "https://www.sslproxies.org/",
        "https://free-proxy-list.net/anonymous-proxy.html",
    ],
}

PROXY_CACHE_FILE           = "proxies.txt"
PROXY_VALIDATE_TO          = 1.0      # Replit DC: low latency, can afford tight timeout
PROXY_VALIDATE_CONCURRENCY = 5000     # Replit: no ISP limits, max concurrency
P1_CONCURRENCY             = 10000    # Replit: TCP SYN flood at full speed
MAX_WORKERS_LIMIT          = 3000     # Replit: much higher worker ceiling

# ─── Shared State ──────────────────────────────────────────────────────────────

class AppState:
    def __init__(self):
        # Scan
        self.running      = False
        self.checked      = 0
        self.valid        = 0
        self.start_time   = 0.0
        self.results: list[dict] = []
        self.stop_event   = asyncio.Event()
        # Proxy
        self.proxy_urls: list[str] = []
        self.proxy_sessions: list[aiohttp.ClientSession] = []
        self.direct_session: aiohttp.ClientSession | None = None
        self.proxy_status  = "none"   # none | fetching | validating | ready | error
        self.proxy_p1_done = 0
        self.proxy_p1_total= 0
        self.proxy_p2_done = 0
        self.proxy_p2_total= 0
        self.proxy_working = 0
        self.fetch_task: asyncio.Task | None = None


state = AppState()
ws_clients: list[WebSocket] = []


async def broadcast(msg: dict):
    dead = []
    for ws in ws_clients:
        try:
            await ws.send_json(msg)
        except Exception:
            dead.append(ws)
    for ws in dead:
        try: ws_clients.remove(ws)
        except ValueError: pass


def generate_code() -> str:
    k = random.choices(_INVITE_LENGTHS, weights=_INVITE_WEIGHTS, k=1)[0]
    return "".join(random.choices(_CHARS, k=k))


# ─── Proxy Manager ─────────────────────────────────────────────────────────────

async def _fetch_one_source(
    session: aiohttp.ClientSession,
    category: str,
    url: str,
) -> list[str]:
    out: list[str] = []
    try:
        async with session.get(
            url,
            headers={"User-Agent": _REQ_HEADERS["User-Agent"]},
            timeout=aiohttp.ClientTimeout(total=14),
        ) as r:
            if r.status != 200:
                return out
            if category == "raw":
                text = await r.text()
                for line in text.splitlines():
                    line = line.strip()
                    if not line or line.startswith("#") or ":" not in line:
                        continue
                    if "://" in line:
                        if line.startswith(("socks4://", "socks5://", "http://")):
                            out.append(line)
                        elif line.startswith("https://"):
                            out.append("http://" + line[8:])
                    else:
                        url_l = url.lower()
                        proto = "socks5"
                        if "socks4" in url_l: proto = "socks4"
                        elif "http" in url_l:  proto = "http"
                        out.append(f"{proto}://{line}")

            elif category == "geonode":
                data = await r.json(content_type=None)
                for item in data.get("data", []):
                    ip   = item.get("ip")
                    port = item.get("port")
                    protos = item.get("protocols", [])
                    if ip and port and protos:
                        proto = protos[0]
                        if proto == "https": proto = "http"
                        out.append(f"{proto}://{ip}:{port}")

            elif category == "html":
                text = await r.text()
                rows = re.findall(r"<tr>(.*?)</tr>", text, re.DOTALL)
                for row in rows:
                    tds = re.findall(r"<td>(.*?)</td>", row)
                    if len(tds) >= 7:
                        ip   = tds[0].strip()
                        port = tds[1].strip()
                        if re.match(r"^\d{1,3}(?:\.\d{1,3}){3}$", ip) and port.isdigit():
                            row_l = row.lower()
                            if "socks5" in row_l:           proto = "socks5"
                            elif "socks4" in row_l:         proto = "socks4"
                            elif "yes" in tds[6].lower():   proto = "http"
                            else:                           proto = "http"
                            out.append(f"{proto}://{ip}:{port}")

            elif category == "litport":
                text = await r.text()
                for line in text.splitlines():
                    line = line.strip()
                    if not line or ":" not in line:
                        continue
                    if re.match(r"^\d{1,3}(?:\.\d{1,3}){3}:\d+$", line):
                        out.append(f"socks5://{line}")
                        out.append(f"http://{line}")
    except Exception:
        pass
    return out


async def fetch_all_proxies() -> list[str]:
    raw: list[str] = []
    async with aiohttp.ClientSession() as session:
        tasks = [
            _fetch_one_source(session, cat, url)
            for cat, urls in PROXY_SOURCES.items()
            for url in urls
        ]
        for chunk in await asyncio.gather(*tasks, return_exceptions=True):
            if isinstance(chunk, list):
                raw.extend(chunk)
    raw = list({u for u in raw if u.startswith(("socks4://", "socks5://", "http://"))})
    random.shuffle(raw)
    return raw


async def _phase1_tcp_ping(proxy_urls: list[str]) -> list[str]:
    """TCP SYN to proxy port — knocks out dead proxies in milliseconds."""
    alive: list[str] = []
    sem = asyncio.Semaphore(P1_CONCURRENCY)
    state.proxy_p1_total = len(proxy_urls)
    state.proxy_p1_done  = 0

    async def ping(url: str):
        async with sem:
            try:
                part = url.split("://", 1)[1]
                if "@" in part: part = part.rsplit("@", 1)[1]
                host, port_str = part.rsplit(":", 1)
                port = int(port_str)
                _, writer = await asyncio.wait_for(
                    asyncio.open_connection(host, port), timeout=0.6
                )
                writer.close()
                try: await writer.wait_closed()
                except Exception: pass
                alive.append(url)
            except Exception:
                pass
            finally:
                state.proxy_p1_done += 1
                if state.proxy_p1_done % 1000 == 0 or state.proxy_p1_done == state.proxy_p1_total:
                    await broadcast({
                        "type": "proxy_progress",
                        "phase": 1,
                        "done":  state.proxy_p1_done,
                        "total": state.proxy_p1_total,
                        "alive": len(alive),
                    })

    await asyncio.gather(*[ping(u) for u in proxy_urls])
    return alive


async def _phase2_socks_handshake(alive: list[str]) -> list[str]:
    """Full SOCKS/HTTP handshake through alive proxies → 1.1.1.1:80."""
    working: list[str] = []
    sem = asyncio.Semaphore(PROXY_VALIDATE_CONCURRENCY)
    state.proxy_p2_total = len(alive)
    state.proxy_p2_done  = 0

    async def check(url: str):
        async with sem:
            sock = None
            try:
                proxy = Proxy.from_url(url)
                sock = await asyncio.wait_for(
                    proxy.connect(dest_host="1.1.1.1", dest_port=80),
                    timeout=PROXY_VALIDATE_TO,
                )
                working.append(url)
            except Exception:
                pass
            finally:
                if sock is not None:
                    try: sock.close()
                    except Exception: pass
                state.proxy_p2_done += 1
                if state.proxy_p2_done % 500 == 0 or state.proxy_p2_done == state.proxy_p2_total:
                    await broadcast({
                        "type":    "proxy_progress",
                        "phase":   2,
                        "done":    state.proxy_p2_done,
                        "total":   state.proxy_p2_total,
                        "working": len(working),
                    })

    await asyncio.gather(*[check(u) for u in alive])
    return working


async def _build_proxy_sessions(proxy_urls: list[str]) -> None:
    """Build one aiohttp session per proxy URL with keepalive enabled."""
    await _close_proxy_sessions()
    sessions: list[aiohttp.ClientSession] = []
    for url in proxy_urls:
        try:
            connector = ProxyConnector.from_url(
                url,
                limit=200,           # Replit: more connections per proxy
                ttl_dns_cache=600,
                force_close=False,
                enable_cleanup_closed=True,
            )
            sessions.append(aiohttp.ClientSession(connector=connector, connector_owner=True))
        except Exception:
            sessions.append(None)
    state.proxy_sessions = sessions
    state.proxy_urls     = proxy_urls
    state.direct_session = aiohttp.ClientSession(
        connector=aiohttp.TCPConnector(limit=0, ttl_dns_cache=600, force_close=False)  # 0 = unlimited on Replit
    )


async def _close_proxy_sessions() -> None:
    for s in state.proxy_sessions:
        if s and not s.closed:
            try: await s.close()
            except Exception: pass
    state.proxy_sessions.clear()
    state.proxy_urls.clear()
    if state.direct_session and not state.direct_session.closed:
        try: await state.direct_session.close()
        except Exception: pass
    state.direct_session = None


def _session_for(worker_idx: int) -> tuple[str, aiohttp.ClientSession]:
    """Return the session pinned to this worker index."""
    if not state.proxy_sessions:
        return "direct", state.direct_session
    i = worker_idx % len(state.proxy_sessions)
    s = state.proxy_sessions[i]
    if s is None or s.closed:
        return "direct", state.direct_session
    return state.proxy_urls[i], s


def _load_cache() -> list[str]:
    try:
        with open(PROXY_CACHE_FILE, "r", encoding="utf-8") as f:
            return [
                l.strip() for l in f
                if l.strip() and l.strip().startswith(("socks4://", "socks5://", "http://"))
            ]
    except FileNotFoundError:
        return []


def _save_cache(proxies: list[str]) -> None:
    try:
        with open(PROXY_CACHE_FILE, "w", encoding="utf-8") as f:
            f.write("\n".join(proxies) + "\n")
    except Exception:
        pass


async def _do_full_proxy_pipeline(skip_validation: bool = False):
    """Fetch → Phase-1 TCP → Phase-2 SOCKS → build sessions."""
    state.proxy_status = "fetching"
    await broadcast({"type": "proxy_status", "status": "fetching", "count": 0, "detail": "Downloading proxy lists…"})

    try:
        raw = await fetch_all_proxies()
        total = len(raw)
        await broadcast({
            "type": "proxy_status", "status": "fetching",
            "count": total, "detail": f"Downloaded {total:,} unique proxies",
        })

        if skip_validation:
            working = raw
        else:
            state.proxy_status = "validating"
            await broadcast({"type": "proxy_status", "status": "validating", "count": 0, "detail": "Phase 1: TCP ping…"})

            alive = await _phase1_tcp_ping(raw)
            await broadcast({
                "type": "proxy_status", "status": "validating",
                "count": len(alive), "detail": f"Phase 1 done — {len(alive):,}/{total:,} reachable. Phase 2: SOCKS handshake…",
            })

            working = await _phase2_socks_handshake(alive)
            _save_cache(working)

        await _build_proxy_sessions(working)
        state.proxy_status  = "ready"
        state.proxy_working = len(working)
        await broadcast({
            "type": "proxy_status", "status": "ready",
            "count": len(working), "detail": f"{len(working):,} working proxies ready",
        })

    except Exception as e:
        state.proxy_status = "error"
        await broadcast({"type": "proxy_status", "status": "error", "count": 0, "detail": str(e)})


# ─── Invite Checker ────────────────────────────────────────────────────────────

async def check_invite(
    code: str,
    session: aiohttp.ClientSession,
    proxy_url: str,
) -> dict:
    url = f"https://discord.com/api/v10/invites/{code}?with_counts=true"
    try:
        async with session.get(url, headers=_REQ_HEADERS, timeout=REQUEST_TIMEOUT) as resp:
            s = resp.status
            if s == 200:
                data = await resp.json(content_type=None)
                return {
                    "code":    code,
                    "url":     f"https://discord.gg/{code}",
                    "valid":   True,
                    "guild":   data.get("guild", {}).get("name", "Unknown"),
                    "members": data.get("approximate_member_count"),
                    "online":  data.get("approximate_presence_count"),
                    "channel": data.get("channel", {}).get("name", "Unknown"),
                    "proxy":   proxy_url,
                    "status":  s,
                }
            return {"code": code, "valid": False, "status": s, "proxy": proxy_url}
    except Exception as e:
        return {"code": code, "valid": False, "status": 0, "error": type(e).__name__, "proxy": proxy_url}


# ─── Scan Engine ───────────────────────────────────────────────────────────────

async def _run_scan(workers: int, limit: int):
    infinite = limit == 0
    seen: set[str] = set()
    seen_lock = asyncio.Lock()

    # Use proxy sessions if available, else build a direct session pool
    use_proxies = bool(state.proxy_sessions)
    if not use_proxies:
        connector = aiohttp.TCPConnector(limit=workers + 20, ttl_dns_cache=300)
        _direct_pool = aiohttp.ClientSession(connector=connector)
    else:
        _direct_pool = None

    last_broadcast = time.time()
    _BATCH = 500  # Replit: larger batch = fewer lock grabs at high throughput

    async def worker(idx: int):
        nonlocal last_broadcast
        proxy_idx = idx
        local_queue: list[str] = []

        while not state.stop_event.is_set():
            if not infinite and state.checked >= limit:
                break

            if not local_queue:
                batch: list[str] = []
                async with seen_lock:
                    while len(batch) < _BATCH:
                        c = generate_code()
                        if c not in seen:
                            seen.add(c)
                            batch.append(c)
                local_queue = batch

            code = local_queue.pop()

            if use_proxies:
                proxy_url, session = _session_for(proxy_idx)
            else:
                proxy_url, session = "direct", _direct_pool

            r = await check_invite(code, session, proxy_url)
            state.checked += 1

            if r.get("valid"):
                state.valid += 1
                entry = {
                    "timestamp": datetime.now().strftime("%H:%M:%S"),
                    "code":      r["code"],
                    "url":       r["url"],
                    "guild":     r["guild"],
                    "members":   r.get("members"),
                    "online":    r.get("online"),
                    "channel":   r.get("channel"),
                    "proxy":     r.get("proxy", "direct"),
                }
                state.results.append(entry)
                await broadcast({"type": "hit", "result": entry})

            # Rotate proxy on 429
            if r.get("status") == 429 and use_proxies:
                proxy_idx = (proxy_idx + workers) % max(len(state.proxy_sessions), 1)

            now = time.time()
            if now - last_broadcast >= 0.4:
                elapsed = now - state.start_time
                rate = state.checked / elapsed if elapsed > 0 else 0
                await broadcast({
                    "type":    "stats",
                    "checked": state.checked,
                    "valid":   state.valid,
                    "rate":    round(rate, 1),
                })
                last_broadcast = now

            await asyncio.sleep(0)  # Replit has no ISP throttling — yield only, no delay

    tasks = [asyncio.create_task(worker(i)) for i in range(workers)]
    try:
        await asyncio.gather(*tasks)
    except Exception:
        pass
    finally:
        state.stop_event.set()
        state.running = False
        for t in tasks:
            if not t.done(): t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        if _direct_pool:
            await _direct_pool.close()

        elapsed = time.time() - state.start_time
        rate = state.checked / elapsed if elapsed > 0 else 0
        await broadcast({
            "type":    "scan_done",
            "checked": state.checked,
            "valid":   state.valid,
            "rate":    round(rate, 1),
        })


# ─── FastAPI Routes ─────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return FileResponse("static/index.html")


@app.get("/api/status")
async def get_status():
    elapsed = time.time() - state.start_time if state.start_time else 0
    rate = state.checked / elapsed if elapsed > 0 and state.checked > 0 else 0
    return {
        "running":      state.running,
        "checked":      state.checked,
        "valid":        state.valid,
        "rate":         round(rate, 1),
        "proxy_status": state.proxy_status,
        "proxy_count":  len(state.proxy_sessions),
        "results":      state.results[-100:],
    }


@app.post("/api/check")
async def check_codes(body: dict):
    raw_codes = body.get("codes", [])
    codes = []
    for c in raw_codes:
        c = c.strip().rstrip("/")
        if not c: continue
        codes.append(c.split("/")[-1])
    if not codes:
        return {"error": "No codes provided"}

    use_proxies = bool(state.proxy_sessions)
    if not use_proxies:
        connector = aiohttp.TCPConnector(limit=len(codes) + 5, ttl_dns_cache=60)
        session = aiohttp.ClientSession(connector=connector)
        tasks = [check_invite(code, session, "direct") for code in codes]
        results = await asyncio.gather(*tasks)
        await session.close()
    else:
        tasks = []
        for i, code in enumerate(codes):
            proxy_url, sess = _session_for(i)
            tasks.append(check_invite(code, sess, proxy_url))
        results = await asyncio.gather(*tasks)

    return {"results": [r for r in results if isinstance(r, dict)]}


@app.post("/api/proxies/fetch")
async def trigger_proxy_fetch(body: dict = {}):
    if state.proxy_status in ("fetching", "validating"):
        return {"message": "Already running"}
    skip = body.get("skip_validation", False)
    if state.fetch_task and not state.fetch_task.done():
        state.fetch_task.cancel()
    state.fetch_task = asyncio.create_task(_do_full_proxy_pipeline(skip_validation=skip))
    return {"message": "Fetch started"}


@app.post("/api/proxies/load_cache")
async def load_proxy_cache():
    cached = _load_cache()
    if not cached:
        return {"error": "No cache file found"}
    await _build_proxy_sessions(cached)
    state.proxy_status  = "ready"
    state.proxy_working = len(cached)
    await broadcast({"type": "proxy_status", "status": "ready", "count": len(cached), "detail": f"Loaded {len(cached):,} cached proxies"})
    return {"count": len(cached)}


@app.post("/api/proxies/clear")
async def clear_proxies():
    await _close_proxy_sessions()
    state.proxy_status  = "none"
    state.proxy_working = 0
    await broadcast({"type": "proxy_status", "status": "none", "count": 0, "detail": ""})
    return {"message": "Proxies cleared"}


@app.post("/api/scan/start")
async def start_scan(body: dict):
    if state.running:
        return {"error": "Scan already running"}
    workers = max(1, min(int(body.get("workers", 100)), MAX_WORKERS_LIMIT))
    limit   = max(0, int(body.get("limit", 0)))

    state.running    = True
    state.checked    = 0
    state.valid      = 0
    state.start_time = time.time()
    state.results    = []
    state.stop_event = asyncio.Event()

    asyncio.create_task(_run_scan(workers, limit))
    return {"message": "Scan started", "workers": workers}


@app.post("/api/scan/stop")
async def stop_scan():
    state.stop_event.set()
    state.running = False
    return {"message": "Stopped"}


@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    await websocket.accept()
    ws_clients.append(websocket)
    try:
        elapsed = time.time() - state.start_time if state.start_time else 0
        rate    = state.checked / elapsed if elapsed > 0 and state.checked > 0 else 0
        await websocket.send_json({
            "type":         "init",
            "running":      state.running,
            "checked":      state.checked,
            "valid":        state.valid,
            "rate":         round(rate, 1),
            "proxy_status": state.proxy_status,
            "proxy_count":  len(state.proxy_sessions),
            "results":      state.results[-100:],
        })
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        try: ws_clients.remove(websocket)
        except ValueError: pass


app.mount("/static", StaticFiles(directory="static"), name="static")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=5000, log_level="warning")
