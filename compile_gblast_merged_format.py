import pandas as pd
import os
from pathlib import Path
import re

# Directory containing the CSV files
TRADES_DIR = Path(__file__).parent / 'trades'

def is_gblast_file(filename):
    """Check if filename is a GBlast file based on server.js logic"""
    filename_lower = filename.lower()

    is_gblast = (
        filename_lower.startswith('live_trades') or
        'gblast' in filename_lower or
        'g-blast' in filename_lower or
        'g_blast' in filename_lower or
        filename_lower.startswith('v1_') or
        filename_lower.startswith('v2_') or
        filename_lower.startswith('v3_')
    )

    return is_gblast

def determine_version(row, filename):
    """Determine GBlast version based on the 'type' field"""
    trade_type = ''
    for col in row.index:
        if col.lower() == 'type':
            trade_type = str(row[col]).strip()
            break

    if trade_type == 'version_3':
        return 'V3'
    elif trade_type == 'version_2':
        return 'V2'
    else:
        return 'V1'

def extract_date_from_filename(filename):
    """Extract date from filename"""
    # Try YYYY-MM-DD format
    date_match = re.search(r'(\d{4})-(\d{2})-(\d{2})', filename)
    if date_match:
        return f"{date_match.group(1)}-{date_match.group(2)}-{date_match.group(3)}"

    # Try YYYYMMDD format
    date_match = re.search(r'(\d{8})', filename)
    if date_match:
        date_str = date_match.group(1)
        return f"{date_str[0:4]}-{date_str[4:6]}-{date_str[6:8]}"

    return None

def get_column_value(row, *possible_names):
    """Get value from row using multiple possible column names (case-insensitive)"""
    for col_name in possible_names:
        for col in row.index:
            if col.lower() == col_name.lower():
                value = row[col]
                return value if pd.notna(value) else ''
    return ''

def transform_to_merged_format(df, filename):
    """Transform CSV data into the merged report format"""

    # Determine version for all rows
    version = determine_version(df.iloc[0] if len(df) > 0 else pd.Series(), filename)

    # Extract date from filename if not in data
    file_date = extract_date_from_filename(filename)

    transformed_rows = []

    for idx, row in df.iterrows():
        # Get strike and option type to build name
        entry_strike = get_column_value(row, 'entry_strike', 'strike')
        option_type = get_column_value(row, 'option_type', 'type')
        symbol = get_column_value(row, 'symbol')

        # Build name (like "NIFTY 25950 CE")
        if entry_strike and option_type:
            name = f"NIFTY {entry_strike} {option_type}"
        elif symbol:
            name = symbol
        else:
            name = "NIFTY"

        # Get direction to determine signal_b_s
        direction = get_column_value(row, 'direction', 'signal_type', 'position_type').upper()
        signal_type = get_column_value(row, 'signal_type').upper()

        # Get entry and exit data
        entry_time = get_column_value(row, 'entry_time', 'Entry_Time', 'ENTRY_TIME')
        exit_time = get_column_value(row, 'exit_time', 'Exit_Time', 'EXIT_TIME')
        entry_price = get_column_value(row, 'entry_price', 'Entry_Price', 'ENTRY_PRICE')
        exit_price = get_column_value(row, 'exit_price', 'Exit_Price', 'EXIT_PRICE')

        # Calculate quantity: quantity_lots * lot_size
        quantity_lots = get_column_value(row, 'quantity_lots', 'Quantity_Lots', 'QUANTITY_LOTS')
        lot_size = get_column_value(row, 'lot_size', 'Lot_Size', 'LOT_SIZE')

        # Try to convert to numbers and calculate quantity
        try:
            if quantity_lots and lot_size:
                quantity = float(quantity_lots) * float(lot_size)
            else:
                # Fallback to direct quantity column if available
                quantity = get_column_value(row, 'quantity', 'Quantity', 'QUANTITY')
                quantity = float(quantity) if quantity else 0
        except (ValueError, TypeError):
            quantity = 0

        pnl = get_column_value(row, 'net_pnl', 'total_pnl', 'pnl', 'Net_PnL', 'PNL', 'Total_PnL')
        exit_reason = get_column_value(row, 'exit_reason', 'Exit_Reason', 'EXIT_REASON')
        isin = get_column_value(row, 'isin', 'ISIN', 'instrument_key', 'Instrument_Key')

        # Determine trade date - with better fallback handling
        trade_date_time = ''

        if entry_time and str(entry_time) != '' and str(entry_time) != 'nan':
            if 'T' in str(entry_time):
                trade_date = str(entry_time).split('T')[0]
                time_part = str(entry_time).split('T')[1] if 'T' in str(entry_time) else '00:00'
                trade_date_time = f"{trade_date} {time_part.split('.')[0] if '.' in time_part else time_part}"
            elif ' ' in str(entry_time):
                trade_date_time = str(entry_time)
            else:
                # Just time, no date - use file date
                if file_date:
                    trade_date_time = f"{file_date} {entry_time}"
                else:
                    trade_date_time = ''

        # If still no date, use file_date
        if not trade_date_time and file_date:
            trade_date_time = f"{file_date} 09:00:00"

        # Create BUY row
        buy_reason = 'BUY_CALL' if direction in ['BUY_CALL', 'LONG'] or signal_type == 'BULLISH' else 'BUY_PUT'

        buy_row = {
            'version': version,
            'name': name,
            'company': 'NIFTY OPTIONS',
            'trade_date': trade_date_time,
            'signal_b_s': 'BUY',
            'triggered_price': entry_price,
            'executed_price': entry_price,
            'ltp': exit_price if exit_price else entry_price,
            'quantity': int(quantity) if quantity else 0,
            'status': 'Close',
            'isin': isin if isin else 'NSE_FO|NIFTY',
            'reason': buy_reason,
            'return': 0.0,
            'source_file': filename
        }
        transformed_rows.append(buy_row)

        # Create SELL row if exit data exists
        if exit_price and exit_time:
            # Determine exit date/time - with better fallback handling
            exit_date_time = ''

            if str(exit_time) != '' and str(exit_time) != 'nan':
                if 'T' in str(exit_time):
                    exit_date = str(exit_time).split('T')[0]
                    time_part = str(exit_time).split('T')[1] if 'T' in str(exit_time) else '00:00'
                    exit_date_time = f"{exit_date} {time_part.split('.')[0] if '.' in time_part else time_part}"
                elif ' ' in str(exit_time):
                    exit_date_time = str(exit_time)
                else:
                    # Just time, no date - use file date
                    if file_date:
                        exit_date_time = f"{file_date} {exit_time}"

            # If still no date, use file_date
            if not exit_date_time and file_date:
                exit_date_time = f"{file_date} 15:00:00"

            # Map exit reason
            reason_map = {
                'TARGET_HIT': 'TARGET_HIT',
                'STOP_LOSS': 'STOP_LOSS',
                'EOD': 'EOD',
                'SIGNAL_REVERSED': 'SIGNAL_REVERSED',
                'TRAILING_STOP': 'TRAILING_STOP',
            }
            sell_reason = reason_map.get(exit_reason, exit_reason if exit_reason else 'TARGET_HIT')

            sell_row = {
                'version': version,
                'name': name,
                'company': 'NIFTY OPTIONS',
                'trade_date': exit_date_time,
                'signal_b_s': 'SELL',
                'triggered_price': exit_price,
                'executed_price': exit_price,
                'ltp': exit_price,
                'quantity': int(quantity) if quantity else 0,
                'status': 'Close',
                'isin': isin if isin else 'NSE_FO|NIFTY',
                'reason': sell_reason,
                'return': float(pnl) if pnl else 0.0,
                'source_file': filename
            }
            transformed_rows.append(sell_row)

    return pd.DataFrame(transformed_rows)

