"""
Zerodha Brokerage Calculator - Test & Verification Script
=========================================================
Verifies the brokerage calculation against the screenshot example provided,
then runs against actual live trade data.

Confirmed rates from screenshot (F&O Options, NSE):
  BUY=100, SELL=110, QTY=400
  - Brokerage:      Rs  40.00  (Rs 20/order x 2)
  - STT:            Rs  66.00  (0.15% on sell premium value)
  - Exchange Txn:   Rs  29.85  (0.0355% on total turnover)
  - GST:            Rs  12.59  (18% on brokerage + exchange + SEBI)
  - SEBI Charges:   Rs   0.08  (0.0001% on total turnover)
  - Stamp Duty:     Rs   1.00  (0.0025% on buy value only)
  - Total Charges:  Rs 149.52
  - Net P&L:        Rs3850.48  (Gross Rs4000 - Rs149.52)
"""

import csv
import os
import glob
import sys

# Fix Windows console encoding
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")


# =============================================================================
#  BROKERAGE RATE CONSTANTS
# =============================================================================

class ZerodhaBrokerageRates:
    """Current Zerodha brokerage rates (as of FY 2024-25)."""

    # F&O OPTIONS (NSE & BSE)
    FO_OPTIONS_BROKERAGE_PER_ORDER = 20.0          # Rs 20 flat per order
    FO_OPTIONS_STT_PCT             = 0.0015        # 0.15% on SELL premium value
    FO_OPTIONS_NSE_TXN_PCT         = 0.000355      # 0.0355% on total turnover (NSE)
    FO_OPTIONS_BSE_TXN_PCT         = 0.000355      # 0.0355% on total turnover (BSE)
    FO_OPTIONS_SEBI_PCT            = 0.000001      # 0.0001% on total turnover
    FO_OPTIONS_STAMP_PCT           = 0.000025      # 0.0025% on BUY value only
    FO_OPTIONS_GST_PCT             = 0.18          # 18% GST on (brokerage + txn + SEBI)

    # EQUITY INTRADAY (NiftyBeES ETF - B20)
    EQ_INTRADAY_BROKERAGE_PCT      = 0.0003        # 0.03% per order, max Rs 20
    EQ_INTRADAY_BROKERAGE_MAX      = 20.0          # Rs 20 cap per order
    EQ_INTRADAY_STT_PCT            = 0.00025       # 0.025% on SELL value only
    EQ_INTRADAY_NSE_TXN_PCT        = 0.0000345     # 0.00345% on total turnover (NSE EQ)
    EQ_INTRADAY_SEBI_PCT           = 0.000001      # 0.0001% on total turnover
    EQ_INTRADAY_STAMP_PCT          = 0.00003       # 0.003% on BUY value only
    EQ_INTRADAY_GST_PCT            = 0.18          # 18% GST on (brokerage + txn + SEBI)


class BrokerageBreakdown:
    """Detailed brokerage breakdown for a single trade."""

    def __init__(self, gross_pnl=0.0, brokerage=0.0, stt=0.0, exchange_txn=0.0,
                 gst=0.0, sebi_charges=0.0, stamp_duty=0.0,
                 total_charges=0.0, net_pnl=0.0, trade_type=""):
        self.gross_pnl     = gross_pnl
        self.brokerage     = brokerage
        self.stt           = stt
        self.exchange_txn  = exchange_txn
        self.gst           = gst
        self.sebi_charges  = sebi_charges
        self.stamp_duty    = stamp_duty
        self.total_charges = total_charges
        self.net_pnl       = net_pnl
        self.trade_type    = trade_type

    def __str__(self):
        lines = [
            f"  Trade Type     : {self.trade_type}",
            f"  Gross P&L      : Rs {self.gross_pnl:>10.2f}",
            f"  -----------------------------------",
            f"  Brokerage      : Rs {self.brokerage:>10.2f}",
            f"  STT            : Rs {self.stt:>10.2f}",
            f"  Exchange Txn   : Rs {self.exchange_txn:>10.2f}",
            f"  GST            : Rs {self.gst:>10.2f}",
            f"  SEBI Charges   : Rs {self.sebi_charges:>10.2f}",
            f"  Stamp Duty     : Rs {self.stamp_duty:>10.2f}",
            f"  -----------------------------------",
            f"  Total Charges  : Rs {self.total_charges:>10.2f}",
            f"  Net P&L        : Rs {self.net_pnl:>10.2f}",
        ]
        return "\n".join(lines)


