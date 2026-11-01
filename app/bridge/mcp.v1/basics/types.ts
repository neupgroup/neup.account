export type McpToolDefinition = {
  name: string;
  description: string;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
};

export type McpToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

export type McpToolModule = {
  definition: McpToolDefinition;
  execute: (args: Record<string, unknown>) => Promise<McpToolResult>;
};

/** Creates a consistent text result and optional structured payload for MCP tools. */
export function createMcpToolResult(
  value: Record<string, unknown>,
  isError = false,
): McpToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
    structuredContent: value,
    ...(isError ? { isError: true } : {}),
  };
}
