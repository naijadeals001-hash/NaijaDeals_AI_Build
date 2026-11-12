# NaijaDrive driver economics model

**Status: design and local calculation template only.** No rate, commission, subscription, incentive,
tip, fee, guarantee or income figure in this document is approved, configured or encoded. The only
behaviour currently encoded is:

- a wallet-paid ride releases **100% of the server-locked fare** to the driver wallet
  (`lib/services/core/drive.service.ts:539-578`);
- a cash ride is recorded as collected and the driver keeps the cash
  (`lib/services/core/drive.service.ts:768-809`);
- the cancellation fee is **zero** because no policy is defined
  (`lib/services/core/drive.service.ts:359-366`);
- there is no driver payout, commission, tip, incentive or statement feature (§3.6 of
  `current-state-audit.md`).

This model exists so a commercial decision can be made on visible arithmetic instead of a headline
"per hour" number that hides pickup distance, waiting and fixed costs.

---

## 1. Principles

1. **Show the time waterfall.** Online time is split into engaged trip time, pickup approach time,
   pickup waiting time and idle available time. A per-hour figure is only meaningful next to all
   four.
2. **Do not hide deadhead.** The distance and fuel used to reach the passenger are real costs even
   though they earn no fare.
3. **Do not hide unpaid waiting.** Waiting at the pickup is time with no fare; it is disclosed as
   hours and as an optional opportunity cost, never silently netted away.
4. **Separate platform deductions from driver costs.** A commission is not fuel, and a subscription
   is not maintenance.
5. **Use integer minor units.** Compute in kobo (BigInt or integer arithmetic), present in naira, and
   round only at presentation. No floating-point accumulation of money.
6. **Label every assumption.** A worked example is a scenario, not observed income or a market rate.
7. **No cross-currency balancing.** This model is NGN-only.

---

## 2. Notation and formulas

### 2.1 Trip revenue

For one completed trip:

```
gross_fare_G   = base_kobo + distance_kobo + time_kobo + rounding_kobo
trip_revenue_R = G + tip + incentive_alloc + cancellation_compensation
                 - refund_or_adjustment_clawback
```

- `G` comes from the server quote. In the current build it is itemised and becomes the locked fare at
  request time (`lib/config/drive.ts:330-365`).
- `tip` is **not implemented**; set 0 unless a tip feature is approved.
- `incentive_alloc` is a period incentive allocated to this trip; **not implemented**.
- `cancellation_compensation` is currently 0 because the cancellation fee is 0.
- `refund_or_adjustment_clawback` is money the platform recovers from the driver. The policy for
  whether a refund is borne by the driver, the platform or both is **undecided**.

### 2.2 Platform deductions

```
platform_deduction_D =
      commission_rate * G
    + fixed_per_trip_fee
    + subscription_alloc
    + payout_fee_alloc
    + other_platform_fee
```

- `commission_rate` is a rate on the gross fare in this formula. Whether commission also applies to
  tips, incentives or cancellation compensation is a policy input; if it does, add those bases
  explicitly.
- `subscription_alloc` is the subscription fee allocated to the period in which this trip occurred:
  `subscription_fee * (online_hours_in_period / subscription_period_online_hours)`, or simply a
  per-online-hour plan rate multiplied by the session's online hours.
- `payout_fee_alloc` is the withdrawal/payout fee allocated to the trip. There is no driver payout
  flow today; set 0 until one exists.
- A **customer-side booking fee** is not a driver deduction. If one is introduced, it increases what
  the customer pays without changing `G` or the driver's deduction, unless the policy says otherwise.

### 2.3 Driver operating costs

```
paid_distance_km      = d_paid
deadhead_distance_km  = d_deadhead
total_distance_km     = d_paid + d_deadhead

fuel_cost =
      total_distance_km * (fuel_l_per_100km / 100) * fuel_price_per_l
    + engine_idle_hours * idle_l_per_hour * fuel_price_per_l

maintenance_cost = total_distance_km * maintenance_allowance_per_km

variable_cost_C_var = fuel_cost + maintenance_cost + tolls + parking + cleaning

fixed_cost_C_fixed =
      insurance_licensing_alloc
    + rental_or_finance_alloc
    + phone_data_alloc
    + other_fixed_alloc
```

- `maintenance_allowance_per_km` is a reserve for servicing, tyres, brakes and wear. It is not a
  cash payment in the period; it is the amount that must be set aside to keep the vehicle roadworthy.
