# Implementation Plan - Integrate Brokerage Calculations

The user wants to display actual (Net) P&L instead of Gross P&L on the dashboard. This requires calculating brokerages and statutory charges based on Zerodha's F&O and Equity Intraday rates.

## Proposed Changes

### 1. Frontend Utilities

#### [REF] [brokerageUtils.js](file:///d:/QUANT_DASHBAORD/frontend/src/brokerageUtils.js)
- Use the already created utility which implements:
    - **F&O Options**: ₹20/order brokerage, 0.15% STT on Sell, 0.0355% Exchange Txn, 0.0025% Stamp on Buy, 18% GST on (Brokerage + Txn + SEBI).
    - **Equity Intraday**: 0.03% (max ₹20) brokerage, 0.025% STT on Sell, 0.00345% Exchange Txn, 0.003% Stamp on Buy, 18% GST.

### 2. Live Page Component

#### [MODIFY] [LivePage.jsx](file:///d:/QUANT_DASHBAORD/frontend/src/LivePage.jsx)
- Import `calcBrokerageForTrade` from `./brokerageUtils`.
- Modify the `activeTrades` or `processedTrades` logic to enrich trade objects:
    - `trade.brokerage_charges`: Total charges calculated.
    - `trade.gross_pnl`: Original P&L from backend.
    - `trade.total_pnl` (or `net_pnl`): Calculated as `gross_pnl - brokerage_charges`.
- **UI Changes**:
    - Add a "Brokerage" column to the trades table.
    - Update the "P&L" column header to "Net P&L".
    - Ensure summary cards (Total P&L, Return %) use the enriched `net_pnl`.

### 3. Dashboard Component

#### [MODIFY] [TradingDashboard.jsx](file:///d:/QUANT_DASHBAORD/frontend/src/TradingDashboard.jsx)
- Import `calcBrokerageForTrade` from `./brokerageUtils`.
- Enrich `tradesData` upon fetch or via `useMemo` to include calculated charges and net P&L.
- **UI Changes**:
    - Add "Brokerage" column to the main trade table.
    - Update summary statistics calculation (`currentStats`) to use the net P&L.
    - Update the "Total P&L" header in the table to "Net P&L".

## Verification Plan

### Manual Verification
1. Open the dashboard and navigate to the Live tab.
2. Verify that a new "Brokerage" column is visible.
3. Compare a specific trade's P&L with the previous version to ensure it has decreased by exactly the brokerage amount.
4. Verify that the "Total P&L" card matches the sum of individual "Net P&L" rows.
5. Cross-check a sample B-20 trade (high brokerage impact) to ensure it matches the Python test script results (approx ₹411 charges per trade).
