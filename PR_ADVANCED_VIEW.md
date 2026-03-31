# Advanced View (PR notes)

## Liquidity depth (how we visualize it)

- **Depth bar:** Each segment’s width is that outcome’s **share of XLM staked in the last 24 hours**. A wider segment means more recent volume and more “room” to trade on that side before the split shifts.
- **Order book:** **Price** = implied probability from that 24h volume split. **Size** = XLM staked on that outcome in the window (shown as shares at that level). **Total** = same as size here (single level per outcome). Binary markets use green **Bid** / red **Ask** rows; 3+ outcomes list all rows sorted by price.

## Figma

Replace with your file: **https://www.figma.com/design/REPLACE_WITH_YOUR_FILE/advanced-view**

## Screenshot (for reviewers)

Capture **Advanced** toggled **on** on a market with real 24h volume and attach to the PR.
