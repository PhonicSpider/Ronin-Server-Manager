# <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🤖 Discord Integration</p>

RSM includes a built-in HTTPS REST API so you can monitor and control your game servers from anywhere--including directly from a Discord bot or any HTTP-capable tool. This guide covers enabling the API, finding your server IDs, and using every available endpoint.

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">⚙️ Step 1--Enable the API</p>

1. Open RSM and click **⚙️ App Settings** in the sidebar.
2. Scroll down to the **Remote API** card.
3. Toggle **Enabled** on.
4. Click **Regenerate Key** to generate a secure API key--copy it and store it somewhere safe.
5. Note the **Port** (default: `3002`). Change it here if another service already uses that port, then click **Save Port**.

!!! warning "Keep your API key private"
    Your key grants full control over every managed server. Never paste it publicly in a Discord channel, commit it to a repository, or share it in a screenshot.

!!! tip "TLS / Self-Signed Certificate"
    The API runs over HTTPS using a self-signed certificate that RSM generates and stores locally. Your HTTP client will need to **skip certificate verification** or trust the cert. In most libraries this is a single flag--see the code examples below.

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🔍 Step 2--Find Your Server IDs</p>

Every request that targets a specific server requires its **ID**--a numeric string assigned the moment you add the server to RSM. IDs never change for an existing server.

Fetch them with a single call to the server list:

```bash
curl -k https://YOUR_PC_IP:3002/api/servers \
  -H "x-api-key: YOUR_API_KEY"
```

```json
{
  "servers": [
    { "id": "1716000000001", "name": "My Minecraft Server",  "type": "minecraft",       "status": "Online",  "pid": 4321, "cpu": 8,    "ramMB": 2048 },
    { "id": "1716000000002", "name": "SE Survival",          "type": "space-engineers", "status": "Offline", "pid": null, "cpu": null, "ramMB": null }
  ]
}
```

Save those IDs in your bot config--they are permanent.

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🔐 Authentication</p>

Every request must include the following header:

```
x-api-key: YOUR_API_KEY_HERE
```

Requests with a missing or wrong key receive `401 Unauthorized`.

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">📋 API Endpoints</p>

Replace `YOUR_PC_IP` with the IP address or hostname of the machine running RSM, and `3002` with your configured port if you changed it.

---

### List All Servers

```
GET /api/servers
```

Returns every managed server with live status, CPU %, and RAM usage.

=== "cURL"
    ```bash
    curl -k https://YOUR_PC_IP:3002/api/servers \
      -H "x-api-key: YOUR_API_KEY"
    ```
=== "Python (discord.py)"
    ```python
    import requests

    r = requests.get(
        "https://YOUR_PC_IP:3002/api/servers",
        headers={"x-api-key": "YOUR_API_KEY"},
        verify=False   # self-signed cert
    )
    print(r.json())
    ```
=== "JavaScript (fetch)"
    ```javascript
    const res = await fetch("https://YOUR_PC_IP:3002/api/servers", {
        headers: { "x-api-key": "YOUR_API_KEY" }
    });
    console.log(await res.json());
    ```

**Response**
```json
{
  "servers": [
    {
      "id":     "1716000000001",
      "name":   "My Minecraft Server",
      "type":   "minecraft",
      "status": "Online",
      "pid":    4321,
      "cpu":    8,
      "ramMB":  2048
    }
  ]
}
```

---

### Get One Server

```
GET /api/servers/:id
```

Returns live details for a single server.

=== "cURL"
    ```bash
    curl -k https://YOUR_PC_IP:3002/api/servers/1716000000001 \
      -H "x-api-key: YOUR_API_KEY"
    ```
=== "Python"
    ```python
    r = requests.get(
        "https://YOUR_PC_IP:3002/api/servers/1716000000001",
        headers={"x-api-key": "YOUR_API_KEY"},
        verify=False
    )
    ```
=== "JavaScript"
    ```javascript
    const res = await fetch("https://YOUR_PC_IP:3002/api/servers/1716000000001", {
        headers: { "x-api-key": "YOUR_API_KEY" }
    });
    ```

**Response**--same shape as a single entry from the list above.

---

### Start a Server

```
POST /api/servers/:id/start
```

Sends a start signal to the server. Returns `409` if it is already Online or Starting.

=== "cURL"
    ```bash
    curl -k -X POST https://YOUR_PC_IP:3002/api/servers/1716000000001/start \
      -H "x-api-key: YOUR_API_KEY"
    ```
=== "Python"
    ```python
    r = requests.post(
        "https://YOUR_PC_IP:3002/api/servers/1716000000001/start",
        headers={"x-api-key": "YOUR_API_KEY"},
        verify=False
    )
    ```
