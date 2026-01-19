import { createServer, IncomingMessage, ServerResponse } from "http";
import { URL } from "url";
import open from "open";
import { getProjectPublicKey } from "./tidio-api.js";
import { saveCredentials, TidioCredentials } from "./storage.js";

const TIDIO_PANEL_URL = "https://www.tidio.com/panel";
const DEFAULT_PORT = 38470;
const CALLBACK_TIMEOUT_MS = 120000; // 2 minutes
const NGROK_URL: string | null = null; // Set to ngrok URL for public access, null for localhost

export interface OAuthResult {
  success: boolean;
  credentials?: TidioCredentials;
  error?: string;
}

function findAvailablePort(startPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(startPort, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : startPort;
      server.close(() => resolve(port));
    });
    server.on("error", () => {
      // Port is in use, try next one
      if (startPort < 65535) {
        resolve(findAvailablePort(startPort + 1));
      } else {
        reject(new Error("No available ports found"));
      }
    });
  });
}

function createSuccessHtml(): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Tidio Connected</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: #ffffff;
      color: #000000;
    }
    .container {
      text-align: center;
      padding: 60px 40px;
      max-width: 480px;
    }
    .success-icon {
      width: 72px;
      height: 72px;
      background: #00D26A;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 32px;
    }
    .success-icon svg {
      width: 36px;
      height: 36px;
      fill: white;
    }
    h1 {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 12px;
      letter-spacing: -0.5px;
    }
    p {
      font-size: 16px;
      color: #6B7280;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="success-icon">
      <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
    </div>
    <h1>Tidio Connected</h1>
    <p>You can close this window and return to your application.</p>
  </div>
</body>
</html>`;
}

function createErrorHtml(error: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Connection Failed</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: #ffffff;
      color: #000000;
    }
    .container {
      text-align: center;
      padding: 60px 40px;
      max-width: 480px;
    }
    .error-icon {
      width: 72px;
      height: 72px;
      background: #000000;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 32px;
    }
    .error-icon svg {
      width: 36px;
      height: 36px;
      fill: white;
    }
    h1 {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 12px;
      letter-spacing: -0.5px;
    }
    p {
      font-size: 16px;
      color: #6B7280;
      line-height: 1.6;
    }
    .error-details {
      margin-top: 24px;
      padding: 16px;
      background: #F9FAFB;
      border-radius: 8px;
      font-size: 14px;
      color: #6B7280;
      word-break: break-word;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="error-icon">
      <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
    </div>
    <h1>Connection Failed</h1>
    <p>Something went wrong while connecting to Tidio.</p>
    <div class="error-details">${error}</div>
  </div>
</body>
</html>`;
}

export async function startOAuthFlow(siteUrl: string): Promise<OAuthResult> {
  return new Promise(async (resolve) => {
    let server: ReturnType<typeof createServer> | null = null;
    let timeoutId: NodeJS.Timeout | null = null;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (server) {
        server.close();
        server = null;
      }
    };

    try {
      const port = await findAvailablePort(DEFAULT_PORT);
      // IMPORTANT: Tidio appends "&refreshToken=..." expecting the URL already has "?"
      // So we add a dummy parameter to ensure proper URL formation
      const callbackUrl = NGROK_URL
        ? `${NGROK_URL}/callback?source=mcp`
        : `http://localhost:${port}/callback?source=mcp`;

      server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url || "/", `http://localhost:${port}`);

        console.error(`[Tidio MCP] Received request: ${req.method} ${req.url}`);

        // Handle ngrok browser warning bypass
        if (req.headers["ngrok-skip-browser-warning"]) {
          res.setHeader("ngrok-skip-browser-warning", "true");
        }

        if (url.pathname === "/callback") {
          const refreshToken = url.searchParams.get("refreshToken");

          console.error(`[Tidio MCP] Callback received, refreshToken present: ${!!refreshToken}`);

          if (!refreshToken) {
            // Show debug info if no token
            const debugInfo = `URL: ${req.url}\nQuery params: ${JSON.stringify(Object.fromEntries(url.searchParams))}`;
            console.error(`[Tidio MCP] No refresh token. Debug: ${debugInfo}`);
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end(createErrorHtml(`No refresh token received from Tidio.<br><br><small>Debug: ${req.url}</small>`));
            cleanup();
            resolve({ success: false, error: "No refresh token received" });
            return;
          }

          try {
            const result = await getProjectPublicKey(refreshToken);

            const credentials = saveCredentials({
              public_key: result.publicKey,
              access_token: result.accessToken,
              refresh_token: result.newRefreshToken,
              site_url: siteUrl,
            });

            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(createSuccessHtml());
            cleanup();
            resolve({ success: true, credentials });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            res.writeHead(500, { "Content-Type": "text/html" });
            res.end(createErrorHtml(errorMessage));
            cleanup();
            resolve({ success: false, error: errorMessage });
          }
        } else if (url.pathname === "/") {
          // Root path - show waiting page
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
<!DOCTYPE html>
<html>
<head>
  <title>Tidio MCP - Waiting</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: #ffffff;
      color: #000000;
    }
    .container { text-align: center; padding: 60px 40px; max-width: 480px; }
    .loader {
      width: 48px;
      height: 48px;
      border: 3px solid #F3F4F6;
      border-top-color: #00D26A;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 32px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    h1 { font-size: 24px; font-weight: 600; margin-bottom: 8px; }
    p { font-size: 14px; color: #6B7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="loader"></div>
    <h1>Waiting for Tidio</h1>
    <p>Complete authentication in the browser window...</p>
  </div>
</body>
</html>`);
        } else {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not found - expected /callback");
        }
      });

      server.listen(port, () => {
        const authUrl = new URL(`${TIDIO_PANEL_URL}/register-platforms`);
        authUrl.searchParams.set("pluginUrl", callbackUrl);
        authUrl.searchParams.set("siteUrl", siteUrl);
        authUrl.searchParams.set("localeCode", "en_US");
        authUrl.searchParams.set("language", "en");
        authUrl.searchParams.set("utm_source", "platform");
        authUrl.searchParams.set("utm_medium", "wordpress");

        open(authUrl.toString());
      });

      // Set timeout
      timeoutId = setTimeout(() => {
        cleanup();
        resolve({ success: false, error: "OAuth flow timed out. Please try again." });
      }, CALLBACK_TIMEOUT_MS);
    } catch (error) {
      cleanup();
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      resolve({ success: false, error: errorMessage });
    }
  });
}
