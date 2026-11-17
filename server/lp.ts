// Server side of the real loan steps: the LoanPilot SDK (@ippopone/loanpilot) on app.ippo.one.
// The browser calls /lp/*; the lp_live_ key stays here.
// Every SDK request is logged as [lp-sdk] in logs/live.log, next to the voice call.
import type { IncomingMessage, ServerResponse } from "node:http";
import { LoanPilot } from "@ippopone/loanpilot";

export type LpEnv = { key?: string; baseUrl?: string; name?: string; mobile?: string };
type Log = (src: string, what: string, data?: unknown) => void;

const redact = (t: string) =>
  t
    .replace(/lp_live_[A-Za-z0-9_-]+/g, "lp_live_…")
    .replace(/("token"\s*:\s*")[^"]+/g, "$1…")
    .replace(/("pan"\s*:\s*"[A-Z]{5})[^"]*/g, "$1•••••")
    .replace(/("mobile"\s*:\s*")\d+(\d{4})"/g, "$1••••••$2\"");

function loggedFetch(log: Log): typeof fetch {
  return async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    const path = url.replace(/^https?:\/\/[^/]+/, "");
    const body = init?.body;
    const t0 = Date.now();
    log("lp-sdk", `→ ${method} ${path}`, typeof body === "string" ? redact(body).slice(0, 300) : body ? "(file upload)" : undefined);
    try {
      const res = await fetch(input, init);
      const text = await res.clone().text();
      log("lp-sdk", `← ${res.status} ${method} ${path} ${Date.now() - t0}ms`, redact(text).slice(0, 500));
      return res;
    } catch (e) {
      log("lp-sdk", `✗ ${method} ${path} ${Date.now() - t0}ms network error`, String(e));
      throw e;
    }
  };
}

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

const errOf = (e: unknown) => {
  const x = e as { status?: number; message?: string; code?: string; detail?: unknown };
  return { status: x.status && x.status < 600 ? x.status : 502, error: x.message ?? String(e), code: x.code };
};

/** The pieces of a finished analysis the demo shows and Ippo says. */
function summarise(a: Record<string, any>) {
  const r = (a.result ?? {}) as Record<string, any>;
  const dec = (r.decision ?? {}) as Record<string, any>;
  const o = (dec.loan_offer ?? {}) as Record<string, any>;
  return {
    id: a.id,
    ref: a.ref,
    status: a.status,
    error: a.error ?? null,
    bank: a.bank_name ?? r.account?.bank_name ?? null,
    account: a.account_name ?? r.account?.name ?? null,
    decision: a.decision ?? dec.decision ?? null,
    score: a.score ?? dec.final_score ?? null,
    from: r.account?.period_from ?? null,
    to: r.account?.period_to ?? null,
    offer: o && typeof o.amount === "number" ? { amount: o.amount, emi: o.emi, rate: o.rate, tenure: o.tenure_months, needsReview: o.needs_review, reason: o.reason } : null,
  };
}

