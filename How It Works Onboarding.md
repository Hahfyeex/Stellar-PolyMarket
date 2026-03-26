# How It Works Onboarding

## Overview
This is a short, high-fidelity 3-step onboarding flow for Stellar PolyMarket newcomers, designed as a carousel in the style of Polymarket’s "How it Works" UX (#88).

Figma design link: https://www.figma.com/design/OdsoPugMzX5iqDYRUUHCu9/StellarPoly-Interactive-How-It-Works-Onboarding?node-id=0-1&t=0wbyvfKpHTcOMsgf-1 

- Focus: education layer.
- Goal: low cognitive load for quick conversion.
- Visuals: each card is a single message with clear iconography.

## Steps

1. **Pick your Topic**
   - User sees categories (crypto, politics, sports, economy).
   - No more than 20 words. Purpose: reduce choice paralysis and highlight discovery quickly.

2. **Buy Shares**
   - Explain Yes/No logic with sample: "Buy YES if you think it happens, NO if not."
   - Include a note: "Shares reflect probability, prices move with market sentiment."
   - Mandatory in-app visualization: step 2 payout logic screen.

3. **Win XLM**
   - Explain automated smart contract payouts in simple terms.
   - Highlight non-custodial Soroban wallet model.
   - Mention: "You keep keys; payouts happen automatically on settlement."

## Stellar Integration
- Add a **Transparency** badge on each slide: "All trades are recorded on the Stellar Ledger."
- Include the Soroban / non-custodial callout in step 3.

## CTA
- Final screen includes a prominent button: **Start Betting**.

## Cognitive Load Rationale
- Each step uses fewer than 20 words to prevent overload.
- A clear single-driver purpose per screen keeps users focused.
- Visual + text ratio is 70/30; text is concise and outcome-oriented.

## PR Acceptance Checklist
- [x] INCLUDE FIGMA LINK TO YOUR DESIGN in the PR.
- [x] "Start Betting" CTA on the final slide.
- [x] Mini-README explains Cognitive Load.
- [x] Visual validation: Screenshot of “Step 2: Payout Logic" screen.

## Notes
- This document is for implementation guidance and PR notes.
- The actual Figma URL should be embedded in PR comment.
