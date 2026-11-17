// The cards Ippo can put on the phone (with the `show_step` tool), and the hint shown above the
// voice bar while each is open. A tap on a card goes back to Ippo as the user's words.
import { motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFlow, type Screen, type StepId, type UserBit } from "./flow";
import { followAa, uploadStatement } from "./live";
import { Btn, Card, FinMeadows, Icon, inr, Pill, Tick, cx } from "./ui";

export type Ctx = {
  /** only the newest card takes taps; older cards stay as the record */
  active: boolean;
  /** tell Ippo what the user tapped */
  tap: (user: UserBit) => void;
  screen: (s: Screen) => void;
  /** end the call and go back to the start */
  end: () => void;
  /** the amount Ippo passed with the card, in rupees */
  amount?: number;
  /** real data behind the card (LoanPilot SDK) */
  data?: Record<string, any>;
};

export type Step = {
  hint: string;
  /** a check is running: the voice bar shows dots */
  checking?: boolean;
  card: (c: Ctx) => ReactNode;
};

const say = (text: string, mono?: boolean): UserBit => ({ kind: "say", text, mono });

/* ── card pieces ─────────────────────────────────────────────────────── */
function Checklist({ title, rows }: { title: string; rows: { label: string; state: "done" | "doing" | "todo" }[] }) {
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[14px] font-semibold">{title}</span>
        <FinMeadows small />
      </div>
      <div className="flex flex-col gap-2.5">
        {rows.map((r, i) => (
          <motion.div key={r.label} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.25 }} className="flex items-center gap-2.5 text-[13.5px]">
            <Tick state={r.state} />
            <span className={r.state === "todo" ? "text-faint" : "text-ink-2"}>{r.label}</span>
          </motion.div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-faint">Lending platform for IppoPay</p>
    </Card>
  );
}

/** Rows switch from "doing" to "done" one by one while the check runs. */
function useProgress(count: number, live: boolean, every = 700) {
  const [n, setN] = useState(live ? 0 : count);
  useEffect(() => {
    if (!live) return setN(count);
    const t = setInterval(() => setN((x) => Math.min(count, x + 1)), every);
    return () => clearInterval(t);
  }, [live, count, every]);
  return n;
}