- `insurance_licensing_alloc` and `rental_or_finance_alloc` are period costs allocated by online
  hours (or by days, if that is the actual contract).
- Fuel is charged on **paid + deadhead distance**, and on engine idling while waiting in traffic or at
  the pickup. A driver who ignores deadhead fuel will overstate net earnings.
- Tolls, parking and cleaning are optional inputs; they are real in Lagos but vary by route.

### 2.4 Net earnings

```
net_earnings_N = sum(trip_revenue_R)
               - sum(platform_deduction_D)
               - sum(variable_cost_C_var)
               - sum(fixed_cost_C_fixed)
```

Do not subtract a subscription twice: it appears once in `platform_deduction_D`. Do not subtract
income tax in this model unless a tax input is explicitly added; this model currently excludes tax,
VAT and any statutory contribution.

### 2.5 Time and hourly metrics

```
engaged_hours_H_engage  = sum(completed_at - started_at)
approach_hours_H_approach = sum(arrived_at - accepted_at)
wait_hours_H_wait       = sum(started_at - arrived_at)
idle_hours_H_idle       = online_hours
                        - engaged_hours
                        - approach_hours
                        - wait_hours
                        - other_online_hours

online_hours_H_online   = engaged_hours + approach_hours + wait_hours
                        + idle_hours + other_online_hours
```

The four disclosed metrics are:

```
net_per_online_hour        = N / H_online
net_per_engaged_trip_hour  = N / H_engage
net_per_completed_trip     = N / completed_trips
net_per_paid_km            = N / sum(d_paid)
```

Supporting metrics:

```
gross_fare_per_online_hour = sum(G) / H_online
platform_deduction_per_online_hour = sum(D) / H_online
cost_per_paid_km = (sum(D) + sum(C_var) + sum(C_fixed)) / sum(d_paid)
break_even_fare_per_paid_km = cost_per_paid_km   # before any margin
```

**Never report `net_per_engaged_trip_hour` alone.** It excludes approach, waiting and idle time and
will always look better than the driver's actual online-hour experience. Report it next to
`net_per_online_hour` and the time waterfall.

### 2.6 Optional opportunity cost of unpaid time

```
imputed_wait_cost = (H_wait + H_idle) * target_net_hourly_rate
```

This is **not** a cash cost and must not be subtracted from `N`. It is a sensitivity that answers:
"What would those hours be worth at a target rate?" Keep it in a separate line.

### 2.7 Current telemetry support

| Input | Available today? | Notes |
| --- | --- | --- |
| `G`, `base`, `distance`, `time`, `rounding` | Yes | Recorded on the `Ride`; receipt rebuilds them |
| `accepted_at`, `arrived_at`, `started_at`, `completed_at` | Yes | `Ride` columns; supports separate approach and wait |
| `d_paid` | Approximate | The quote stores haversine × 1.35 road factor, not an odometer |
| `d_deadhead` | No direct field | Requires GPS trace calculation or driver input; not billed or stored as a metric |
| `H_online` | Yes | Presence events, 120-second TTL, Lagos-day clipping |
| Tips, incentives, refunds, commission, payout fee | No | Not implemented; inputs must be 0 or explicitly labelled scenario values |
| Fuel, maintenance, insurance, rental | No | Driver-supplied inputs; not collected by the platform |
| Tax | No | Excluded; requires an explicit input and policy |

The current dashboard's `todayPickupSeconds` is `accepted_at -> started_at`, which combines approach
and wait (`lib/services/core/drive.service.ts:1619-1633`). The model separates them using
`arrived_at`; a future report can do the same.

---

## 3. Editable local inputs

Copy the block below into a local spreadsheet or calculator. Every value is an **assumption** unless
marked "server quote". Do not treat the defaults as approved rates or observed costs.

