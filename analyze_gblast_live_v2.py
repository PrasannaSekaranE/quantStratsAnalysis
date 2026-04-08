import pandas as pd
import sys
import os

def analyze_excel(path, name):
    print(f'\n=== {name} ===')
    if not os.path.exists(path):
        print(f'File not found: {path}')
        return
    
    xl = pd.ExcelFile(path)
    print(f'Sheets: {xl.sheet_names}')
    
    for sheet in xl.sheet_names:
        print(f'\n--- Sheet: {sheet} ---')
        df = pd.read_excel(path, sheet_name=sheet)
        print('Full Columns:', df.columns.tolist())
        # Print first few rows that are not all NaN
        print(df.dropna(how='all').head(20))

try:
    path_tb = r'd:\QUANT_DASHBAORD\trades\G - BLAST - LIVE\tradebook-JOC883-FO (2).xlsx'
    path_pnl = r'd:\QUANT_DASHBAORD\trades\G - BLAST - LIVE\pnl-JOC883 (21).xlsx'
    path_ledger = r'd:\QUANT_DASHBAORD\trades\G - BLAST - LIVE\ledger-JOC883 (5).xlsx'

    pd.set_option('display.max_columns', None)
    pd.set_option('display.width', 1000)

    analyze_excel(path_tb, 'TRADEBOOK')
    analyze_excel(path_pnl, 'PNL')
    # analyze_excel(path_ledger, 'LEDGER') # Skipping ledger for now to keep output manageable

except Exception as e:
    print(f'Error: {e}')
