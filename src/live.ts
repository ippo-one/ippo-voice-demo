// The call with Ippo: /live/connect starts it on agent.ippo.one (via @ippopone/agents-sdk on the server);
// here the browser joins the call$.room, plays Ippo's voice, sends the mic, and turns the bot's data
// messages into chat turns and cards.
import { DisconnectReason, Room, RoomEvent, Track } from "livekit-client";
import type { Dispatch } from "react";
import type { Action, StepId } from "./flow";
import { STEPS } from "./steps";

// The call lives on window, not in this module: in dev, editing this file hot-swaps the module, and a
// module-level variable would forget the running call (taps then go nowhere).
const kept = window as unknown as { __ippoCall?: { room: Room | null; callId: string | null; customer?: string; amount?: number; lastSaid?: string } };
kept.__ippoCall ??= { room: null, callId: null };
const call$ = kept.__ippoCall;

/* Call events go to the dev server's log (logs/live.log), next to the SDK's requests. */
let queue: { what: string; data?: unknown; t: number }[] = [];
let flushing: ReturnType<typeof setTimeout> | null = null;
function trace(what: string, data?: unknown) {
  queue.push({ what, data, t: Date.now() }); // the browser's own time: background tabs send late
  flushing ??= setTimeout(() => {
    const events = queue;
    queue = [];
    flushing = null;
    void fetch("/live/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ events }) }).catch(() => {});
  }, 300);
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function publish(msg: unknown) {
  if (!call$.room) return trace("✗ not sent, no call", msg);
  call$.room.localParticipant.publishData(enc.encode(JSON.stringify(msg)), { reliable: true }).catch((e) => trace("✗ send failed", String(e)));
}

export async function startCall(d: Dispatch<Action>) {
  dispatch = d;
  await endCall();
  d({ type: "live", live: { status: "connecting", error: undefined, botSpeaking: false } });
  try {
    // presenter-only: ?outcome=pan|upload|locked|none picks the demo scenario Ippo plays
    const outcome = new URLSearchParams(location.search).get("outcome") ?? "aa";
    trace("calling Ippo", { outcome, browser: (["Edg", "Chrome", "Firefox", "Version"].map((b) => navigator.userAgent.match(new RegExp(b + "/[\\d.]+"))).find(Boolean) ?? [navigator.userAgent])[0] });
    const r = await fetch("/live/connect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ outcome }) });
    const call = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(call.error ?? `Could not reach Ippo (${r.status})`);
    call$.callId = call.callId;

    const rm = new Room();
    call$.room = rm;
    let heartbeats = 0;
    const seen = new Set<string | undefined>();
    rm.on(RoomEvent.ConnectionStateChanged, (st) => trace("room " + st));
    rm.on(RoomEvent.ParticipantConnected, (p) => trace("joined: " + p.identity));
    rm.on(RoomEvent.ParticipantDisconnected, (p) => {
      trace("left: " + p.identity);
      // the bot hung up (idle timeout, error): end our side too, so the screen says "Call ended"
      if (p.identity.startsWith("bot-")) void endCall();
    });
    rm.on(RoomEvent.Reconnecting, () => trace("reconnecting…"));
    rm.on(RoomEvent.Reconnected, () => trace("reconnected"));
    rm.on(RoomEvent.MediaDevicesError, (e) => trace("✗ mic error", String(e)));
    rm.on(RoomEvent.AudioPlaybackStatusChanged, () => trace(rm.canPlaybackAudio ? "audio playback ok" : "✗ audio blocked by the browser (needs a tap)"));
    rm.on(RoomEvent.ConnectionQualityChanged, (q, p) => q === "poor" && trace("poor connection: " + p.identity));
    rm.on(RoomEvent.TrackSubscribed, (track, _pub, p) => {
      trace(`track: ${track.kind} from ${p.identity}`);
      if (track.kind !== Track.Kind.Audio) return;
      const el = track.attach();
      el.style.display = "none";
      document.body.appendChild(el);
    });
    rm.on(RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((el) => el.remove()));
    rm.on(RoomEvent.DataReceived, (payload) => {
      let m: Record<string, any>;
      try {
        m = JSON.parse(dec.decode(payload));
      } catch {
        return trace("✗ bad data message", dec.decode(payload).slice(0, 200));
      }
      if (m.type === "heartbeat") {
        if (++heartbeats % 10 === 1) trace(`bot heartbeat #${heartbeats}`);
        return;
      }
      if (m.type === "bot-speaking") trace(m.speaking ? "Ippo speaking" : "Ippo stopped");
      else if (m.final && (m.type === "bot-transcript" || m.type === "user-transcript")) trace(m.type === "bot-transcript" ? "Ippo said" : "user said", m.text);
      else if (m.label === "rtvi-ai" && m.type === "llm-function-call-in-progress") trace("tool call", { name: m.data?.function_name, args: m.data?.arguments });
      // the bot's turn lifecycle: every time, so a stall shows exactly where it stopped
      else if (m.label === "rtvi-ai" && /^(user-(started|stopped)-speaking|user-mute-(started|stopped)|bot-llm-(started|stopped)|llm-function-call-(started|stopped)|bot-interrupted|error|bot-error)$/.test(m.type))
        trace("· " + m.type, m.type === "llm-function-call-stopped" ? { result: m.data?.result, cancelled: m.data?.cancelled } : m.type.includes("error") ? m.data : undefined);
      else if (m.type === "tool-status") trace("· tool " + m.status, m.tool);
      else if (!/transcript/.test(m.type ?? "") && !seen.has(m.type)) {
        // other bot messages (RTVI metrics, LLM tokens…): log each kind once, not every frame
        seen.add(m.type);
        trace("data (first of its kind): " + (m.type ?? m.label ?? "?"), JSON.stringify(m).slice(0, 300));
      }

      // live feedback: Ippo is thinking from the end of the user's turn until it starts speaking
      if (m.label === "rtvi-ai" && (m.type === "user-stopped-speaking" || m.type === "bot-llm-started"))
        d({ type: "live", live: { thinkingSince: Date.now(), turnError: undefined } });
      if (m.label === "rtvi-ai" && m.type === "error") d({ type: "live", live: { thinkingSince: undefined, turnError: String(m.data?.error ?? "error") } });

      if (m.type === "bot-speaking") d({ type: "live", live: { botSpeaking: Boolean(m.speaking), ...(m.speaking ? { thinkingSince: undefined, turnError: undefined } : {}) } });
      else if (m.label === "rtvi-ai" && m.type === "bot-tts-text" && m.data?.text?.trim()) d({ type: "saying", text: m.data.text.trim() });
      else if (m.type === "bot-transcript" && m.final && m.text?.trim()) d({ type: "said", text: m.text.trim() });
      else if (m.type === "user-transcript" && m.final && m.text?.trim()) {
        call$.lastSaid = m.text.trim();
        d({ type: "user", user: { kind: "say", text: m.text.trim() } });
      }
      else if (m.label === "rtvi-ai" && m.type === "llm-function-call-in-progress" && m.data?.function_name) {
        const { tool_call_id, function_name, arguments: args } = m.data;
        void (async () => {
          const result = await runTool(function_name, args ?? {}, d).catch((e) => `The ${function_name} tool failed: ${String(e)}`);
          trace("tool result", result);
          // The bot announces the tool call a moment BEFORE it starts waiting for the answer; an instant
          // answer arrives first and is dropped ("No pending client tool"), leaving the bot waiting its full
          // 30 s with the user muted. So answer a beat later, and once more in case that was still early
          // (a late duplicate is ignored by the bot).
          for (const ms of [350, 1500]) setTimeout(() => publish({ type: "client-tool-result", tool_call_id, result }), ms);
        })();
      }
    });
    rm.on(RoomEvent.Disconnected, (reason) => {
      trace("call ended", { reason: reason === undefined ? "unknown" : DisconnectReason[reason], callId: call$.callId });
      if (call$.callId) void fetch(`/live/ended/${call$.callId}`, { method: "POST" }).catch(() => {});
      if (call$.room === rm) call$.room = null;
      d({ type: "live", live: { status: "idle", botSpeaking: false } });
    });

    await rm.connect(call.livekitUrl, call.token);
    trace("in room", { room: rm.name, others: [...rm.remoteParticipants.values()].map((p) => p.identity) });
    await rm.localParticipant.setMicrophoneEnabled(true);
    trace("mic on", rm.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack.label ?? "?");
    d({ type: "live", live: { status: "on" } });
  } catch (e) {
    trace("✗ call failed", e instanceof Error ? e.message : String(e));
    await endCall();
    d({ type: "live", live: { status: "error", error: e instanceof Error ? e.message : String(e), botSpeaking: false } });
  }
}

/** Steps that carry on by themselves: a running check, or the note before the lender's page opens. */
const GOES_ON = new Set(["checkCredit", "upDone", "checkBank", "applyNote"]);

const inr = (n: unknown) => (typeof n === "number" ? "₹" + n.toLocaleString("en-IN") : "unknown");

/** check_pan: the real PAN + credit check on app.ippo.one (LoanPilot SDK, via the demo server). */
async function checkPan(args: Record<string, unknown>, d: Dispatch<Action>): Promise<string> {
  const pan = String(args.pan ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) return `"${pan}" is not a valid PAN (5 letters, 4 digits, 1 letter). Ask them to type it again in the PAN card.`;
  d({ type: "step", step: "checkCredit" });
  const r = await fetch("/lp/pan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pan }) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) {
    d({ type: "step", step: "credit", data: { error: b.error ?? `HTTP ${r.status}` } });
    return `The PAN check failed on LoanPilot: ${b.error ?? r.status}. Tell them plainly in one sentence and offer to try again.`;
  }
  call$.customer = b.customer?.id;
  d({ type: "step", step: "credit", data: b });
  const c = b.credit;
  const next = `Then ask how they want to share 6 months of bank statements (Account Aggregator or PDF upload), and call show_step("bankChoice").`;
  return c
    ? `PAN verified for ${b.customer?.name} (${b.customer?.ref}). ${c.bureau === "equifax" ? "Equifax" : "Experian"} credit score ${c.score ?? "not available"}, ${c.activeLoans ?? 0} active loans, ${inr(c.outstanding)} outstanding, ${inr(c.overdue)} overdue. The credit card is on screen. In one or two short sentences tell them their score and what it means. ${next}`
    : `PAN verified for ${b.customer?.name} (${b.customer?.ref}), but the credit report could not be pulled: ${b.creditError}. Say so in one sentence. ${next}`;
}

/** A statement PDF from the card: upload it to LoanPilot, follow the analysis, and tell Ippo the real result. */
export async function uploadStatement(file: File, password: string | undefined, onStatus: (s: string) => void, d: Dispatch<Action>) {
  d({ type: "user", user: { kind: "file", name: file.name, note: `Uploaded · ${Math.max(1, Math.round(file.size / 1024))} KB` } });
  send(`[tap] I uploaded my bank statement ${file.name}. Say you are analysing it; the result comes in a moment.`);
  onStatus("Uploading…");
  const q = new URLSearchParams({ name: file.name, ...(password ? { password } : {}), ...(call$.customer ? { customer: call$.customer } : {}), ...(call$.amount ? { amount: String(call$.amount) } : {}) });
  const r = await fetch(`/lp/upload?${q}`, { method: "POST", body: file });
  const a = await r.json().catch(() => ({}));
  if (!r.ok) {
    onStatus(`Upload failed: ${a.error ?? r.status}`);
    return send(`[system] LoanPilot could not take the statement: ${a.error ?? r.status}. Tell them plainly and ask them to try another PDF.`);
  }
  trace("statement analysis started", { id: a.id, ref: a.ref });
  return followAnalysis(a, onStatus, d);
}

/** Poll an analysis until it finishes, then show the real offer and tell Ippo the result. */
async function followAnalysis(a: { id: string; ref?: string }, onStatus: (s: string) => void, d: Dispatch<Action>) {
  const t0 = Date.now();
  for (;;) {
    onStatus(`Analysing ${a.ref ?? ""}… ${Math.round((Date.now() - t0) / 1000)} s`);
    await new Promise((ok) => setTimeout(ok, 3000));
    const s = await fetch(`/lp/analysis/${a.id}`).then((x) => x.json()).catch(() => null);
    if (!s) continue;
    if (s.status === "completed") {
      onStatus("Analysed");
      d({ type: "step", step: "realOffer", data: s });
      const o = s.offer;
      return send(
        `[system] LoanPilot analysed the statement (${s.ref}${s.bank ? `, ${s.bank}` : ""}${s.from ? `, ${s.from} to ${s.to}` : ""}). Decision: ${s.decision ?? "none"}. ` +
          (o && o.amount > 0
            ? `Offer: ${inr(o.amount)} at ${inr(o.emi)} a month for ${o.tenure} months, ${Math.round((o.rate ?? 0) * 1000) / 10}% a year${o.needsReview ? ", subject to an officer's review" : ""}.`
            : `No loan can be offered now${o?.reason ? `: ${o.reason}` : ""}.`) +
          ` The offer card is on screen. Tell them the result in two short sentences and ask if they want to apply.`,
      );
    }
    if (s.status === "failed") {
      onStatus(`Analysis failed: ${s.error ?? "unknown"}`);
      return send(`[system] LoanPilot could not analyse the statement: ${s.error ?? "unknown error"}. Tell them plainly and ask for another PDF.`);
    }
    if (Date.now() - t0 > 6 * 60_000) {
      onStatus("Still analysing — taking long");
      return send(`[system] The analysis is taking longer than usual. Tell them it is still running.`);
    }
  }
}

/** start_aa: a real Finpass consent link by SMS (the web app's /api/aa, not in the SDK yet). The card follows it. */
async function startAa(d: Dispatch<Action>): Promise<string> {
  const r = await fetch("/lp/aa", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ customer: call$.customer, amount: call$.amount }) });
  const c = await r.json().catch(() => ({}));
  if (!r.ok) {
    d({ type: "step", step: "aa", data: { error: c.error ?? `HTTP ${r.status}` } });
    return `Sending the Account Aggregator link failed: ${c.error ?? r.status}. Say so in one sentence and offer the PDF upload instead (show_step("statement")).`;
  }
  d({ type: "step", step: "aa", data: { consent: c } });
  return `A real ${c.provider === "finpass" ? "Finpass" : "SAAFE"} consent link was sent by SMS to the number ending ${String(c.mobile ?? "").slice(-4)}. The card shows it with a live status. Tell them to open the SMS link (or tap Open link on the card), pick their bank and approve. Then wait: a "[system]" message brings the result.`;
}

