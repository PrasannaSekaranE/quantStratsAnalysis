import glob
import pandas as pd
import os

def calculate_existing_pnl():
    base_path = r'd:\QUANT_DASHBAORD\trades\G - BLAST - LIVE'
    csv_files = glob.glob(os.path.join(base_path, '**', '*.csv'), recursive=True)
    
    total_pnl = 0
    file_count = 0
    
    for f in csv_files:
        try:
            df = pd.read_csv(f)
            # Find P&L column
            pnl_cols = [c for c in df.columns if 'total_pnl' in c.lower() or 'pnl' in c.lower() and 'pct' not in c.lower()]
            if pnl_cols:
                file_pnl = df[pnl_cols[0]].sum()
                total_pnl += file_pnl
                file_count += 1
        except Exception as e:
            pass
            
    print(f"EXISTING_DASHBOARD_PNL: ₹{total_pnl:,.2f}")
    print(f"FILES_PROCESSED: {file_count}")

if __name__ == "__main__":
    calculate_existing_pnl()
