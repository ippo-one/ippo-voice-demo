// The phone screens outside the chat: consent (where the demo starts), the lender's page,
// My loans and loan details.
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useCtx } from "./Chat";
import { useFlow } from "./flow";
import { startCall, startPhone } from "./live";
import { LenderLogo, Track } from "./steps";
import { Btn, Card, HomeIndicator, Icon, IppoMark, Pill, RoundBtn, StatusBar, TopBar, cx, inr } from "./ui";

/* ── consent ─────────────────────────────────────────────────────────── */
/** How to talk to Ippo. Only what @ippopone/agents-sdk fully supports: a call in the app (agents.connect)
 *  or Ippo ringing the user's phone (calls.outbound). Phone needs a number on the account. */
function ChannelToggle() {
  const { s, d } = useFlow();
  const [numbers, setNumbers] = useState<number | null>(null);
  useEffect(() => {
    fetch("/live/status")
      .then((r) => r.json())
      .then((st) => setNumbers(st.phoneNumbers?.length ?? 0))
      .catch(() => setNumbers(0));
  }, []);
  const phoneOff = numbers === 0;
  const opts = [
    { id: "app" as const, label: "Call in the app", icon: "speaker" as const },
    { id: "phone" as const, label: "Call my phone", icon: "phone" as const },
  ];
  return (
    <div className="mb-4">
      <div className="grid grid-cols-2 gap-1 rounded-full bg-soft p-1">
        {opts.map((o) => {
          const off = o.id === "phone" && phoneOff;
          return (
            <button
              key={o.id}
              disabled={off}
              onClick={() => d({ type: "channel", channel: o.id })}
              className={cx("relative flex h-10 items-center justify-center gap-1.5 rounded-full text-[13.5px] font-semibold transition-colors", s.channel === o.id ? "text-ink" : "text-muted", off && "opacity-40")}
            >
              {s.channel === o.id && <motion.span layoutId="channel" className="absolute inset-0 rounded-full bg-white shadow-sm" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              <span className="relative flex items-center gap-1.5">
                <Icon name={o.icon} size={15} /> {o.label}
              </span>
            </button>
          );
        })}
      </div>
      {phoneOff && <p className="mt-1.5 text-center text-[11px] text-faint">Phone calls need a number on agent.ippo.one</p>}
      <AnimatePresence initial={false}>
        {s.channel === "phone" && (
          <motion.label initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="block overflow-hidden">
            <span className="mt-3 mb-1 block text-[12px] font-semibold text-muted">Ippo will call this number</span>
            <input
              value={s.phoneTo}
              inputMode="tel"
              onChange={(e) => d({ type: "channel", channel: "phone", phoneTo: e.target.value.replace(/[^\d+ ]/g, "") })}
              className="h-12 w-full rounded-xl border-2 border-line bg-white px-3 text-[17px] font-semibold tracking-wide outline-none tabular focus:border-ippo-400 focus:ring-4 focus:ring-ippo-100"
              aria-label="Mobile number"
            />
          </motion.label>
        )}
      </AnimatePresence>
    </div>
  );
}

export function EntryScreen() {
  const { s, d } = useFlow();
  const phoneReady = /^\+[1-9]\d{9,14}$/.test(s.phoneTo.replace(/\s/g, ""));
  const rows = [
    { icon: "card" as const, t: "Your PAN", s: "To confirm it’s you" },
    { icon: "report" as const, t: "Credit Report", s: "How you’ve repaid loans and card bills" },
    { icon: "doc" as const, t: "Bank Statement", s: "To check income, fraud and risk" },
  ];
  return (
    <div className="relative flex h-full flex-col bg-[linear-gradient(180deg,#fff3ea,#ffffff_45%)]">
      <StatusBar />
      <div className="flex flex-1 flex-col px-5 pt-6">
        <div className="flex justify-center">
          <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 200, damping: 14 }}>
            <IppoMark size={72} live />
          </motion.div>
        </div>
        <h1 className="mt-5 text-center text-[28px] font-bold tracking-tight">Get a Personal Loan</h1>
        <p className="mx-auto mt-2 max-w-[310px] text-center text-[14px] leading-relaxed text-muted">Tell Ippo how much you need, by voice or typing. You’ll see offers from lenders and choose whether to apply.</p>
        <p className="mt-7 mb-2 text-[13px] font-semibold">What lenders see, and why</p>
        <div className="flex flex-col gap-2.5">
          {rows.map((r, i) => (
            <motion.div key={r.t} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.12 }} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3">
              <span className="grid size-10 place-items-center rounded-xl bg-ippo-50 text-ippo-600">
                <Icon name={r.icon} size={19} />
              </span>
              <span className="flex-1">
                <span className="block text-[14px] font-semibold">{r.t}</span>
                <span className="block text-[12px] text-muted">{r.s}</span>
              </span>
              <span className="grid size-6 place-items-center rounded-full bg-ok text-white">
                <Icon name="check" size={13} stroke={3} />
              </span>
            </motion.div>
          ))}
        </div>
        <div className="mt-auto pb-10">
          <p className="mb-4 flex gap-2 text-[11.5px] leading-relaxed text-muted">
            <Icon name="shield" size={16} className="mt-0.5 shrink-0 text-ippo-600" />
            <span>
              By continuing, you allow IppoPay to get your credit report and share these details with Fin Meadows and its partner lenders for this loan. <span className="font-semibold text-ippo-600">See terms and conditions</span>
            </span>
          </p>
          <ChannelToggle />
          <Btn
            className="w-full"
            disabled={s.channel === "phone" && !phoneReady}
            onClick={() => {
              d({ type: "screen", screen: "chat" });
              void (s.channel === "phone" ? startPhone(s.phoneTo.replace(/\s/g, ""), d) : startCall(d));
            }}
          >
            Agree and Continue
          </Btn>
        </div>
      </div>
      <HomeIndicator />
    </div>
  );
}