/** Follow an AA consent until the statement is fetched and analysed (called by the AA card). */
export async function followAa(id: string, onConsent: (c: Record<string, any>) => void, d: Dispatch<Action>) {
  const t0 = Date.now();
  let last = "";
  for (let n = 1; ; n++) {
    await new Promise((ok) => setTimeout(ok, 6000));
    // a forced refresh only every 5th check (the server rate-limits refresh; its own poll loop advances it too)
    const r = await fetch(`/lp/aa/${id}${n % 5 === 0 ? "?refresh=1" : ""}`).then((x) => x.json()).catch(() => null);
    if (!r?.consent) continue;
    const c = r.consent;
    onConsent(c);
    if (c.status !== last) trace("AA status " + c.status, c.error ?? undefined);
    // only "fetching" is worth saying; "completed" is NOT sent: the analysis result (or failure) follows, and a bare
    // "completed" made Ippo invent an offer
    if (c.status !== last && last && c.status === "fetching")
      send(`[system] Account Aggregator: they approved and the bank is sending the statement. Say so briefly. There is no result yet.`);
    last = c.status;
    if (c.status === "completed" && r.analysis) {
      return followAnalysis(r.analysis, () => {}, d);
    }
    if (["failed", "rejected", "cancelled"].includes(c.status))
      return send(`[system] The Account Aggregator request ${c.status}: ${c.error ?? "no reason given"}. Tell them plainly and offer the PDF upload (show_step("statement")).`);
    if (Date.now() - t0 > 15 * 60_000) return send(`[system] The Account Aggregator approval is still pending after 15 minutes.`);
  }
}

