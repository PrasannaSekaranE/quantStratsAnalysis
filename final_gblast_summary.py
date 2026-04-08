import pandas as pd
import os

def final_summary():
    path_ledger = r'd:\QUANT_DASHBAORD\trades\G - BLAST - LIVE\ledger-JOC883 (5).xlsx'
    xl = pd.ExcelFile(path_ledger)
    df = pd.read_excel(path_ledger, skiprows=12) # Particulars header is around row 13
    
    # Filter for valid rows
    df = df[df['Particulars'].notna()]
    # Total Debit and Credit
    total_debit = df['Debit'].sum()
    total_credit = df['Credit'].sum()
    net_ledger = total_credit - total_debit # Credit is money in, Debit is charges/money out
    
    # Identify Deposits vs Trading Charges
    deposits = df[df['Particulars'].str.contains('Opening|Receipt|Payment|Journal|Transfer', case=False, na=False)]
    trading_related = df[~df['Particulars'].str.contains('Opening|Receipt|Payment|Journal|Transfer', case=False, na=False)]
    
    net_trading_settlement = trading_related['Credit'].sum() - trading_related['Debit'].sum()
    
    print(f"--- CONSOLIDATED G-BLAST REPORT ---")
    print(f"Total Trading Settlements (Ledger): ₹{net_trading_settlement:,.2f}")
    
    # PNL FILE CHECK
    path_pnl = r'd:\QUANT_DASHBAORD\trades\G - BLAST - LIVE\pnl-JOC883 (21).xlsx'
    df_pnl = pd.read_excel(path_pnl, skiprows=19) # Symbol header is around row 20
    df_pnl = df_pnl[df_pnl['Symbol'].notna() & ~df_pnl['Symbol'].str.contains('Total', case=False)]
    total_realized = df_pnl['Realized P&L'].sum()
    print(f"Total Realized P&L (Trade P&L): ₹{total_realized:,.2f}")
    
    charges = total_realized - net_trading_settlement
    print(f"Estimated Total Charges/Taxes: ₹{charges:,.2f}")

if __name__ == "__main__":
    final_summary()
