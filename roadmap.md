# Checkout corrections
- [x] Diagnose Pix failure: order selected inactive ImperiumPay; no attempt or HTTP call occurred.
- [x] Gate shipping and payment on a complete valid physical address.
- [x] Improve safe payment diagnostics and preserve ambiguous transaction IDs.
- [x] Run 13 simulated unit tests and real public checkout address/shipping flow; simulated Pix panel and unknown-result message verified.
- [ ] Live Pix generation: blocked on explicit authorization and gateway activation by the store; no charges requested.
- [ ] Hosted runtime credential check: blocked on admin preview sign-in; secrets are saved but runtime availability is unverified.