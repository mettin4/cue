import { rateLimit, RateLimitError } from "@/lib/api/guard";
import { handleMessage } from "@/lib/mcp/jsonrpc";
import { resolveConnectToken } from "@/lib/mcp/tokens";

export const dynamic = "force-dynamic";

/**
 * Remote MCP endpoint, one per connect token. Streamable HTTP transport in
 * stateless mode: every JSON-RPC message is a POST and the response comes back
 * as application/json.
 *
 * The acting account is resolved from the token in the path and never from any
 * client supplied value, so one person's connection cannot move another's money.
 */

function rpcError(status: number, code: number, message: string) {
  return Response.json(
    { jsonrpc: "2.0", id: null, error: { code, message } },
    { status },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  try {
    // Rate limit per token, since the endpoint is publicly reachable.
    rateLimit(`mcp:${token}`, 120, 60_000);
  } catch (error) {
    if (error instanceof RateLimitError) {
      return rpcError(429, -32000, "Too many requests. Slow down and try again shortly.");
    }
    throw error;
  }

  const user = await resolveConnectToken(token);
  if (!user) {
    return rpcError(401, -32001, "This connect link is not valid. It may have been revoked.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return rpcError(400, -32700, "Could not parse the request.");
  }

  try {
    // A single message is the normal case. Tolerate a batch array as well.
    if (Array.isArray(body)) {
      const responses = [];
      for (const message of body) {
        const response = await handleMessage(user, message);
        if (response) responses.push(response);
      }
      if (responses.length === 0) return new Response(null, { status: 202 });
      return Response.json(responses);
    }

    const response = await handleMessage(user, body as never);
    if (!response) return new Response(null, { status: 202 });
    return Response.json(response);
  } catch {
    return rpcError(500, -32603, "The server hit an error handling that request.");
  }
}

// This endpoint does not offer a server initiated stream, so GET is not allowed.
// The spec permits answering GET and DELETE with 405.
export async function GET() {
  return new Response("Method Not Allowed", { status: 405 });
}

export async function DELETE() {
  return new Response("Method Not Allowed", { status: 405 });
}
