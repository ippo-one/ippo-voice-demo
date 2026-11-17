// Server side of the call: holds the LoanPilot Agents API key and starts a voice call with the SDK.
// The browser only ever gets the room token, never the key.
// Everything is logged to logs/live.log: every SDK request/response, the browser's call events
// (sent to /live/log), and the platform's own record of the call once it ends.
import { describeFailureReason, LoanpilotAgents, TERMINAL_CALL_STATUSES } from "@ippopone/agents-sdk";
import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { lpRoutes, type LpEnv } from "./lp";
import { mobileRoutes } from "./mobile";
import { loadEnv, type Connect, type Plugin } from "vite";

type Env = { key?: string; agentId?: string; baseUrl?: string; firstName?: string; lp: LpEnv };

let LOG_FILE = "";

/** One line per event: time, where it came from, what happened, details. */
function log(src: string, what: string, data?: unknown, at?: number) {
  const now = new Date(at ?? Date.now());
  const line = `${now.toTimeString().slice(0, 8)}.${String(now.getMilliseconds()).padStart(3, "0")} [${src}] ${what}${data === undefined ? "" : " " + (typeof data === "string" ? data : JSON.stringify(data))}`;
  console.log(line);
  if (LOG_FILE) appendFileSync(LOG_FILE, line + "\n");
}

/** Room tokens and keys never go in the log. */
const redact = (text: string) => text.replace(/"token"\s*:\s*"[^"]+"/g, '"token":"…"').replace(/ippo_[A-Za-z0-9_-]+/g, "ippo_…");

