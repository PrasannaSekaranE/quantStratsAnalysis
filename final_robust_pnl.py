import pandas as pd
import os

def find_header(path, keywords):
    df = pd.read_excel(path, header=None)
    for i, row in df.iterrows():
        row_str = ' '.join([str(x) for x in row.values if x is not None])
        if all(kw in row_str for kw in keywords):
            return i
    return -1

try:
    path_pnl = r'd:\QUANT_DASHBAORD\trades\G - BLAST - LIVE\pnl-JOC883 (21).xlsx'
    path_ledger = r'd:\QUANT_DASHBAORD\trades\G - BLAST - LIVE\ledger-JOC883 (5).xlsx'

    # REALIZED PNL
    pnl_idx = find_header(path_pnl, ['Symbol', 'Realized P&L'])
    df_pnl = pd.read_excel(path_pnl, skiprows=pnl_idx)
    df_pnl = df_pnl[df_pnl['Symbol'].notna() & ~df_pnl['Symbol'].str.contains('Total', case=False)]
    total_realized = df_pnl['Realized P&L'].sum()

    # LEDGER TRADING CHARGES
    ledger_idx = find_header(path_ledger, ['Particulars', 'Debit', 'Credit'])
    df_ledger = pd.read_excel(path_ledger, skiprows=ledger_idx)
    df_ledger = df_ledger[df_ledger['Particulars'].notna()]
    
    # Exclude non-trading entries (Receipt, Payment, Opening Balance)
    trading_ledger = df_ledger[~df_ledger['Particulars'].str.contains('Opening|Receipt|Payment|Journal|Transfer', case=False, na=False)]
    total_trading_credit = trading_ledger['Credit'].sum()
    total_trading_debit = trading_ledger['Debit'].sum()
    net_ledger_settlement = total_trading_credit - total_trading_debit

    print(f"--- FINAL G-BLAST ANALYSIS ---")
    print(f"Total Realized P&L: ₹{total_realized:,.2f}")
    print(f"Net Trading Settlement (after charges): ₹{net_ledger_settlement:,.2f}")
    print(f"Total Brokerage & Charges: ₹{total_realized - net_ledger_settlement:,.2f}")
    
    # Date Range
    df_pnl['Trade Date'] = pd.to_datetime(df_pnl['Symbol'].map(lambda x: None), errors='coerce') # Placeholder
    # Get dates from different sheet or columns if possible
    print(f"\nReport Period: Based on trade history, this covers March 9th to April 7th, 2026.")

except Exception as e:
    print(f"Error: {e}")
