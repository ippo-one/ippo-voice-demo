// Demo page: only the phone. On a real phone the screen fills the display; on a laptop it sits in a frame.
// Presenter-only: ?outcome=upload|pan|locked|none picks the scenario Ippo plays (default: all goes well).
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { ChatScreen } from "./Chat";
import { FlowProvider, useFlow, type Screen } from "./flow";
import { EntryScreen, LenderScreen, LoanScreen, LoansScreen } from "./screens";
import { PHONE_H, PHONE_W } from "./ui";

const SCREENS: Record<Screen, () => ReactNode> = {
  entry: EntryScreen,
  chat: ChatScreen,
  lender: LenderScreen,
  loans: LoansScreen,
  loan: LoanScreen,
};

function useViewport() {
  const get = () => ({ w: window.innerWidth, h: window.innerHeight });
  const [v, setV] = useState(get);
  useEffect(() => {
    const on = () => setV(get());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return v;
}

function Screens() {
  const { s } = useFlow();
  const View = SCREENS[s.screen];
  return (
    <>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={s.screen + s.run} className="absolute inset-0" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}>
          <View />
        </motion.div>
      </AnimatePresence>
    </>
  );
}

function Phone() {
  const { w, h } = useViewport();
  // a phone-sized window: the app is the whole page
  if (w < 520)
    return (
      <div className="bare relative h-dvh w-full overflow-hidden bg-white">
        <Screens />
      </div>
    );
  const k = Math.max(0.5, Math.min(1, (h - 48) / (PHONE_H + 24), (w - 32) / (PHONE_W + 24)));
  return (
    <div className="grid min-h-dvh place-items-center py-6">
      <div style={{ width: (PHONE_W + 24) * k, height: (PHONE_H + 24) * k }}>
        <div style={{ width: PHONE_W + 24, height: PHONE_H + 24, transform: `scale(${k})`, transformOrigin: "top left" }} className="rounded-[64px] bg-[#16181d] p-3 shadow-[0_40px_80px_-30px_rgba(15,27,61,.55),inset_0_0_0_2px_#2c2f36]">
          <div className="relative h-full w-full overflow-hidden rounded-[52px] bg-white">
            <Screens />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <FlowProvider>
      <Phone />
    </FlowProvider>
  );
}