```ini
# NaijaDrive driver-economics local inputs (NGN unless stated)
# All money is in naira for readability; compute in kobo if implementing.
gross_fare_ngn=7750.00              # server quote for the worked route, economy class
paid_distance_km=27.941             # server quote distance (haversine x 1.35), not an odometer
engaged_hours=1.0                   # ASSUMPTION: actual trip time
deadhead_distance_km=5.0            # ASSUMPTION: distance to the pickup
approach_hours=0.25                 # ASSUMPTION: 15 minutes to the pickup
wait_hours=0.0833                   # ASSUMPTION: 5 minutes waiting at the pickup
online_hours=3.0                    # ASSUMPTION: the online session containing this trip
engine_idle_hours=0.0833            # ASSUMPTION: engine idling during the wait
other_online_hours=0.0               # online but not engaged/approaching/waiting/idle
fuel_l_per_100km=9.0                # ASSUMPTION: saloon car consumption
fuel_price_ngn_per_l=1000.00        # ASSUMPTION: replace with the price actually paid
idle_l_per_hour=0.6                 # ASSUMPTION: idling consumption
maintenance_ngn_per_km=25.00        # ASSUMPTION: servicing/tyre reserve
insurance_licensing_ngn_per_year=180000.00  # ASSUMPTION
online_hours_per_month=200          # ASSUMPTION: used to allocate annual/monthly fixed costs
phone_data_ngn_per_online_hour=10.00 # ASSUMPTION
rental_or_finance_ngn_per_session=0.00 # ASSUMPTION: 0 means an owned vehicle
tolls_ngn=0.00                      # ASSUMPTION
parking_ngn=0.00                    # ASSUMPTION
cleaning_ngn=0.00                   # ASSUMPTION
payout_fee_ngn=50.00                # ASSUMPTION: no driver payout exists yet
commission_rate=0.00                # BASE CASE: matches the encoded 0% deduction
fixed_per_trip_fee_ngn=0.00         # not implemented
subscription_ngn_per_month=0.00     # not implemented
tip_ngn=0.00                        # not implemented
incentive_ngn=0.00                  # not implemented
refund_or_adjustment_ngn=0.00       # policy undecided
tax_rate=0.00                       # excluded from this model
```

For a scenario with a per-trip commission, change only `commission_rate` (for example 0.10, 0.15 or
0.20). For a subscription scenario, set `subscription_ngn_per_month` and allocate it by online hours.
For a hybrid, set both.

---

## 4. Worked NGN example

**This is a scenario, not a claim of actual income.** The fare and distance come from the current
server quote for Economy, Computer Village → Victoria Island. The time, fuel price, consumption,
maintenance reserve, insurance and all other costs are assumptions in §3.

### 4.1 Server quote (verified by running the quote function)

| Component | Kobo | Naira |
| --- | ---: | ---: |
| Base fare | 70,000 | 700.00 |
| Distance (27.941 km at ₦180/km) | 502,938 | 5,029.38 |
| Time (80 estimated minutes at ₦25/min) | 200,000 | 2,000.00 |
| Rounding to the nearest ₦50 | +2,062 | +20.62 |
| **Locked fare `G`** | **775,000** | **7,750.00** |

The 80 minutes is the quote's estimate, not the actual trip time. The example assumes the trip
actually takes 60 minutes.

### 4.2 Time waterfall for the session

| Bucket | Hours | Minutes | Share of online time |
| --- | ---: | ---: | ---: |
| Engaged trip (`started_at` → `completed_at`) | 1.000 | 60 | 33.3% |
| Pickup approach (`accepted_at` → `arrived_at`) | 0.250 | 15 | 8.3% |
| Pickup wait (`arrived_at` → `started_at`) | 0.083 | 5 | 2.8% |
| Idle available (no trip) | 1.667 | 100 | 55.6% |
| **Online total** | **3.000** | **180** | **100%** |

### 4.3 Cost build-up (base case, 0% commission)

| Line | Calculation | Naira |
| --- | --- | ---: |
| Gross fare | server quote | 7,750.00 |
| Tips / incentives / adjustments | not implemented | 0.00 |
| Platform commission | 0% × 7,750.00 | 0.00 |
| Subscription allocation | 0 | 0.00 |
| Payout fee | one withdrawal this session | 50.00 |
| **Platform deductions** | | **50.00** |
| Fuel, paid + deadhead distance | 32.941 km × 0.09 L/km × ₦1,000/L | 2,964.69 |
| Fuel, idling | 0.0833 h × 0.6 L/h × ₦1,000/L | 50.00 |
| Maintenance/tyre reserve | 32.941 km × ₦25/km | 823.53 |
| Tolls / parking / cleaning | assumptions | 0.00 |
| **Variable costs** | | **3,838.22** |
| Insurance/licensing allocation | ₦180,000/year ÷ 12 ÷ 200 h × 3 h | 225.00 |
| Phone/data allocation | ₦10/h × 3 h | 30.00 |
| Rental/finance | owned vehicle assumption | 0.00 |
| **Fixed-cost allocation** | | **255.00** |
| **Net earnings** | 7,750.00 − 50.00 − 3,838.22 − 255.00 | **3,606.78** |