export function lpRoutes(env: LpEnv, log: Log) {
  const client = () => new LoanPilot({ apiKey: env.key!, fetch: loggedFetch(log), ...(env.baseUrl ? { baseUrl: env.baseUrl } : {}) });
  const who = { name: env.name ?? "", mobile: env.mobile ?? "" };

  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = req.url ?? "";
    if (!url.startsWith("/lp/")) return false;
    if (!env.key) return send(res, 400, { error: "LOANPILOT_API_KEY is missing in .env.local" }), true;
    if (!who.name || !who.mobile) return send(res, 400, { error: "TEST_NAME and TEST_MOBILE are missing in .env.local" }), true;

    try {
      // PAN: find or create the customer, then pull credit (Experian; Equifax if Experian fails)
      if (url === "/lp/pan" && req.method === "POST") {
        const { pan } = JSON.parse((await readRaw(req)).toString() || "{}");
        log("demo", "── real PAN check ──", { pan: String(pan).slice(0, 5) + "•••••", name: who.name, mobile: "••••" + who.mobile.slice(-4) });
        const lp = client();
        const customer = await lp.customers.create({ pan, name: who.name, mobile: who.mobile });
        let check: Record<string, any> | null = null;
        let bureau = "experian";
        let bureauError: string | null = null;
        for (const b of ["experian", "equifax"]) {
          try {
            // `bureau` and `pan` are accepted by the API; the SDK's types don't list them yet
            check = (await lp.creditChecks.create({ name: who.name, mobile: who.mobile, consent: true, bureau: b, pan } as never)) as Record<string, any>;
            bureau = b;
            break;
          } catch (e) {
            bureauError = errOf(e).error;
            log("demo", `${b} failed${b === "experian" ? ", trying Equifax" : ""}`, bureauError);
          }
        }
        const out = {
          customer: { id: customer.id, ref: (customer as any).ref, name: (customer as any).name ?? who.name },
          credit: check
            ? (() => {
                // the API nests the summary under `bureau` (the SDK's CreditCheck type says top level: SDK type bug)
                const k = { ...check, ...((check.bureau as Record<string, any>) ?? {}) };
                return { bureau, score: k.score ?? null, activeLoans: k.active_loans ?? null, outstanding: k.total_outstanding ?? null, overdue: k.total_overdue ?? k.overdue_amount ?? null, writtenOff: k.written_off_accounts ?? k.written_off ?? null, reused: Boolean(check.reused) };
              })()
            : null,
          creditError: check ? null : bureauError,
        };
        log("demo", "PAN check result", out);
        return send(res, 200, out), true;
      }

      // a statement PDF from the card: start the analysis (the browser polls /lp/analysis/:id)
      if (url.startsWith("/lp/upload") && req.method === "POST") {
        const q = new URL(url, "http://x").searchParams;
        const file = await readRaw(req);
        const fileName = q.get("name") || "statement.pdf";
        log("demo", "── real statement upload ──", { file: fileName, kb: Math.round(file.length / 1024) });
        const a = await client().analyses.create({
          file: new Uint8Array(file),
          fileName,
          password: q.get("password") || undefined,
          inputs: q.get("amount") ? { requested_amount: Number(q.get("amount")) } : undefined,
        });
        if (q.get("customer")) {
          try {
            await client().customers.attach(q.get("customer")!, { kind: "analysis", id: a.id });
          } catch (e) {
            log("demo", "attach to customer failed", errOf(e).error);
          }
        }
        return send(res, 200, summarise(a as never)), true;
      }

      // Account Aggregator (Finpass), through the SDK's `aa` resource (0.4.0+)
      if (url === "/lp/aa" && req.method === "POST") {
        const body = JSON.parse((await readRaw(req)).toString() || "{}");
        log("demo", "── real AA consent (Finpass) ──", { mobile: "••••" + who.mobile.slice(-4), customer: body.customer ?? null });
        const c = await client().aa.start({
          mobile: who.mobile,
          fi_months: 6,
          ...(body.customer ? { customer: body.customer } : {}),
          ...(body.amount ? { inputs: { requested_amount: Number(body.amount) } } : {}),
        });
        return send(res, 201, c), true;
      }
      const aa = url.match(/^\/lp\/aa\/([\w-]+)(\?refresh=1)?$/);
      if (aa && req.method === "GET") {
        const lp = client();
        // a plain read; "refresh" (rate-limited) forces the server to ask Finpass now, its poll loop does it anyway
        let c = aa[2] ? await lp.aa.refresh(aa[1]).catch(() => lp.aa.get(aa[1])) : await lp.aa.get(aa[1]);
        // "ready": the bank sent the statements and they wait to be picked; take them all
        if (c.status === "ready" && !c.analyses.length) {
          const names = c.statements.map((s) => s.name).filter((n): n is string => Boolean(n));
          log("demo", "AA ready, analysing", { statements: names.length });
          c = await lp.aa.analyse(aa[1], names);
        }
        const first = c.analyses[0];
        const analysis = first?.id ? summarise((await lp.analyses.get(first.id, { includeResult: true })) as never) : null;
        return send(res, 200, { consent: c, analysis }), true;
      }

      const m = url.match(/^\/lp\/analysis\/([\w-]+)$/);
      if (m && req.method === "GET") {
        const a = await client().analyses.get(m[1], { includeResult: true });
        const s = summarise(a as never);
        if (s.status === "completed" || s.status === "failed") log("demo", `analysis ${s.status}`, s);
        return send(res, 200, s), true;
      }
    } catch (e) {
      const x = errOf(e);
      log("demo", `✗ ${url} failed`, x);
      return send(res, x.status, x), true;
    }
    return false;
  };
}
