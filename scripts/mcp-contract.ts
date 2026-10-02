import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import {
  mcpContract,
  mcpOutputSchemas,
  MCP_CONTRACT_VERSION,
  mcpErrorCodes,
  mcpManualOperations,
  type McpToolName,
} from "../lib/mcp-contract";
import {
  MCP_CAPABILITIES,
  LEGACY_MCP_CAPABILITIES,
  MCP_CAPABILITY_DESCRIPTIONS,
} from "../lib/mcp-access";

const document = {
  contractVersion: MCP_CONTRACT_VERSION,
  transport: {
    path: "/api/mcp",
    protocol: "MCP Streamable HTTP",
    requests: "POST",
    authentication:
      "OAuth resource-bound bearer token plus fresh Fieldbook account and connection grant",
  },
  capabilities: MCP_CAPABILITIES.map((name) => ({
    name,
    description: MCP_CAPABILITY_DESCRIPTIONS[name],
  })),
  legacyCapabilities: LEGACY_MCP_CAPABILITIES,
  errors: mcpErrorCodes,
  manualOperations: mcpManualOperations,
  tools: Object.entries(mcpContract).map(([name, tool]) => ({
    name,
    description: tool.description,
    capability: tool.capability,
    annotations: tool.annotations,
    inputSchema: z.toJSONSchema(tool.inputSchema, { io: "input" }),
    outputSchema: z.toJSONSchema(mcpOutputSchemas[name as McpToolName], {
      io: "output",
    }),
    ...(tool.manual ? { manual: tool.manual } : {}),
  })),
};
const path = new URL("../docs/mcp-contract.json", import.meta.url);
const output = JSON.stringify(document, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (readFileSync(path, "utf8") !== output)
    throw new Error("MCP contract is stale. Run pnpm generate:mcp.");
  console.log("MCP contract matches executable schemas.");
} else writeFileSync(path, output);
