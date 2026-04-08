import pandas as pd
import glob
import os

def analyze_slippage():
    base_path = r'd:\QUANT_DASHBAORD\trades\G - BLAST - LIVE'
    csv_files = glob.glob(os.path.join(base_path, '**', '*.csv'), recursive=True)
    
    total_slippage = 0
    total_csv_pnl = 0
    trade_count = 0
    
    for f in csv_files:
        try:
            df = pd.read_csv(f)
            if 'scan_entry_price' in df.columns and 'entry_price' in df.columns:
                # Entry Slippage: (Actual Fill - Intended Scan)
                # For Long trades, higher entry_price is bad (slippage)
                # The CSV uses Kite/Upstox keys, assuming these are all bullish for simplicity or checking signal_type
                df['entry_slippage'] = (df['entry_price'] - df['scan_entry_price']) * df['quantity']
                total_slippage += df['entry_slippage'].sum()
            
            pnl_cols = [c for c in df.columns if 'total_pnl' in c.lower() or 'pnl' in c.lower() and 'pct' not in c.lower()]
            if pnl_cols:
                total_csv_pnl += df[pnl_cols[0]].sum()
                trade_count += len(df)
        except:
            pass
            
    print(f"--- SLIPPAGE ANALYSIS ---")
    print(f"Total Trades in CSVs: {trade_count}")
    print(f"Total Entry Slippage (Scan vs Fill): ₹{total_slippage:,.2f}")
    print(f"Total CSV P&L (execution based): ₹{total_csv_pnl:,.2f}")
    
    # Let's see the comparison with the Broker Net
    broker_net = -21810.89
    broker_charges = 16651.14
    
    print(f"\n--- RECONCILIATION GAP ---")
    print(f"Broker Net (Real Truth): ₹{broker_net:,.2f}")
    print(f"CSV Profit: ₹{total_csv_pnl:,.2f}")
    print(f"Gap to Bridge: ₹{broker_net - total_csv_pnl:,.2f}")
    print(f"Amount Explained by Taxes/Charges: ₹{-broker_charges:,.2f}")
    print(f"Amount Explained by Entry Slippage: ₹{-total_slippage:,.2f}")
    
    unexplained = (broker_net - total_csv_pnl) - (-broker_charges) - (-total_slippage)
    print(f"Unexplained Gap (Potential Exit Slippage / Missing Trades): ₹{unexplained:,.2f}")

if __name__ == "__main__":
    analyze_slippage()