=== "JavaScript"
    ```javascript
    await fetch("https://YOUR_PC_IP:3002/api/servers/1716000000001/start", {
        method: "POST",
        headers: { "x-api-key": "YOUR_API_KEY" }
    });
    ```

**Response**
```json
{ "message": "Start signal sent to My Minecraft Server" }
```

---

### Stop a Server

```
POST /api/servers/:id/stop
```

Sends a graceful stop signal. Returns `409` if the server is already Offline.

=== "cURL"
    ```bash
    curl -k -X POST https://YOUR_PC_IP:3002/api/servers/1716000000001/stop \
      -H "x-api-key: YOUR_API_KEY"
    ```
=== "Python"
    ```python
    r = requests.post(
        "https://YOUR_PC_IP:3002/api/servers/1716000000001/stop",
        headers={"x-api-key": "YOUR_API_KEY"},
        verify=False
    )
    ```
=== "JavaScript"
    ```javascript
    await fetch("https://YOUR_PC_IP:3002/api/servers/1716000000001/stop", {
        method: "POST",
        headers: { "x-api-key": "YOUR_API_KEY" }
    });
    ```

**Response**
```json
{ "message": "Stop signal sent to My Minecraft Server" }
```

---

### Get Player List

```
GET /api/servers/:id/players
```

Returns the current player count and names. Server must be Online--returns `409` if not.

| Game | What's returned |
|---|---|
| **Minecraft** | Player names + `online` / `max` count |
| **Space Engineers** | `online` / `max` count (names not available via VRage HTTP API) |
| **Ark** | Player names + count via RCON |
| **Others** | `online: null` with an explanatory note |

=== "cURL"
    ```bash
    curl -k https://YOUR_PC_IP:3002/api/servers/1716000000001/players \
      -H "x-api-key: YOUR_API_KEY"
    ```
=== "Python"
    ```python
    r = requests.get(
        "https://YOUR_PC_IP:3002/api/servers/1716000000001/players",
        headers={"x-api-key": "YOUR_API_KEY"},
        verify=False
    )
    ```
=== "JavaScript"
    ```javascript
    const res = await fetch("https://YOUR_PC_IP:3002/api/servers/1716000000001/players", {
        headers: { "x-api-key": "YOUR_API_KEY" }
    });
    ```

**Response (Minecraft)**
```json
{
  "online":  3,
  "max":     20,
  "players": ["Alice", "Bob", "Charlie"]
}
```

**Response (Space Engineers)**
```json
{
  "online":  5,
  "max":     16,
  "players": []
}
```

---

### Send a Console Command

```
POST /api/servers/:id/command
Content-Type: application/json

{ "command": "your command here" }
```

Executes a command on the server and returns the output. The command also appears in the RSM console window as `[API] > your command`.

!!! info "How commands are routed by game type"
    - **Minecraft / Terraria / 7 Days to Die**--written to `stdin`; the response is whatever the server prints to console in the next 1.5 seconds.
    - **Space Engineers**--sent to the VRage Remote HTTP API.
    - **Ark and others**--sent via RCON; the response string is returned directly.

=== "cURL"
    ```bash
    curl -k -X POST https://YOUR_PC_IP:3002/api/servers/1716000000001/command \
      -H "x-api-key: YOUR_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{"command": "say Hello from Discord!"}'
    ```
=== "Python"
    ```python
    r = requests.post(
        "https://YOUR_PC_IP:3002/api/servers/1716000000001/command",
        headers={"x-api-key": "YOUR_API_KEY", "Content-Type": "application/json"},
        json={"command": "say Hello from Discord!"},
        verify=False
    )
    ```
=== "JavaScript"
    ```javascript
    await fetch("https://YOUR_PC_IP:3002/api/servers/1716000000001/command", {
        method: "POST",
        headers: {
            "x-api-key": "YOUR_API_KEY",
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ command: "say Hello from Discord!" })
    });
    ```

**Response**
```json
{
  "success": true,
  "output":  "(server output, or '(no output)' if nothing was printed)"
}
```

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">⚠️ Error Reference</p>

| Code | Meaning |
|---|---|
| `401` | Missing or incorrect `x-api-key` header |
| `404` | Route not recognised, or the server ID does not exist |
| `405` | Wrong HTTP method for that endpoint |
| `409` | State conflict--server already running, already stopped, or not online for a player/command request |
| `500` | Command or RCON execution failed on the server side |

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🐍 Discord Bot Examples</p>

The examples below use **discord.py**, but the same pattern applies to any Discord library or language.

### Setup

