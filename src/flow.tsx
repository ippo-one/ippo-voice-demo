// The demo's state: which phone screen is up, the live call, and the chat so far.
import { createContext, useContext, useMemo, useReducer, type Dispatch, type ReactNode } from "react";

/** Phone screens. "entry" is the consent screen the demo starts on; "chat" is the call with Ippo. */
export type Screen = "entry" | "chat" | "lender" | "loans" | "loan";

/** A card Ippo can put on the phone. */
export type StepId =
  | "heard" | "pan" | "checkCredit" | "panOk" | "panInvalid" | "bankChoice"
  | "upStart" | "upLocked" | "upPartial" | "upDone" | "aaBank" | "aaOtp" | "checkBank"
  | "offers" | "noOffer" | "applyNote" | "lenderBack" | "applied" | "disbursed"
  // real steps, backed by the LoanPilot SDK on app.ippo.one
  | "credit" | "statement" | "realOffer" | "aa";

/** What the user said or did: words, a file, or a status note. */
export type UserBit =
  | { kind: "say"; text: string; mono?: boolean }
  | { kind: "file"; name: string; note: string; locked?: boolean }
  | { kind: "note"; text: string; tone?: "ok" | "bad" | "plain" };

/** One turn in the chat: the user's words, Ippo's words (`said`), and/or a card Ippo showed. */
export type Turn = {
  key: number;
  user?: UserBit;
  said?: string;
  /** Ippo is still saying this line: sentences arrive as they start being spoken */
  saying?: boolean;
  step?: StepId;
  /** the amount Ippo heard or offered, in rupees, when the card shows one */
  amount?: number;
  /** real data behind the card (credit report, analysis), from the LoanPilot SDK */
  data?: Record<string, any>;
};

export type Live = {
  status: "idle" | "connecting" | "on" | "error";
  error?: string;
  botSpeaking: boolean;
  /** Ippo has the user's turn and is working on a reply (since this time, ms) */
  thinkingSince?: number;
  /** the bot reported an error on the last turn */
  turnError?: string;
};

/** How the user talks to Ippo: a call inside the app, or Ippo ringing their phone. */
export type Channel = "app" | "phone";

export type State = {
  screen: Screen;
  turns: Turn[];
  /** mic muted */
  muted: boolean;
  live: Live;
  /** bumps on every restart */
  run: number;
  channel: Channel;
  /** the mobile number Ippo rings, in phone mode */
  phoneTo: string;
};

export type Action =
  | { type: "screen"; screen: Screen }
  | { type: "mute"; on: boolean }
  | { type: "restart" }
  | { type: "live"; live: Partial<Live> }
  | { type: "user"; user: UserBit }
  | { type: "said"; text: string }
  | { type: "saying"; text: string }
  | { type: "step"; step: StepId; amount?: number; data?: Record<string, any> }
  | { type: "channel"; channel: Channel; phoneTo?: string }
  | { type: "transcript"; lines: { role: string; text: string }[] };

const initial: State = { screen: "entry", turns: [], muted: false, live: { status: "idle", botSpeaking: false }, run: 0, channel: "app", phoneTo: "+91 " };

let keySeq = 0;

function reduce(s: State, a: Action): State {
  switch (a.type) {
    case "screen":
      return { ...s, screen: a.screen };
    case "mute":
      return { ...s, muted: a.on };
    case "restart":
      return { ...initial, channel: s.channel, phoneTo: s.phoneTo, run: s.run + 1 };
    case "channel":
      return { ...s, channel: a.channel, phoneTo: a.phoneTo ?? s.phoneTo };
    case "transcript":
      // phone mode: the platform's transcript so far, one turn per line (stable keys, so lines don't re-animate)
      return {
        ...s,
        turns: a.lines.map((l, i) => (l.role === "user" ? { key: -(i + 1), user: { kind: "say", text: l.text } } : { key: -(i + 1), said: l.text })),
      };
    case "live":
      return { ...s, live: { ...s.live, ...a.live } };
    case "user":
      return { ...s, screen: "chat", turns: [...s.turns, { key: ++keySeq, user: a.user }] };
    case "saying": {
      // a sentence Ippo starts speaking now: add it to the line in progress, so text and voice land together
      const last = s.turns[s.turns.length - 1];
      // the bot sometimes sends the finished line before (or while) speaking it: don't show a sentence twice
      if (last?.said && last.said.includes(a.text)) return s;
      if (last?.saying) return { ...s, turns: [...s.turns.slice(0, -1), { ...last, said: `${last.said ?? ""} ${a.text}`.trim() }] };
      if (last && !last.said && (last.user || last.step)) return { ...s, turns: [...s.turns.slice(0, -1), { ...last, said: a.text, saying: true }] };
      return { ...s, turns: [...s.turns, { key: ++keySeq, said: a.text, saying: true }] };
    }
    case "said": {
      // the finished line: replaces the sentences shown while speaking
      const last = s.turns[s.turns.length - 1];
      if (last?.saying) return { ...s, turns: [...s.turns.slice(0, -1), { ...last, said: a.text, saying: false }] };
      // Ippo's words answer the user's last line, or caption a card shown just before them
      if (last && !last.said && (last.user || last.step)) return { ...s, turns: [...s.turns.slice(0, -1), { ...last, said: a.text }] };
      return { ...s, turns: [...s.turns, { key: ++keySeq, said: a.text }] };
    }
    case "step": {
      // the card goes under what Ippo just said; otherwise it stands on its own
      const last = s.turns[s.turns.length - 1];
      if (last && last.said && !last.step) return { ...s, screen: "chat", turns: [...s.turns.slice(0, -1), { ...last, step: a.step, amount: a.amount, data: a.data }] };
      return { ...s, screen: "chat", turns: [...s.turns, { key: ++keySeq, step: a.step, amount: a.amount, data: a.data }] };
    }
  }
}

const Ctx = createContext<{ s: State; d: Dispatch<Action> } | null>(null);

export function FlowProvider({ children }: { children: ReactNode }) {
  const [s, d] = useReducer(reduce, initial);
  const v = useMemo(() => ({ s, d }), [s]);
  // dev only: lets a test feed agent events without a real call
  if (import.meta.env.DEV) (window as unknown as { __ippo?: Dispatch<Action> }).__ippo = d;
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}

export function useFlow() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useFlow outside FlowProvider");
  return v;
}
