// Shared phone parts: frame, bars, Ippo's mark, buttons, cards and icons.
import { motion } from "motion/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export const inr = (n: number) => "₹" + n.toLocaleString("en-IN");

/* ── icons (24px stroke set) ─────────────────────────────────────────── */
const P = {
  back: "M15 5l-7 7 7 7",
  history: "M3 12a9 9 0 1 0 3-6.7M3 4v4h4M12 7v5l3 2",
  close: "M6 6l12 12M18 6L6 18",
  check: "M5 12.5l4.5 4.5L19 7",
  keyboard: "M3 7h18v11H3zM7 11h.01M11 11h.01M15 11h.01M7 14.5h10",
  pause: "M9 6v12M15 6v12",
  play: "M8 5l11 7-11 7z",
  speaker: "M4 9h4l5-4v14l-5-4H4zM17 9a4 4 0 0 1 0 6",
  doc: "M7 3h7l5 5v13H7zM14 3v5h5",
  bank: "M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18",
  upload: "M12 16V5M7 10l5-5 5 5M5 19h14",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z",
  chevron: "M9 6l6 6-6 6",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  card: "M3 6h18v12H3zM3 10h18",
  report: "M5 3h14v18H5zM9 8h6M9 12h6M9 16h4",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01",
  send: "M4 12l16-8-6 16-3-7z",
  wallet: "M3 7h15a3 3 0 0 1 3 3v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l11-4 2 4M16 13h2",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  bolt: "M13 3L5 14h6l-1 7 8-11h-6z",
  restart: "M4 4v6h6M4.5 15a8 8 0 1 0 1.9-8.3L4 10",
  skip: "M6 5l9 7-9 7zM18 5v14",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z",
} as const;
export type IconName = keyof typeof P;

export function Icon({ name, size = 20, className, stroke = 1.8 }: { name: IconName; size?: number; className?: string; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={P[name]} />
    </svg>
  );
}

/* ── Ippo's mark: an orange orb with three voice bars ────────────────── */
export function IppoMark({ size = 22, live = false }: { size?: number; live?: boolean }) {
  const bars = [0.42, 0.78, 0.55];
  return (
    <span
      className="relative inline-grid shrink-0 place-items-center rounded-full bg-[radial-gradient(circle_at_32%_28%,#ffb37f,#ff6b1a_55%,#ec5608)] shadow-[0_2px_8px_-2px_rgba(236,86,8,.55)]"
      style={{ width: size, height: size }}
    >
      <span className="flex items-center gap-[12%]" style={{ height: size * 0.5, width: size * 0.5 }}>
        {bars.map((h, i) => (
          <motion.span
            key={i}
            className="block flex-1 rounded-full bg-white"
            animate={live ? { scaleY: [h, 1, h * 0.6, h] } : { scaleY: h }}
            transition={live ? { duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" } : { duration: 0.3 }}
            style={{ height: "100%", originY: 0.5 }}
          />
        ))}
      </span>
    </span>
  );
}

/* ── buttons and cards ───────────────────────────────────────────────── */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "ink" | "ghost" | "soft" | "ippo"; size?: "md" | "sm" };
export function Btn({ tone = "ink", size = "md", className, ...p }: BtnProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors disabled:opacity-40",
        size === "md" ? "h-12 px-5 text-[15px]" : "h-9 px-4 text-[13px]",
        tone === "ink" && "bg-ink text-white hover:bg-[#1a2a55]",
        tone === "ghost" && "border border-line bg-white text-ink hover:bg-soft",
        tone === "soft" && "bg-soft text-ink hover:bg-[#eceef3]",
        tone === "ippo" && "bg-ippo-500 text-white hover:bg-ippo-600",
        className,
      )}
      {...(p as object)}
    />
  );
}

export function Card({ children, className, accent }: { children: ReactNode; className?: string; accent?: boolean }) {
  return (
    <div
      className={cx(
        "rounded-[22px] border bg-white p-4 shadow-[0_6px_24px_-14px_rgba(15,27,61,.25)]",
        accent ? "border-ippo-400 ring-2 ring-ippo-100" : "border-line",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Pill({ children, tone = "plain" }: { children: ReactNode; tone?: "ok" | "bad" | "warn" | "plain" | "ippo" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold",
        tone === "ok" && "bg-ok-soft text-ok",
        tone === "bad" && "bg-bad-soft text-bad",
        tone === "warn" && "bg-warn-soft text-warn",
        tone === "plain" && "bg-soft text-muted",
        tone === "ippo" && "bg-ippo-100 text-ippo-700",
      )}
    >
      {children}
    </span>
  );
}

/** Round tick / spinner / empty mark for checklists. */
export function Tick({ state }: { state: "done" | "doing" | "todo" | "bad" }) {
  if (state === "done")
    return (
      <span className="grid size-5 place-items-center rounded-full bg-ok text-white">
        <Icon name="check" size={12} stroke={3} />
      </span>
    );
  if (state === "bad")
    return (
      <span className="grid size-5 place-items-center rounded-full bg-bad text-white">
        <Icon name="close" size={11} stroke={3} />
      </span>
    );
  if (state === "doing")
    return <motion.span className="block size-5 rounded-full border-2 border-ippo-200 border-t-ippo-500" animate={{ rotate: 360 }} transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }} />;
  return <span className="block size-5 rounded-full border-2 border-line" />;
}

