import pandas as pd
import sys
import os

def find_header_and_data(path, sheet_name):
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
    path_ledger = r'd:\QUANT_DASHBAORD\trades\G - BLAST - LIVE\ledger-JOC883 (5).xlsx'

    print('--- TRADEBOOK ---')
    df_tb = find_header_and_data(path_tb, 'F&O')
    print('Columns:', df_tb.columns.tolist())
    print(df_tb.head(10))

    print('\n--- PNL ---')
    xl_pnl = pd.ExcelFile(path_pnl)
    print('PNL Sheets:', xl_pnl.sheet_names)
    df_pnl = find_header_and_data(path_pnl, xl_pnl.sheet_names[0])
    print('Columns:', df_pnl.columns.tolist())
    print(df_pnl.head(10))

    print('\n--- LEDGER ---')
    xl_ledger = pd.ExcelFile(path_ledger)
    print('Ledger Sheets:', xl_ledger.sheet_names)
    df_ledger = find_header_and_data(path_ledger, xl_ledger.sheet_names[0])
    print('Columns:', df_ledger.columns.tolist())
    print(df_ledger.head(10))

except Exception as e:
    print(f'Error: {e}')
