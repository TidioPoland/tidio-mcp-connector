# Tidio MCP Connector

An MCP (Model Context Protocol) server that connects AI assistants to [Tidio](https://www.tidio.com) live chat - with **automatic setup**

## Features

- **Automatic Setup**: Connect to Tidio with one command - no manual key copying
- **OAuth Authentication**: Opens browser for secure Tidio login, auto-retrieves your public key
- **Credential Persistence**: Credentials are saved locally for future sessions
- **Embed Code Generation**: Get ready-to-use JavaScript code for any website

## Installation

```bash
npm install tidio-mcp-connector
```

Or clone and build locally:

```bash
git clone https://github.com/your-username/tidio-mcp-connector.git
cd tidio-mcp-connector
npm install
npm run build
```

## Usage

### With Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "tidio": {
      "command": "npx",
      "args": ["tidio-mcp-connector"]
    }
  }
}
```

### With Lovable

This MCP connector works with [Lovable](https://lovable.dev) and similar AI-powered development platforms. Add it as a custom MCP server.

### With MCP Inspector (Testing)

```bash
npx @modelcontextprotocol/inspector npx tidio-mcp-connector
```

## Available Tools

### `tidio_connect` (Recommended)

Connect to Tidio and automatically get your public key.

**How it works:**
1. Opens your browser to Tidio's login page
2. You authenticate with your Tidio account
3. Returns your public key and embed code automatically

**Parameters:**
- `site_url` (required): The website URL where Tidio will be embedded

**Example:**
```
Connect Tidio to https://mywebsite.com
```

### `tidio_status`

Check your connection status and get your embed code.

**Parameters:** None

### `tidio_disconnect`

Clear stored credentials.

**Parameters:** None

### `generate_tidio_embed`

Generate embed code for a specific public key (if you already have one).

**Parameters:**
- `public_key` (required): Your Tidio public key
- `loading_mode` (optional): `"async"` (default) or `"sync"`

## How It Works

1. **User calls `tidio_connect`** with their website URL
2. **Browser opens** to Tidio's authentication page
3. **User logs in** to their Tidio account
4. **Callback received** - MCP server gets the refresh token
5. **API calls made** - exchanges token for access token, then retrieves public key
6. **Credentials saved** to `~/.tidio-mcp/credentials.json`
7. **Embed code returned** - ready to add to the website

## Credential Storage

Credentials are stored locally at `~/.tidio-mcp/credentials.json`:

```json
{
  "public_key": "abc123...",
  "access_token": "...",
  "refresh_token": "...",
  "site_url": "https://example.com",
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-01T00:00:00.000Z"
}
```

## Embed Code Output

The connector generates optimized async loading code:

```html
<script type="text/javascript">
document.tidioChatCode = "YOUR_PUBLIC_KEY";
(function() {
  function asyncLoad() {
    var tidioScript = document.createElement("script");
    tidioScript.type = "text/javascript";
    tidioScript.async = true;
    tidioScript.src = "//code.tidio.co/YOUR_PUBLIC_KEY.js";
    document.body.appendChild(tidioScript);
  }
  if (window.attachEvent) {
    window.attachEvent("onload", asyncLoad);
  } else {
    window.addEventListener("load", asyncLoad, false);
  }
})();
</script>
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Run built version
npm start
```

## Requirements

- Node.js 18+
- A Tidio account (free tier works)

## License

MIT

## Related

- [Tidio](https://www.tidio.com) - Live chat and chatbot platform
- [Model Context Protocol](https://modelcontextprotocol.io) - Open standard for AI integrations
- [Lovable](https://lovable.dev) - AI-powered app development
