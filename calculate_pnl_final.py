import pandas as pd
import os

def find_row_with_text(path, sheet_name, text):
    df = pd.read_excel(path, sheet_name=sheet_name, header=None)
    for i, row in df.iterrows():
        row_str = ' '.join([str(x) for x in row.values if x is not None])
        if text in row_str:
            return i
    return -1

try:
    path_tb = r'd:\QUANT_DASHBAORD\trades\G - BLAST - LIVE\tradebook-JOC883-FO (2).xlsx'
    path_pnl = r'd:\QUANT_DASHBAORD\trades\G - BLAST - LIVE\pnl-JOC883 (21).xlsx'
    path_ledger = r'd:\QUANT_DASHBAORD\trades\G - BLAST - LIVE\ledger-JOC883 (5).xlsx'

    # 1. TRADEBOOK: Get symbols for April 7
    df_tb = pd.read_excel(path_tb, sheet_name='F&O', skiprows=find_row_with_text(path_tb, 'F&O', 'Symbol'))
    df_tb['Trade Date'] = pd.to_datetime(df_tb['Trade Date'])
    day_trades = df_tb[df_tb['Trade Date'] == '2026-04-07']
    symbols = day_trades['Symbol'].unique().tolist()
    print(f'Symbols traded on April 7: {symbols}')

    # 2. PNL: Get Realized P&L for these symbols
    pnl_skip = find_row_with_text(path_pnl, 0, 'Symbol')
    df_pnl = pd.read_excel(path_pnl, skiprows=pnl_skip)
    relevant_pnl = df_pnl[df_pnl['Symbol'].isin(symbols)]
    print('\n--- Realized P&L (April 7 Symbols) ---')
    print(relevant_pnl[['Symbol', 'Realized P&L']])
    total_realized = relevant_pnl['Realized P&L'].sum()
    print(f'Total Realized P&L: {total_realized}')

    # 3. LEDGER: Get charges for April 7
    ledger_skip = find_row_with_text(path_ledger, 0, 'Particulars')
    df_ledger = pd.read_excel(path_ledger, skiprows=ledger_skip)
    df_ledger['Posting Date'] = pd.to_datetime(df_ledger['Posting Date'])
    day_ledger = df_ledger[df_ledger['Posting Date'] == '2026-04-07']
    print('\n--- Ledger Charges (April 7) ---')
    print(day_ledger[['Particulars', 'Debit', 'Credit']])
    net_charges = day_ledger['Debit'].sum() - day_ledger['Credit'].sum()
    print(f'Net Charges for the day: {net_charges}')
    
    print(f'\n--- FINAL NET PNL FOR APRIL 7 ---')
    print(f'Net P&L (Realized - Charges): {total_realized - net_charges}')

except Exception as e:
    print(f'Error: {e}')