/** The lending platform's wordmark (the partner that matches lenders for IppoPay). */
export function FinMeadows({ small }: { small?: boolean }) {
  return (
    <span className={cx("inline-flex flex-col items-center leading-none", small ? "gap-0.5" : "gap-1.5")}>
      <span className={cx("font-black tracking-tight text-[#d6274a]", small ? "text-[9px]" : "text-[34px]")} style={{ fontStretch: "condensed" }}>
        FIN MEADOWS
      </span>
      <span className={cx("font-semibold tracking-wide text-ink", small ? "text-[4.5px]" : "text-[10px]")}>TECHNOLOGIES PRIVATE LIMITED</span>
    </span>
  );
}

/* ── the phone ───────────────────────────────────────────────────────── */
export const PHONE_W = 402;
export const PHONE_H = 874;

export function StatusBar({ dark }: { dark?: boolean }) {
  return (
    <div className={cx("phone-status relative z-30 flex h-[54px] shrink-0 items-center justify-between px-9 pt-1 text-[16px] font-semibold", dark ? "text-white" : "text-ink")}>
      <span className="tabular">9:41</span>
      <span className="absolute top-[11px] left-1/2 h-[37px] w-[125px] -translate-x-1/2 rounded-full bg-black" />
      <span className="flex items-center gap-1.5">
        <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx="1" /><rect x="5" y="5.5" width="3" height="6.5" rx="1" /><rect x="10" y="3" width="3" height="9" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" /></svg>
        <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor"><path d="M8 2.5c2.2 0 4.2.8 5.7 2.2l1.3-1.4C13.1 1.5 10.7.5 8 .5S2.9 1.5 1 3.3l1.3 1.4C3.8 3.3 5.8 2.5 8 2.5zm0 3.6c1.2 0 2.3.4 3.2 1.2l1.3-1.4C11.3 4.8 9.7 4.1 8 4.1s-3.3.7-4.5 1.8l1.3 1.4c.9-.8 2-1.2 3.2-1.2zM8 9.6l1.9-2c-.5-.4-1.2-.7-1.9-.7s-1.4.3-1.9.7z" /></svg>
        <span className="relative h-[13px] w-[26px] rounded-[4px] border border-current opacity-90"><span className="absolute inset-[1.5px] right-[3px] rounded-[2px] bg-current" /></span>
      </span>
    </div>
  );
}

export function HomeIndicator({ dark }: { dark?: boolean }) {
  return <div className={cx("phone-home absolute bottom-2 left-1/2 z-40 h-[5px] w-[139px] -translate-x-1/2 rounded-full", dark ? "bg-white" : "bg-ink")} />;
}

export function RoundBtn({ icon, onClick, label }: { icon: IconName; onClick?: () => void; label: string }) {
  return (
    <motion.button whileTap={{ scale: 0.92 }} onClick={onClick} aria-label={label} className="grid size-11 place-items-center rounded-full border border-line/80 bg-white/80 text-ink backdrop-blur">
      <Icon name={icon} size={19} />
    </motion.button>
  );
}

export function TopBar({ title, center, onBack, onRight, rightIcon = "history", rightLabel = "My loans" }: { title?: string; center?: ReactNode; onBack?: () => void; onRight?: () => void; rightIcon?: IconName; rightLabel?: string }) {
  return (
    <div className="relative z-20 flex h-[62px] shrink-0 items-center justify-between px-4">
      <RoundBtn icon="back" onClick={onBack} label="Back" />
      {center ?? <span className="text-[17px] font-semibold">{title}</span>}
      <RoundBtn icon={rightIcon} onClick={onRight} label={rightLabel} />
    </div>
  );
}

/** Soft orange glow at the bottom of the conversation screens. */
export function Glow({ strong }: { strong?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[46%]">
      <div className={cx("absolute -bottom-24 -left-16 size-[340px] rounded-full bg-ippo-200 blur-3xl", strong ? "opacity-60" : "opacity-30")} />
      <div className={cx("absolute -right-20 -bottom-28 size-[360px] rounded-full bg-[#ffc9a3] blur-3xl", strong ? "opacity-70" : "opacity-35")} />
      <div className="absolute -bottom-10 left-1/3 size-[220px] rounded-full bg-[#ffe1c7] opacity-50 blur-3xl" />
    </div>
  );
}