async function runTool(name: string, args: Record<string, unknown>, d: Dispatch<Action>): Promise<string> {
  if (name === "check_pan") return checkPan(args, d);
  if (name === "start_aa") return startAa(d);
  if (name !== "show_step") return `Unknown tool ${name}`;
  const step = String(args.step ?? "");
  if (step === "lender" || step === "loans") {
    d({ type: "screen", screen: step });
    return `Opened ${step}`;
  }
  if (!(step in STEPS)) return `Unknown step "${step}". Use one of: ${Object.keys(STEPS).join(", ")}, lender, loans`;
  const amount = Number(String(args.amount ?? "").replace(/[^\d.]/g, "")) || undefined;
  if (amount && step === "heard") {
    // safety net: the LLM once showed ₹1,00,000 for a typed "10000"; check against what they actually said
    const said = call$.lastSaid ? amountIn(call$.lastSaid) : null;
    if (said && said !== amount) {
      trace("✗ amount mismatch", { said, shown: amount });
      return `Wrong amount: the user said ₹${said.toLocaleString("en-IN")} but you showed ₹${amount.toLocaleString("en-IN")}. Call show_step("heard", amount ${said}) again and repeat ${said.toLocaleString("en-IN")} rupees back to them.`;
    }
    call$.amount = amount;
  }
  d({ type: "step", step: step as StepId, amount });
  // The bot runs the LLM again on this result, so the result says what to do next: after a check, go on to
  // its result; after a question card, wait — otherwise Ippo answers its own question and skips ahead.
  const shown = `Card "${step}" is on the screen${amount ? ` (₹${amount})` : ""}.`;
  return GOES_ON.has(step)
    ? `${shown} The check is done: now say its result and show the next card.`
    : `${shown} Now wait for the user's answer. Do not speak again and do not call show_step until they reply.`;
}