def compile_gblast_merged_format():
    """Main function to compile all GBlast trades into merged report format"""

    if not TRADES_DIR.exists():
        print(f"Error: Trades directory not found: {TRADES_DIR}")
        return

    all_transformed_trades = []

    # Get all CSV files in the trades directory
    csv_files = sorted([f for f in os.listdir(TRADES_DIR) if f.endswith('.csv')])

    print(f"Found {len(csv_files)} CSV files in {TRADES_DIR}")
    print("\nProcessing GBlast files...\n")

    for filename in csv_files:
        if not is_gblast_file(filename):
            continue

        filepath = TRADES_DIR / filename

        try:
            # Read CSV file
            df = pd.read_csv(filepath)

            if df.empty:
                print(f"[WARNING] Skipped {filename}: Empty file")
                continue

            # Transform to merged format
            transformed_df = transform_to_merged_format(df, filename)

            if not transformed_df.empty:
                all_transformed_trades.append(transformed_df)
                version = transformed_df['version'].iloc[0] if len(transformed_df) > 0 else 'Unknown'
                print(f"[OK] Transformed {len(transformed_df)} rows from {filename} ({version})")

        except Exception as e:
            print(f"[ERROR] Error processing {filename}: {str(e)}")
            import traceback
            traceback.print_exc()
            continue

    if not all_transformed_trades:
        print("\nNo GBlast trades found!")
        return

    # Combine all dataframes
    combined_df = pd.concat(all_transformed_trades, ignore_index=True)

    # Convert trade_date to datetime using mixed format to handle variations
    combined_df['trade_date'] = pd.to_datetime(combined_df['trade_date'], format='mixed', errors='coerce')

    # Remove source_file column before saving (it was just for debugging)
    if 'source_file' in combined_df.columns:
        combined_df = combined_df.drop(columns=['source_file'])

    # Sort by date and time
    combined_df = combined_df.sort_values(['trade_date', 'version'], ascending=[True, True])

    # Reorder columns to match the desired format
    column_order = [
        'version', 'name', 'company', 'trade_date', 'signal_b_s',
        'triggered_price', 'executed_price', 'ltp', 'quantity',
        'status', 'isin', 'reason', 'return'
    ]

    combined_df = combined_df[column_order]

    # Save to Excel with only 1 sheet
    output_file = Path(__file__).parent / 'GBlast_Merged_Report_All_Versions.xlsx'

    # Create Excel writer with single sheet
    with pd.ExcelWriter(output_file, engine='openpyxl') as writer:
        # All trades in one sheet only
        combined_df.to_excel(writer, sheet_name='GBlast All Versions', index=False)

    print(f"\n{'='*60}")
    print(f"[SUCCESS] Compiled {len(combined_df)} rows (BUY + SELL pairs)!")
    print(f"[SUCCESS] Output file: {output_file}")
    print(f"{'='*60}")
    print(f"\nVersion breakdown (SELL rows only):")
    sell_df = combined_df[combined_df['signal_b_s'] == 'SELL']
    print(sell_df['version'].value_counts().sort_index())
    print(f"\n{'='*60}")

if __name__ == "__main__":
    compile_gblast_merged_format()