# =============================================================================
#  CALCULATOR FUNCTIONS
# =============================================================================

def calc_fo_options_brokerage(entry_price, exit_price, quantity, exchange="NSE"):
    """
    Calculate Zerodha brokerage for F&O Options trades.

    Args:
        entry_price : Buy price per unit (premium)
        exit_price  : Sell price per unit (premium)
        quantity    : Total quantity (lots x lot_size)
        exchange    : "NSE" or "BSE"

    Returns:
        BrokerageBreakdown with full charge details
    """
    r = ZerodhaBrokerageRates

    buy_value  = entry_price * quantity
    sell_value = exit_price * quantity
    turnover   = buy_value + sell_value
    gross_pnl  = sell_value - buy_value   # positive = profit

    brokerage   = r.FO_OPTIONS_BROKERAGE_PER_ORDER * 2          # 2 orders (buy + sell)
    stt         = r.FO_OPTIONS_STT_PCT * sell_value              # on sell side only
    txn_rate    = r.FO_OPTIONS_NSE_TXN_PCT if exchange.upper() == "NSE" else r.FO_OPTIONS_BSE_TXN_PCT
    exchange_txn = txn_rate * turnover
    sebi        = r.FO_OPTIONS_SEBI_PCT * turnover
    stamp       = r.FO_OPTIONS_STAMP_PCT * buy_value             # on buy side only
    gst         = r.FO_OPTIONS_GST_PCT * (brokerage + exchange_txn + sebi)

    total_charges = brokerage + stt + exchange_txn + gst + sebi + stamp
    net_pnl       = gross_pnl - total_charges

    return BrokerageBreakdown(
        gross_pnl=round(gross_pnl, 2),
        brokerage=round(brokerage, 2),
        stt=round(stt, 2),
        exchange_txn=round(exchange_txn, 2),
        gst=round(gst, 2),
        sebi_charges=round(sebi, 2),
        stamp_duty=round(stamp, 2),
        total_charges=round(total_charges, 2),
        net_pnl=round(net_pnl, 2),
        trade_type=f"F&O Options ({exchange})"
    )


def calc_equity_intraday_brokerage(entry_price, exit_price, quantity, direction="BUY"):
    """
    Calculate Zerodha brokerage for Equity Intraday trades (NiftyBeES ETF - B20).

    Args:
        entry_price : Entry price per share
        exit_price  : Exit price per share
        quantity    : Total number of shares
        direction   : "BUY" (long) or "SELL" (short)

    Returns:
        BrokerageBreakdown with full charge details
    """
    r = ZerodhaBrokerageRates

    buy_value  = entry_price * quantity
    sell_value = exit_price * quantity
    turnover   = buy_value + sell_value

    if direction.upper() == "SELL":
        gross_pnl = (entry_price - exit_price) * quantity   # short: profit if price fell
        stt_value = entry_price * quantity                   # STT on sell side (entry for short)
    else:
        gross_pnl = (exit_price - entry_price) * quantity   # long: profit if price rose
        stt_value = exit_price * quantity                    # STT on sell side (exit for long)

    brok_per_order = min(r.EQ_INTRADAY_BROKERAGE_PCT * buy_value, r.EQ_INTRADAY_BROKERAGE_MAX)
    brokerage      = brok_per_order * 2

    stt          = r.EQ_INTRADAY_STT_PCT * stt_value
    exchange_txn = r.EQ_INTRADAY_NSE_TXN_PCT * turnover
    sebi         = r.EQ_INTRADAY_SEBI_PCT * turnover
    stamp        = r.EQ_INTRADAY_STAMP_PCT * buy_value
    gst          = r.EQ_INTRADAY_GST_PCT * (brokerage + exchange_txn + sebi)

    total_charges = brokerage + stt + exchange_txn + gst + sebi + stamp
    net_pnl       = gross_pnl - total_charges

    return BrokerageBreakdown(
        gross_pnl=round(gross_pnl, 2),
        brokerage=round(brokerage, 2),
        stt=round(stt, 2),
        exchange_txn=round(exchange_txn, 2),
        gst=round(gst, 2),
        sebi_charges=round(sebi, 2),
        stamp_duty=round(stamp, 2),
        total_charges=round(total_charges, 2),
        net_pnl=round(net_pnl, 2),
        trade_type="Equity Intraday (NSE)"
    )


