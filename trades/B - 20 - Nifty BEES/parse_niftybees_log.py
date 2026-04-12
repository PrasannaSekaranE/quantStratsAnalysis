import os
import re
import csv
import sys

def parse_niftybees_log(filename):
    trades = []
    current_trade = {}
    
    with open(filename, 'r', encoding='utf-8') as f:
        for line in f:
            # Entry Detection
            if '[TRADE ENTRY] BLAZE NiftyBeES' in line:
                current_trade = {}
                ts_match = re.search(r'^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})', line)
                if ts_match:
                    current_trade['entry_time'] = ts_match.group(1)
            
            elif 'signal' in line.lower() and current_trade and 'votes' in line.lower():
                m = re.search(r'Signal\s*:\s*(\w+)', line, re.IGNORECASE)
                if m:
                    current_trade['signal_type'] = m.group(1).upper()
            
            elif 'nifty ref' in line.lower() and current_trade:
                m = re.search(r'NIFTY ref\s*:\s*([\d.]+)', line, re.IGNORECASE)
                if m:
                    current_trade['nifty_ref_spot'] = m.group(1)
            
            elif 'direction' in line.lower() and current_trade:
                m = re.search(r'Direction\s*:\s*(\w+)', line, re.IGNORECASE)
                if m:
                    current_trade['direction'] = m.group(1).upper()
            
            elif 'entry price' in line.lower() and current_trade:
                m = re.search(r'Entry [Pp]rice\s*:\s*Rs\.([\d.]+)', line)
                if m:
                    current_trade['entry_price'] = m.group(1)
            
            elif 'quantity' in line.lower() and current_trade:
                m = re.search(r'Quantity\s*:\s*(\d+)', line, re.IGNORECASE)
                if m:
                    current_trade['qty'] = m.group(1)
                m2 = re.search(r'Rs\.([\d,.]+)', line)
                if m2:
                    current_trade['capital_used'] = m2.group(1).replace(',', '')

            # Exit Detection
            elif '[TRADE EXIT] NIFTYBEES —' in line and current_trade:
                m = re.search(r'—\s+(\w+)', line)
                if m:
                    current_trade['exit_reason'] = m.group(1)
                ts_match = re.search(r'^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})', line)
                if ts_match:
                    current_trade['exit_time'] = ts_match.group(1)
            
            elif 'exit=' in line and 'entry=' in line and current_trade:
                # BUY  entry=Rs.259.72  exit=Rs.259.84
                m = re.search(r'exit=Rs\.([\d.]+)', line)
                if m:
                    current_trade['exit_price'] = m.group(1)
            
            elif 'P&L/unit :' in line and current_trade:
                # P&L/unit : Rs.+0.12    Total: Rs.+46.20  (+0.05%)
                m = re.search(r'Total:\s+Rs\.([+\-.\d,]+)\s+\(([+\-.\d,]+)%\)', line)
                if m:
                    current_trade['total_pnl'] = m.group(1).replace('+', '').replace(',', '')
                    current_trade['pnl_pct'] = m.group(2).replace('+', '')
                
                # Finalize
                current_trade['status'] = 'CLOSED'
                current_trade['instrument'] = 'NIFTYBEES'
                trades.append(current_trade)
                current_trade = {}
                
    return trades

if __name__ == "__main__":
    if len(sys.argv) > 1:
        log_file = sys.argv[1]
    else:
        log_file = 'blaze_niftybees_20260401.log'
        
    if os.path.exists(log_file):
        trades = parse_niftybees_log(log_file)
        if trades:
            fieldnames = [
                'entry_time', 'signal_type', 'direction', 'nifty_ref_spot', 
                'instrument', 'entry_price', 'qty', 'capital_used', 
                'status', 'exit_time', 'exit_price', 'total_pnl', 'pnl_pct', 'exit_reason'
            ]
            csv_file = log_file.replace('.log', '.csv')
            with open(csv_file, 'w', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                for t in trades:
                    row = {k: t.get(k, '') for k in fieldnames}
                    writer.writerow(row)
            print(f"Generated {csv_file} with {len(trades)} trades.")
        else:
            print("No trades found in log.")
    else:
        print(f"Log file {log_file} not found.")