```python
import discord, requests
from discord.ext import commands

RSM_URL = "https://YOUR_PC_IP:3002"
RSM_KEY = "YOUR_API_KEY"
HEADERS = {"x-api-key": RSM_KEY}

bot = commands.Bot(command_prefix="!")

# Silence the InsecureRequestWarning from the self-signed cert
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
```

---

### !servers--Status Embed

Posts a live embed showing every server, its status, CPU, and RAM.

```python
@bot.command()
async def servers(ctx):
    r = requests.get(f"{RSM_URL}/api/servers", headers=HEADERS, verify=False)
    data = r.json()

    embed = discord.Embed(title="🖥️ Server Status", color=0xff4500)
    for srv in data["servers"]:
        icon = "🟢" if srv["status"] == "Online" else "🔴"
        cpu  = f'{srv["cpu"]}%'    if srv["cpu"]   is not None else "--"
        ram  = f'{srv["ramMB"]} MB' if srv["ramMB"] is not None else "--"
        embed.add_field(
            name=f'{icon} {srv["name"]}',
            value=f'**Status:** {srv["status"]}\n**CPU:** {cpu}  **RAM:** {ram}\n**ID:** `{srv["id"]}`',
            inline=False
        )
    await ctx.send(embed=embed)
```

---

### !start / !stop--Server Control

```python
@bot.command()
async def start(ctx, server_id: str):
    r = requests.post(f"{RSM_URL}/api/servers/{server_id}/start", headers=HEADERS, verify=False)
    msg = r.json().get("message") or r.json().get("error", "Unknown error")
    await ctx.send(f'✅ {msg}' if r.status_code == 200 else f'❌ {msg}')

@bot.command()
async def stop(ctx, server_id: str):
    r = requests.post(f"{RSM_URL}/api/servers/{server_id}/stop", headers=HEADERS, verify=False)
    msg = r.json().get("message") or r.json().get("error", "Unknown error")
    await ctx.send(f'✅ {msg}' if r.status_code == 200 else f'❌ {msg}')
```

**Usage in Discord:**
```
!start 1716000000001
!stop  1716000000001
```

---

### !players--Who's Online

```python
@bot.command()
async def players(ctx, server_id: str):
    r = requests.get(f"{RSM_URL}/api/servers/{server_id}/players", headers=HEADERS, verify=False)
    if r.status_code != 200:
        await ctx.send(f'❌ {r.json().get("error", "Could not fetch players")}')
        return

    data  = r.json()
    count = f'{data["online"]} / {data["max"]}' if data["max"] is not None else str(data["online"])
    names = ", ".join(data["players"]) if data["players"] else "No player names available"
    await ctx.send(f'👥 **Players ({count}):** {names}')
```

---

### !rsmcmd--Send a Console Command

```python
@bot.command()
async def rsmcmd(ctx, server_id: str, *, command: str):
    r = requests.post(
        f"{RSM_URL}/api/servers/{server_id}/command",
        headers={**HEADERS, "Content-Type": "application/json"},
        json={"command": command},
        verify=False
    )
    data = r.json()
    if data.get("success"):
        output = data.get("output") or "(no output)"
        await ctx.send(f'✅ Command sent.\n```\n{output}\n```')
    else:
        await ctx.send(f'❌ Failed: {data.get("output", "Unknown error")}')
```

**Usage in Discord:**
```
!rsmcmd 1716000000001 say Server restarting in 5 minutes!
!rsmcmd 1716000000001 listplayers
```

---

## <p style="text-align: center; text-shadow: 0 0 15px rgba(255,69,0,0.5);">🔗 ArkenBot Integration</p>

RSM's Remote API is designed to work natively with **ArkenBot**, a free community Discord bot that provides a no-code server management experience--no Python or bot hosting required.

Once connected, ArkenBot can:

<div class="grid cards" markdown>

-   :material-monitor-dashboard: **Live Status Board**

    ---
    A persistent Discord message that auto-updates with server names, online status, and resource usage.

-   :material-play-circle: **Slash Command Control**

    ---
    Start and stop servers with slash commands--no terminal access needed.

-   :material-bell-alert: **Offline Alerts**

    ---
    Sends a Discord notification when a server goes offline unexpectedly.

-   :material-console: **Command Relay**

    ---
    Send console commands directly from Discord and get the server's response back in-channel.

</div>

Visit **[arkenbot.app](https://arkenbot.app)** for the full setup guide and command list.

---

<p align="center"><i>Have a question or hit a problem? Open an issue on <a href="https://github.com/PhonicSpider/Ronin-Server-Manager/issues">GitHub</a>.</i></p>
