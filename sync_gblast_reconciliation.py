import pandas as pd
import glob
import os
import json
from datetime import datetime

def find_header(path, keywords):
    try:
        df = pd.read_excel(path, header=None)
        for i, row in df.iterrows():
            row_str = ' '.join([str(x) for x in row.values if x is not None])
            if all(kw in row_str for kw in keywords):
                return i
    except Exception as e:
        print(f"Error finding header in {path}: {e}")
    return -1

def sync_gblast_reconciliation():
    trades_dir = r'd:\QUANT_DASHBAORD\trades\G - BLAST - LIVE'
    path_pnl = os.path.join(trades_dir, 'pnl-JOC883 (21).xlsx')
    path_ledger = os.path.join(trades_dir, 'ledger-JOC883 (5).xlsx')
    output_path = os.path.join(trades_dir, 'gblast_live_reconciliation.json')

    # 1. SLIPPAGE & CSV P&L ANALYSIS
    versions = ['V1', 'V2', 'V2 Upgrade']
    version_data = {}
    total_slippage = 0
    total_csv_pnl = 0
    total_trades = 0

    for v in versions:
        v_path = os.path.join(trades_dir, v)
        csv_files = glob.glob(os.path.join(v_path, '*.csv'))
        v_slippage = 0
        v_pnl = 0
        v_count = 0
        
        for f in csv_files:
            try:
                df = pd.read_csv(f)
                if 'scan_entry_price' in df.columns and 'entry_price' in df.columns:
                    # Entry Slippage
                    df['slippage'] = (df['entry_price'] - df['scan_entry_price']) * df['quantity']
                    v_slippage += df['slippage'].sum()
                
                pnl_col = [c for c in df.columns if 'total_pnl' in c.lower() or 'pnl' in c.lower() and 'pct' not in c.lower()]
                if pnl_col:
                    v_pnl += df[pnl_col[0]].sum()
                    v_count += len(df)
            except Exception as e:
                print(f"Error processing CSV {f}: {e}")
        
        version_data[v] = {
            'trades': v_count,
            'pnl': round(float(v_pnl), 2),
            'slippage': round(float(v_slippage), 2)
        }
        total_slippage += v_slippage
        total_csv_pnl += v_pnl
        total_trades += v_count

    # 2. BROKER DATA (PNL & LEDGER)
    broker_realized = 0
    broker_charges = 0
    net_settlement = 0

    try:
        # Realized PNL
        pnl_idx = find_header(path_pnl, ['Symbol', 'Realized P&L'])
        if pnl_idx != -1:
            df_pnl = pd.read_excel(path_pnl, skiprows=pnl_idx)
            df_pnl = df_pnl[df_pnl['Symbol'].notna() & ~df_pnl['Symbol'].str.contains('Total', case=False)]
            broker_realized = float(df_pnl['Realized P&L'].sum())

        # Ledger Charges
        ledger_idx = find_header(path_ledger, ['Particulars', 'Debit', 'Credit'])
        if ledger_idx != -1:
            df_ledger = pd.read_excel(path_ledger, skiprows=ledger_idx)
            df_ledger = df_ledger[df_ledger['Particulars'].notna()]
            trading_ledger = df_ledger[~df_ledger['Particulars'].str.contains('Opening|Receipt|Payment|Journal|Transfer', case=False, na=False)]
            total_trading_credit = trading_ledger['Credit'].sum()
            total_trading_debit = trading_ledger['Debit'].sum()
            net_settlement = float(total_trading_credit - total_trading_debit)
            broker_charges = broker_realized - net_settlement
    except Exception as e:
        print(f"Error processing Excel data: {e}")

    # 3. CONSOLIDATE
    hidden_cost = float(total_csv_pnl) - net_settlement

    # Calculate Version Net
    for v in versions:
        v_data = version_data[v]
        v_trades = v_data['trades']
        if total_trades > 0:
            v_hidden_allocation = hidden_cost * (v_trades / total_trades)
        else:
            v_hidden_allocation = 0
            
        v_data['net_pnl'] = round(v_data['pnl'] - v_hidden_allocation, 2)
        v_data['charges'] = round(v_hidden_allocation, 2)

    reconciliation = {
        'last_updated': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'total_trades': total_trades,
        'csv_execution_pnl': round(float(total_csv_pnl), 2),
        'execution_slippage': round(float(total_slippage), 2),
        'theoretical_signal_pnl': round(float(total_csv_pnl + total_slippage), 2),
        'broker_realized_pnl': round(float(broker_realized), 2),
        'broker_charges': round(float(broker_charges), 2),
        'net_realized_pnl': round(float(net_settlement), 2),
        'reconciliation_gap': round(float(net_settlement - total_csv_pnl), 2), # This is the "Charges + Hidden Slippage"
        'version_breakdown': version_data
    }

    with open(output_path, 'w') as f:
        json.dump(reconciliation, f, indent=2)
    
    print(f"Reconciliation data saved to {output_path}")
    print(json.dumps(reconciliation, indent=2))

if __name__ == "__main__":
    sync_gblast_reconciliation()