/* ── the lender's own page ───────────────────────────────────────────── */
export function LenderScreen() {
  const c = useCtx(true);
  const turn = (text: string, tone: "ok" | "plain") => {
    c.screen("chat");
    c.tap({ kind: "note", text, tone });
  };
  return (
    <div className="relative flex h-full flex-col bg-white">
      <StatusBar />
      <div className="flex items-center gap-3 border-b border-line px-4 pb-3">
        <RoundBtn icon="close" label="Close" onClick={() => turn("I closed Tata Capital’s page before finishing", "plain")} />
        <div className="flex-1 text-center">
          <p className="text-[15px] font-semibold">Tata Capital</p>
          <p className="flex items-center justify-center gap-1 text-[11px] text-muted">
            <Icon name="lock" size={11} /> Secure page from Tata Capital
          </p>
        </div>
        <span className="size-11" />
      </div>
      <div className="flex items-center gap-3 bg-[#f1f6ff] px-4 py-3">
        <LenderLogo src="" name="Tata Capital" />
        <span className="text-[13px] font-semibold text-[#1d3ba8]">
          Applying for {inr(35000)} at 15.5% a year
        </span>
      </div>
      <div className="flex-1 overflow-hidden px-4 pt-4">
        <p className="rounded-2xl border border-dashed border-line bg-soft p-3 text-[12px] text-muted">Demo: this area is Tata Capital’s own web page. The rest of the application happens here, in Tata Capital’s steps.</p>
        {[0, 1, 2].map((i) => (
          <div key={i} className="mt-4 rounded-2xl border border-line p-4">
            <div className="h-3 w-2/5 rounded-full bg-soft" />
            <div className="mt-3 h-10 rounded-xl bg-soft" />
            <div className="mt-2 h-3 w-3/5 rounded-full bg-soft" />
          </div>
        ))}
      </div>
      <div className="px-4 pb-10">
        <motion.button whileTap={{ scale: 0.97 }} onClick={() => turn("I submitted the application to Tata Capital", "ok")} className="h-12 w-full rounded-xl bg-[#1d3ba8] text-[15px] font-semibold text-white">
          Submit application
        </motion.button>
      </div>
      <HomeIndicator />
    </div>
  );
}

