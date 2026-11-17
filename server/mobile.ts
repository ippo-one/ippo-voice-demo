// Backend for the Flutter app (ippo-voice-demo-flutter). The app uses the ippo_loanpilot Dart SDK with its
// baseUrl pointed here, so the lp_live_ key never ships in the APK: this proxy forwards only the calls the
// demo needs (customer, credit check, statement analysis, Account Aggregator), adds the real key, and binds every request to the demo's applicant (TEST_NAME / TEST_MOBILE),
// the way a real backend binds requests to the logged-in borrower. Voice calls use the existing
// /live/connect (the app's IppoAgents.tokenProvider). Logged as [lp-proxy] in logs/live.log.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { LpEnv } from "./lp";

type Log = (src: string, what: string, data?: unknown) => void;

/** The only LoanPilot calls the app may make. */
const ALLOWED: [string, RegExp][] = [
  ["POST", /^\/customers$/],
  ["POST", /^\/customers\/[\w-]+\/attach$/],
  ["POST", /^\/credit-checks$/],
  ["POST", /^\/analyses$/],
  ["GET", /^\/analyses\/[\w-]+$/],
  ["POST", /^\/aa\/consents$/],
  ["GET", /^\/aa\/consents\/[\w-]+$/],
  ["POST", /^\/aa\/consents\/[\w-]+\/(refresh|analyse)$/],
];

const redact = (t: string) =>
  t
    .replace(/lp_live_[A-Za-z0-9_-]+/g, "lp_live_…")
    .replace(/("pan"\s*:\s*"[A-Z]{5})[^"]*/g, "$1•••••")
    .replace(/("mobile"\s*:\s*")\d+(\d{4})"/g, "$1••••••$2\"");

function readRaw(req: IncomingMessage): Promise<Buffer> {
  return new Promise((done, fail) => {
    const parts: Buffer[] = [];
    req.on("data", (c) => parts.push(c));
    req.on("end", () => done(Buffer.concat(parts)));
    req.on("error", fail);
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

const isLoopback = (a?: string) => a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";

export function mobileRoutes(env: LpEnv, log: Log) {
  const base = (env.baseUrl ?? "https://api.ippo.one/v1").replace(/\/$/, "");

  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = req.url ?? "";
    if (!url.startsWith("/v1/")) return false;
    // a demo backend with no borrower login: only this machine (or a phone/emulator over `adb reverse`)
    if (!isLoopback(req.socket.remoteAddress)) return send(res, 403, { detail: "This demo backend only answers on localhost." }), true;
    if (!env.key) return send(res, 400, { detail: "LOANPILOT_API_KEY is missing in .env.local" }), true;

    const [path, query = ""] = url.slice(3).split("?");
    const method = req.method ?? "GET";
    if (!ALLOWED.some(([m, re]) => m === method && re.test(path))) {
      log("lp-proxy", `✗ blocked ${method} /v1${path}`);
      return send(res, 403, { detail: `${method} /v1${path} is not allowed from the app` }), true;
    }

    let body: Buffer | string | undefined = method === "GET" ? undefined : await readRaw(req);
    const type = req.headers["content-type"] ?? "";
    // the applicant is the backend's to decide, never the app's: overwrite name and mobile
    if (body && type.includes("application/json") && (path === "/customers" || path === "/credit-checks")) {
      const j = JSON.parse(body.toString() || "{}");
      body = JSON.stringify({ ...j, name: env.name, mobile: env.mobile });
    }
    if (body && type.includes("application/json") && path === "/aa/consents") {
      // the consent SMS goes to the applicant's own mobile
      const j = JSON.parse(body.toString() || "{}");
      body = JSON.stringify({ ...j, mobile: env.mobile });
    }

    const t0 = Date.now();
    log("lp-proxy", `→ ${method} /v1${path}${query ? "?" + query : ""}`, typeof body === "string" ? redact(body).slice(0, 300) : body ? `(upload ${Math.round(body.length / 1024)} KB)` : undefined);
    try {
      const r = await fetch(`${base}${path}${query ? "?" + query : ""}`, {
        method,
        headers: { authorization: `Bearer ${env.key}`, ...(type ? { "content-type": type } : {}), accept: "application/json" },
        body: body as BodyInit | undefined,
      });
      const text = await r.text();
      log("lp-proxy", `← ${r.status} ${method} /v1${path} ${Date.now() - t0}ms`, redact(text).slice(0, 500));
      res.statusCode = r.status;
      res.setHeader("content-type", r.headers.get("content-type") ?? "application/json");
      res.end(text);
    } catch (e) {
      log("lp-proxy", `✗ ${method} /v1${path} network error`, `${String(e)} ${String((e as { cause?: unknown }).cause ?? "")}`);
      send(res, 502, { detail: "Could not reach LoanPilot" });
    }
    return true;
  };
}
