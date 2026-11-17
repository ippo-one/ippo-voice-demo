# Ippo · voice loan demo

A live voice call with **Ippo**, IppoPay's loan assistant, running end to end on real systems:

| Step | Real system |
| --- | --- |
| Voice call, Ippo's words and cards | LoanPilot Agents on agent.ippo.one, via `@ippopone/agents-sdk` |
| PAN, credit report (Experian, else Equifax) | app.ippo.one, via `@ippopone/loanpilot` |
| Bank statement: Account Aggregator (Finpass) or PDF upload | app.ippo.one, via `@ippopone/loanpilot` (`aa`, 0.4.0+) |
| Offer (amount, EMI, decision) | LoanPilot's analysis of the statement |

The demo opens on the consent screen; **Agree and Continue** starts the call. Ippo puts each card on the phone with
the `show_step`, `check_pan` and `start_aa` client tools; taps go back to Ippo as the user's words.

## Run

```bash
pnpm install
cp .env.example .env.local   # fill in the keys
pnpm agent:setup             # creates / updates the Ippo agent from agent/ippo.mjs
pnpm dev                     # http://localhost:5180
```

The PAN check pulls a **real, billable** credit report (re-used for 30 days), and Account Aggregator sends a **real
SMS** to `TEST_MOBILE`.

## Backend for the Flutter app

The same server is the backend for [ippo-voice-demo-flutter](https://github.com/ippo-one/ippo-voice-demo-flutter), so
no key ships in the APK:

| Route | For |
| --- | --- |
| `POST /live/connect` | The app's `IppoAgents.tokenProvider`: a room token for one call |
| `/v1/*` | The app's `ippo_loanpilot` SDK: forwards only customers, credit checks, analyses and Account Aggregator, adds the `lp_live_` key, and sets the applicant (`TEST_NAME`, `TEST_MOBILE`) itself |

`/v1/*` answers on localhost only (a phone reaches it through `adb reverse tcp:5180 tcp:5180`).

## Logs

Everything is written to `logs/live.log` (git-ignored): every SDK request and response (`[sdk]`, `[lp-sdk]`), the browser's call events (`[web]`), the Flutter app's (`[app]`) and its LoanPilot calls (`[lp-proxy]`), and the platform's record of each call (`[demo]`). PAN, mobile and
keys are masked.

Presenter-only: `?outcome=upload|pan|locked|none` (kept for the agent's demo scenarios).
