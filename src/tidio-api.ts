const TIDIO_API_URL = "https://api-v2.tidio.co";
const TIDIO_OAUTH_CLIENT_ID = "8ea883be-28c3-4bfd-9fe2-4091eb38fe08";

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
}

export interface IntegrateResponse {
  projectPublicKey: string;
}

export class TidioApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public responseData?: unknown
  ) {
    super(message);
    this.name = "TidioApiError";
  }
}

export async function exchangeRefreshToken(
  refreshToken: string
): Promise<TokenResponse> {
  const response = await fetch(`${TIDIO_API_URL}/platforms/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: TIDIO_OAUTH_CLIENT_ID,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new TidioApiError(
      `Failed to exchange refresh token: ${response.status}`,
      response.status,
      errorData
    );
  }

  return response.json();
}

export async function integrateProject(
  accessToken: string
): Promise<IntegrateResponse> {
  const response = await fetch(`${TIDIO_API_URL}/platforms/wordpress/integrate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new TidioApiError(
      `Failed to integrate project: ${response.status}`,
      response.status,
      errorData
    );
  }

  return response.json();
}

export async function getProjectPublicKey(
  refreshToken: string
): Promise<{ publicKey: string; accessToken: string; newRefreshToken: string }> {
  const tokens = await exchangeRefreshToken(refreshToken);
  const integration = await integrateProject(tokens.access_token);

  return {
    publicKey: integration.projectPublicKey,
    accessToken: tokens.access_token,
    newRefreshToken: tokens.refresh_token,
  };
}