# =============================================================================
#  TEST 1: VERIFY AGAINST SCREENSHOT EXAMPLE
# =============================================================================

def test_screenshot_example():
    print("=" * 62)
    print("TEST 1: VERIFY AGAINST ZERODHA SCREENSHOT")
    print("  BUY=100  SELL=110  QTY=400  F&O Options (NSE)")
    print("=" * 62)
    print()

    expected = {
        "brokerage":     40.00,
        "stt":           66.00,
        "exchange_txn":  29.85,
        "gst":           12.59,
        "sebi_charges":   0.08,
        "stamp_duty":     1.00,
        "total_charges": 149.52,
        "net_pnl":      3850.48,
    }

    result = calc_fo_options_brokerage(entry_price=100, exit_price=110, quantity=400, exchange="NSE")
    print(result)
    print()

    all_pass = True
    tolerance = 0.05   # Rs 0.05 tolerance for rounding differences
    print("  VALIDATION vs screenshot:")
    print(f"  {'Field':<20} {'Expected':>9} {'Got':>9}  Status")
    print(f"  {'-'*20} {'-'*9} {'-'*9}  ------")
    for key, exp_val in expected.items():
        got_val = getattr(result, key)
        diff    = abs(got_val - exp_val)
        status  = "PASS" if diff <= tolerance else f"FAIL (exp {exp_val})"
        print(f"  {key:<20} {exp_val:>9.2f} {got_val:>9.2f}  {status}")
        if diff > tolerance:
            all_pass = False

    print()
    print(f"  >>> {'ALL PASS' if all_pass else 'SOME TESTS FAILED'} <<<")
    print()
    return all_pass


# =============================================================================
#  TEST 2: BLAZE V4 ACTUAL TRADES (F&O BSE SENSEX OPTIONS)
# =============================================================================

