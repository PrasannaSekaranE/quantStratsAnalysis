import pandas as pd
import os

def get_clean_df(path, sheet_name=0):
    df = pd.read_excel(path, sheet_name=sheet_name, header=None)
    header_row = -1
    for i, row in df.iterrows():
        row_str = ' '.join([str(x) for x in row.values if x is not None])
        if any(kw in row_str for kw in ['Symbol', 'Trade Date', 'Realized P&L']):
            header_row = i
            break
    if header_row != -1:
        return pd.read_excel(path, sheet_name=sheet_name, skiprows=header_row)
    return df

try:
    path_pnl = r'd:\QUANT_DASHBAORD\trades\G - BLAST - LIVE\pnl-JOC883 (21).xlsx'
    df_pnl = get_clean_df(path_pnl)
    print('PNL Columns:', df_pnl.columns.tolist())
    print(df_pnl.head(20))
    
    path_tb = r'd:\QUANT_DASHBAORD\trades\G - BLAST - LIVE\tradebook-JOC883-FO (2).xlsx'
    df_tb = get_clean_df(path_tb, 'F&O')
    print('\nTB Columns:', df_tb.columns.tolist())
    
    # Check for April 8 trades
    df_tb['Trade Date'] = pd.to_datetime(df_tb['Trade Date'])
    today_trades = df_tb[df_tb['Trade Date'] == '2026-04-08']
    print(f'\nTrades on 2026-04-08: {len(today_trades)}')
    if len(today_trades) > 0:
        print(today_trades)

except Exception as e:
    print(f'Error: {e}')
