import pandas as pd
import os

def calculate_pnl():
    path = r'd:\QUANT_DASHBAORD\trades\G - BLAST - LIVE\pnl-JOC883 (21).xlsx'
    if not os.path.exists(path):
        print(f"File not found: {path}")
        return

    xl = pd.ExcelFile(path)
    total_realized_pnl = 0
    min_date = None
    max_date = None

    for sheet in xl.sheet_names:
        df = pd.read_excel(path, sheet_name=sheet, header=None)
        header_row = -1
        for i, row in df.iterrows():
            row_str = ' '.join([str(x) for x in row.values if x is not None])
            if 'Symbol' in row_str and 'Realized P&L' in row_str:
                header_row = i
                break
        
        if header_row != -1:
            df_clean = pd.read_excel(path, sheet_name=sheet, skiprows=header_row)
            # Remove any summary rows at the bottom (usually contain 'Total')
            df_clean = df_clean[df_clean['Symbol'].notna()]
            df_clean = df_clean[~df_clean['Symbol'].str.contains('Total', case=False, na=False)]
            
            pnl_sum = df_clean['Realized P&L'].sum()
            total_realized_pnl += pnl_sum
            
            # Try to find date range
            date_cols = [c for c in df_clean.columns if 'Date' in c]
            for col in date_cols:
                dates = pd.to_datetime(df_clean[col], errors='coerce').dropna()
                if not dates.empty:
                    if min_date is None or dates.min() < min_date:
                        min_date = dates.min()
                    if max_date is None or dates.max() > max_date:
                        max_date = dates.max()

    print(f"--- G-BLAST TOTAL P&L REPORT ---")
    print(f"Total Realized P&L: ₹{total_realized_pnl:,.2f}")
    if min_date and max_date:
        print(f"Date Range: {min_date.strftime('%Y-%m-%d')} to {max_date.strftime('%Y-%m-%d')}")
    else:
        print("Date range not found in file structure")

if __name__ == "__main__":
    calculate_pnl()
