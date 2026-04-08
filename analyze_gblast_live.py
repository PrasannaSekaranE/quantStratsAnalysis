import pandas as pd
import sys
import os

try:
    path_tb = r'd:\QUANT_DASHBAORD\trades\G - BLAST - LIVE\tradebook-JOC883-FO (2).xlsx'
    path_pnl = r'd:\QUANT_DASHBAORD\trades\G - BLAST - LIVE\pnl-JOC883 (21).xlsx'
    path_ledger = r'd:\QUANT_DASHBAORD\trades\G - BLAST - LIVE\ledger-JOC883 (5).xlsx'

    pd.set_option('display.max_columns', None)
    pd.set_option('display.width', 1000)

    print('--- TRADEBOOK ---')
    if os.path.exists(path_tb):
        df_tb = pd.read_excel(path_tb)
        print(df_tb.head())
        print(df_tb.columns.tolist())
    else:
        print('Tradebook file not found')

    print('\n--- PNL ---')
    if os.path.exists(path_pnl):
        df_pnl = pd.read_excel(path_pnl)
        print(df_pnl.head())
        print(df_pnl.columns.tolist())
    else:
        print('PNL file not found')

    print('\n--- LEDGER ---')
    if os.path.exists(path_ledger):
        df_ledger = pd.read_excel(path_ledger)
        print(df_ledger.head())
        print(df_ledger.columns.tolist())
    else:
        print('Ledger file not found')

except Exception as e:
    print(f'Error: {e}')
