// The call with Ippo as a chat: Ippo's words and the user's words as they are heard, and the
// cards Ippo puts on the phone. Every turn stays in the thread; only the newest card takes taps.
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFlow, type Turn, type UserBit } from "./flow";
import { endCall, endPhone, send, setMic, startCall, startPhone } from "./live";
import { STEPS, type Ctx } from "./steps";
import { Btn, Glow, HomeIndicator, Icon, IppoMark, StatusBar, TopBar, cx } from "./ui";

/** What a tap means as words, for Ippo. */
function asWords(user: UserBit): string {
  return user.kind === "file" ? `I added the file ${user.name}` : user.text;
}

/** Card actions: show what was tapped in the chat and tell Ippo; Ippo decides what comes next. */
export function useCtx(active: boolean, amount?: number, data?: Record<string, any>): Ctx {
  const { d } = useFlow();
  return useMemo(
    () => ({
      active,
      amount,
      data,
      tap: (user: UserBit) => {
        d({ type: "user", user });
        send(`[tap] ${asWords(user)}`);
      },
      screen: (screen) => d({ type: "screen", screen }),
      end: () => {
        void endCall();
        void endPhone();
        d({ type: "restart" });
      },
    }),
    [active, amount, data, d],
  );
}

/** Bold the rupee amounts in a line. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(₹\s?[\d,]+)/g).map((p, i) =>
        p.startsWith("₹") ? (
          <b key={i} className="font-semibold tabular">
            {p}
          </b>
        ) : (
          p
        ),
      )}
    </>
  );
}

function UserLine({ bit }: { bit: UserBit }) {
  if (bit.kind === "note")
    return (
      <div className="flex justify-center py-1">
        <span
          className={cx(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold",
            bit.tone === "ok" ? "bg-ok-soft text-ok" : bit.tone === "bad" ? "bg-bad-soft text-bad" : "bg-soft text-muted",
          )}
        >
          {bit.tone === "ok" && <Icon name="check" size={13} stroke={2.6} />}
          {bit.tone === "bad" && <Icon name="close" size={12} stroke={2.6} />}
          {bit.text}
        </span>
      </div>
    );
  if (bit.kind === "file")
    return (
      <div className="flex justify-end">
        <div className="flex items-center gap-3 rounded-[20px] rounded-br-md border border-line bg-white p-2.5 pr-4 shadow-sm">
          <span className={cx("grid size-9 place-items-center rounded-xl text-[10px] font-bold text-white", bit.locked ? "bg-bad" : "bg-[#e5484d]")}>{bit.locked ? <Icon name="lock" size={15} /> : "PDF"}</span>
          <span>
            <span className="block text-[13px] font-semibold">{bit.name}</span>
            <span className={cx("block text-[11.5px]", bit.locked ? "text-bad" : "text-muted")}>{bit.note}</span>
          </span>
        </div>
      </div>
    );
  return (
    <div className="flex justify-end">
      <span className={cx("max-w-[82%] rounded-[22px] rounded-br-md bg-ippo-500 px-4 py-2.5 text-[15px] text-white shadow-[0_6px_16px_-8px_rgba(236,86,8,.6)]", bit.mono && "font-mono tracking-[0.12em]")}>{bit.text}</span>
    </div>
  );
}

function TurnView({ turn, newest, speaking }: { turn: Turn; newest: boolean; speaking: boolean }) {
  const step = turn.step ? STEPS[turn.step] : null;
  const ctx = useCtx(newest, turn.amount, turn.data);
  const words = turn.said ? turn.said.split(" ") : [];
  return (
    <div className="flex flex-col gap-3">
      {turn.user && (
        <motion.div initial={newest ? { opacity: 0, y: 8 } : false} animate={{ opacity: 1, y: 0 }}>
          <UserLine bit={turn.user} />
        </motion.div>
      )}
      {turn.said && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-ippo-700">
            <IppoMark size={20} live={newest && speaking} /> Ippo
          </div>
          <p className="text-[19px] leading-[1.38] tracking-[-0.01em] text-ink">
            {words.map((w, i) => (
              <motion.span key={i} initial={newest ? { opacity: 0, filter: "blur(4px)" } : false} animate={{ opacity: 1, filter: "blur(0px)" }} transition={{ delay: i * 0.05, duration: 0.3 }}>
                <Rich text={w} />{" "}
              </motion.span>
            ))}
          </p>
        </div>
      )}
      {step && (
        <motion.div initial={newest ? { opacity: 0, y: 14 } : false} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 260, damping: 26 }}>
          {step.card(ctx)}
        </motion.div>
      )}
    </div>
  );
}

type BarState = "speaking" | "listening" | "checking" | "muted" | "off";

function VoiceBar({ state, hint, onMute, onSend }: { state: BarState; hint: string; onMute: () => void; onSend: (t: string) => void }) {
  const [typing, setTyping] = useState(false);
  const [v, setV] = useState("");
  return (
    <div className="relative z-20 px-4 pb-7">
      <AnimatePresence mode="wait">
        <motion.p key={hint} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-3 min-h-5 text-center text-[14px] font-medium text-ink-2/80">
          {hint}
        </motion.p>
      </AnimatePresence>
      <div className="flex h-[66px] items-center gap-2 rounded-full border border-white/80 bg-white/70 p-2 shadow-[0_10px_30px_-12px_rgba(236,86,8,.45)] backdrop-blur-xl">
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => setTyping((x) => !x)} aria-label="Type instead" className={cx("grid size-[50px] shrink-0 place-items-center rounded-full", typing ? "bg-ink text-white" : "bg-soft text-ink")}>
          <Icon name={typing ? "close" : "keyboard"} size={20} />
        </motion.button>
        {typing ? (
          <form
            className="flex h-full flex-1 items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (v.trim()) onSend(v.trim());
              setV("");
            }}
          >
            <input autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder="Message Ippo" className="h-full min-w-0 flex-1 rounded-full bg-white px-4 text-[15px] outline-none" />
            <button className="grid size-[50px] shrink-0 place-items-center rounded-full bg-ippo-500 text-white" aria-label="Send">
              <Icon name="send" size={19} />
            </button>
          </form>
        ) : (
          <>
            <Wave state={state} />
            <motion.button whileTap={{ scale: 0.9 }} onClick={onMute} aria-label={state === "muted" ? "Unmute" : "Mute"} className={cx("grid size-[50px] shrink-0 place-items-center rounded-full", state === "muted" ? "bg-ink text-white" : "bg-soft text-ink")}>
              <Icon name={state === "muted" ? "play" : "pause"} size={20} stroke={2.4} />
            </motion.button>
          </>
        )}
      </div>
    </div>
  );
}

/** The orange glow inside the bar: flows while Ippo speaks, breathes while listening, dots while checking. */
function Wave({ state }: { state: BarState }) {
  const still = state === "muted" || state === "off";
  return (
    <div className="relative flex h-full flex-1 items-center justify-center overflow-hidden rounded-full bg-[linear-gradient(180deg,#fff,#fff6ef)]">
      <motion.div
        className="absolute -bottom-6 left-1/2 h-16 w-3/4 -translate-x-1/2 rounded-full bg-ippo-400 blur-2xl"
        animate={{ opacity: still ? 0.12 : state === "speaking" ? [0.55, 0.9, 0.55] : [0.3, 0.5, 0.3], scaleX: state === "speaking" ? [0.9, 1.1, 0.9] : 1 }}
        transition={{ duration: state === "speaking" ? 1.1 : 2.4, repeat: Infinity, ease: "easeInOut" }}
      />
      {state === "checking" ? (
        <div className="relative flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.span key={i} className="size-2 rounded-full bg-ippo-600" animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }} />
          ))}
        </div>
      ) : (
        <div className="relative flex h-7 items-center gap-[3px]">
          {Array.from({ length: 22 }).map((_, i) => {
            const base = 0.18 + 0.5 * Math.abs(Math.sin(i * 1.7));
            return (
              <motion.span
                key={i}
                className="w-[3px] rounded-full bg-ippo-500"
                style={{ height: "100%", originY: 0.5 }}
                animate={state === "speaking" ? { scaleY: [base, 1 - base * 0.5, base * 0.7, base] } : state === "listening" ? { scaleY: [0.12, 0.22, 0.12] } : { scaleY: 0.1 }}
                transition={{ duration: state === "speaking" ? 0.7 + (i % 4) * 0.12 : 1.8, repeat: still ? 0 : Infinity, delay: i * 0.03, ease: "easeInOut" }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Shown while there is no call: connecting, failed, or ended. */
function CallState() {
  const { s, d } = useFlow();
  const { status, error } = s.live;
  const phone = s.channel === "phone";
  const to = s.phoneTo.replace(/\s/g, "");
  if (status === "on" && (!phone || s.turns.length)) return null;
  const title =
    status === "on" ? "You’re on the phone with Ippo" : status === "connecting" ? (phone ? "Ippo is calling you…" : "Calling Ippo…") : status === "error" ? (phone ? "The call didn’t go through" : "Couldn’t reach Ippo") : "Call ended";
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <IppoMark size={56} live={status === "connecting" || status === "on"} />
      <p className="text-[17px] font-semibold">{title}</p>
      {status === "connecting" && <p className="text-[13px] text-muted">{phone ? `Pick up the call on ${to}.` : "Allow the microphone when your browser asks."}</p>}
      {status === "on" && <p className="max-w-[280px] text-[13px] text-muted">Talk on your phone. What you both say appears here.</p>}
      {status === "error" && <p className="max-w-[300px] text-[13px] text-muted">{error}</p>}
      {(status === "error" || status === "idle") && (
        <Btn tone="ippo" onClick={() => void (phone ? startPhone(to, d) : startCall(d))}>
          <Icon name="restart" size={16} /> {phone ? "Call my phone again" : "Call Ippo again"}
        </Btn>
      )}
    </div>
  );
}

/** Phone mode: the voice is on the user's phone, so the bar only ends the call. */
function PhoneBar() {
  const { s, d } = useFlow();
  if (s.live.status !== "on" && s.live.status !== "connecting") return <div className="h-7" />;
  return (
    <div className="relative z-20 px-4 pb-7">
      <p className="mb-3 text-center text-[14px] font-medium text-ink-2/80">{s.live.status === "on" ? "Talking on your phone" : "Ringing…"}</p>
      <Btn
        className="h-[60px] w-full !bg-bad text-[16px] hover:!bg-[#b92f22]"
        onClick={() => {
          void endPhone();
          d({ type: "live", live: { status: "idle" } });
        }}
      >
        <Icon name="phone" size={18} /> End call
      </Btn>
    </div>
  );
}

export function ChatScreen() {
  const { s, d } = useFlow();
  const ctx = useCtx(true);
  const last = s.turns[s.turns.length - 1];
  const lastCard = [...s.turns].reverse().find((t) => t.step);
  const step = lastCard?.step ? STEPS[lastCard.step] : null;
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const t = setTimeout(() => el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }), 120);
    const t2 = setTimeout(() => el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }), 1000);
    return () => {
      clearTimeout(t);
      clearTimeout(t2);
    };
  }, [last?.key, last?.said, last?.step, s.live.status]);

  const on = s.live.status === "on";
  const talking = on && s.live.botSpeaking;
  // tick while Ippo is thinking, so a long wait turns into a "still working" / "didn't answer" hint
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!s.live.thinkingSince) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [s.live.thinkingSince]);
  const waited = s.live.thinkingSince ? (now - s.live.thinkingSince) / 1000 : 0;
  const thinking = on && !talking && Boolean(s.live.thinkingSince);
  const bar: BarState = !on ? "off" : s.muted ? "muted" : talking ? "speaking" : thinking || step?.checking ? "checking" : "listening";
  const hint = !on
    ? ""
    : s.muted
      ? "Mic is off. Tap play to talk"
      : talking
        ? "Ippo is speaking…"
        : s.live.turnError
          ? "Ippo couldn’t answer that. Say it again"
          : thinking
            ? waited > 12
              ? "Ippo hasn’t answered. Say it again, or tap the card"
              : waited > 4
                ? "Ippo is still working on it…"
                : "Ippo is thinking…"
            : step
              ? step.hint
              : "Listening… just speak";

  return (
    <div className="relative flex h-full flex-col bg-[linear-gradient(180deg,#ffffff,#fbf8f5)]">
      <Glow strong={talking} />
      <StatusBar />
      <TopBar title={s.channel === "phone" ? "Phone call with Ippo" : "Personal loan"} onBack={ctx.end} onRight={() => d({ type: "screen", screen: "loans" })} />
      <div ref={scroller} className="no-bar relative z-10 flex-1 overflow-y-auto px-5 pt-2 pb-6">
        <div className="flex min-h-full flex-col justify-end gap-7">
          {s.turns.map((t) => (
            // the newest card stays tappable even when Ippo says more after it ("Are you still there?")
            <TurnView key={t.key} turn={t} newest={on && (t.step ? t === lastCard : t === last)} speaking={talking} />
          ))}
          <AnimatePresence>
            {thinking && (
              <motion.div key="thinking" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-[13px] font-semibold text-ippo-700">
                <IppoMark size={20} live />
                <span className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <motion.span key={i} className="size-1.5 rounded-full bg-ippo-500" animate={{ opacity: [0.25, 1, 0.25] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }} />
                  ))}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
          <CallState />
        </div>
      </div>
      {s.channel === "phone" ? <PhoneBar /> : <VoiceBar
        state={bar}
        hint={hint}
        onMute={() => {
          setMic(s.muted);
          d({ type: "mute", on: !s.muted });
        }}
        onSend={(text) => {
          d({ type: "user", user: { kind: "say", text } });
          send(text);
        }}
      />}
      <HomeIndicator />
    </div>
  );
}
