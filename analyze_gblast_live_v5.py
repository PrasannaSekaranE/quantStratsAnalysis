import pandas as pd
import sys
import os

def get_clean_df(path, sheet_name=0):
    df = pd.read_excel(path, sheet_name=sheet_name, header=None)
    header_row = -1
    for i, row in df.iterrows():
        row_str = ' '.join([str(x) for x in row.values if x is not None])
        # Look for common header keywords
        if any(kw in row_str for kw in ['Symbol', 'Trade Date', 'Realized P&L', 'Particulars']):
            header_row = i
            break
    
    if header_row != -1:
        df = pd.read_excel(path, sheet_name=sheet_name, skiprows=header_row)
        return df
    return df

try:
    path_tb = r'd:\QUANT_DASHBAORD\trades\G - BLAST - LIVE\tradebook-JOC883-FO (2).xlsx'
    path_pnl = r'd:\QUANT_DASHBAORD\trades\G - BLAST - LIVE\pnl-JOC883 (21).xlsx'
    path_ledger = r'd:\QUANT_DASHBAORD\trades\G - BLAST - LIVE\ledger-JOC883 (5).xlsx'
    
    print('--- TRADEBOOK COLUMNS ---')
    df_tb = get_clean_df(path_tb, 'F&O')
    print(df_tb.columns.tolist())
    
    print('\n--- PNL COLUMNS ---')
    xl_pnl = pd.ExcelFile(path_pnl)
    df_pnl = get_clean_df(path_pnl, xl_pnl.sheet_names[0])
    print(df_pnl.columns.tolist())
    
    print('\n--- LATEST TRADES (Last 3 dates) ---')
    df_tb['Trade Date'] = pd.to_datetime(df_tb['Trade Date'])
    latest_dates = sorted(df_tb['Trade Date'].unique())[-3:]
    for d in latest_dates:
        print(f'\nDate: {d}')
        day_trades = df_tb[df_tb['Trade Date'] == d]
        # Sum Buy/Sell quantities to see if it's active
        print(day_trades.groupby(['Symbol', 'Trade Type'])['Quantity'].sum())

    print('\n--- PNL DATA ---')
    # Filter P&L for latest data
    print(df_pnl[['Symbol', 'Buy Qty', 'Sell Qty', 'Realized P&L']].tail(20))

except Exception as e:
    import traceback
    print(f'Error: {e}')
    traceback.print_exc()
