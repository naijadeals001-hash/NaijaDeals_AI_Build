# NaijaDeals Plus+ — commercial decisions required

No value below is proposed, implied or defaulted in code. Each item blocks a specific
capability and nothing else.

| # | Decision | Blocks | Current behaviour without it |
|---|---|---|---|
| 1 | Plan names, number of tiers and position (free tier, paid tier, business tier) | Plan records, eligibility copy | No plan exists; every country says "Not yet available" |
| 2 | Price per tier, currency per market, monthly/annual periods, tax treatment | Priced activation, checkout | Priced activation refused `paid_activation_not_approved`; no checkout |
| 3 | Trial or introductory offer, if any (length, eligibility, conversion) | Activation flow | No trial is offered or mentioned |
| 4 | Cancellation, refund and failed-renewal rules | Terms record, lifecycle transitions, customer terms page | No cancellation/refund text exists; no membership can be bought |
| 5 | Benefit register: which benefits are genuine, their value, and which are enforced server-side per vertical | `PlusBenefit` rows, entitlement enforcement | Benefits area is an honest empty state |
| 6 | Eligible countries per tier and launch order | `PlusPlanCountry`, country availability | All countries "Not yet available" |
| 7 | Advertiser eligibility, disclosure wording and approval policy | Sponsored promotions | Review workflow exists; nothing can publish without approval and a sponsor name |
| 8 | Whether house promotions may ever outrank organic service cards | Ordering policy | House promotions are a separate, labelled section |
| 9 | Member data and consent terms for personalisation | Personalised benefit eligibility | None implemented |
| 10 | Renewal, dunning and payout/accounting policy for membership revenue | Membership billing engine | Not implemented |

Approval must name the values and the effective date. Until then the system stays
configuration-only, and the public page states that membership is not open.
