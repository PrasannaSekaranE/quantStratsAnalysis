import pandas as pd
import os

def check_dates():
    files = [
        r'd:\QUANT_DASHBAORD\trades\G - BLAST - LIVE\pnl-JOC883 (21).xlsx',
        r'd:\QUANT_DASHBAORD\trades\G - BLAST - LIVE\tradebook-JOC883-FO (2).xlsx',
        r'd:\QUANT_DASHBAORD\trades\G - BLAST - LIVE\ledger-JOC883 (5).xlsx'
    ]
    
    for path in files:
        if not os.path.exists(path): continue
        print(f"\n=== File: {os.path.basename(path)} ===")
        xl = pd.ExcelFile(path)
        for sheet in xl.sheet_names:
            df = pd.read_excel(path, sheet_name=sheet, header=None)
            header_row = -1
            for i, row in df.iterrows():
                row_str = ' '.join([str(x) for x in row.values if x is not None])
                if any(kw in row_str for kw in ['Symbol', 'Trade Date', 'Particulars']):
                    header_row = i
                    break
            
            if header_row != -1:
                df_clean = pd.read_excel(path, sheet_name=sheet, skiprows=header_row)
                date_cols = [c for c in df_clean.columns if 'Date' in c or 'time' in c.lower()]
                print(f"Sheet: {sheet} | Date Columns: {date_cols}")
                for col in date_cols:
                    dates = pd.to_datetime(df_clean[col], errors='coerce').dropna()
                    if not dates.empty:
                        print(f"  Column '{col}': {dates.min().strftime('%Y-%m-%d')} to {dates.max().strftime('%Y-%m-%d')}")
            else:
                print(f"Sheet: {sheet} | No header found")

if __name__ == "__main__":
    check_dates()
