# Meat House Skewer Ordering

Independent table-ordering system for Meat House Canberra.

## Architecture
- Next.js App Router
- Supabase project: `tbpinwmfmywkpdqnpula` (Meat House Ordering)
- Separate from the Wagga Hanok repository, database and deployment
- Fixed opaque QR token per table
- HttpOnly role session for staff / manager / kitchen access

## Dining rules
- 90-minute dining session
- Last order 15 minutes before session end
- Skewer reorder cooldown: 5 minutes by default, manager-editable
- Order cap by guest equivalent: 1–2 = 4, 3–4 = 6, 5–6 = 8, 7+ = 10 skewers per round
- Each menu item also has a manager-editable max-per-round setting
- No Starter Platter logic

## Main routes
- `/t/[token]` customer ordering
- `/staff` staff table/session dashboard
- `/kitchen` skewer kitchen KDS
- `/manager` manager control center
- `/manager/qr` table QR generation and printing

## Manager controls
- Unlock one table immediately
- Extend dining time +5 / +10 minutes
- Edit guest counts
- Move an active session to another available table
- Add / hide / restore products
- Add / disable / restore tables
- Change store-wide skewer cooldown
- Change staff / kitchen / manager PINs
- Operational analytics

## Environment
Copy `.env.example` to `.env.local` and provide the Meat House Supabase publishable key. Never commit private keys or operational PINs.


## A La Carte + Stripe

The paid extra-skewer flow is built behind a default-OFF release lock. Setup and safe single-table test instructions are in `docs/ALA-CARTE-STRIPE-SETUP.md`.
