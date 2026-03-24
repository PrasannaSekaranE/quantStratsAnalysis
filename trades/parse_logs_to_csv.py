import os
import re
import csv

def parse_log(filename, version):
    trades = []
    current_trade = {}
    with open(filename, 'r', encoding='utf-8') as f:
        for line in f:
            if '[TRADE ENTRY] BLAZE TRADE ENTERED' in line:
                current_trade = {}
                timestamp_match = re.search(r'^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})', line)
                if timestamp_match:
                    current_trade['entry_time'] = timestamp_match.group(1)
            elif 'NIFTY Signal:' in line and current_trade:
                m = re.search(r'NIFTY Signal: (\w+) \(Spot: ([\d.]+)\)', line)
                if m:
                    current_trade['nifty_signal'] = m.group(1)
                    current_trade['nifty_spot'] = m.group(2)
            elif 'SENSEX Entry:' in line and current_trade:
                m = re.search(r'SENSEX Entry: (\d+)(CE|PE) @ Rs\.([\d.]+)', line)
                if m:
                    current_trade['entry_strike'] = m.group(1)
                    current_trade['option_type'] = m.group(2)
                    current_trade['entry_price'] = m.group(3)
            elif 'Target:' in line and current_trade:
                m = re.search(r'Target: Rs\.([\d.]+)', line)
                if m:
                    current_trade['exit_target'] = m.group(1)
            elif 'Stop Loss:' in line and current_trade:
                m = re.search(r'Stop Loss: Rs\.([\d.]+)', line)
                if m:
                    current_trade['stop_loss'] = m.group(1)
            elif 'Quantity:' in line and current_trade:
                m = re.search(r'Quantity: (\d+) lots', line)
                if m:
                    current_trade['quantity_lots'] = m.group(1)
            elif 'Capital:' in line and current_trade:
                m = re.search(r'Capital: Rs\.([\d,.]+)', line)
                if m:
                    current_trade['capital_deployed'] = m.group(1).replace(',', '')
            elif '[TRADE EXIT] TRADE CLOSED' in line and current_trade:
                timestamp_match = re.search(r'^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})', line)
                if timestamp_match:
                    current_trade['exit_time'] = timestamp_match.group(1)
                m = re.search(r'TRADE CLOSED - (\w+)', line)
                if m:
                    current_trade['exit_reason'] = m.group(1)
            elif 'Entry: Rs.' in line and '-> Exit: Rs.' in line and current_trade:
                m = re.search(r'Entry: Rs\.[\d.]+ -> Exit: Rs\.([\d.]+)', line)
                if m:
                    current_trade['exit_price'] = m.group(1)
            elif 'P&L: Rs.' in line and current_trade:
                m = re.search(r'P&L: Rs\.([-\d.,]+) \(([-+\d.,]+)%\)', line)
                if m:
                    current_trade['total_pnl'] = m.group(1).replace(',', '')
                    current_trade['pnl_pct'] = m.group(2)
            elif 'Holding:' in line and current_trade:
                m = re.search(r'Holding: (\d+)', line)
                if m:
                    current_trade['holding_minutes'] = m.group(1)
                    
                    # Finalize trade
                    current_trade['sensex_atm'] = ''
                    current_trade['lot_size'] = '20'
                    current_trade['instrument_key'] = ''
                    current_trade['status'] = 'CLOSED'
                    current_trade['type'] = version
                    
                    if 'entry_price' in current_trade and 'exit_price' in current_trade:
                        try:
                            current_trade['pnl_per_lot'] = round(float(current_trade['exit_price']) - float(current_trade['entry_price']), 2)
                        except:
                            current_trade['pnl_per_lot'] = ''
                    else:
                        current_trade['pnl_per_lot'] = ''
                        
                    trades.append(current_trade)
                    current_trade = {}
    return trades

log_files = []
for f in os.listdir('.'):
    if f.startswith('blaze_trading_V') and f.endswith('.log'):
        match = re.search(r'V(\d)_(\d{8})', f)
        if match:
            v_num = match.group(1)
            date_str = match.group(2)
            csv_name = f"BLAZE_{date_str}_V{v_num}.csv"
            log_files.append((f, f'v{v_num}', csv_name))

fieldnames = [
    'entry_time','nifty_signal','nifty_spot','sensex_atm','entry_strike',
    'option_type','entry_price','exit_target','stop_loss','lot_size','quantity_lots',
    'capital_deployed','instrument_key','status','exit_time','exit_price',
    'pnl_per_lot','total_pnl','pnl_pct','holding_minutes','exit_reason','type'
]

for log_file, version, csv_file in log_files:
    if os.path.exists(log_file):
        trades = parse_log(log_file, version)
        if trades:
            with open(csv_file, 'w', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                for t in trades:
                    # ensure all keys exist
                    row = {k: t.get(k, '') for k in fieldnames}
                    writer.writerow(row)
            print(f"Generated {csv_file} with {len(trades)} trades.")
            os.rename(log_file, log_file + '.done')
        else:
            print(f"No trades found in {log_file}.")
    else:
        print(f"Log file not found: {log_file}")
