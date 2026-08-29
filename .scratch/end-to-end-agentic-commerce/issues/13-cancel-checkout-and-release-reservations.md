# 13 — Cancel checkout and release reservations

**What to build:** Let a Customer safely reject or abandon an approved checkout before internal Order creation.

**Blocked by:** 00 — Align the application around one Brand; 12 — Evaluate policy and capture exact Approval.

Status: ready-for-agent

- [ ] An explicit cancellation before internal Order creation rejects the active proposal and Approval where applicable.
- [ ] Associated inventory reservations are released exactly once.
- [ ] An expired or already consumed proposal cannot be cancelled into an invalid state.
- [ ] The conversation receives an authoritative cancellation outcome and can resume Cart changes.
- [ ] Cancellation and reservation release are recorded as Audit Events.