### 4.4 Resulting metrics

| Metric | Value |
| --- | ---: |
| Net earnings per online hour | **₦1,202.26** |
| Net earnings per engaged trip hour | **₦3,606.78** |
| Net earnings per completed trip | **₦3,606.78** |
| Net earnings per paid km | **₦129.09** |
| Gross fare per online hour | ₦2,583.33 |
| All-in cost per paid km | ₦148.28 |
| Time with no fare (approach + wait + idle) | 120 minutes (66.7% of the session) |

The gap between ₦3,606.78 per engaged hour and ₦1,202.26 per online hour is the entire point of the
model: 67% of the online session was not engaged trip time.

### 4.5 Sensitivity to a per-trip commission (illustrative, not approved)

| Commission rate | Deduction | Net after costs | Net per online hour | Net per engaged hour |
| ---: | ---: | ---: | ---: | ---: |
| 0% (encoded behaviour) | ₦0.00 | ₦3,606.78 | ₦1,202.26 | ₦3,606.78 |
| 10% (illustrative) | ₦775.00 | ₦2,831.78 | ₦943.93 | ₦2,831.78 |
| 15% (illustrative) | ₦1,162.50 | ₦2,444.28 | ₦814.76 | ₦2,444.28 |
| 20% (illustrative) | ₦1,550.00 | ₦2,056.78 | ₦685.60 | ₦2,056.78 |

These percentages are arithmetic examples only. No commission rate is approved and none is encoded.

### 4.6 Sensitivity to subscription and hybrid models (illustrative)

Assumption: 200 online hours per month, so ₦30,000/month is ₦150 per online hour and ₦15,000/month is
₦75 per online hour.

| Model | Deduction for this 3-hour session | Net after costs | Net per online hour |
| --- | ---: | ---: | ---: |
| Subscription ₦30,000/month, 0% commission | ₦450.00 | ₦3,156.78 | ₦1,052.26 |
| Hybrid ₦15,000/month + 5% commission | ₦225.00 + ₦387.50 = ₦612.50 | ₦2,994.28 | ₦998.09 |
| Per-trip 15% commission (for comparison) | ₦1,162.50 | ₦2,444.28 | ₦814.76 |

A subscription is cheaper per online hour at high utilization and more expensive at low utilization.
That trade-off is a commercial decision, not a conclusion of this document.

### 4.7 What the example does not include

- Income tax, VAT or statutory contributions.
- Depreciation or the capital cost of the vehicle (only the maintenance/tyre reserve and any rental or
  finance payment).
- Fines, accidents, downtime, illness or unpaid leave.
- Surge, tips, incentives or guarantees (none are implemented).
- Waiting before acceptance, cruising for requests, or time spent offline doing admin.
- The 80-minute quote estimate versus the 60-minute actual trip; real trips vary.

---

## 5. Comparison of the three funding models

This comparison describes implications; it does not choose a model. No rate is approved. The
"current code" column states what exists at HEAD `ecd0e54`.

### 5.1 Driver keeps the full fare

| Dimension | Implication |
| --- | --- |
| Customer charge | Customer pays the fare `G` (plus any separate fee if one is later added). No platform deduction is baked into the fare. |
| Driver deduction | Zero platform deduction from the fare. The driver bears fuel, maintenance, insurance, rental and waiting. |
| Refund | If a refund is owed, the platform must fund it from its own account, recover it from the driver, or refuse it. There is no driver clawback mechanism today. The cancellation fee is zero. |
| Platform revenue | Zero from the ride itself. Revenue must come from another product (subscription, delivery, shop commission, advertising) or the model runs at a loss equal to payment processing, support and safety costs. |
| Config / accounting changes | No fare-split change: current `releaseHoldToDriver` already credits the full fare. Would need a platform revenue source, a refund reserve, a policy for who bears chargebacks, and disclosure that the platform takes no ride commission. No commission ledger is needed. |
| Current code fit | **This is what the code does** for wallet rides; cash is collected directly by the driver. It is a behaviour, not an approved commercial model. |

### 5.2 Per-trip commission

