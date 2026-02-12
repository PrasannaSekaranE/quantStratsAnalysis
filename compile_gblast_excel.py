import pandas as pd
import os
from pathlib import Path
import re

# Directory containing the CSV files
TRADES_DIR = Path(__file__).parent / 'trades'

# GBlast file patterns (matching the logic in server.js)
def is_gblast_file(filename):
    """Check if filename is a GBlast file based on server.js logic"""
    filename_lower = filename.lower()

    # Check if it's a GBlast file (lines 257-263 in server.js)
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
    """Determine GBlast version based on the 'type' field (lines 279-286 in server.js)"""
    # Check type field (case-insensitive)
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

def determine_position_type(row):
    """Determine position type based on direction or signal_type (lines 287-299 in server.js)"""
    # Check direction field
    direction = ''
    for col in row.index:
        if col.lower() == 'direction':
            direction = str(row[col]).strip().upper()
            break

    if direction == 'BUY_CALL':
        return 'LONG'
    elif direction == 'BUY_PUT':
        return 'SHORT'

    # Check signal_type field
    signal_type = ''
    for col in row.index:
        if col.lower() == 'signal_type':
            signal_type = str(row[col]).strip().upper()
            break

    if signal_type == 'BULLISH':
        return 'LONG'
    elif signal_type == 'BEARISH':
        return 'SHORT'

    # Check position_type field as fallback
    for col in row.index:
        if col.lower() == 'position_type':
            return str(row[col]).strip().upper()

    return ''

def extract_date_from_filename(filename):
    """Extract date from filename (lines 231-240 in server.js)"""
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

def normalize_column_name(col):
    """Normalize column names to lowercase with underscores"""
    return col.lower().strip()

def compile_gblast_trades():
    """Main function to compile all GBlast trades into a single Excel file"""

    if not TRADES_DIR.exists():
        print(f"Error: Trades directory not found: {TRADES_DIR}")
        return

    all_gblast_trades = []

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

            # Add metadata columns
            df['version'] = df.apply(lambda row: determine_version(row, filename), axis=1)
            df['source_file'] = filename

            # Extract date if not present in data
            date_col = None
            for col in df.columns:
                if col.lower() in ['date', 'trade_date']:
                    date_col = col
                    break

            if date_col is None:
                # Try to extract from entry_time or exit_time
                for time_col in ['entry_time', 'Entry_Time', 'ENTRY_TIME', 'exit_time', 'Exit_Time', 'EXIT_TIME']:
                    if time_col in df.columns:
                        df['date'] = df[time_col].apply(lambda x: str(x).split('T')[0] if 'T' in str(x) else str(x).split(' ')[0] if ' ' in str(x) else None)
                        break

                # If still no date, extract from filename
                if 'date' not in df.columns or df['date'].isna().all():
                    file_date = extract_date_from_filename(filename)
                    df['date'] = file_date

            # Determine position type
            if 'position_type' not in [c.lower() for c in df.columns]:
                df['position_type'] = df.apply(determine_position_type, axis=1)

            # Normalize column names for consistency
            df.columns = [normalize_column_name(col) for col in df.columns]

            all_gblast_trades.append(df)
            print(f"[OK] Loaded {len(df)} trades from {filename} ({df['version'].iloc[0] if len(df) > 0 else 'Unknown'})")

        except Exception as e:
            print(f"[ERROR] Error processing {filename}: {str(e)}")
            continue

    if not all_gblast_trades:
        print("\nNo GBlast trades found!")
        return

    # Combine all dataframes
    combined_df = pd.concat(all_gblast_trades, ignore_index=True)

    # Sort by date and version
    if 'date' in combined_df.columns:
        combined_df['date'] = pd.to_datetime(combined_df['date'], errors='coerce')
        combined_df = combined_df.sort_values(['date', 'version'], ascending=[False, True])

    # Reorder columns to have version and source_file at the beginning
    cols = combined_df.columns.tolist()
    priority_cols = ['version', 'source_file', 'date']

    # Move priority columns to front
    for col in reversed(priority_cols):
        if col in cols:
            cols.remove(col)
            cols.insert(0, col)

    combined_df = combined_df[cols]

    # Save to Excel
    output_file = Path(__file__).parent / 'GBlast_All_Versions_Compiled.xlsx'

    # Create Excel writer with multiple sheets
    with pd.ExcelWriter(output_file, engine='openpyxl') as writer:
        # All trades in one sheet
        combined_df.to_excel(writer, sheet_name='All GBlast Trades', index=False)

        # Separate sheets for each version
        for version in ['V1', 'V2', 'V3']:
            version_df = combined_df[combined_df['version'] == version]
            if not version_df.empty:
                version_df.to_excel(writer, sheet_name=f'GBlast {version}', index=False)

        # Summary statistics sheet
        summary_data = []
        for version in ['V1', 'V2', 'V3', 'All']:
            if version == 'All':
                version_df = combined_df
            else:
                version_df = combined_df[combined_df['version'] == version]

            if version_df.empty:
                continue

            # Calculate statistics
            total_trades = len(version_df)

            # Try to find PnL column
            pnl_col = None
            for col in version_df.columns:
                if col in ['net_pnl', 'total_pnl', 'pnl']:
                    pnl_col = col
                    break

            if pnl_col:
                total_pnl = version_df[pnl_col].sum()
                winners = len(version_df[version_df[pnl_col] > 0])
                losers = len(version_df[version_df[pnl_col] < 0])
                win_rate = (winners / total_trades * 100) if total_trades > 0 else 0
                avg_pnl = version_df[pnl_col].mean()
            else:
                total_pnl = 0
                winners = 0
                losers = 0
                win_rate = 0
                avg_pnl = 0

            summary_data.append({
                'Version': version,
                'Total Trades': total_trades,
                'Total PnL': total_pnl,
                'Winners': winners,
                'Losers': losers,
                'Win Rate (%)': round(win_rate, 2),
                'Avg PnL per Trade': round(avg_pnl, 2)
            })

        summary_df = pd.DataFrame(summary_data)
        summary_df.to_excel(writer, sheet_name='Summary', index=False)

    print(f"\n{'='*60}")
    print(f"[SUCCESS] Compiled {len(combined_df)} GBlast trades!")
    print(f"[SUCCESS] Output file: {output_file}")
    print(f"{'='*60}")
    print(f"\nVersion breakdown:")
    print(combined_df['version'].value_counts().sort_index())
    print(f"\n{'='*60}")

if __name__ == "__main__":
    compile_gblast_trades()
