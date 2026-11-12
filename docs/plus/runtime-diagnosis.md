# Capacity-refusal diagnosis (2026-11-12)

Runtime: ZCode desktop harness, Node v26.13.0, main agent on provider `deepseek`,
model `deepseek-flash`. Session `sess_c4642718…` resumed a long NaijaDeals conversation.

Evidence from `~/.zcode/cli/rollout/model-io-session_c4642718….jsonl`:
- 111 completed model calls; latest input 350,380 tokens, output 464 tokens,
  `finishReason: "tool-calls"`, duration ~4 s.
- 0 error/failure records in the model-IO log.
- 0 occurrences of context-length, maximum-context, token-overflow or compaction
  errors in the day's runtime log.
- Message payloads alternate `tail`/`delta` with varying counts, consistent with normal
  long-conversation handling, not a provider rejection.

Control probes executed in the same session: write → read → delete of a scratch file
succeeded; a fresh child `Explore` agent read `package.json` and returned in 2.6 s.

Conclusion: the repeated "insufficient remaining context" refusals were model-generated
caution, not a provider or harness error. Remaining context is not exposed by this
runtime, so no measurement is claimed. No configuration change was made; a fresh session
is the reversible mitigation. Do not repeat the refusal explanation without new evidence.