| Dimension | Implication |
| --- | --- |
| Customer charge | Either the customer pays `G` and the driver receives `G − cG` (commission inside the fare), or the customer pays `G + fee` and the driver receives `G` (commission added on top). The choice changes the customer price and must be explicit. |
| Driver deduction | `c × G` plus any fixed per-trip fee. Driver net is reduced by the commission before operating costs. |
| Refund | Commission must be reversed proportionally on a partial refund, and the platform/vendor share allocation must match the refund policy. The existing `allocateRefundShares` already reverses commission proportionally for shop orders, but the drive path has no commission. A partial refund before completion is currently broken by the `completeOrder` defect (§4.1 of the audit). |
| Platform revenue | `c × G` per trip plus fixed fees; scales with trip volume but depends on fare levels and driver acceptance. |
| Config / accounting changes | Add a commission-rate configuration (not hard-coded), compute the platform share at release, post a platform revenue ledger account, credit only the driver net, disclose the deduction on the quote/receipt, add a driver earnings statement, define refund/tip/incentive bases, and add admin controls with audit. Also fix the escrow amount tracking so a partial refund cannot release the original total. |
| Current code fit | **Not encoded.** The driver receives 100%. The schema has no drive commission field and `releaseHoldToDriver` has no split. |

### 5.3 Subscription or hybrid

| Dimension | Implication |
| --- | --- |
| Customer charge | The customer still pays the fare (or a fare adjusted by policy). The subscription is paid by the driver, not the customer, unless a separate customer membership is introduced. |
| Driver deduction | A periodic subscription (for example monthly or per online hour) and, in a hybrid, a lower per-trip commission. The driver pays regardless of low demand, so utilization risk moves to the driver. |
| Refund | Trip refunds are unaffected by the subscription in principle, but the subscription refund/cancellation policy, non-payment suspension and unused-time credit must be defined. The platform may have to absorb trip refunds because there is no per-trip commission to reverse. |
| Platform revenue | Recurring subscription revenue plus any hybrid commission. More predictable per active driver, but dependent on driver count and churn; unpaid subscriptions and access suspension need handling. |
| Config / accounting changes | Add subscription plan and entitlement models, a billing provider and invoice/receipt flow, revenue recognition over the subscription period, non-payment suspension, refund/credit policy, driver statements, and a per-trip commission only if the hybrid uses one. No subscription model exists today. |
| Current code fit | **Not encoded.** There is no subscription table, billing route or access entitlement. |

### 5.4 At-a-glance comparison

| Question | Full fare | Per-trip commission | Subscription / hybrid |
| --- | --- | --- | --- |
| Who bears demand risk? | Platform (no ride revenue) | Shared: platform earns only when trips happen | Driver (pays in low demand) |
| Customer price | Fare only | Fare, or fare + fee | Fare (plus any membership) |
| Driver marginal deduction | 0 | `c × G` per trip | Subscription allocated per period, plus optional lower `c` |
| Platform revenue per trip | 0 | `c × G` | 0 per trip (subscription) or lower `c × G` |
| Refund complexity | Platform must fund or recover | Reverse commission proportionally | Trip refunds separate from subscription refunds |
| Accounting additions | Revenue source, refund reserve | Commission revenue account, split release, statements | Subscription billing, deferred revenue, entitlement/suspension |
| Current code | Matches full-fare release | Not implemented | Not implemented |

**No model is selected here.** A decision needs approved customer pricing, driver terms, refund policy,
tax treatment and a legal review. Until then, no rate is encoded beyond the existing full-fare
behaviour.

---

## 6. Guardrails for any future implementation

1. Compute in kobo and store integer amounts; never use floating point for money.
2. Make every rate a configuration value with an effective date and an audit trail; do not hard-code a
   commercial rate in a service.
3. Disclose the deduction on the quote, before the rider requests, and on the receipt.
4. Show the driver gross, deductions, net and the time waterfall; do not show only a headline hourly
   figure.
5. Keep tips, incentives, refunds and adjustments as separate ledger lines so they can be reconciled.
6. Fund refunds from a defined account; never create a negative driver balance without an explicit
   recovery policy.
7. Treat waiting and deadhead as first-class metrics, even if they are not charged.
8. Do not call any figure a guarantee, minimum or expected income without an approved policy and
   sufficient funding.
9. Resolve the two financial defects in `current-state-audit.md` §4 before enabling live money or any
   new deduction.
10. Validate any model change against a controlled dataset; the current full-fare behaviour is not
    evidence that a commission or subscription works.
