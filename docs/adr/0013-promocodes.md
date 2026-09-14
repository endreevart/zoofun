# ADR-0013: Promocodes on generation packs and construction worlds

- Status: accepted
- Date: 2026-09-14
- Relates: D-016, D-023, ADR-0006, ADR-0007, ADR-0008

## Context

CRM needed a discount tool without a second ledger. Parents type a code wherever the shop shows a price: site `/pricing`, island pack shop, and island construction copies.

## Decision

1. Table `promo_codes` in the same Postgres. Kind is `percent` or `fixed` (whole RUB). Code is unique uppercase `[A-Z0-9_-]{3,24}`. Optional window (`starts_at` / `ends_at`), redemption cap (`max_redemptions` 0 = unlimited), and `active`.
2. `pack_ids` is a subset of generation packs `pack_1` / `pack_5` / `pack_10` / `pack_15` / `pack_20` and construction SKUs `world_diy_garden` / `world_diy_meadow` / `world_diy_grove`. Empty means all of those.
3. Quote `POST /v1/commerce/quote` with optional `promo_code`. The quote is public (rate-limited) so `/pricing` can show the discounted amount before sign-in. Invalid, inactive, not yet started, expired, exhausted, or wrong SKU returns 400. Never silently charge the list price when a code was sent.
4. Checkout stores `payments.promo_code` and `discount_rub`. T-Bank `Amount` is `payment.amount_rub` after discount, at least 1 ₽. Reuse a pending checkout only if pack, promo, and amount match.
5. Redemptions count confirmed payments, not created checkouts.
6. The island PackSheet and WorldPicker quote after the parent types a code. Pay still goes through ParentGate. Child UI does not collect card data. `/pricing` has the same field next to pack and island prices.

## Consequences

- CRM lists, creates, updates, and activates or deactivates codes. SQLAdmin can edit the same rows.
- Operator-set pack and world prices remain the base; the promo only changes this payment.
