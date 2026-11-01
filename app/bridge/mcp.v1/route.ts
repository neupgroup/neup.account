import { NextResponse, type NextRequest } from 'next/server';
import { getProfileTool } from './basics/get_profile';
import { getNeupIdTool } from './basics/get_neupid';
import { updateProfileTool } from './basics/update_profile';
import { notificationTools } from './notifications';
import { securityTools } from './security';
import { listApplicationsTool } from './applications/list_applications';
import { rootTools } from './root';
import type { McpToolModule } from './basics/types';

export const dynamic = 'force-dynamic';

const serverInfo = { name: 'neup-account', version: '1.0.0' };
const modernProtocolVersion = '2026-07-28';
const tools: McpToolModule[] = [
  getProfileTool,
  getNeupIdTool,
  updateProfileTool,
  ...notificationTools,
  ...securityTools,
  listApplicationsTool,
  ...rootTools,
];
const toolsByName = new Map(tools.map((tool) => [tool.definition.name, tool]));

type JsonRpcRequest = {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
};

/** Builds a JSON-RPC success response with the request's original id. */
function jsonRpcResult(id: unknown, result: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id, result });
}

/** Builds a JSON-RPC error response with the request's original id. */
function jsonRpcError(id: unknown, code: number, message: string) {
  return NextResponse.json({ jsonrpc: '2.0', id, error: { code, message } });
}

/** Adds modern MCP result metadata while keeping legacy responses unchanged. */
function withModernResult(result: Record<string, unknown>, isModern: boolean) {
  if (!isModern) return result;
  return {
    resultType: 'complete',
    ...result,
    _meta: { 'io.modelcontextprotocol/serverInfo': serverInfo },
  };
}

/** Handles MCP initialization, tool discovery, and tool calls over JSON-RPC. */
export async function POST(request: NextRequest) {
  let payload: JsonRpcRequest;
  try {
    payload = await request.json() as JsonRpcRequest;
  } catch {
    return jsonRpcError(null, -32700, 'Parse error');
  }

  if (!payload || payload.jsonrpc !== '2.0' || typeof payload.method !== 'string') {
    return jsonRpcError(payload?.id ?? null, -32600, 'Invalid Request');
  }

  const params = payload.params && typeof payload.params === 'object' && !Array.isArray(payload.params)
    ? payload.params as Record<string, unknown>
    : {};
  const requestMeta = params._meta && typeof params._meta === 'object'
    ? params._meta as Record<string, unknown>
    : {};
  const metaProtocolVersion = requestMeta['io.modelcontextprotocol/protocolVersion'];
  const headerProtocolVersion = request.headers.get('mcp-protocol-version');
  const isModern = headerProtocolVersion === modernProtocolVersion || metaProtocolVersion === modernProtocolVersion;

  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json(
      { jsonrpc: '2.0', id: payload.id ?? null, error: { code: -32000, message: 'Origin is not allowed.' } },
      { status: 403 },
    );
  }

  if (isModern) {
    if (headerProtocolVersion !== modernProtocolVersion || metaProtocolVersion !== modernProtocolVersion) {
      return NextResponse.json(
        { jsonrpc: '2.0', id: payload.id ?? null, error: { code: -32020, message: 'Protocol version header does not match request metadata.' } },
        { status: 400 },
      );
    }

    if (request.headers.get('mcp-method') !== payload.method) {
      return NextResponse.json(
        { jsonrpc: '2.0', id: payload.id ?? null, error: { code: -32020, message: 'Mcp-Method header does not match request method.' } },
        { status: 400 },
      );
    }

    if (payload.method === 'tools/call' && request.headers.get('mcp-name') !== params.name) {
      return NextResponse.json(
        { jsonrpc: '2.0', id: payload.id ?? null, error: { code: -32020, message: 'Mcp-Name header does not match tool name.' } },
        { status: 400 },
      );
    }
  }

  const hasId = Object.prototype.hasOwnProperty.call(payload, 'id');
  const id = payload.id ?? null;

  if (payload.method.startsWith('notifications/')) {
    return new NextResponse(null, { status: 202 });
  }

  if (!hasId) {
    return jsonRpcError(null, -32600, 'Request id is required');
  }

  if (payload.method === 'initialize') {
    const requestedVersion = params.protocolVersion;
    const supportedVersions = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
    const protocolVersion = typeof requestedVersion === 'string' && supportedVersions.includes(requestedVersion)
      ? requestedVersion
      : supportedVersions[0];

    return jsonRpcResult(id, {
      protocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo,
      instructions: 'Use get_profile and update_profile to manage the signed-in user’s active profile.',
    });
  }

  if (payload.method === 'ping') {
    return jsonRpcResult(id, {});
  }

  if (payload.method === 'tools/list') {
    return jsonRpcResult(id, withModernResult({
      tools: tools.map(({ definition }) => definition),
      ...(isModern ? { ttlMs: 60_000, cacheScope: 'private' } : {}),
    }, isModern));
  }

  if (payload.method === 'server/discover' && isModern) {
    return jsonRpcResult(id, {
      resultType: 'complete',
      supportedVersions: [modernProtocolVersion],
      capabilities: { tools: {} },
      instructions: 'Use get_profile and update_profile to manage the signed-in user’s active profile.',
      ttlMs: 60_000,
      cacheScope: 'private',
      _meta: { 'io.modelcontextprotocol/serverInfo': serverInfo },
    });
  }

  if (payload.method === 'tools/call') {
    if (!payload.params || typeof payload.params !== 'object') {
      return jsonRpcError(id, -32602, 'Invalid params');
    }

    if (typeof params.name !== 'string') {
      return jsonRpcError(id, -32602, 'Tool name is required');
    }

    const tool = toolsByName.get(params.name);
    if (!tool) {
      return jsonRpcError(id, -32602, `Unknown tool: ${params.name}`);
    }

    const args = params.arguments && typeof params.arguments === 'object' && !Array.isArray(params.arguments)
      ? params.arguments as Record<string, unknown>
      : {};

    try {
      const result = await tool.execute(args);
      return jsonRpcResult(id, withModernResult(result, isModern));
    } catch {
      return jsonRpcResult(id, withModernResult({
        content: [{ type: 'text', text: 'The tool failed while processing the request.' }],
        isError: true,
      }, isModern));
    }
  }

  return jsonRpcError(id, -32601, `Method not found: ${payload.method}`);
}