/** A tap or a typed line, sent to Ippo as the user's words. */
let dispatch: Dispatch<Action> | null = null;

/** The amount in the user's last words, in rupees ("10000", "2,00,000", "2 lakh", "1.5 lakh"), if any. */
function amountIn(text: string): number | null {
  const t = text.toLowerCase().replace(/,/g, "");
  const lakh = t.match(/(\d+(?:\.\d+)?)\s*(lakh|lac|லட்சம்|லேக்|लाख)/);
  if (lakh) return Math.round(parseFloat(lakh[1]) * 100000);
  const n = t.match(/\b\d{4,8}\b/);
  return n ? Number(n[0]) : null;
}

export function send(text: string) {
  call$.lastSaid = text;
  trace("user tapped/typed", text);
  // nobody to answer: the bot already left, so end the call instead of showing "thinking" forever
  if (call$.room && ![...call$.room.remoteParticipants.values()].some((p) => p.identity.startsWith("bot-"))) {
    trace("✗ not sent, Ippo already left the call");
    void endCall();
    return;
  }
  dispatch?.({ type: "live", live: { thinkingSince: Date.now(), turnError: undefined } });
  publish({ type: "chat-message", text });
}

export function setMic(on: boolean) {
  trace(on ? "mic unmuted" : "mic muted");
  call$.room?.localParticipant.setMicrophoneEnabled(on);
}

