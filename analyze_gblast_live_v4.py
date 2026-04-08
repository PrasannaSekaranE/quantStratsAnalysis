import pandas as pd
import sys
import os

def get_clean_df(path, sheet_name=0):
    df = pd.read_excel(path, sheet_name=sheet_name, header=None)
    header_row = -1
    for i, row in df.iterrows():
        row_str = ' '.join([str(x) for x in row.values])
        if 'Symbol' in row_str or 'Trade Date' in row_str or 'Realized P&L' in row_str or 'Particulars' in row_str:
            header_row = i
            break
    
    if header_row != -1:
        df = pd.read_excel(path, sheet_name=sheet_name, skiprows=header_row)
        return df
    return df

try:
    path_tb = r'd:\QUANT_DASHBAORD\trades\G - BLAST - LIVE\tradebook-JOC883-FO (2).xlsx'
    path_pnl = r'd:\QUANT_DASHBAORD\trades\G - BLAST - LIVE\pnl-JOC883 (21).xlsx'
    
    print('--- TRADEBOOK SUMMARY ---')
    df_tb = get_clean_df(path_tb, 'F&O')
    # Filter for non-null symbols
    df_tb = df_tb[df_tb['Symbol'].notna()]
    print(f'Total Trades: {len(df_tb)}')
    print('Latest Dates:', df_tb['Trade Date'].unique()[-5:])
    
    # Symbols traded on the latest date
    latest_date = df_tb['Trade Date'].max()
    print(f'\nTrades on {latest_date}:')
    today_trades = df_tb[df_tb['Trade Date'] == latest_date]
    print(today_trades[['Symbol', 'Trade Type', 'Quantity', 'Price', 'Order execution time']])

    print('\n--- PNL SUMMARY ---')
    xl_pnl = pd.ExcelFile(path_pnl)
    df_pnl = get_clean_df(path_pnl, xl_pnl.sheet_names[0])
    df_pnl = df_pnl[df_pnl['Symbol'].notna()]
    print(f'Realized P&L for latest data:')
    # Find columns for P&L
    pnl_col = [c for c in df_pnl.columns if 'Realized' in c or 'PnL' in c or 'P&L' in c][0]
    # Sum P&L by Symbol
    pnl_summary = df_pnl.groupby('Symbol')[pnl_col].sum()
    print(pnl_summary)

except Exception as e:
    import traceback
    print(f'Error: {e}')
    traceback.print_exc()