def test_blaze_v4_trades():
    print("=" * 62)
    print("TEST 2: BLAZE V4 (BSE SENSEX F&O Options)")
    print("=" * 62)

    blaze_v4_file = r"d:\QUANT_DASHBAORD\trades\Blaze v4 - v4\BLAZE_SENSEX_20260407_v4.csv"
    if not os.path.exists(blaze_v4_file):
        print(f"  [SKIP] File not found: {blaze_v4_file}")
        return

    trades = []
    with open(blaze_v4_file, newline='', encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            if row.get('entry_price'):
                trades.append(row)

    hdr = f"  {'#':<3} {'Entry':>8} {'Exit':>8} {'Qty':>5} {'Gross':>10} {'Charges':>9} {'Net':>10}"
    sep = f"  {'-'*3} {'-'*8} {'-'*8} {'-'*5} {'-'*10} {'-'*9} {'-'*10}"
    print(hdr)
    print(sep)

    total_gross = total_charges = total_net = 0.0
    for i, row in enumerate(trades, 1):
        entry  = float(row['entry_price'])
        exit_p = float(row['exit_price'])
        qty    = int(float(row['lot_size'])) * int(float(row['quantity_lots']))
        b      = calc_fo_options_brokerage(entry, exit_p, qty, exchange="BSE")
        total_gross   += b.gross_pnl
        total_charges += b.total_charges
        total_net     += b.net_pnl
        print(f"  {i:<3} {entry:>8.2f} {exit_p:>8.2f} {qty:>5} {b.gross_pnl:>10.2f} {b.total_charges:>9.2f} {b.net_pnl:>10.2f}")

    print(sep)
    print(f"  {'TOTAL':<30} {total_gross:>10.2f} {total_charges:>9.2f} {total_net:>10.2f}")
    print(f"\n  Brokerage impact: Rs {total_charges:.2f} deducted from gross Rs {total_gross:.2f}")
    print()


# =============================================================================
#  TEST 3: G-BLAST LIVE V1 (NSE NIFTY OPTIONS)
# =============================================================================

def test_gblast_live_trades():
    print("=" * 62)
    print("TEST 3: G-BLAST LIVE V1 (NSE NIFTY F&O Options)")
    print("=" * 62)

    live_dir  = r"d:\QUANT_DASHBAORD\trades\G - BLAST - LIVE\V1"
    csv_files = sorted(glob.glob(os.path.join(live_dir, "*.csv")))[-5:]

    if not csv_files:
        print(f"  [SKIP] No files in {live_dir}")
        return

    all_trades = []
    for fp in csv_files:
        with open(fp, newline='', encoding='utf-8-sig') as f:
            for row in csv.DictReader(f):
                if row.get('entry_price') and row.get('exit_price') and row.get('quantity'):
                    all_trades.append(row)

    print(f"  Loaded {len(all_trades)} trades from last 5 files\n")
    hdr = f"  {'#':<3} {'Entry':>8} {'Exit':>8} {'Qty':>5} {'Gross':>10} {'Charges':>9} {'Net':>10}"
    sep = f"  {'-'*3} {'-'*8} {'-'*8} {'-'*5} {'-'*10} {'-'*9} {'-'*10}"
    print(hdr)
    print(sep)

    total_gross = total_charges = total_net = 0.0
    for i, row in enumerate(all_trades, 1):
        entry  = float(row['entry_price'])
        exit_p = float(row['exit_price'])
        qty    = int(float(row['quantity']))
        b      = calc_fo_options_brokerage(entry, exit_p, qty, exchange="NSE")
        total_gross   += b.gross_pnl
        total_charges += b.total_charges
        total_net     += b.net_pnl
        print(f"  {i:<3} {entry:>8.2f} {exit_p:>8.2f} {qty:>5} {b.gross_pnl:>10.2f} {b.total_charges:>9.2f} {b.net_pnl:>10.2f}")

    print(sep)
    print(f"  {'TOTAL':<30} {total_gross:>10.2f} {total_charges:>9.2f} {total_net:>10.2f}")
    print(f"\n  Brokerage impact: Rs {total_charges:.2f} deducted from gross Rs {total_gross:.2f}")
    print()


# =============================================================================
#  TEST 4: B-20 NIFTYBEES (EQUITY INTRADAY)
# =============================================================================

def test_b20_trades():
    print("=" * 62)
    print("TEST 4: B-20 NiftyBeES (Equity Intraday NSE)")
    print("=" * 62)

    b20_file = r"d:\QUANT_DASHBAORD\trades\B - 20 - Nifty BEES\BLAZE_NiftyBeES_20260407_161142.csv"
    if not os.path.exists(b20_file):
        print(f"  [SKIP] File not found: {b20_file}")
        return

    with open(b20_file, newline='', encoding='utf-8-sig') as f:
        trades = [r for r in csv.DictReader(f) if r.get('entry_price')]

    hdr = f"  {'#':<3} {'Dir':<5} {'Entry':>7} {'Exit':>7} {'Qty':>5} {'Gross':>10} {'Charges':>9} {'Net':>10}"
    sep = f"  {'-'*3} {'-'*5} {'-'*7} {'-'*7} {'-'*5} {'-'*10} {'-'*9} {'-'*10}"
    print(hdr)
    print(sep)

    total_gross = total_charges = total_net = 0.0
    for i, row in enumerate(trades, 1):
        entry_p = float(row['entry_price'])
        exit_p  = float(row.get('niftybees_exit_price') or row.get('exit_price') or 0)
        qty     = int(float(row['qty']))
        dirn    = row.get('direction', 'BUY').upper()
        b       = calc_equity_intraday_brokerage(entry_p, exit_p, qty, dirn)

        total_gross   += b.gross_pnl
        total_charges += b.total_charges
        total_net     += b.net_pnl
        print(f"  {i:<3} {dirn:<5} {entry_p:>7.2f} {exit_p:>7.2f} {qty:>5} {b.gross_pnl:>10.2f} {b.total_charges:>9.2f} {b.net_pnl:>10.2f}")

    print(sep)
    print(f"  {'TOTAL':<33} {total_gross:>10.2f} {total_charges:>9.2f} {total_net:>10.2f}")
    print(f"\n  Brokerage impact: Rs {total_charges:.2f} deducted from gross Rs {total_gross:.2f}")
    print()


# =============================================================================
#  MAIN
# =============================================================================

if __name__ == "__main__":
    print()
    print("=" * 62)
    print("   ZERODHA BROKERAGE CALCULATOR - TEST & VERIFICATION")
    print("=" * 62)
    print()

    passed = test_screenshot_example()

    if not passed:
        print("WARNING: Screenshot verification FAILED. Fix rates before proceeding.\n")
    else:
        print("Screenshot verified OK. Running against actual trade data...\n")
        test_blaze_v4_trades()
        test_gblast_live_trades()
        test_b20_trades()

    print("=" * 62)
    print("BROKERAGE RATES USED")
    print("=" * 62)
    r = ZerodhaBrokerageRates
    print(f"  F&O Options:")
    print(f"    Brokerage       : Rs {r.FO_OPTIONS_BROKERAGE_PER_ORDER}/order x2 per trade = Rs 40")
    print(f"    STT             : {r.FO_OPTIONS_STT_PCT*100:.4f}%  on SELL premium value")
    print(f"    Exchange Txn    : {r.FO_OPTIONS_NSE_TXN_PCT*100:.4f}%  on total turnover")
    print(f"    SEBI Charges    : {r.FO_OPTIONS_SEBI_PCT*100:.4f}%  on total turnover")
    print(f"    Stamp Duty      : {r.FO_OPTIONS_STAMP_PCT*100:.4f}%  on BUY value only")
    print(f"    GST             : {r.FO_OPTIONS_GST_PCT*100:.1f}%   on (brokerage + txn + SEBI)")
    print()
    print(f"  Equity Intraday (NiftyBeES B-20):")
    print(f"    Brokerage       : 0.03% or Rs {r.EQ_INTRADAY_BROKERAGE_MAX}/order max x2/trade")
    print(f"    STT (intraday)  : {r.EQ_INTRADAY_STT_PCT*100:.4f}%  on SELL value")
    print(f"    Exchange Txn    : {r.EQ_INTRADAY_NSE_TXN_PCT*100:.5f}% on total turnover")
    print(f"    SEBI Charges    : {r.EQ_INTRADAY_SEBI_PCT*100:.4f}%  on total turnover")
    print(f"    Stamp Duty      : {r.EQ_INTRADAY_STAMP_PCT*100:.4f}%  on BUY value only")
    print(f"    GST             : {r.EQ_INTRADAY_GST_PCT*100:.1f}%   on (brokerage + txn + SEBI)")
    print()
    print("Verify numbers above. If anything looks wrong, adjust ZerodhaBrokerageRates.")
    print()
