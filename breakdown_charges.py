import pandas as pd
import os

def analyze_charges():
    path_ledger = r'd:\QUANT_DASHBAORD\trades\G - BLAST - LIVE\ledger-JOC883 (5).xlsx'
    
    # Robust header finding
    df_raw = pd.read_excel(path_ledger, header=None)
    header_row = -1
    for i, row in df_raw.iterrows():
        row_str = ' '.join([str(x) for x in row.values if x is not None])
        if 'Particulars' in row_str and 'Debit' in row_str:
            header_row = i
            break
            
    if header_row == -1:
        print("Header not found")
        return

    df = pd.read_excel(path_ledger, skiprows=header_row)
    df = df[df['Particulars'].notna()]
    
    # Filter for charges (usually Debit entries that are not Journal or Payments)
    # Actually, charges are all Debit entries except for "Payment" or "Journal" transfers out
    trading_ledger = df[~df['Particulars'].str.contains('Opening|Receipt|Payment|Journal|Transfer', case=False, na=False)]
    
    # Group charges by type
    # Many particulars are like 'Net obligation for Equity F&O 2026-04-07'
    # I'll strip the dates to group them
    import re
    def clean_particulars(text):
        return re.sub(r'\s*\d{4}-\d{2}-\d{2}.*', '', str(text))
    
    trading_ledger['Category'] = trading_ledger['Particulars'].apply(clean_particulars)
    
    summary = trading_ledger.groupby('Category').agg({
        'Debit': 'sum',
        'Credit': 'sum'
    })
    
    summary['Net Impact'] = summary['Credit'] - summary['Debit']
    
    print("--- DETAILED CHARGES ANALYSIS ---")
    print(summary)
    
    # Total Trading Impact
    total_net = summary['Net Impact'].sum()
    print(f"\nTotal Net Trading Impact (Real Profit - Charges): ₹{total_net:,.2f}")

if __name__ == "__main__":
    analyze_charges()
