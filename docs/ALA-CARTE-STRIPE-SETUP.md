# Meat House A La Carte + Stripe — Setup & Test Runbook

Status: **built but customer release locked by default**.

## Architecture

Included table → configured free rounds → A La Carte → Stripe-hosted Checkout → verified Stripe webhook → paid order → Kitchen KDS → isolated paid print queue → Android Bridge → both kitchen printers.

The normal Included / Paid round flow stays separate from A La Carte paid orders.

## Required server configuration

### Supabase

Apply these migrations in order:

1. `supabase/migrations/20260923_ala_carte_stripe_v1.sql`
2. `supabase/migrations/20260923_ala_carte_test_mode.sql`

Then add the project's **server-side Supabase secret/service-role key** to Vercel as:

`SUPABASE_SECRET_KEY`

Do not put this key in source code or any `NEXT_PUBLIC_*` variable.

### Stripe — TEST setup

Use a Stripe test/sandbox secret key in Vercel:

`STRIPE_SECRET_KEY=sk_test_...`

Create a Stripe webhook endpoint:

`https://meathouseskewer.com.au/api/stripe/webhook`

Subscribe at minimum to:

- `checkout.session.completed`
- `checkout.session.expired`

The implementation also safely handles:

- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`

Copy the webhook signing secret to Vercel:

`STRIPE_WEBHOOK_SECRET=whsec_...`

This implementation uses Stripe-hosted Checkout, so a Stripe publishable key is not required by the current customer flow.

### Paid print Bridge authentication

Generate one random secret and save the **same value** in:

- Vercel: `MEATHOUSE_ALA_API_KEY`
- GitHub Actions repository secret: `MEATHOUSE_ALA_API_KEY`

After adding the GitHub secret, rebuild/publish the Android Bridge so the signed APK contains the matching paid-order API credential.

### Release lock

Keep this OFF during setup:

`ALA_CARTE_RELEASE_UNLOCK=false`

After every readiness check is green, change it to:

`ALA_CARTE_RELEASE_UNLOCK=true`

This does **not** open the feature by itself. The database setting still has `enabled=false` by default.

## Safe TEST workflow

1. Confirm Manager → **A La Carte + Stripe** shows:
   - Supabase secret: READY
   - A La Carte schema: READY
   - Stripe: READY · TEST
   - Paid print Bridge key: READY
   - Release lock: UNLOCKED
   - Customer release: OFF
2. Set prices for the items being tested.
3. Leave the full-store **Feature switch OFF**.
4. Turn on **Single-table TEST mode**.
5. Select exactly one test table.
6. Start that table as an Included table and complete its configured free rounds.
7. The selected table only should switch to A La Carte.
8. Place a small test order.
9. Use Stripe's test Visa `4242 4242 4242 4242`, any future expiry, and any valid CVC.
10. Confirm the complete chain:
    - Stripe Checkout succeeds
    - webhook marks the order `paid`
    - KDS shows **PAID EXTRA · ONLINE PAYMENT**
    - both printers receive **已付款加单 / PAID EXTRA ORDER**
    - Manager payment history shows the paid order
11. Turn Single-table TEST mode OFF after testing.

## LIVE release workflow

Only use live Stripe keys when ready to accept real payments.

The Manager API intentionally blocks:
- full-store A La Carte when Stripe is in TEST mode
- single-table TEST mode when Stripe is in LIVE mode

Before going live:

1. Replace the test Stripe secret key with the live secret key.
2. Create/confirm the live webhook endpoint and live `whsec_...`.
3. Verify Manager shows **Stripe: READY · LIVE**.
4. Keep Single-table TEST mode OFF.
5. Review all A La Carte prices and limits.
6. Only then turn the full-store Feature switch ON.

## Safety rules implemented

- Customer-provided prices are never trusted.
- Server recalculates the total using database prices.
- Checkout Session uses a Stripe idempotency key.
- Success-page redirects do not fulfill orders.
- Only a verified Stripe webhook can mark an order paid.
- Webhook checks Stripe amount equals the server order total.
- Paid orders are isolated from existing round orders.
- Paid print jobs are isolated from the normal print queue.
- Release lock defaults OFF.
- Database feature flag defaults OFF.
- TEST Stripe cannot enable the full store.
- LIVE Stripe cannot enable single-table TEST mode.

## Key rotation

Any secret key ever pasted into chat or another transient channel should be rotated before live launch. Keep final live secrets only in Stripe/Vercel/GitHub secret storage.
