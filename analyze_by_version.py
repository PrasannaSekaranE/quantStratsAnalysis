import pandas as pd
import glob
import os

def analyze_by_version():
    base_path = r'd:\QUANT_DASHBAORD\trades\G - BLAST - LIVE'
    versions = ['V1', 'V2', 'V2 Upgrade']
    
    results = []
    
    for v in versions:
        v_path = os.path.join(base_path, v)
        if not os.path.exists(v_path):
            continue
            
        csv_files = glob.glob(os.path.join(v_path, '*.csv'))
        v_pnl = 0
        v_slippage = 0
        v_trades = 0
        
        for f in csv_files:
            try:
                df = pd.read_csv(f)
                if 'scan_entry_price' in df.columns and 'entry_price' in df.columns:
                    df['slippage'] = (df['entry_price'] - df['scan_entry_price']) * df['quantity']
                    v_slippage += df['slippage'].sum()
                
                pnl_col = [c for c in df.columns if 'total_pnl' in c.lower() or 'pnl' in c.lower() and 'pct' not in c.lower()]
                if pnl_col:
                    v_pnl += df[pnl_col[0]].sum()
                    v_trades += len(df)
            except:
                pass
        
        results.append({
            'Version': v,
            'Trades': v_trades,
            'Execution P&L (CSV)': v_pnl,
            'Slippage (Scan vs Fill)': v_slippage,
            'Ideal Signal P&L': v_pnl + v_slippage
        })

    df_results = pd.DataFrame(results)
    print("--- PERFORMANCE BY VERSION ---")
    print(df_results)
    
    # Summary of Charges from previous analysis
    total_charges = 16651.14
    # Distribute charges proportionally by trade count roughly
    total_trades = df_results['Trades'].sum()
    df_results['Est. Charges'] = (df_results['Trades'] / total_trades) * total_charges
    df_results['Final Net P&L'] = df_results['Execution P&L (CSV)'] - df_results['Est. Charges']
    
    print("\n--- FINAL NET ESTIMATE (AFTER SLIPPAGE & CHARGES) ---")
    print(df_results[['Version', 'Execution P&L (CSV)', 'Est. Charges', 'Final Net P&L']])
    print(f"\nConsolidated Net P&L: ₹{df_results['Final Net P&L'].sum():,.2f}")

if __name__ == "__main__":
    analyze_by_version()