export async function endCall() {
  const rm = call$.room;
  call$.room = null;
  if (rm) {
    trace("user ended the call");
    await rm.disconnect();
  }
}

/* ── phone mode: Ippo rings the user's mobile (calls.outbound on the server) ── */
let polling: ReturnType<typeof setTimeout> | null = null;
let phoneCall: string | null = null;

export async function startPhone(to: string, d: Dispatch<Action>) {
  await endPhone();
  d({ type: "live", live: { status: "connecting", error: undefined, botSpeaking: false } });
  try {
    const outcome = new URLSearchParams(location.search).get("outcome") ?? "aa";
    trace("phone call to", to.replace(/\d{4}$/, "••••"));
    const r = await fetch("/live/phone", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ destination: to, outcome }) });
    const call = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(call.error ?? `Could not place the call (${r.status})`);
    phoneCall = call.callId;
    trace("phone call placed", { callId: phoneCall });
    let lastStatus = "";
    const tick = async () => {
      if (!phoneCall) return;
      const res = await fetch(`/live/call/${phoneCall}`).then((x) => x.json()).catch(() => null);
      if (res && !res.error) {
        if (res.status !== lastStatus) trace("phone call " + res.status, res.failure ?? undefined);
        lastStatus = res.status;
        d({ type: "transcript", lines: res.transcript });
        if (res.done) {
          phoneCall = null;
          const f = res.failure as { title?: string; whatToTry?: string } | null;
          return d({ type: "live", live: f ? { status: "error", error: [f.title, f.whatToTry].filter(Boolean).join(". "), botSpeaking: false } : { status: "idle", botSpeaking: false } });
        }
        if (res.status === "active") d({ type: "live", live: { status: "on" } });
      }
      polling = setTimeout(tick, 2000);
    };
    void tick();
  } catch (e) {
    trace("✗ phone call failed", e instanceof Error ? e.message : String(e));
    d({ type: "live", live: { status: "error", error: e instanceof Error ? e.message : String(e), botSpeaking: false } });
  }
}

export async function endPhone() {
  if (polling) clearTimeout(polling);
  polling = null;
  const id = phoneCall;
  phoneCall = null;
  if (id) await fetch(`/live/call/${id}/end`, { method: "POST" }).catch(() => {});
}