/* ── My loans ────────────────────────────────────────────────────────── */
function EmiBar({ paid, total = 12 }: { paid: number; total?: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className={cx("h-1.5 flex-1 rounded-full", i < paid ? "bg-ippo-500" : i === paid ? "bg-ippo-200" : "bg-line")} />
      ))}
    </div>
  );
}

export function LoansScreen() {
  const { s, d } = useFlow();
  const disbursed = s.turns.some((t) => t.step === "disbursed");
  const applied = disbursed || s.turns.some((t) => t.step === "applied");
  const history = [
    ...(applied ? [{ amt: 35000, logo: "", name: "Tata Capital", sub: disbursed ? "Tata Capital, disbursed today" : "Tata Capital, applied 4 Nov", tag: disbursed ? <Pill tone="ok">Active</Pill> : <Pill tone="warn">Under review</Pill> }] : []),
    { amt: 25000, logo: "/lenders/poonawalla.png", name: "Poonawalla Fincorp", sub: "Poonawalla Fincorp, 3 of 12 EMIs paid", tag: <Pill tone="ok">Active</Pill>, open: true },
    { amt: 15000, logo: "/lenders/shriram.png", name: "Shriram Finance", sub: "Shriram Finance, paid off in Jun 2026", tag: <Pill>Closed</Pill> },
  ];
  return (
    <div className="relative flex h-full flex-col bg-[#f7f8fb]">
      <StatusBar />
      <TopBar title="My loans" onBack={() => d({ type: "screen", screen: "chat" })} onRight={() => d({ type: "screen", screen: "chat" })} rightIcon="close" rightLabel="Back to Ippo" />
      <div className="no-bar flex-1 overflow-y-auto px-4 pb-10">
        <Card className="bg-[linear-gradient(135deg,#fff6ef,#fff_60%)]">
          <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ippo-700">
            <span className="size-1.5 rounded-full bg-ippo-500" /> Due tomorrow, 6 Nov
          </p>
          <p className="mt-1 text-[34px] font-bold tracking-tight tabular">{inr(2290)}</p>
          <p className="text-[12.5px] text-muted">EMI 4 of 12 on your {inr(25000)} loan from Poonawalla Fincorp</p>
          <div className="mt-3">
            <EmiBar paid={3} />
          </div>
          <div className="mt-1.5 flex justify-between text-[11.5px] text-muted">
            <span>3 paid</span>
            <span className="tabular">{inr(20610)} left to pay</span>
          </div>
          <Btn className="mt-3 w-full">Pay {inr(2290)}</Btn>
        </Card>

        {applied && (
          <>
            <p className="mt-6 mb-2 px-1 text-[13px] font-semibold text-muted">Application</p>
            <Card>
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-semibold tabular">{inr(35000)} from Tata Capital</span>
                {disbursed ? <Pill tone="ok">Disbursed</Pill> : <Pill tone="warn">Under review</Pill>}
              </div>
              <Track at={disbursed ? 2 : 1} />
              <p className="mt-2 text-[12px] text-muted">{disbursed ? "Money sent to your SBI account. First EMI on 5 Dec." : "Tata Capital is checking your details. Ippo will tell you when they decide."}</p>
            </Card>
          </>
        )}

        <p className="mt-6 mb-2 px-1 text-[13px] font-semibold text-muted">Loan history</p>
        <Card className="p-1.5">
          {history.map((h, i) => (
            <button key={h.name} onClick={() => h.open && d({ type: "screen", screen: "loan" })} className={cx("flex w-full items-center gap-3 rounded-2xl p-2.5 text-left", h.open && "hover:bg-soft", i > 0 && "border-t border-line")}>
              <LenderLogo src={h.logo} name={h.name} />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold tabular">{inr(h.amt)}</span>
                <span className="block truncate text-[11.5px] text-muted">{h.sub}</span>
              </span>
              {h.tag}
              <Icon name="chevron" size={16} className="text-faint" />
            </button>
          ))}
        </Card>

        <p className="mt-6 mb-2 px-1 text-[13px] font-semibold text-muted">Chats with Ippo</p>
        <Card className="p-1.5">
          {[
            [`Asked for ${inr(200000)}`, "Today. Offers shown"],
            [`Applied for ${inr(35000)}`, "4 Nov. Under review"],
            [`Took ${inr(25000)}`, "2 Jul. Now an active loan"],
          ].map(([t, sub], i) => (
            <button key={t} onClick={() => d({ type: "screen", screen: "chat" })} className={cx("flex w-full items-center gap-3 rounded-2xl p-2.5 text-left hover:bg-soft", i > 0 && "border-t border-line")}>
              <IppoMark size={30} />
              <span className="flex-1">
                <span className="block text-[14px] font-semibold tabular">{t}</span>
                <span className="block text-[11.5px] text-muted">{sub}</span>
              </span>
              <Icon name="chevron" size={16} className="text-faint" />
            </button>
          ))}
        </Card>

      </div>
      <HomeIndicator />
    </div>
  );
}