function Months({ have }: { have: number }) {
  const m = ["May", "Jun", "Jul", "Aug", "Sep", "Oct"];
  return (
    <div>
      <div className="mb-2 flex justify-between text-[12.5px]">
        <span className="text-muted">Months covered, 2026</span>
        <span className="font-semibold tabular">{have} of 6</span>
      </div>
      <div className="grid grid-cols-6 gap-1.5">
        {m.map((x, i) => (
          <motion.div
            key={x}
            initial={false}
            animate={{ backgroundColor: i < have ? "#e6f5ec" : "#f5f6f9" }}
            className={cx("flex flex-col items-center gap-1 rounded-xl py-2 text-[11.5px] font-medium", i < have ? "text-ok" : "text-faint")}
          >
            {x}
            {i < have ? <Icon name="check" size={13} stroke={2.6} /> : <span className="h-[13px] leading-none">–</span>}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function FileRow({ name, note }: { name: string; note: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-soft p-2.5">
      <span className="grid size-9 place-items-center rounded-xl bg-[#e5484d] text-[10px] font-bold text-white">PDF</span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold">{name}</span>
        <span className="block text-[11.5px] text-ok">{note}</span>
      </span>
    </div>
  );
}

function Eligible({ amount }: { amount: number }) {
  return (
    <Card className="relative overflow-hidden bg-[linear-gradient(135deg,#fff6ef,#ffffff_60%)]">
      <div className="absolute -top-10 -right-10 size-32 rounded-full bg-ippo-100 blur-2xl" />
      <div className="relative">
        <div className="flex items-center gap-2 text-[14px] font-semibold text-ippo-700">
          <Icon name="star" size={16} /> Great news, Mohan!
        </div>
        <p className="mt-2 text-[13px] text-muted">You’re eligible for a loan amount up to</p>
        <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-[34px] font-bold tracking-tight tabular">
          {inr(amount)}
        </motion.p>
      </div>
    </Card>
  );
}

function ChoiceRow({ icon, title, sub, tag, onClick, disabled }: { icon: "upload" | "bank"; title: string; sub: string; tag: ReactNode; onClick: () => void; disabled: boolean }) {
  return (
    <motion.button whileTap={{ scale: 0.98 }} disabled={disabled} onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl p-3 text-left hover:bg-soft disabled:hover:bg-transparent">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-ippo-50 text-ippo-600">
        <Icon name={icon} size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-semibold">{title}</span>
        <span className="block text-[12.5px] text-muted">{sub}</span>
        <span className="mt-1 block">{tag}</span>
      </span>
      <Icon name="chevron" size={18} className="text-faint" />
    </motion.button>
  );
}

const OFFERS = [
  { lender: "Tata Capital", logo: "", rate: "15.5%", amount: 35000, emi: 3167, best: true },
  { lender: "Poonawalla Fincorp", logo: "/lenders/poonawalla.png", rate: "17%", amount: 35000, emi: 3192 },
  { lender: "Shriram Finance", logo: "/lenders/shriram.png", rate: "16.5%", amount: 30000, emi: 2729 },
  { lender: "Vikasam", logo: "/lenders/vikasam.png", rate: "18%", amount: 25000, emi: 2292 },
];

export function LenderLogo({ src, name, size = "md" }: { src: string; name: string; size?: "md" | "sm" }) {
  return (
    <span className={cx("grid shrink-0 place-items-center overflow-hidden rounded-2xl border border-line bg-white", size === "md" ? "h-10 w-[72px] p-1.5" : "h-8 w-8 p-1")}>
      {src ? (
        <img src={src} alt={name} className="max-h-full max-w-full object-contain" />
      ) : name === "Tata Capital" ? (
        <span className={cx("flex flex-col items-center leading-none text-[#1d3ba8]", size === "sm" && "scale-75")}>
          <span className="text-[10px] font-black tracking-tight">
            TATA <span className="font-semibold">CAPITAL</span>
          </span>
          <span className="mt-[3px] h-[2px] w-full rounded-full bg-[#d7e51f]" />
        </span>
      ) : (
        <span className="text-[12px] font-bold text-ippo-600">{name[0]}</span>
      )}
    </span>
  );
}

function PanInput({ c }: { c: Ctx }) {
  const [v, setV] = useState("");
  const ok = /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v);
  return (
    <Card>
      <div className="mb-1.5 flex justify-between text-[12px] text-muted">
        <span className="font-semibold">PAN</span>
        <span className="tabular">{v.length} of 10</span>
      </div>
      <input
        value={v}
        disabled={!c.active}
        autoFocus={c.active}
        placeholder="ABCDE1234F"
        onChange={(e) => setV(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))}
        className="h-12 w-full rounded-xl border-2 border-ippo-400 bg-white px-3 font-mono text-[19px] font-semibold tracking-[0.18em] outline-none placeholder:text-line focus:ring-4 focus:ring-ippo-100 disabled:border-line"
        aria-label="PAN"
      />
      <p className="mt-2 text-[11.5px] text-muted">Type it exactly as on your PAN card: 5 letters, 4 numbers, 1 letter.</p>
      <Btn className="mt-3 w-full" disabled={!c.active || !ok} onClick={() => c.tap(say(v, true))}>
        Verify PAN
      </Btn>
    </Card>
  );
}

function UploadCard({ c, have, files, foot }: { c: Ctx; have: number; files: { name: string; note: string }[]; foot?: string }) {
  return (
    <Card>
      <Months have={have} />
      {files.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {files.map((f) => (
            <FileRow key={f.name} name={f.name} note={f.note} />
          ))}
        </div>
      )}
      {foot && (
        <>
          <p className="mt-3 text-[11.5px] text-muted">{foot}</p>
          <Btn className="mt-3 w-full" disabled={!c.active} onClick={() => c.tap({ kind: "say", text: "Add statements" })}>
            <Icon name="upload" size={17} /> Add statements
          </Btn>
          <button disabled={!c.active} onClick={() => c.tap(say("Use Account Aggregator instead"))} className="mt-2 w-full text-center text-[13px] font-semibold text-ippo-600 disabled:opacity-40">
            Use Account Aggregator
          </button>
        </>
      )}
    </Card>
  );
}

function AaBank({ c }: { c: Ctx }) {
  const [pick, setPick] = useState(0);
  const banks = [
    ["SBI savings ••••4521", "SBI"],
    ["HDFC savings ••••0932", "HDFC"],
  ];
  return (
    <Card>
      <div className="flex flex-col gap-2">
        {banks.map(([t], i) => (
          <button
            key={t}
            disabled={!c.active}
            onClick={() => setPick(i)}
            className={cx("flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition-colors", pick === i ? "border-ippo-400 bg-ippo-50" : "border-line")}
          >
            <span className="grid size-9 place-items-center rounded-xl bg-white text-ink-2 shadow-sm">
              <Icon name="bank" size={17} />
            </span>
            <span className="flex-1">
              <span className="block text-[14px] font-semibold tabular">{t}</span>
              <span className="block text-[11.5px] text-muted">Linked to your IppoPay UPI</span>
            </span>
            <span className={cx("grid size-5 place-items-center rounded-full border-2", pick === i ? "border-ippo-500" : "border-line")}>{pick === i && <span className="size-2.5 rounded-full bg-ippo-500" />}</span>
          </button>
        ))}
      </div>
      <Btn className="mt-3 w-full" disabled={!c.active} onClick={() => c.tap(say(banks[pick][1]))}>
        Continue with {banks[pick][1]}
      </Btn>
    </Card>
  );
}

function OtpCard({ c }: { c: Ctx }) {
  const [v, setV] = useState("");
  return (
    <Card>
      <label className="relative block">
        <input
          value={v}
          disabled={!c.active}
          autoFocus={c.active}
          inputMode="numeric"
          onChange={(e) => setV(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="absolute inset-0 opacity-0"
          aria-label="OTP"
        />
        <span className="grid grid-cols-6 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <motion.span
              key={i}
              animate={{ borderColor: i === v.length && c.active ? "#ff6b1a" : "#e6e9f0", scale: i < v.length ? [1.08, 1] : 1 }}
              className="grid h-12 place-items-center rounded-xl border-2 bg-white text-[20px] font-semibold tabular"
            >
              {v[i] ?? ""}
            </motion.span>
          ))}
        </span>
      </label>
      <div className="mt-2 flex justify-between text-[11.5px] text-muted tabular">
        <span>Expires in 4:32</span>
        <span>Resend in 0:24</span>
      </div>
      <Btn className="mt-3 w-full" disabled={!c.active || v.length < 6} onClick={() => c.tap(say("OTP shared ••••••"))}>
        Approve and share
      </Btn>
    </Card>
  );
}

function CreditCheck({ live }: { live: boolean }) {
  const n = useProgress(2, live, 650);
  return (
    <Checklist
      title="Checking your credit report"
      rows={[
        { label: "Credit report requested", state: n >= 1 ? "done" : "doing" },
        { label: "Matching it with your PAN", state: n >= 2 ? "done" : n === 1 ? "doing" : "todo" },
      ]}
    />
  );
}

function BankCheck({ live }: { live: boolean }) {
  const n = useProgress(3, live, 600);
  return (
    <Checklist
      title="Finding lender offers for you"
      rows={[
        { label: "Credit report checked", state: "done" },
        { label: "Reading your 6-month bank statement", state: n >= 1 ? "done" : "doing" },
        { label: "Matching you with lenders", state: n >= 3 ? "done" : n >= 1 ? "doing" : "todo" },
      ]}
    />
  );
}

/** Applied → Lender checking → Disbursed. */
export function Track({ at }: { at: 0 | 1 | 2 }) {
  const steps = ["Applied", "Lender checking", "Disbursed"];
  return (
    <div className="mt-4">
      <div className="relative mx-2 flex items-center justify-between">
        <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-line" />
        <motion.div className="absolute top-1/2 left-0 h-[3px] -translate-y-1/2 rounded-full bg-ok" initial={{ width: 0 }} animate={{ width: `${at * 50}%` }} transition={{ duration: 0.8 }} />
        {steps.map((s, i) => (
          <span key={s} className={cx("relative grid size-4 place-items-center rounded-full border-2 bg-white", i < at || at === 2 ? "border-ok bg-ok" : i === at ? "border-ippo-500" : "border-line")}>
            {i === at && at < 2 && <span className="size-1.5 rounded-full bg-ippo-500" />}
          </span>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px]">
        {steps.map((s, i) => (
          <span key={s} className={cx(i === at ? "font-semibold text-ink" : "text-muted", i === 1 && "text-center", i === 2 && "text-right")}>
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}


/* ── real cards (LoanPilot SDK on app.ippo.one) ──────────────────────── */
function Real() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-ink px-2 py-0.5 text-[10px] font-bold tracking-wide text-white">
      <span className="size-1.5 rounded-full bg-ok" /> LIVE · app.ippo.one
    </span>
  );
}

function CreditCard({ data }: { data?: Record<string, any> }) {
  if (!data) return null;
  if (data.error)
    return (
      <Card>
        <div className="mb-2 flex justify-between"><span className="text-[14px] font-semibold">PAN check failed</span><Real /></div>
        <p className="text-[12.5px] text-bad">{data.error}</p>
      </Card>
    );
  const c = data.credit;
  const score = c?.score as number | null;
  const tone = score == null ? "text-muted" : score >= 750 ? "text-ok" : score >= 650 ? "text-warn" : "text-bad";
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[14px] font-semibold">PAN verified</span>
        <Real />
      </div>
      <p className="text-[13px] text-muted">
        {data.customer?.name} · <span className="font-mono">{data.customer?.ref}</span>
      </p>
      {c ? (
        <div className="mt-3 flex items-center gap-4">
          <div className="text-center">
            <p className={cx("text-[40px] leading-none font-bold tabular", tone)}>{score ?? "–"}</p>
            <p className="mt-1 text-[11px] text-muted">{c.bureau === "equifax" ? "Equifax" : "Experian"} score</p>
          </div>
          <div className="grid flex-1 grid-cols-2 gap-2 text-[12px]">
            {[
              ["Active loans", c.activeLoans ?? 0],
              ["Outstanding", inr(c.outstanding ?? 0)],
              ["Overdue", inr(c.overdue ?? 0)],
              ["Written off", c.writtenOff ?? 0],
            ].map(([k, v]) => (
              <span key={k as string} className="rounded-xl bg-soft p-2">
                <span className="block text-muted">{k}</span>
                <span className="block font-semibold tabular">{v as string}</span>
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-2 text-[12.5px] text-warn">Credit report not available: {data.creditError}</p>
      )}
      {c?.reused && <p className="mt-2 text-[11px] text-faint">Re-used a recent report (no new bureau charge).</p>}
    </Card>
  );
}

function StatementCard({ c }: { c: Ctx }) {
  const { d } = useFlow();
  const [status, setStatus] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const busy = status != null && !/failed|Analysed/.test(status);
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[14px] font-semibold">Upload bank statement</span>
        <Real />
      </div>
      <p className="text-[12.5px] text-muted">Last 6 months, PDF from your bank’s app or website. LoanPilot reads it and works out what you can borrow.</p>
      <input value={pw} onChange={(e) => setPw(e.target.value)} disabled={!c.active || busy} placeholder="PDF password (if any)" className="mt-3 h-10 w-full rounded-xl border border-line px-3 text-[13px] outline-none focus:border-ippo-400" />
      <label className={cx("mt-2 flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-ink text-[15px] font-semibold text-white", (!c.active || busy) && "pointer-events-none opacity-40")}>
        <Icon name="upload" size={17} /> Choose PDF
        <input
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadStatement(f, pw || undefined, setStatus, d);
            e.target.value = "";
          }}
        />
      </label>
      {status && (
        <p className={cx("mt-2 flex items-center gap-2 text-[12.5px]", /failed/.test(status) ? "text-bad" : "text-ink-2")}>
          {busy && <Tick state="doing" />} {status}
        </p>
      )}
    </Card>
  );
}

const AA_STEPS: [string, string][] = [
  ["pending", "Link sent by SMS · waiting for your approval"],
  ["approved", "Approved"],
  ["fetching", "Your bank is sending the statement"],
  ["completed", "Statement received and analysed"],
];

function AaCard({ c }: { c: Ctx }) {
  const { d } = useFlow();
  const [consent, setConsent] = useState<Record<string, any> | null>(c.data?.consent ?? null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !consent?.id || !c.active) return;
    started.current = true;
    void followAa(consent.id, setConsent, d);
  }, [consent?.id, c.active, d]);
  if (c.data?.error)
    return (
      <Card>
        <div className="mb-2 flex justify-between"><span className="text-[14px] font-semibold">Account Aggregator</span><Real /></div>
        <p className="text-[12.5px] text-bad">{c.data.error}</p>
      </Card>
    );
  if (!consent) return null;
  // "ready": the statements are in and being analysed, the same point as "fetching" on the card
  const at = consent.status === "ready" ? 2 : Math.max(0, AA_STEPS.findIndex(([s]) => s === consent.status));
  const bad = ["failed", "rejected", "cancelled"].includes(consent.status);
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <span className="min-w-0 truncate pr-2 text-[14px] font-semibold">AA · {consent.provider === "finpass" ? "Finpass" : "SAAFE"}</span>
        <Real />
      </div>
      <p className="text-[12.5px] text-muted">Sent to {consent.mobile ? "••••••" + String(consent.mobile).slice(-4) : "your mobile"}. Open the SMS link, pick your bank and approve.</p>
      <div className="mt-3 flex flex-col gap-2">
        {bad ? (
          <p className="text-[13px] font-semibold text-bad">{consent.status}: {consent.error ?? "no reason given"}</p>
        ) : (
          AA_STEPS.map(([s, label], i) => (
            <div key={s} className="flex items-center gap-2.5 text-[13px]">
              <Tick state={i < at || consent.status === "completed" ? "done" : i === at ? "doing" : "todo"} />
              <span className={i > at ? "text-faint" : "text-ink-2"}>{label}</span>
            </div>
          ))
        )}
      </div>
      {consent.approval_url && !bad && consent.status !== "completed" && (
        // the consent link right here in the chat too, not only in the SMS
        <div className="mt-3 rounded-2xl bg-soft p-2.5">
          <p className="mb-1 text-[11px] font-semibold text-muted">Your consent link</p>
          <p className="truncate font-mono text-[11px] text-ink-2">{consent.approval_url}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <a href={consent.approval_url} target="_blank" rel="noreferrer" className="flex h-10 items-center justify-center rounded-full bg-ink text-[13px] font-semibold text-white">
              Open link
            </a>
            <button onClick={() => void navigator.clipboard?.writeText(consent.approval_url)} className="h-10 rounded-full border border-line bg-white text-[13px] font-semibold">
              Copy link
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

function RealOfferCard({ c }: { c: Ctx }) {
  const a = c.data;
  if (!a) return null;
  const o = a.offer;
  const ok = o && o.amount > 0;
  return (
    <Card accent={ok}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[14px] font-semibold">Your LoanPilot offer</span>
        <Real />
      </div>
      <p className="text-[12px] text-muted">
        {[a.ref, a.bank, a.from && `${a.from} – ${a.to}`].filter(Boolean).join(" · ")}
      </p>
      {ok ? (
        <>
          <p className="mt-2 text-[34px] leading-tight font-bold tracking-tight tabular">{inr(o.amount)}</p>
          <p className="text-[13px] text-muted">
            <b className="text-ink-2 tabular">{inr(o.emi)}</b> a month for {o.tenure} months · {Math.round((o.rate ?? 0) * 1000) / 10}% a year
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {a.decision && <Pill tone={/approv/i.test(a.decision) ? "ok" : /declin|reject/i.test(a.decision) ? "bad" : "warn"}>{a.decision}</Pill>}
            {o.needsReview && !/review/i.test(a.decision ?? "") && <Pill tone="warn">Officer review</Pill>}
            {a.score != null && <Pill>Score {a.score}</Pill>}
          </div>
          <Btn className="mt-3 w-full" disabled={!c.active} onClick={() => c.tap({ kind: "say", text: "I want to apply for this loan" })}>
            Apply
          </Btn>
        </>
      ) : (
        <p className="mt-2 text-[13px] text-bad">No loan can be offered now{o?.reason ? `: ${o.reason}` : "."}</p>
      )}
    </Card>
  );
}

/* ── the cards ───────────────────────────────────────────────────────── */
export const STEPS: Record<StepId, Step> = {
  credit: {
    hint: "Ippo is reading your credit report…",
    card: (c) => <CreditCard data={c.data} />,
  },

  statement: {
    hint: "Choose your bank statement PDF",
    card: (c) => <StatementCard c={c} />,
  },

  aa: {
    hint: "Approve on your phone, then come back",
    checking: true,
    card: (c) => <AaCard c={c} />,
  },

  realOffer: {
    hint: "Say “apply”, or ask Ippo anything",
    card: (c) => <RealOfferCard c={c} />,
  },

  heard: {
    hint: "Say “yes” or tap",
    card: (c) => (
      <Card>
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] text-muted">Loan amount heard</span>
          <span className="text-[28px] font-bold tracking-tight tabular">{inr(c.amount ?? 200000)}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Btn disabled={!c.active} onClick={() => c.tap(say("Yes, that's right"))}>
            Yes, that's right
          </Btn>
          <Btn tone="ghost" disabled={!c.active} onClick={() => c.tap(say("No, I'll say it again"))}>
            Say it again
          </Btn>
        </div>
      </Card>
    ),
  },

  pan: {
    hint: "For your safety, PAN is typed, not spoken",
    card: (c) => <PanInput c={c} />,
  },

  checkCredit: {
    hint: "Ippo is checking…",
    checking: true,
    card: (c) => <CreditCheck live={c.active} />,
  },

  panOk: {
    hint: "Ippo is speaking…",
    card: (c) => <Eligible amount={c.amount ?? 200000} />,
  },

  panInvalid: {
    hint: "Ask Ippo anything",
    card: (c) => (
      <Card>
        <p className="mb-3 text-[14px] font-semibold">Here’s why</p>
        {[
          ["Your credit score is low", "Your credit score doesn’t meet the eligibility criteria."],
          ["Your existing loan commitments are high", "Your current repayments are high compared to your income."],
        ].map(([t, s]) => (
          <div key={t} className="mb-3 flex gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-warn-soft text-warn">
              <Icon name="info" size={16} />
            </span>
            <span>
              <span className="block text-[13.5px] font-semibold">{t}</span>
              <span className="block text-[12.5px] text-muted">{s}</span>
            </span>
          </div>
        ))}
        <Btn className="w-full" disabled={!c.active} onClick={c.end}>
          Back to IppoPay
        </Btn>
      </Card>
    ),
  },

  bankChoice: {
    hint: "Say “upload” or “account aggregator”",
    card: (c) => (
      <Card className="p-2">
        <ChoiceRow icon="upload" title="Upload bank statement" sub="From your bank’s app or website" tag={<Pill tone="ippo">PDF, last 6 months</Pill>} disabled={!c.active} onClick={() => c.tap(say("Upload"))} />
        <div className="mx-3 border-t border-line" />
        <ChoiceRow icon="bank" title="Account Aggregator" sub="Pick your bank and approve with an OTP" tag={<Pill tone="ok">No file needed</Pill>} disabled={!c.active} onClick={() => c.tap(say("Account aggregator"))} />
      </Card>
    ),
  },

  upStart: {
    hint: "Tap Add statements, or say “account aggregator”",
    card: (c) => <UploadCard c={c} have={0} files={[]} foot="PDF from your bank’s app or website, up to 10 MB each. You can add more than one file." />,
  },

  upLocked: {
    hint: "Say “upload again” or “account aggregator”",
    card: (c) => (
      <Card>
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-bad-soft px-3 py-2 text-[13px] font-semibold text-bad">
          <Icon name="lock" size={15} /> Password-protected PDF can’t be read
        </div>
        <p className="mb-2 text-[12.5px] font-semibold text-muted">How to fix it</p>
        {[
          ["Save an unlocked copy", "Open the PDF with its password, then use Print and choose “Save as PDF”."],
          ["Upload that new file", "Or share by OTP with Account Aggregator, no file needed."],
        ].map(([t, s], i) => (
          <div key={t} className="mb-3 flex gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ippo-100 text-[12px] font-bold text-ippo-700">{i + 1}</span>
            <span>
              <span className="block text-[13.5px] font-semibold">{t}</span>
              <span className="block text-[12.5px] text-muted">{s}</span>
            </span>
          </div>
        ))}
        <div className="grid grid-cols-2 gap-2">
          <Btn disabled={!c.active} onClick={() => c.tap({ kind: "file", name: "SBI_May-Aug_2026.pdf", note: "Uploaded · 2.1 MB" })}>
            Upload again
          </Btn>
          <Btn tone="ghost" disabled={!c.active} onClick={() => c.tap(say("Account aggregator"))}>
            Account Aggregator
          </Btn>
        </div>
      </Card>
    ),
  },

  upPartial: {
    hint: "Tap Add statements to add September and October",
    card: (c) => <UploadCard c={c} have={4} files={[{ name: "SBI_May-Aug_2026.pdf", note: "Checked. May to August" }]} foot="Still needed: September and October. PDF from your bank, up to 10 MB each." />,
  },

  upDone: {
    hint: "Ippo is checking…",
    checking: true,
    card: (c) => (
      <UploadCard
        c={c}
        have={6}
        files={[
          { name: "SBI_May-Aug_2026.pdf", note: "Checked. May to August" },
          { name: "SBI_Sep-Oct_2026.pdf", note: "Checked. September and October" },
        ]}
      />
    ),
  },

  aaBank: {
    hint: "Say “SBI” or tap",
    card: (c) => <AaBank c={c} />,
  },

  aaOtp: {
    hint: "Read out the OTP, or type it",
    card: (c) => <OtpCard c={c} />,
  },

  checkBank: {
    hint: "Ippo is finding offers…",
    checking: true,
    card: (c) => <BankCheck live={c.active} />,
  },

  offers: {
    hint: "Say a lender's name or tap Apply",
    card: (c) => (
      <div className="flex flex-col gap-2.5">
        {OFFERS.map((o, i) => (
          <motion.div key={o.lender} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 * i }}>
            <Card accent={o.best} className="p-0">
              <div className="flex items-center gap-3 p-4 pb-3">
                <LenderLogo src={o.logo} name={o.lender} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{o.lender}</span>
                  <span className="block text-[12.5px] text-muted">{o.rate} a year</span>
                </span>
                {o.best && (
                  <Pill tone="ok">
                    <Icon name="star" size={12} /> Lowest cost
                  </Pill>
                )}
              </div>
              <div className="flex items-end justify-between border-t border-line px-4 py-3">
                <span>
                  <span className="block text-[26px] leading-tight font-bold tracking-tight tabular">{inr(o.amount)}</span>
                  <span className="block text-[12.5px] text-muted">
                    <b className="font-semibold text-ink-2 tabular">{inr(o.emi)}</b> a month for 12 months
                  </span>
                </span>
                <Btn size="sm" tone={o.best ? "ink" : "soft"} className="h-10 px-5" disabled={!c.active} onClick={() => c.tap(say(`Apply with ${o.lender}`))}>
                  Apply
                </Btn>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
    ),
  },

  noOffer: {
    hint: "Ask Ippo anything",
    card: (c) => (
      <Card>
        <p className="text-[13px] text-muted">Lenders look at your credit report and the income in your bank statements. This doesn’t change your IppoPay account or payments.</p>
        <p className="mt-3 mb-2 text-[13.5px] font-semibold">What you can do next</p>
        <ul className="mb-3 flex flex-col gap-1.5 text-[13px] text-ink-2">
          <li className="flex gap-2">
            <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-ippo-500" />
            Try again after your next salary or income credit
          </li>
          <li className="flex gap-2">
            <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-ippo-500" />
            Check your credit report for mistakes
          </li>
        </ul>
        <div className="grid grid-cols-2 gap-2">
          <Btn tone="ghost" disabled={!c.active} onClick={() => c.tap(say("I need help"))}>
            Get help
          </Btn>
          <Btn disabled={!c.active} onClick={c.end}>
            Back to IppoPay
          </Btn>
        </div>
      </Card>
    ),
  },

  applyNote: {
    hint: "Opening Tata Capital…",
    card: (c) => (
      <Card className="flex items-center gap-3">
        <LenderLogo src="" name="Tata Capital" />
        <span className="flex-1 text-[13px] text-muted">
          Applying for <b className="text-ink tabular">{inr(35000)}</b> at 15.5% a year
        </span>
        <Btn size="sm" disabled={!c.active} onClick={() => c.screen("lender")}>
          Open
        </Btn>
      </Card>
    ),
  },

  lenderBack: {
    hint: "Say “go back” or “other offers”",
    card: (c) => (
      <div className="flex flex-wrap gap-2">
        <Btn size="sm" className="h-10" disabled={!c.active} onClick={() => c.screen("lender")}>
          Back to Tata Capital
        </Btn>
        <Btn size="sm" tone="ghost" className="h-10" disabled={!c.active} onClick={() => c.tap(say("Show me the other offers"))}>
          See other offers
        </Btn>
      </div>
    ),
  },

  applied: {
    hint: "Ask me anything, or say “my loans”",
    card: () => (
      <Card>
        <div className="flex items-center justify-between">
          <span className="text-[14px] font-semibold">{inr(35000)} from Tata Capital</span>
          <Pill tone="warn">Under review</Pill>
        </div>
        <Track at={1} />
        <p className="mt-2 text-[12.5px] text-muted">Tata Capital is checking your details.</p>
      </Card>
    ),
  },

  disbursed: {
    hint: "Ask me anything, or say “my loans”",
    card: (c) => (
      <Card>
        <div className="flex items-center gap-3">
          <LenderLogo src="" name="Tata Capital" />
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-semibold tabular">{inr(35000)} · Tata Capital</span>
            <span className="block text-[12px] text-muted">Sent to your bank account today</span>
          </span>
          <Pill tone="ok">Disbursed</Pill>
        </div>
        <Track at={2} />
        <div className="mt-3 flex items-end justify-between rounded-2xl bg-soft p-3">
          <span>
            <span className="block text-[11.5px] text-muted">First EMI · 5 Dec</span>
            <span className="block text-[22px] font-bold tabular">{inr(3167)}</span>
          </span>
          <span className="text-right text-[11.5px] text-muted">
            12 EMIs
            <br />
            <span className="tabular">{inr(38008)}</span> in total
          </span>
        </div>
        <Btn className="mt-3 w-full" tone="ghost" disabled={!c.active} onClick={() => c.screen("loans")}>
          My loans
        </Btn>
      </Card>
    ),
  },
};
