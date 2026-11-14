// Creates the Ippo agent on LoanPilot Agents (or updates it when IPPO_AGENT_ID is set) and saves its id.
// Reads LOANPILOT_AGENTS_API_KEY (and optional LOANPILOT_AGENTS_URL, IPPO_AGENT_ID) from .env.local.
import { LoanpilotAgents } from "@ippopone/agents-sdk";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { AGENT } from "../agent/ippo.mjs";

const ENV = new URL("../.env.local", import.meta.url);
const env = Object.fromEntries(
  (existsSync(ENV) ? readFileSync(ENV, "utf8") : "")
    .split("\n")
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
if (!env.LOANPILOT_AGENTS_API_KEY) {
  console.error("Add LOANPILOT_AGENTS_API_KEY=ippo_… to apps/voice-demo/.env.local (agent.ippo.one → Settings → API keys).");
  process.exit(1);
}

const client = new LoanpilotAgents({ apiKey: env.LOANPILOT_AGENTS_API_KEY, ...(env.LOANPILOT_AGENTS_URL ? { baseUrl: env.LOANPILOT_AGENTS_URL } : {}) });

const agent = env.IPPO_AGENT_ID ? await client.agents.update(env.IPPO_AGENT_ID, AGENT) : await client.agents.create(AGENT);
console.log(`${env.IPPO_AGENT_ID ? "Updated" : "Created"} agent ${agent.id} (${agent.name})`);

if (!env.IPPO_AGENT_ID) {
  writeFileSync(ENV, readFileSync(ENV, "utf8").replace(/\n?$/, "\n") + `IPPO_AGENT_ID=${agent.id}\n`);
  console.log("Saved IPPO_AGENT_ID to .env.local");
}
