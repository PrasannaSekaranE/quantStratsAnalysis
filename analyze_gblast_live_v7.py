import pandas as pd
import os

def get_clean_df(path, sheet_name=0):
    df = pd.read_excel(path, sheet_name=sheet_name, header=None)
    header_row = -1
    for i, row in df.iterrows():
        row_str = ' '.join([str(x) for x in row.values if x is not None])
        if any(kw in row_str for kw in ['Symbol', 'Trade Date', 'Particulars']):
            header_row = i
            break
    if header_row != -1:
        return pd.read_excel(path, sheet_name=sheet_name, skiprows=header_row)
    return df

try:
    # 1. TRADEBOOK (find latest day and its trades)
    path_tb = r'd:\QUANT_DASHBAORD\trades\G - BLAST - LIVE\tradebook-JOC883-FO (2).xlsx'
    df_tb = get_clean_df(path_tb, 'F&O')
    df_tb['Trade Date'] = pd.to_datetime(df_tb['Trade Date'])
    latest_date = df_tb['Trade Date'].max()
    print(f'--- TRADES ON {latest_date} ---')
    today_trades = df_tb[df_tb['Trade Date'] == latest_date]
    # Sum by Symbol and Type to see activity
    summary = today_trades.groupby(['Symbol', 'Trade Type']).agg({'Quantity': 'sum', 'Price': 'mean'}).reset_index()
    print(summary)

    # 2. PNL (Realized P&L for these symbols)
    path_pnl = r'd:\QUANT_DASHBAORD\trades\G - BLAST - LIVE\pnl-JOC883 (21).xlsx'
    df_pnl = pd.read_excel(path_pnl, header=None)
    # P&L sheet usually has a lot of fluff. Let's find the table.
    pnl_table_row = -1
    for i, row in df_pnl.iterrows():
        row_str = ' '.join([str(x) for x in row.values if x is not None])
        if 'Symbol' in row_str and 'Realized P&L' in row_str:
            pnl_table_row = i
            break
    
    if pnl_table_row != -1:
        df_pnl_clean = pd.read_excel(path_pnl, skiprows=pnl_table_row)
        print(f'\n--- PNL DATA FOR RELEVANT SYMBOLS ---')
        symbols_traded = summary['Symbol'].unique()
        df_relevant_pnl = df_pnl_clean[df_pnl_clean['Symbol'].isin(symbols_traded)]
        print(df_relevant_pnl[['Symbol', 'Realized P&L']])
        print(f'Total Realized P&L: {df_relevant_pnl["Realized P&L"].sum()}')
    else:
        print('Could not find P&L table row')

    # 3. LEDGER (Charges for the day)
    path_ledger = r'd:\QUANT_DASHBAORD\trades\G - BLAST - LIVE\ledger-JOC883 (5).xlsx'
    df_ledger = get_clean_df(path_ledger)
    df_ledger['Posting Date'] = pd.to_datetime(df_ledger['Posting Date'])
    print(f'\n--- LEDGER ENTRIES ON {latest_date} ---')
    day_ledger = df_ledger[df_ledger['Posting Date'] == latest_date]
    print(day_ledger[['Particulars', 'Debit', 'Credit']])
    print(f'Net Charges (Debit - Credit): {day_ledger["Debit"].sum() - day_ledger["Credit"].sum()}')

except Exception as e:
    import traceback
    print(f'Error: {e}')
    traceback.print_exc()
