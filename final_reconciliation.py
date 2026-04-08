import pandas as pd
import glob
import os

def final_net_analysis():
    base_path = r'd:\QUANT_DASHBAORD\trades\G - BLAST - LIVE'
    
    # Based on user's dashboard screenshots
    config = {
        'V1': {'path': 'V1', 'display_pnl': 21310, 'trades': 44},
        'V1.1': {'path': 'V2', 'display_pnl': 23017, 'trades': 25}, # V1.1 is in the V2 folder based on logic
        'V2 Upgrade': {'path': 'V2 Upgrade', 'display_pnl': -37394, 'trades': 32}
    }
    
    results = []
    total_trades_count = 0
    total_slippage = 0
    total_csv_pnl = 0
    
    for name, cfg in config.items():
        v_path = os.path.join(base_path, cfg['path'])
        csv_files = glob.glob(os.path.join(v_path, '*.csv'))
        
        v_slippage = 0
        v_csv_pnl = 0
        v_count = 0
        
        # Sort files by date to get the most recent ones if there are more than needed
        csv_files.sort(key=os.path.getmtime, reverse=True)
        
        for f in csv_files:
            try:
                df = pd.read_csv(f)
                if 'scan_entry_price' in df.columns and 'entry_price' in df.columns:
                    v_slippage += ((df['entry_price'] - df['scan_entry_price']) * df['quantity']).sum()
                
                pnl_col = [c for c in df.columns if 'total_pnl' in c.lower() or 'pnl' in c.lower() and 'pct' not in c.lower()]
                if pnl_col:
                    v_csv_pnl += df[pnl_col[0]].sum()
                    v_count += len(df)
            except:
                pass
        
        total_trades_count += v_count
        total_slippage += v_slippage
        total_csv_pnl += v_csv_pnl
        
        results.append({
            'Category': name,
            'Dashboard P&L': cfg['display_pnl'],
            'Detected CSV P&L': v_csv_pnl,
            'Execution Slippage': v_slippage,
            'Count': v_count
        })

    df = pd.DataFrame(results)
    
    # Total Charges from Ledger for the period
    total_charges = 16651.14
    
    print("--- DETAILED RECONCILIATION ---")
    print(df)
    
    print(f"\nPortfolio Total Dashboard P&L: ₹{df['Dashboard P&L'].sum():,.2f}")
    print(f"Total Portfolio Slippage (Scan vs Fill): ₹{total_slippage:,.2f}")
    print(f"Total Brokerage & Taxes (Ledger): ₹{total_charges:,.2f}")
    
    final_net = df['Dashboard P&L'].sum() - total_slippage - total_charges
    print(f"\n--- FINAL NET BALANCE ESTIMATE ---")
    print(f"Final NET Realized P&L: ₹{final_net:,.2f}")

if __name__ == "__main__":
    final_net_analysis()