/* ── loan details ────────────────────────────────────────────────────── */
export function LoanScreen() {
  const { d } = useFlow();
  const months = ["Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"];
  return (
    <div className="relative flex h-full flex-col bg-[#f7f8fb]">
      <StatusBar />
      <TopBar title="Poonawalla Fincorp loan" onBack={() => d({ type: "screen", screen: "loans" })} onRight={() => d({ type: "screen", screen: "loans" })} />
      <div className="no-bar flex-1 overflow-y-auto px-4 pb-32">
        <Card>
          <div className="flex items-center justify-between text-[12.5px] text-muted">
            Left to pay <Pill tone="ok">Active</Pill>
          </div>
          <p className="text-[36px] font-bold tracking-tight tabular">{inr(20610)}</p>
          <p className="text-[12.5px] text-muted">of {inr(27480)} over 12 EMIs, taken 2 Jul</p>
          <div className="mt-3">
            <EmiBar paid={3} />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3">
            {[
              ["You got", 25000],
              ["Each month", 2290],
              ["Paid so far", 6870],
            ].map(([k, v]) => (
              <span key={k}>
                <span className="block text-[11px] text-muted">{k}</span>
                <span className="block text-[15px] font-bold tabular">{inr(v as number)}</span>
              </span>
            ))}
          </div>
        </Card>
        <div className="mt-6 mb-2 flex justify-between px-1 text-[13px]">
          <span className="font-semibold">Repayment schedule</span>
          <span className="text-muted">3 of 12 paid</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {months.map((m, i) => {
            const paid = i < 3;
            const due = i === 3;
            return (
              <motion.div key={m} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className={cx("rounded-2xl border p-2.5", paid ? "border-ok/20 bg-ok-soft" : due ? "border-ippo-400 bg-white ring-2 ring-ippo-100" : "border-line bg-white")}>
                <span className={cx("flex items-center justify-between text-[11.5px] font-semibold", paid ? "text-ok" : due ? "text-ippo-700" : "text-muted")}>
                  6 {m} {paid && <Icon name="check" size={12} stroke={2.6} />}
                </span>
                <span className="block text-[14px] font-bold tabular">{inr(2290)}</span>
                <span className={cx("block text-[10.5px]", due ? "font-semibold text-ippo-700" : "text-muted")}>{paid ? "Paid" : due ? "Due tomorrow" : `EMI ${i + 1}`}</span>
              </motion.div>
            );
          })}
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex gap-2 bg-gradient-to-t from-[#f7f8fb] via-[#f7f8fb] px-4 pt-6 pb-10">
        <Btn className="flex-1">Pay {inr(2290)}</Btn>
        <Btn tone="ghost" className="flex-1" onClick={() => d({ type: "screen", screen: "chat" })}>
          <IppoMark size={20} /> Ask Ippo
        </Btn>
      </div>
      <HomeIndicator />
    </div>
  );
}

