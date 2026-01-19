#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { startOAuthFlow } from "./oauth.js";
import { loadCredentials, clearCredentials, hasValidCredentials } from "./storage.js";

const TIDIO_WIDGET_URL = "//code.tidio.co";

function generateAsyncEmbed(publicKey: string): string {
  return `<script type="text/javascript">
document.tidioChatCode = "${publicKey}";
(function() {
  function asyncLoad() {
    var tidioScript = document.createElement("script");
    tidioScript.type = "text/javascript";
    tidioScript.async = true;
    tidioScript.src = "${TIDIO_WIDGET_URL}/${publicKey}.js";
    document.body.appendChild(tidioScript);
  }
  if (window.attachEvent) {
    window.attachEvent("onload", asyncLoad);
  } else {
    window.addEventListener("load", asyncLoad, false);
  }
})();
</script>`;
}

function generateSyncEmbed(publicKey: string): string {
  return `<script src="${TIDIO_WIDGET_URL}/${publicKey}.js" async></script>`;
}

function validatePublicKey(publicKey: string): { valid: boolean; message: string } {
  if (!publicKey || publicKey.trim() === "") {
    return { valid: false, message: "Public key cannot be empty" };
  }

  const trimmed = publicKey.trim();

  if (!/^[a-zA-Z0-9]+$/.test(trimmed)) {
    return { valid: false, message: "Public key should only contain alphanumeric characters" };
  }

  if (trimmed.length < 10) {
    return { valid: false, message: "Public key seems too short (expected 10+ characters)" };
  }

  if (trimmed.length > 50) {
    return { valid: false, message: "Public key seems too long (expected less than 50 characters)" };
  }

  return { valid: true, message: "Public key format appears valid" };
}

// Create the MCP server
const server = new Server(
  {
    name: "tidio-mcp-connector",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "tidio_connect",
        description:
          "Connect to Tidio and automatically get your public key. Opens browser for authentication, then returns the public key and embed code. This is the recommended way to set up Tidio.",
        inputSchema: {
          type: "object",
          properties: {
            site_url: {
              type: "string",
              description: "The website URL where Tidio will be embedded (e.g., https://example.com)",
            },
          },
          required: ["site_url"],
        },
      },
      {
        name: "tidio_status",
        description:
          "Check if Tidio is connected and get the current public key and embed code. Use this to see your connection status.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "tidio_disconnect",
        description: "Disconnect from Tidio and clear stored credentials.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "generate_tidio_embed",
        description:
          "Generate Tidio embed code for a specific public key. Use this if you already have your public key, or use tidio_connect for automatic setup.",
        inputSchema: {
          type: "object",
          properties: {
            public_key: {
              type: "string",
              description: "Your Tidio public key",
            },
            loading_mode: {
              type: "string",
              enum: ["async", "sync"],
              description: "Loading mode: 'async' (recommended) or 'sync'. Default: async",
            },
          },
          required: ["public_key"],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "tidio_connect": {
      const siteUrl = (args?.site_url as string)?.trim();

      if (!siteUrl) {
        return {
          content: [
            {
              type: "text",
              text: "Error: site_url is required. Please provide the website URL where Tidio will be embedded.",
            },
          ],
          isError: true,
        };
      }

      // Validate URL format
      try {
        new URL(siteUrl);
      } catch {
        return {
          content: [
            {
              type: "text",
              text: `Error: Invalid URL format. Please provide a valid URL (e.g., https://example.com)`,
            },
          ],
          isError: true,
        };
      }

      const result = await startOAuthFlow(siteUrl);

      if (!result.success || !result.credentials) {
        return {
          content: [
            {
              type: "text",
              text: `# Tidio Connection Failed

**Error:** ${result.error || "Unknown error"}

Please try again or check your Tidio account.`,
            },
          ],
          isError: true,
        };
      }

      const embedCode = generateAsyncEmbed(result.credentials.public_key);

      return {
        content: [
          {
            type: "text",
            text: `# Tidio Connected Successfully!

**Public Key:** \`${result.credentials.public_key}\`
**Site URL:** ${result.credentials.site_url}

## Embed Code

Add this code just before the closing \`</body>\` tag of your HTML:

\`\`\`html
${embedCode}
\`\`\`

## Optional: Add Preconnect

For faster loading, add this in your \`<head>\` section:

\`\`\`html
<link rel="preconnect" href="//code.tidio.co">
\`\`\`

Your credentials have been saved. Use \`tidio_status\` to view them anytime.`,
          },
        ],
      };
    }

    case "tidio_status": {
      const credentials = loadCredentials();

      if (!credentials || !hasValidCredentials()) {
        return {
          content: [
            {
              type: "text",
              text: `# Tidio Status

**Status:** Not connected

Use \`tidio_connect\` to connect your Tidio account and get your embed code.`,
            },
          ],
        };
      }

      const embedCode = generateAsyncEmbed(credentials.public_key);

      return {
        content: [
          {
            type: "text",
            text: `# Tidio Status

**Status:** Connected
**Public Key:** \`${credentials.public_key}\`
**Site URL:** ${credentials.site_url}
**Connected:** ${new Date(credentials.created_at).toLocaleDateString()}

## Embed Code

\`\`\`html
${embedCode}
\`\`\`

Use \`tidio_disconnect\` to clear credentials or \`tidio_connect\` to reconnect.`,
          },
        ],
      };
    }

    case "tidio_disconnect": {
      const hadCredentials = hasValidCredentials();
      clearCredentials();

      return {
        content: [
          {
            type: "text",
            text: hadCredentials
              ? "# Tidio Disconnected\n\nCredentials have been cleared. Use `tidio_connect` to reconnect."
              : "# Tidio\n\nNo credentials were stored. Use `tidio_connect` to connect.",
          },
        ],
      };
    }

    case "generate_tidio_embed": {
      const publicKey = (args?.public_key as string)?.trim();
      const loadingMode = (args?.loading_mode as string) || "async";

      if (!publicKey) {
        return {
          content: [
            {
              type: "text",
              text: "Error: public_key is required. Use `tidio_connect` for automatic setup, or provide your public key.",
            },
          ],
          isError: true,
        };
      }

      const validation = validatePublicKey(publicKey);
      if (!validation.valid) {
        return {
          content: [
            {
              type: "text",
              text: `Warning: ${validation.message}\n\nProceeding with embed generation anyway. If the widget doesn't work, please verify your public key or use \`tidio_connect\` for automatic setup.`,
            },
          ],
        };
      }

      const embedCode =
        loadingMode === "sync"
          ? generateSyncEmbed(publicKey)
          : generateAsyncEmbed(publicKey);

      const instructions =
        loadingMode === "async"
          ? "Add this code just before the closing </body> tag of your HTML."
          : "Add this code in the <head> section or just before the closing </body> tag.";

      return {
        content: [
          {
            type: "text",
            text: `# Tidio Embed Code (${loadingMode} loading)

${instructions}

\`\`\`html
${embedCode}
\`\`\`

## Preconnect (Optional)

Add this in your <head> section for faster widget loading:

\`\`\`html
<link rel="preconnect" href="//code.tidio.co">
\`\`\``,
          },
        ],
      };
    }

    default:
      return {
        content: [
          {
            type: "text",
            text: `Unknown tool: ${name}`,
          },
        ],
        isError: true,
      };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Tidio MCP Connector running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