/** The SDK's fetch, with every request and response logged. */
const loggedFetch: typeof fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = init?.method ?? "GET";
  const path = url.replace(/^https?:\/\/[^/]+/, "");
  const t0 = Date.now();
  log("sdk", `→ ${method} ${path}`, init?.body ? redact(String(init.body)).slice(0, 400) : undefined);
  try {
    const res = await fetch(input, init);
    const body = await res.clone().text();
    log("sdk", `← ${res.status} ${method} ${path} ${Date.now() - t0}ms`, redact(body).slice(0, 600));
    return res;
  } catch (e) {
    log("sdk", `✗ ${method} ${path} ${Date.now() - t0}ms network error`, String(e));
    throw e;
  }
};

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((done) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        done(raw ? JSON.parse(raw) : {});
      } catch {
        done({});
      }
    });
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function routes(env: Env): Connect.NextHandleFunction {
  const lp = lpRoutes(env.lp, log);
  const mobile = mobileRoutes(env.lp, log);
  const client = () => new LoanpilotAgents({ apiKey: env.key!, fetch: loggedFetch, ...(env.baseUrl ? { baseUrl: env.baseUrl } : {}) });

  return async (req, res, next) => {
    if (await lp(req, res)) return; // /lp/*: the real loan steps on app.ippo.one (LoanPilot SDK)
    if (await mobile(req, res)) return; // /v1/*: the Flutter app's LoanPilot SDK, key added here
    if (!req.url?.startsWith("/live/")) return next();
    const configured = Boolean(env.key && env.agentId);

    if (req.url === "/live/status") {
      // phone mode needs a number on the account to call from
      let phoneNumbers: { id: string; number: string }[] = [];
      if (configured) {
        try {
          phoneNumbers = (await client().phoneNumbers.list()).map((n) => ({ id: n.id, number: n.phoneNumber }));
        } catch (e) {
          log("demo", "phone numbers unavailable", String(e));
        }
      }
      return send(res, 200, { configured, hasKey: Boolean(env.key), hasAgent: Boolean(env.agentId), phoneNumbers });
    }

    // phone mode: Ippo rings the user's mobile
    if (req.url === "/live/phone" && req.method === "POST") {
      if (!configured) return send(res, 400, { error: "Ippo is not set up on this server." });
      const body = await readBody(req);
      const destination = String(body.destination ?? "").replace(/[\s-]/g, "");
      if (!/^\+[1-9]\d{7,14}$/.test(destination)) return send(res, 400, { error: "Enter the mobile number with its country code, like +91 98765 43210." });
      log("demo", "── new phone call ──", { to: destination.slice(0, -4) + "••••", outcome: body.outcome ?? "aa" });
      try {
        const numbers = await client().phoneNumbers.list();
        if (!numbers.length) return send(res, 400, { error: "No phone number on agent.ippo.one to call from." });
        const call = await client().calls.outbound(
          {
            agentId: env.agentId!,
            phoneNumberId: numbers[0].id,
            destination,
            dynamicVariables: { first_name: env.firstName ?? "Mohan", scenario: String(body.outcome ?? "aa") },
            metadata: { source: "ippo-voice-demo" },
          },
          { idempotencyKey: randomUUID() },
        );
        log("demo", "phone call placed", { callId: call.callId, from: numbers[0].phoneNumber });
        return send(res, 200, call);
      } catch (e) {
        const err = e as { status?: number; message?: string };
        log("demo", "phone call failed", { status: err.status, error: err.message });
        return send(res, err.status && err.status < 600 ? err.status : 502, { error: err.message ?? "Could not place the call" });
      }
    }

    // phone mode: the call's status and transcript so far
    const poll = req.url.match(/^\/live\/call\/([\w-]+)$/);
    if (poll && req.method === "GET" && configured) {
      try {
        const c = await client().calls.get(poll[1]);
        const raw = Array.isArray(c.transcript) ? (c.transcript as Record<string, unknown>[]) : [];
        const transcript = raw
          .map((t) => ({ role: String(t.role ?? t.speaker ?? ""), text: String(t.content ?? t.text ?? t.message ?? "").trim() }))
          .filter((t) => t.text && t.role !== "system");
        const done = (TERMINAL_CALL_STATUSES as readonly string[]).includes(c.status);
        return send(res, 200, {
          status: c.status,
          done,
          transcript,
          durationSeconds: c.durationSeconds ?? null,
          failure: c.failureReason ? describeFailureReason(c.failureReason) : null,
        });
      } catch (e) {
        const err = e as { status?: number; message?: string };
        return send(res, err.status && err.status < 600 ? err.status : 502, { error: err.message ?? "Could not read the call" });
      }
    }

    const hang = req.url.match(/^\/live\/call\/([\w-]+)\/end$/);
    if (hang && req.method === "POST" && configured) {
      log("demo", "user ended the phone call", { callId: hang[1] });
      try {
        await client().calls.end(hang[1]);
      } catch (e) {
        log("demo", "end failed", String(e));
      }
      return send(res, 200, { ok: true });
    }

    // the browser's call events, so one log shows the whole call
    if (req.url === "/live/log" && req.method === "POST") {
      const body = await readBody(req);
      const src = body.source === "app" ? "app" : "web"; // "app": the Flutter app
      for (const e of (body.events as { what: string; data?: unknown; t?: number }[]) ?? []) log(src, e.what, e.data, e.t);
      return send(res, 200, { ok: true });
    }

    if (req.url === "/live/connect" && req.method === "POST") {
      if (!configured) {
        log("demo", "connect refused: missing", { apiKey: !env.key, agentId: !env.agentId });
        return send(res, 400, { error: "Live mode is not set up: add LOANPILOT_AGENTS_API_KEY to .env.local and run pnpm agent:setup." });
      }
      const body = await readBody(req);
      log("demo", "── new call ──", { agent: env.agentId, outcome: body.outcome ?? "aa" });
      try {
        const call = await client().agents.connect(env.agentId!, {
          dynamicVariables: { first_name: env.firstName ?? "Mohan", scenario: String(body.outcome ?? "aa") },
          metadata: { source: "ippo-voice-demo" },
        });
        log("demo", "call started", { callId: call.callId, room: call.roomName, livekitUrl: call.livekitUrl });
        return send(res, 200, call);
      } catch (e) {
        const err = e as { status?: number; message?: string };
        log("demo", "connect failed", { status: err.status, error: err.message });
        return send(res, err.status && err.status < 600 ? err.status : 502, { error: err.message ?? "Could not start the call" });
      }
    }

    // after a call ends: the platform's own record (status, failure reason, transcript length)
    const ended = req.url.match(/^\/live\/ended\/([\w-]+)$/);
    if (ended && req.method === "POST" && configured) {
      send(res, 200, { ok: true });
      setTimeout(async () => {
        try {
          const c = (await client().calls.get(ended[1])) as unknown as Record<string, unknown>;
          const transcript = c.transcript as unknown[] | undefined;
          log("demo", "call record", {
            status: c.status,
            failureReason: c.failureReason ?? null,
            didConnect: c.didConnect ?? null,
            durationSeconds: c.durationSeconds ?? c.duration ?? null,
            turns: Array.isArray(transcript) ? transcript.length : null,
          });
        } catch (e) {
          log("demo", "call record unavailable", String(e));
        }
      }, 4000);
      return;
    }
    return next();
  };
}

export function livePlugin(): Plugin {
  let env: Env = { lp: {} };
  return {
    name: "ippo-live",
    configResolved(cfg) {
      const all = loadEnv(cfg.mode, cfg.root, "");
      env = {
        key: all.LOANPILOT_AGENTS_API_KEY,
        agentId: all.IPPO_AGENT_ID,
        baseUrl: all.LOANPILOT_AGENTS_URL,
        firstName: (all.TEST_NAME ?? "Mohan").split(" ")[0],
        lp: { key: all.LOANPILOT_API_KEY, baseUrl: all.LOANPILOT_URL, name: all.TEST_NAME, mobile: all.TEST_MOBILE },
      };
      LOG_FILE = resolve(cfg.root, "logs/live.log");
      mkdirSync(dirname(LOG_FILE), { recursive: true });
      log("demo", "server up", { apiKey: Boolean(env.key), agentId: env.agentId ?? null, baseUrl: env.baseUrl ?? "https://agent.ippo.one" });
    },
    configureServer(server) {
      server.middlewares.use(routes(env));
    },
    configurePreviewServer(server) {
      server.middlewares.use(routes(env));
    },
  };
}
