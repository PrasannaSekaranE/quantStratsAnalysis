#!/usr/bin/env python3
"""
LIVE PAPER TRADING SYSTEM - NIFTY Options Trading with OI Analysis
Trading Hours: 9:15 AM - 3:00 PM
Max Trades: 2 per day
Stop Loss: 40% of entry price
Profit Target: 20 points
Min Price Filter: Entry price > Rs.20

UPDATED V2: ITM Entry Logic (200 ITM with 100 Rounding)
- Signal Detection: 10 ITM for Bullish, 10 OTM for Bearish (ATM NOT in voting pool)
- Entry Strike Calculation:
  1. ATM → Round to nearest 100
  2. Then ± 200 for ITM entry
- BULLISH (CALL): Rounded ATM - 200 (200 points ITM)
- BEARISH (PUT): Rounded ATM + 200 (200 points ITM)
- Example: Spot 23545 → ATM 23550 → Round 23600 → CALL Entry 23400, PUT Entry 23800
- Uses actual NIFTY spot price from API (not estimated)
- Validates: Entry strike price > Rs.20
- Signal Verification: Exits if OI pattern reverses while trade is in loss
"""

import requests
import pandas as pd
import numpy as np
from datetime import datetime, time as dt_time, timedelta
import sys
import time as time_module
import io
import json
from threading import Thread, Lock
import logging
import math

# UTF-8 encoding fix
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# Setup logging with UTF-8 encoding
log_handlers = [
    logging.FileHandler(f'live_trading_{datetime.now().strftime("%Y%m%d")}.log', encoding='utf-8')
]

# Add console handler with proper encoding
import sys
if sys.platform == 'win32':
    # Windows console - use basic ASCII
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
    log_handlers.append(console_handler)
else:
    # Unix/Linux - full UTF-8 support
    log_handlers.append(logging.StreamHandler())

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=log_handlers
)

# ============================================================================
# CONSTANTS
# ============================================================================
LOT_SIZE = 75
CAPITAL_PER_TRADE = 100000
TRADING_START_TIME = dt_time(9, 15)
TRADING_END_TIME = dt_time(15, 0)
MAX_TRADES_PER_DAY = 2
STOP_LOSS_PCT = 40  # 40% stop loss
TARGET_POINTS = 20
MIN_ENTRY_PRICE = 20  # Minimum Rs.20 entry price
OI_CHANGE_THRESHOLD_PCT = 0.3
MIN_OI_ABSOLUTE = 1000
POLL_INTERVAL = 60  # seconds (poll every 1 minute)
MIN_VOTES_REQUIRED = 2  # Minimum number of strikes that must vote YES


# ============================================================================
# UPSTOX LIVE DATA FETCHER
# ============================================================================

class UpstoxLiveDataFetcher:
    """Fetches live option chain data from Upstox API"""
    
    def __init__(self, access_token):
        self.access_token = access_token
        self.base_url = "https://api.upstox.com/v2"
        self.headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json"
        }
        logging.info(">>> Live Data Fetcher initialized")
    
    def get_next_expiry(self):
        """Get the nearest weekly expiry (only future dates)"""
        url = f"{self.base_url}/option/contract"
        params = {"instrument_key": "NSE_INDEX|Nifty 50"}

        try:
            response = requests.get(url, headers=self.headers, params=params, timeout=10)
            if response.status_code == 200:
                data = response.json()
                if data.get('status') == 'success':
                    all_contracts = data['data']
                    all_expiries = sorted(list(set([c['expiry'] for c in all_contracts])))

                    # Filter out past expiries (safety check for post-expiry day)
                    today = datetime.now().date()
                    future_expiries = [exp for exp in all_expiries
                                      if datetime.strptime(exp, '%Y-%m-%d').date() >= today]

                    if future_expiries:
                        logging.info(f"[NIFTY EXPIRY] Next expiry: {future_expiries[0]}")
                        return future_expiries[0]
                    else:
                        logging.error(f"[NIFTY EXPIRY] No future expiries found! Available: {all_expiries}")
                        return None
        except Exception as e:
            logging.error(f"Error fetching expiry: {e}")

        return None
    
    def get_option_contracts(self, expiry_date):
        """Get all option contracts for given expiry"""
        url = f"{self.base_url}/option/contract"
        params = {
            "instrument_key": "NSE_INDEX|Nifty 50",
            "expiry_date": expiry_date
        }
        
        try:
            response = requests.get(url, headers=self.headers, params=params, timeout=10)
            
            logging.info(f"[DEBUG] Contracts API status code: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                
                if data.get('status') == 'success':
                    contracts = data['data']
                    logging.info(f"[DEBUG] Received {len(contracts)} contracts")
                    
                    # Organize by strike
                    strikes_data = {}
                    for contract in contracts:
                        strike = contract['strike_price']
                        option_type = contract['instrument_type']
                        
                        if strike not in strikes_data:
                            strikes_data[strike] = {}
                        
                        strikes_data[strike][option_type] = {
                            'instrument_key': contract['instrument_key'],
                            'trading_symbol': contract['trading_symbol']
                        }
                    
                    return strikes_data
                else:
                    logging.error(f"[DEBUG] Contracts API returned status: {data.get('status')}")
                    logging.error(f"[DEBUG] Response: {data}")
            else:
                logging.error(f"[DEBUG] Contracts API error: {response.status_code}")
                logging.error(f"[DEBUG] Response: {response.text}")
                
        except Exception as e:
            logging.error(f"[DEBUG] Exception fetching contracts: {e}")
        
        return {}
    
    def get_live_quotes(self, instrument_keys):
        """Get live market quotes for multiple instruments"""
        if not instrument_keys:
            return {}
        
        url = f"{self.base_url}/market-quote/quotes"
        params = {"instrument_key": ",".join(instrument_keys[:50])}  # Max 50 at a time
        
        try:
            response = requests.get(url, headers=self.headers, params=params, timeout=10)
            
            logging.info(f"[DEBUG] Quotes API status code: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                
                if data.get('status') == 'success':
                    logging.info(f"[DEBUG] Quotes API success - keys in data: {list(data.keys())}")
                    return data['data']
                else:
                    logging.error(f"[DEBUG] Quotes API returned status: {data.get('status')}")
                    logging.error(f"[DEBUG] Response: {data}")
            else:
                logging.error(f"[DEBUG] Quotes API error: {response.status_code}")
                logging.error(f"[DEBUG] Response: {response.text}")
                
        except Exception as e:
            logging.error(f"[DEBUG] Exception fetching quotes: {e}")

        return {}

    def get_nifty_spot_price(self):
        """Get actual NIFTY spot price from API"""
        url = f"{self.base_url}/market-quote/quotes"
        params = {"instrument_key": "NSE_INDEX|Nifty 50"}

        try:
            response = requests.get(url, headers=self.headers, params=params, timeout=10)

            if response.status_code == 200:
                data = response.json()

                if data.get('status') == 'success':
                    # API returns key with colon instead of pipe
                    response_key = "NSE_INDEX:Nifty 50"

                    if response_key in data['data']:
                        spot_price = data['data'][response_key].get('last_price', 0)
                        logging.info(f"[NIFTY SPOT] Real-time spot: {spot_price:.2f}")
                        return spot_price

        except Exception as e:
            logging.error(f"Error fetching NIFTY spot price: {e}")

        return None

    def get_option_chain_snapshot(self, expiry_date, strike_range=500):
        """Get complete option chain snapshot with OI data"""
        logging.info(f"[DEBUG] Fetching option chain for expiry: {expiry_date}")
        
        contracts = self.get_option_contracts(expiry_date)
        
        if not contracts:
            logging.error("[DEBUG] No contracts found")
            return None
        
        logging.info(f"[DEBUG] Found {len(contracts)} strikes")
        
        all_strikes = sorted(contracts.keys())
        mid_strike = all_strikes[len(all_strikes) // 2]
        target_strikes = [s for s in all_strikes if abs(s - mid_strike) <= strike_range]
        
        logging.info(f"[DEBUG] Target strikes: {len(target_strikes)} (range {target_strikes[0]} to {target_strikes[-1]})")
        
        # Collect all instrument keys
        instrument_keys = []
        for strike in target_strikes:
            if 'CE' in contracts[strike]:
                instrument_keys.append(contracts[strike]['CE']['instrument_key'])
            if 'PE' in contracts[strike]:
                instrument_keys.append(contracts[strike]['PE']['instrument_key'])
        
        logging.info(f"[DEBUG] Fetching quotes for {len(instrument_keys)} instruments")
        
        # Get live quotes
        quotes = self.get_live_quotes(instrument_keys)
        
        if not quotes:
            logging.error("[DEBUG] No quotes received from API")
            return None
        
        logging.info(f"[DEBUG] Received quotes for {len(quotes)} instruments")

        # Month name to number mapping (without zero-padding)
        MONTH_MAP = {
            'JAN': '1', 'FEB': '2', 'MAR': '3', 'APR': '4',
            'MAY': '5', 'JUN': '6', 'JUL': '7', 'AUG': '8',
            'SEP': '9', 'OCT': '10', 'NOV': '11', 'DEC': '12'
        }

        # Build dataframe with correct symbol conversion
        data = []
        matched_count = 0
        for strike in target_strikes:
            for option_type in ['CE', 'PE']:
                if option_type in contracts[strike]:
                    inst_key = contracts[strike][option_type]['instrument_key']
                    trading_symbol = contracts[strike][option_type]['trading_symbol']

                    # Parse trading symbol: "NIFTY 23400 PE 03 FEB 26"
                    parts = trading_symbol.split()
                    if len(parts) >= 6:
                        name = parts[0]          # NIFTY
                        strike_val = parts[1]    # 23400
                        opt = parts[2]           # CE/PE
                        day = parts[3]           # 03 (with padding)
                        month_name = parts[4]    # FEB
                        year = parts[5]          # 26

                        # Convert month to number WITHOUT zero-padding
                        month_num = MONTH_MAP.get(month_name, '')

                        if month_num:
                            # Build quote key: NSE_FO:NIFTY + YY + M + DD + STRIKE + TYPE
                            # Example: NSE_FO:NIFTY2620323400PE
                            quote_key = f"NSE_FO:{name}{year}{month_num}{day}{strike_val}{opt}"

                            # Lookup quote using the correct key
                            quote = quotes.get(quote_key)

                            if quote:
                                matched_count += 1

                                # Extract data
                                ltp = quote.get('last_price', 0)
                                oi = quote.get('oi', 0)
                                volume = quote.get('volume', 0)

                                # Extract OHLC
                                ohlc = quote.get('ohlc', {})
                                open_price = ohlc.get('open', ltp) if ohlc else ltp
                                high_price = ohlc.get('high', ltp) if ohlc else ltp
                                low_price = ohlc.get('low', ltp) if ohlc else ltp

                                data.append({
                                    'strike': strike,
                                    'option_type': option_type,
                                    'instrument_key': inst_key,
                                    'open': open_price,
                                    'high': high_price,
                                    'low': low_price,
                                    'close': ltp,
                                    'ltp': ltp,
                                    'volume': volume,
                                    'oi': oi
                                })
        
        logging.info(f"[DEBUG] Matched {matched_count} quotes to contracts")
        
        logging.info(f"[DEBUG] Built dataframe with {len(data)} rows")
        
        if data:
            df = pd.DataFrame(data)
            return df
        
        logging.error("[DEBUG] No data after processing quotes")
        return None


# ============================================================================
# LIVE SIGNAL DETECTOR WITH ATM-BASED ENTRY
# ============================================================================

class LiveSignalDetector:
    """Detects trading signals from live OI changes with ATM-based entry"""
    
    def __init__(self):
        self.previous_poll = None
        self.signal_history = []
        logging.info(">>> Signal Detector initialized")
    
    def select_strikes(self, df, nifty_spot):
        """Select strikes: 10 ITM + ATM + 10 OTM (total 21 strikes)"""
        atm_strike = round(nifty_spot / 50) * 50
        
        # Get ALL available strikes from the dataframe
        all_strikes = sorted(df['strike'].unique())
        
        # Separate into ITM and OTM based on ATM
        itm_strikes = [s for s in all_strikes if s < atm_strike]
        otm_strikes = [s for s in all_strikes if s > atm_strike]
        
        # Sort: ITM descending (closest to ATM first), OTM ascending (closest to ATM first)
        itm_strikes = sorted(itm_strikes, reverse=True)
        otm_strikes = sorted(otm_strikes)
        
        # Select ONLY 10 ITM and 10 OTM (closest to ATM)
        selected_itm = itm_strikes[:10] if len(itm_strikes) >= 10 else itm_strikes
        selected_otm = otm_strikes[:10] if len(otm_strikes) >= 10 else otm_strikes
        
        logging.info(f"[STRIKES] ATM: {atm_strike}, ITM: {len(selected_itm)} strikes, OTM: {len(selected_otm)} strikes")
        logging.info(f"[STRIKES] ITM Range: {selected_itm[-1] if selected_itm else 'N/A'} to {selected_itm[0] if selected_itm else 'N/A'}")
        logging.info(f"[STRIKES] OTM Range: {selected_otm[0] if selected_otm else 'N/A'} to {selected_otm[-1] if selected_otm else 'N/A'}")
        
        return {
            'ATM': atm_strike,
            'ITM': selected_itm,  # 10 ITM strikes closest to ATM
            'OTM': selected_otm   # 10 OTM strikes closest to ATM
        }
    
    def calculate_oi_changes(self, current_df, previous_df):
        """Calculate OI changes between polls with detailed debugging"""
        if previous_df is None or len(previous_df) == 0:
            return None
        
        merged = pd.merge(
            current_df[['strike', 'option_type', 'oi', 'ltp']],
            previous_df[['strike', 'option_type', 'oi', 'ltp']],
            on=['strike', 'option_type'],
            suffixes=('_current', '_prev'),
            how='left'
        )
        
        merged['oi_change'] = merged['oi_current'] - merged['oi_prev']
        merged['oi_change_pct'] = ((merged['oi_current'] - merged['oi_prev']) / merged['oi_prev'] * 100).fillna(0)
        
        # DEBUG: Log ALL OI changes for all 42 strikes
        logging.info("="*80)
        logging.info("[OI CHANGES] COMPLETE OPTION CHAIN OI ANALYSIS")
        logging.info("="*80)
        
        # Group by strike and show CE and PE together
        strikes = sorted(merged['strike'].unique())
        
        for strike in strikes:
            strike_data = merged[merged['strike'] == strike]
            
            ce_data = strike_data[strike_data['option_type'] == 'CE']
            pe_data = strike_data[strike_data['option_type'] == 'PE']
            
            if len(ce_data) > 0 and len(pe_data) > 0:
                ce_oi_curr = ce_data['oi_current'].iloc[0]
                ce_oi_prev = ce_data['oi_prev'].iloc[0]
                ce_oi_chg = ce_data['oi_change'].iloc[0]
                ce_oi_pct = ce_data['oi_change_pct'].iloc[0]
                ce_ltp = ce_data['ltp_current'].iloc[0]
                
                pe_oi_curr = pe_data['oi_current'].iloc[0]
                pe_oi_prev = pe_data['oi_prev'].iloc[0]
                pe_oi_chg = pe_data['oi_change'].iloc[0]
                pe_oi_pct = pe_data['oi_change_pct'].iloc[0]
                pe_ltp = pe_data['ltp_current'].iloc[0]
                
                # Determine if strike shows bullish or bearish behavior
                is_bullish = (ce_oi_pct < -OI_CHANGE_THRESHOLD_PCT and 
                             pe_oi_pct > OI_CHANGE_THRESHOLD_PCT and
                             abs(ce_oi_chg) >= MIN_OI_ABSOLUTE and
                             abs(pe_oi_chg) >= MIN_OI_ABSOLUTE)
                
                is_bearish = (ce_oi_pct > OI_CHANGE_THRESHOLD_PCT and 
                             pe_oi_pct < -OI_CHANGE_THRESHOLD_PCT and
                             abs(ce_oi_chg) >= MIN_OI_ABSOLUTE and
                             abs(pe_oi_chg) >= MIN_OI_ABSOLUTE)
                
                signal_indicator = ""
                if is_bullish:
                    signal_indicator = " [BULLISH]"
                elif is_bearish:
                    signal_indicator = " [BEARISH]"
                
                logging.info(f"Strike {int(strike):5d}{signal_indicator}")
                logging.info(f"  CE: OI {ce_oi_curr:>10,.0f} (was {ce_oi_prev:>10,.0f}) | "
                           f"Change: {ce_oi_chg:>8,.0f} ({ce_oi_pct:>+6.2f}%) | LTP: Rs.{ce_ltp:>7.2f}")
                logging.info(f"  PE: OI {pe_oi_curr:>10,.0f} (was {pe_oi_prev:>10,.0f}) | "
                           f"Change: {pe_oi_chg:>8,.0f} ({pe_oi_pct:>+6.2f}%) | LTP: Rs.{pe_ltp:>7.2f}")
        
        logging.info("="*80)
        
        return merged
    
    def check_bullish_behavior(self, strike_data):
        """BULLISH: Call OI decreases + Put OI increases (absolute change >= 0.3%)"""
        try:
            ce_data = strike_data[strike_data['option_type'] == 'CE']
            pe_data = strike_data[strike_data['option_type'] == 'PE']
            
            if len(ce_data) == 0 or len(pe_data) == 0:
                return {'is_bullish': False, 'reason': 'missing_data'}
            
            ce_oi_change = ce_data['oi_change'].iloc[0]
            ce_oi_change_pct = ce_data['oi_change_pct'].iloc[0]
            pe_oi_change = pe_data['oi_change'].iloc[0]
            pe_oi_change_pct = pe_data['oi_change_pct'].iloc[0]
            
            # BULLISH: CE OI decreasing (any decrease >= 0.3%) AND PE OI increasing (any increase >= 0.3%)
            call_decreasing = ce_oi_change < 0 and abs(ce_oi_change_pct) >= OI_CHANGE_THRESHOLD_PCT
            put_increasing = pe_oi_change > 0 and abs(pe_oi_change_pct) >= OI_CHANGE_THRESHOLD_PCT
            call_significant = abs(ce_oi_change) >= MIN_OI_ABSOLUTE
            put_significant = abs(pe_oi_change) >= MIN_OI_ABSOLUTE
            
            is_bullish = call_decreasing and put_increasing and call_significant and put_significant
            
            return {
                'is_bullish': is_bullish,
                'ce_oi_pct': ce_oi_change_pct,
                'pe_oi_pct': pe_oi_change_pct,
                'ce_oi_change': ce_oi_change,
                'pe_oi_change': pe_oi_change,
                'call_decreasing': call_decreasing,
                'put_increasing': put_increasing,
                'call_significant': call_significant,
                'put_significant': put_significant
            }
        except Exception as e:
            logging.error(f"[ERROR] Exception in check_bullish_behavior: {e}")
            return {'is_bullish': False, 'reason': f'exception: {e}'}
    
    def check_bearish_behavior(self, strike_data):
        """BEARISH: Call OI increases + Put OI decreases (absolute change >= 0.3%)"""
        try:
            ce_data = strike_data[strike_data['option_type'] == 'CE']
            pe_data = strike_data[strike_data['option_type'] == 'PE']
            
            if len(ce_data) == 0 or len(pe_data) == 0:
                return {'is_bearish': False, 'reason': 'missing_data'}
            
            ce_oi_change = ce_data['oi_change'].iloc[0]
            ce_oi_change_pct = ce_data['oi_change_pct'].iloc[0]
            pe_oi_change = pe_data['oi_change'].iloc[0]
            pe_oi_change_pct = pe_data['oi_change_pct'].iloc[0]
            
            # BEARISH: CE OI increasing (any increase >= 0.3%) AND PE OI decreasing (any decrease >= 0.3%)
            call_increasing = ce_oi_change > 0 and abs(ce_oi_change_pct) >= OI_CHANGE_THRESHOLD_PCT
            put_decreasing = pe_oi_change < 0 and abs(pe_oi_change_pct) >= OI_CHANGE_THRESHOLD_PCT
            call_significant = abs(ce_oi_change) >= MIN_OI_ABSOLUTE
            put_significant = abs(pe_oi_change) >= MIN_OI_ABSOLUTE
            
            is_bearish = call_increasing and put_decreasing and call_significant and put_significant
            
            return {
                'is_bearish': is_bearish,
                'ce_oi_pct': ce_oi_change_pct,
                'pe_oi_pct': pe_oi_change_pct,
                'ce_oi_change': ce_oi_change,
                'pe_oi_change': pe_oi_change,
                'call_increasing': call_increasing,
                'put_decreasing': put_decreasing,
                'call_significant': call_significant,
                'put_significant': put_significant
            }
        except Exception as e:
            logging.error(f"[ERROR] Exception in check_bearish_behavior: {e}")
            return {'is_bearish': False, 'reason': f'exception: {e}'}
    
    def verify_signal_still_valid(self, trade_info, current_df):
        """
        Verify if the original signal pattern is still valid
        Returns True if signal is valid, False if reversed
        """
        try:
            signal_type = trade_info['signal_type']
            voting_strikes = trade_info.get('voting_strikes', [])
            
            if not voting_strikes:
                logging.info("[SIGNAL VERIFY] No voting strikes stored, assuming valid")
                return True  # No voting info, assume valid
            
            # Calculate OI changes
            oi_changes = self.calculate_oi_changes(current_df, self.previous_poll)
            
            if oi_changes is None:
                logging.info("[SIGNAL VERIFY] Cannot calculate OI changes, assuming valid")
                return True  # Can't verify, assume valid
            
            # Count how many voting strikes still show the same pattern
            valid_votes = 0
            
            for strike in voting_strikes:
                strike_data = oi_changes[oi_changes['strike'] == strike]
                
                if len(strike_data) > 0:
                    if signal_type == 'BULLISH':
                        behavior = self.check_bullish_behavior(strike_data)
                        if behavior.get('is_bullish'):
                            valid_votes += 1
                    else:  # BEARISH
                        behavior = self.check_bearish_behavior(strike_data)
                        if behavior.get('is_bearish'):
                            valid_votes += 1
            
            # Signal is still valid if at least MIN_VOTES_REQUIRED strikes still show the pattern
            is_valid = valid_votes >= MIN_VOTES_REQUIRED
            
            logging.info(f"[SIGNAL VERIFY] {signal_type} signal: {valid_votes}/{len(voting_strikes)} strikes still showing pattern")
            
            if not is_valid:
                logging.warning(f"[SIGNAL VERIFY] ⚠️ SIGNAL REVERSED: Only {valid_votes}/{len(voting_strikes)} strikes showing pattern (need {MIN_VOTES_REQUIRED}+)")
            
            return is_valid
            
        except Exception as e:
            logging.error(f"[ERROR] Exception in verify_signal_still_valid: {e}")
            return True  # On error, assume valid to avoid premature exit
    
    def detect_signals(self, df, nifty_spot):
        """Detect BOTH bullish and bearish signals - UPDATED: ATM included in voting"""
        try:
            timestamp = datetime.now()
            
            oi_changes = self.calculate_oi_changes(df, self.previous_poll)
            
            if oi_changes is None:
                logging.info("[SIGNAL] First poll - establishing baseline, no signals yet")
                self.previous_poll = df.copy()
                return []
            
            selected_strikes = self.select_strikes(df, nifty_spot)
            signals = []
            
            logging.info(f"[SIGNAL CHECK] NIFTY Spot: {nifty_spot:.2f}, ATM: {selected_strikes['ATM']}")
            
            # ========================================================================
            # CHECK BULLISH SIGNAL - 10 ITM only (ATM not in voting pool)
            # ========================================================================
            logging.info("[SIGNAL] === CHECKING BULLISH SIGNAL ===")

            # Check 10 ITM strikes only for bullish behavior
            itm_votes = []
            bullish_voting_strikes = selected_strikes['ITM']  # 10 ITM only

            logging.info(f"[SIGNAL] Scanning {len(bullish_voting_strikes)} ITM strikes for bullish behavior...")
            
            for strike in bullish_voting_strikes:
                strike_data = oi_changes[oi_changes['strike'] == strike]
                
                if len(strike_data) > 0:
                    behavior = self.check_bullish_behavior(strike_data)

                    if behavior.get('is_bullish'):
                        itm_votes.append(strike)
                        logging.info(f"[SIGNAL] ✓ ITM {strike} VOTE: CE_OI={behavior['ce_oi_pct']:.2f}%, PE_OI={behavior['pe_oi_pct']:.2f}%")
                    else:
                        logging.debug(f"[SIGNAL] ✗ ITM {strike} REJECTED: CE_OI={behavior.get('ce_oi_pct', 0):.2f}%, PE_OI={behavior.get('pe_oi_pct', 0):.2f}%")
                else:
                    logging.warning(f"[SIGNAL] ✗ Strike {strike} - No data available")
            
            total_bullish_strikes = len(bullish_voting_strikes)
            logging.info(f"[SIGNAL] Bullish votes: {len(itm_votes)}/{total_bullish_strikes} ITM strikes")

            if len(itm_votes) >= MIN_VOTES_REQUIRED:
                logging.info(f"[SIGNAL] ✓✓✓ BULLISH CONFIRMED: {len(itm_votes)}/{total_bullish_strikes} ITM strikes voting (need {MIN_VOTES_REQUIRED}+)")
                
                # CHANGE: Always use ATM as entry strike base (not first voting strike)
                atm_strike = selected_strikes['ATM']
                
                logging.info(f"[SIGNAL] >>> Using ATM {atm_strike} as entry base (regardless of voting)")
                
                entry_data = df[(df['strike'] == atm_strike) & (df['option_type'] == 'CE')]
                
                if len(entry_data) > 0:
                    atm_price = entry_data['ltp'].iloc[0]
                    
                    logging.info(f"[SIGNAL] ATM strike {atm_strike}CE price: Rs.{atm_price:.2f}")
                    
                    # Validate ATM price before adjustment (Reason 2 validation)
                    if atm_price > MIN_ENTRY_PRICE:
                        entry_oi_data = oi_changes[(oi_changes['strike'] == atm_strike) & 
                                                   (oi_changes['option_type'] == 'CE')]
                        oi_pct_atm = entry_oi_data['oi_change_pct'].iloc[0] if len(entry_oi_data) > 0 else 0
                        
                        logging.info(f"[SIGNAL] ✓ ATM price Rs.{atm_price:.2f} > Rs.{MIN_ENTRY_PRICE} - proceeding with signal")
                        
                        signals.append({
                            'timestamp': timestamp,
                            'signal_type': 'BULLISH',
                            'direction': 'BUY_CALL',
                            'atm_strike': atm_strike,  # Store ATM for entry calculation
                            'option_type': 'CE',
                            'atm_price': atm_price,
                            'exit_target': None,  # Will be calculated after adjustment
                            'stop_loss': None,  # Will be calculated after adjustment
                            'target_points': TARGET_POINTS,
                            'votes': len(itm_votes),
                            'oi_change_pct_at_atm': oi_pct_atm,
                            'voting_strikes': itm_votes  # Store voting strikes for verification
                        })
                    else:
                        logging.warning(f"[SIGNAL] ✗ BULLISH REJECTED: ATM {atm_strike}CE price Rs.{atm_price:.2f} <= Rs.{MIN_ENTRY_PRICE} (MIN_PRICE_FILTER - ATM too cheap)")
                else:
                    logging.warning(f"[SIGNAL] ✗ BULLISH REJECTED: No data for ATM {atm_strike}CE")
            else:
                logging.info(f"[SIGNAL] ✗ BULLISH REJECTED: Only {len(itm_votes)}/{total_bullish_strikes} votes (need {MIN_VOTES_REQUIRED}+)")
            
            # ========================================================================
            # CHECK BEARISH SIGNAL - 10 OTM only (ATM not in voting pool)
            # ========================================================================
            logging.info("[SIGNAL] === CHECKING BEARISH SIGNAL ===")

            # Check 10 OTM strikes only for bearish behavior
            otm_votes = []
            bearish_voting_strikes = selected_strikes['OTM']  # 10 OTM only

            logging.info(f"[SIGNAL] Scanning {len(bearish_voting_strikes)} OTM strikes for bearish behavior...")
            
            for strike in bearish_voting_strikes:
                strike_data = oi_changes[oi_changes['strike'] == strike]
                
                if len(strike_data) > 0:
                    behavior = self.check_bearish_behavior(strike_data)

                    if behavior.get('is_bearish'):
                        otm_votes.append(strike)
                        logging.info(f"[SIGNAL] ✓ OTM {strike} VOTE: CE_OI={behavior['ce_oi_pct']:.2f}%, PE_OI={behavior['pe_oi_pct']:.2f}%")
                    else:
                        logging.debug(f"[SIGNAL] ✗ OTM {strike} REJECTED: CE_OI={behavior.get('ce_oi_pct', 0):.2f}%, PE_OI={behavior.get('pe_oi_pct', 0):.2f}%")
                else:
                    logging.warning(f"[SIGNAL] ✗ Strike {strike} - No data available")
            
            total_bearish_strikes = len(bearish_voting_strikes)
            logging.info(f"[SIGNAL] Bearish votes: {len(otm_votes)}/{total_bearish_strikes} OTM strikes")

            if len(otm_votes) >= MIN_VOTES_REQUIRED:
                logging.info(f"[SIGNAL] ✓✓✓ BEARISH CONFIRMED: {len(otm_votes)}/{total_bearish_strikes} OTM strikes voting (need {MIN_VOTES_REQUIRED}+)")
                
                # CHANGE: Always use ATM as entry strike base (not first voting strike)
                atm_strike = selected_strikes['ATM']
                
                logging.info(f"[SIGNAL] >>> Using ATM {atm_strike} as entry base (regardless of voting)")
                
                entry_data = df[(df['strike'] == atm_strike) & (df['option_type'] == 'PE')]
                
                if len(entry_data) > 0:
                    atm_price = entry_data['ltp'].iloc[0]
                    
                    logging.info(f"[SIGNAL] ATM strike {atm_strike}PE price: Rs.{atm_price:.2f}")
                    
                    # Validate ATM price before adjustment (Reason 2 validation)
                    if atm_price > MIN_ENTRY_PRICE:
                        entry_oi_data = oi_changes[(oi_changes['strike'] == atm_strike) & 
                                                   (oi_changes['option_type'] == 'PE')]
                        oi_pct_atm = entry_oi_data['oi_change_pct'].iloc[0] if len(entry_oi_data) > 0 else 0
                        
                        logging.info(f"[SIGNAL] ✓ ATM price Rs.{atm_price:.2f} > Rs.{MIN_ENTRY_PRICE} - proceeding with signal")
                        
                        signals.append({
                            'timestamp': timestamp,
                            'signal_type': 'BEARISH',
                            'direction': 'BUY_PUT',
                            'atm_strike': atm_strike,  # Store ATM for entry calculation
                            'option_type': 'PE',
                            'atm_price': atm_price,
                            'exit_target': None,  # Will be calculated after adjustment
                            'stop_loss': None,  # Will be calculated after adjustment
                            'target_points': TARGET_POINTS,
                            'votes': len(otm_votes),
                            'oi_change_pct_at_atm': oi_pct_atm,
                            'voting_strikes': otm_votes  # Store voting strikes for verification
                        })
                    else:
                        logging.warning(f"[SIGNAL] ✗ BEARISH REJECTED: ATM {atm_strike}PE price Rs.{atm_price:.2f} <= Rs.{MIN_ENTRY_PRICE} (MIN_PRICE_FILTER - ATM too cheap)")
                else:
                    logging.warning(f"[SIGNAL] ✗ BEARISH REJECTED: No data for ATM {atm_strike}PE")
            else:
                logging.info(f"[SIGNAL] ✗ BEARISH REJECTED: Only {len(otm_votes)}/{total_bearish_strikes} votes (need {MIN_VOTES_REQUIRED}+)")
            
            # Save current poll for next comparison
            self.previous_poll = df.copy()
            self.signal_history.extend(signals)
            
            if signals:
                logging.info(f"[SIGNAL] >>> {len(signals)} SIGNAL(S) GENERATED <<<")
            else:
                logging.info("[SIGNAL] No signals generated this poll")
            
            return signals
            
        except Exception as e:
            logging.error(f"[ERROR] Exception in detect_signals: {e}", exc_info=True)
            return []


# ============================================================================
# LIVE PAPER TRADER WITH ATM-BASED ENTRY
# ============================================================================

class LivePaperTrader:
    """Manages live paper trading with ATM-based entry logic"""
    
    def __init__(self, access_token):
        self.fetcher = UpstoxLiveDataFetcher(access_token)
        self.detector = LiveSignalDetector()
        self.active_trade = None
        self.completed_trades = []
        self.trades_today = 0
        self.current_date = datetime.now().date()
        self.lock = Lock()
        self.expiry_date = None
        logging.info(">>> Paper Trader initialized")
    
    def calculate_quantity(self, entry_price):
        """Calculate number of lots based on capital"""
        if entry_price <= 0:
            return 0
        
        contract_value = entry_price * LOT_SIZE
        quantity_lots = CAPITAL_PER_TRADE / contract_value
        
        return max(1, int(quantity_lots))
    
    def is_trading_hours(self):
        """Check if current time is within trading hours"""
        now = datetime.now().time()
        return TRADING_START_TIME <= now <= TRADING_END_TIME
    
    def can_take_new_trade(self):
        """Check if we can take a new trade"""
        # Reset daily counter if new day
        today = datetime.now().date()
        if today != self.current_date:
            self.trades_today = 0
            self.current_date = today
            logging.info(f"[NEW DAY] New trading day: {today}")
        
        return (self.active_trade is None and 
                self.trades_today < MAX_TRADES_PER_DAY and 
                self.is_trading_hours())
    
    def check_exit_conditions(self, current_price, current_df):
        """
        Check if active trade should be exited (including signal verification)
        """
        if not self.active_trade:
            return False, None
        
        entry_price = self.active_trade['entry_price']
        target = self.active_trade['exit_target']
        stop_loss = self.active_trade['stop_loss']
        
        # Target hit
        if current_price >= target:
            return True, 'TARGET_HIT'
        
        # Stop loss hit
        if current_price <= stop_loss:
            return True, 'STOP_LOSS'
        
        # Check if trade is in negative and verify signal
        if current_price < entry_price:
            logging.info(f"[TRADE STATUS] Trade in negative: Entry=Rs.{entry_price:.2f}, Current=Rs.{current_price:.2f}")
            
            # Verify if signal is still valid
            is_valid = self.detector.verify_signal_still_valid(self.active_trade, current_df)
            
            if not is_valid:
                logging.warning("[EXIT TRIGGER] ⚠️ Signal pattern reversed while trade is negative - EXITING IMMEDIATELY")
                return True, 'SIGNAL_REVERSED'
        
        # End of trading hours
        if not self.is_trading_hours():
            return True, 'EOD'
        
        return False, None
    
    def enter_trade(self, signal, df):
        """
        Enter a new paper trade with 200 ITM entry logic

        V2 LOGIC:
        - Uses ATM strike (regardless of voting results)
        - BULLISH (CALL): ATM - 200 (200 points ITM for calls)
        - BEARISH (PUT): ATM + 200 (200 points ITM for puts)
        - Validates entry strike price > Rs.20
        """
        with self.lock:
            if not self.can_take_new_trade():
                return

            atm_strike = signal['atm_strike']
            option_type = signal['option_type']
            signal_type = signal['signal_type']

            # ATM price was already validated in detect_signals()
            atm_price = signal['atm_price']

            logging.info(f"[ENTRY] ATM Strike: {atm_strike}{option_type}, ATM Price: Rs.{atm_price:.2f}")

            # ========================================================================
            # 200 ITM ENTRY LOGIC (with 100 rounding)
            # ========================================================================
            # Step 1: Round ATM to nearest 100
            rounded_atm = round(atm_strike / 100) * 100

            # Step 2: Calculate entry strike (200 ITM from rounded ATM)
            if signal_type == 'BULLISH':
                # CALL option: ITM means below spot, so rounded ATM - 200
                entry_strike = rounded_atm - 200
                logging.info(f"[STRIKE ADJUSTMENT] BULLISH → ATM {atm_strike} → Round {rounded_atm} → CALL Entry {entry_strike} (200 ITM)")
            else:  # BEARISH
                # PUT option: ITM means above spot, so rounded ATM + 200
                entry_strike = rounded_atm + 200
                logging.info(f"[STRIKE ADJUSTMENT] BEARISH → ATM {atm_strike} → Round {rounded_atm} → PUT Entry {entry_strike} (200 ITM)")
            
            # Find the entry strike data in existing df
            entry_data = df[(df['strike'] == entry_strike) & (df['option_type'] == option_type)]

            if len(entry_data) == 0:
                logging.error(f"[ERROR] Entry strike {entry_strike}{option_type} not found in option chain")
                return

            # Get entry price and instrument key for entry strike
            entry_price = entry_data['ltp'].iloc[0]
            instrument_key = entry_data['instrument_key'].iloc[0]

            logging.info(f"[ENTRY PRICE] {entry_strike}{option_type} price: Rs.{entry_price:.2f}")

            # Check minimum price filter for entry strike
            if entry_price <= MIN_ENTRY_PRICE:
                logging.warning(f"[REJECTED] Entry strike {entry_strike}{option_type} price Rs.{entry_price:.2f} <= Rs.{MIN_ENTRY_PRICE} (MIN_PRICE_FILTER)")
                return

            quantity = self.calculate_quantity(entry_price)
            capital_deployed = entry_price * LOT_SIZE * quantity
            
            # Store trade information
            self.active_trade = {
                'entry_time': signal['timestamp'],
                'signal_type': signal['signal_type'],
                'direction': signal['direction'],
                'atm_strike': atm_strike,  # Original ATM strike
                'entry_strike': entry_strike,  # Entry strike (200 ITM)
                'option_type': option_type,
                'atm_price': atm_price,  # ATM price at signal
                'entry_price': entry_price,  # Actual entry price at entry strike
                'exit_target': entry_price + TARGET_POINTS,
                'stop_loss': entry_price * (1 - STOP_LOSS_PCT / 100),
                'lot_size': LOT_SIZE,
                'quantity_lots': quantity,
                'capital_deployed': capital_deployed,
                'oi_change_pct_at_atm': signal['oi_change_pct_at_atm'],
                'instrument_key': instrument_key,
                'voting_strikes': signal.get('voting_strikes', []),
                'status': 'OPEN'
            }

            self.trades_today += 1

            logging.info("="*80)
            logging.info("[TRADE ENTRY] NEW TRADE ENTERED")
            logging.info(f"Signal: {signal['signal_type']}")
            logging.info(f"ATM Strike: {atm_strike}{option_type} (price: Rs.{atm_price:.2f})")
            logging.info(f"Entry Strike: {entry_strike}{option_type} (200 ITM)")
            logging.info(f"Entry Price: Rs.{entry_price:.2f}")
            logging.info(f"Target: Rs.{entry_price + TARGET_POINTS:.2f}")
            logging.info(f"Stop Loss: Rs.{entry_price * (1 - STOP_LOSS_PCT / 100):.2f}")
            logging.info(f"Quantity: {quantity} lots")
            logging.info(f"Capital: Rs.{capital_deployed:,.2f}")
            logging.info(f"OI Change (at ATM): {signal['oi_change_pct_at_atm']:.2f}%")
            logging.info(f"Voting Strikes: {signal.get('voting_strikes', [])} (for verification)")
            logging.info(f"Trades Today: {self.trades_today}/{MAX_TRADES_PER_DAY}")
            logging.info("="*80)
    
    def exit_trade(self, exit_price, exit_reason):
        """Exit the active trade"""
        with self.lock:
            if not self.active_trade:
                return
            
            entry_price = self.active_trade['entry_price']
            pnl_per_lot = exit_price - entry_price
            total_pnl = pnl_per_lot * LOT_SIZE * self.active_trade['quantity_lots']
            pnl_pct = (pnl_per_lot / entry_price * 100)
            
            holding_minutes = (datetime.now() - self.active_trade['entry_time']).total_seconds() / 60
            
            self.active_trade.update({
                'exit_time': datetime.now(),
                'exit_price': exit_price,
                'pnl_per_lot': pnl_per_lot,
                'total_pnl': total_pnl,
                'pnl_pct': pnl_pct,
                'holding_minutes': int(holding_minutes),
                'exit_reason': exit_reason,
                'status': 'CLOSED'
            })
            
            self.completed_trades.append(self.active_trade.copy())
            
            logging.info("="*80)
            logging.info(f"[TRADE EXIT] TRADE CLOSED - {exit_reason}")
            logging.info(f"Strike: {self.active_trade['entry_strike']}{self.active_trade['option_type']}")
            logging.info(f"Entry: Rs.{entry_price:.2f} -> Exit: Rs.{exit_price:.2f}")
            logging.info(f"P&L: Rs.{total_pnl:,.2f} ({pnl_pct:+.2f}%)")
            logging.info(f"Holding: {int(holding_minutes)} minutes")
            logging.info("="*80)
            
            self.active_trade = None
    
    def poll_and_trade(self):
        """Main trading loop - poll market and manage trades"""
        try:
            # Get current expiry if not set
            if not self.expiry_date:
                self.expiry_date = self.fetcher.get_next_expiry()
                if not self.expiry_date:
                    logging.error("[ERROR] Failed to get expiry date")
                    return
                logging.info(f"[EXPIRY] Trading expiry: {self.expiry_date}")
            
            # Fetch option chain snapshot
            df = self.fetcher.get_option_chain_snapshot(self.expiry_date)

            if df is None or len(df) == 0:
                logging.warning("[WARNING] No data received")
                return

            # Get ACTUAL NIFTY spot price from API
            nifty_spot = self.fetcher.get_nifty_spot_price()

            if not nifty_spot:
                logging.warning("[WARNING] Failed to get NIFTY spot price, using fallback")
                # Fallback: Calculate from middle strike
                strikes = sorted(df['strike'].unique())
                nifty_spot = strikes[len(strikes) // 2]
            
            # Check active trade for exit
            if self.active_trade:
                inst_key = self.active_trade['instrument_key']
                current_data = df[df['instrument_key'] == inst_key]
                
                if len(current_data) > 0:
                    current_price = current_data['ltp'].iloc[0]
                    should_exit, exit_reason = self.check_exit_conditions(current_price, df)
                    
                    if should_exit:
                        self.exit_trade(current_price, exit_reason)
                    else:
                        # Show trade status
                        entry_price = self.active_trade['entry_price']
                        pnl = current_price - entry_price
                        pnl_pct = (pnl / entry_price * 100)
                        logging.info(f"[ACTIVE TRADE] {self.active_trade['entry_strike']}{self.active_trade['option_type']} "
                                   f"Entry: Rs.{entry_price:.2f} Current: Rs.{current_price:.2f} "
                                   f"P&L: {pnl_pct:+.2f}%")
            
            # Look for new signals if no active trade
            if self.can_take_new_trade():
                signals = self.detector.detect_signals(df, nifty_spot)
                
                if signals:
                    # Take first signal
                    signal = signals[0]
                    self.enter_trade(signal, df)
            
        except Exception as e:
            logging.error(f"[ERROR] Error in trading loop: {e}", exc_info=True)
    
    def start_trading(self):
        """Start the live trading loop"""
        logging.info("\n" + "="*80)
        logging.info(">>> STARTING LIVE PAPER TRADING (V2 - 200 ITM with 100 Rounding)")
        logging.info("="*80)
        logging.info(f"Trading Hours: {TRADING_START_TIME} - {TRADING_END_TIME}")
        logging.info(f"Max Trades/Day: {MAX_TRADES_PER_DAY}")
        logging.info(f"Stop Loss: {STOP_LOSS_PCT}%")
        logging.info(f"Target: {TARGET_POINTS} points")
        logging.info(f"Min Entry Price: Rs.{MIN_ENTRY_PRICE}")
        logging.info(f"Poll Interval: {POLL_INTERVAL} seconds")
        logging.info(f"\nSTRIKE SELECTION: 10 ITM + ATM + 10 OTM = 21 strikes")
        logging.info(f"VOTING POOLS:")
        logging.info(f"  - BULLISH: 10 ITM only (ATM NOT in voting)")
        logging.info(f"  - BEARISH: 10 OTM only (ATM NOT in voting)")
        logging.info(f"VOTING REQUIREMENT: {MIN_VOTES_REQUIRED}+ strikes must show same OI behavior")
        logging.info(f"OI THRESHOLD: ±{OI_CHANGE_THRESHOLD_PCT}% with minimum {MIN_OI_ABSOLUTE:,} contracts")
        logging.info(f"\nENTRY LOGIC (V2 - 200 ITM with 100 Rounding):")
        logging.info(f"  1. Get actual NIFTY spot price from API")
        logging.info(f"  2. Calculate ATM strike (nearest 50)")
        logging.info(f"  3. Round ATM to nearest 100")
        logging.info(f"  4. Entry strike calculation:")
        logging.info(f"     • BULLISH (CALL): Rounded ATM - 200 (200 points ITM)")
        logging.info(f"     • BEARISH (PUT): Rounded ATM + 200 (200 points ITM)")
        logging.info(f"  5. Examples:")
        logging.info(f"     • Spot 23545 → ATM 23550 → Round 23600 → CALL Entry 23400")
        logging.info(f"     • Spot 23545 → ATM 23550 → Round 23600 → PUT Entry 23800")
        logging.info(f"\nVALIDATIONS:")
        logging.info(f"  ✓ Real-time NIFTY spot price (not estimated)")
        logging.info(f"  ✓ ATM price checked before entry")
        logging.info(f"  ✓ Entry strike price > Rs.{MIN_ENTRY_PRICE}")
        logging.info(f"  ✓ Signal verification - exits if OI pattern reverses while in loss")
        logging.info("="*80 + "\n")
        
        try:
            while True:
                now = datetime.now()
                
                # Only trade during market hours
                if self.is_trading_hours():
                    logging.info(f"[POLL] Polling at {now.strftime('%H:%M:%S')}")
                    self.poll_and_trade()
                else:
                    logging.info(f"[OFF HOURS] Outside trading hours ({now.strftime('%H:%M:%S')})")
                    
                    # If we have an open trade outside hours, close it
                    if self.active_trade:
                        inst_key = self.active_trade['instrument_key']
                        df = self.fetcher.get_option_chain_snapshot(self.expiry_date)
                        if df is not None:
                            current_data = df[df['instrument_key'] == inst_key]
                            if len(current_data) > 0:
                                current_price = current_data['ltp'].iloc[0]
                                self.exit_trade(current_price, 'EOD')
                
                # Wait for next poll
                time_module.sleep(POLL_INTERVAL)
                
        except KeyboardInterrupt:
            logging.info("\n[STOPPED] Trading stopped by user")
            self.print_summary()
        except Exception as e:
            logging.error(f"[FATAL] Fatal error: {e}", exc_info=True)
            self.print_summary()
    
    def print_summary(self):
        """Print trading summary"""
        if not self.completed_trades:
            logging.info("\n[SUMMARY] No completed trades")
            return
        
        df = pd.DataFrame(self.completed_trades)
        
        total = len(df)
        winners = len(df[df['total_pnl'] > 0])
        win_rate = (winners / total * 100) if total > 0 else 0
        total_pnl = df['total_pnl'].sum()
        
        logging.info("\n" + "="*80)
        logging.info("[SUMMARY] TRADING SUMMARY")
        logging.info("="*80)
        logging.info(f"Total Trades: {total}")
        logging.info(f"Winners: {winners} | Losers: {total - winners}")
        logging.info(f"Win Rate: {win_rate:.1f}%")
        logging.info(f"Total P&L: Rs.{total_pnl:,.2f}")
        logging.info(f"Average P&L: Rs.{df['total_pnl'].mean():,.2f}")
        logging.info(f"Max Profit: Rs.{df['total_pnl'].max():,.2f}")
        logging.info(f"Max Loss: Rs.{df['total_pnl'].min():,.2f}")
        logging.info(f"Avg Holding: {df['holding_minutes'].mean():.0f} minutes")
        
        # Exit reason breakdown
        if 'exit_reason' in df.columns:
            exit_reasons = df['exit_reason'].value_counts()
            logging.info("\nExit Reasons:")
            for reason, count in exit_reasons.items():
                logging.info(f"  {reason}: {count}")
        
        logging.info("="*80)
        
        # Save to CSV
        filename = f"live_trades_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        df.to_csv(filename, index=False)
        logging.info(f"[SAVED] Trades saved to: {filename}")


# ============================================================================
# MAIN EXECUTION
# ============================================================================

if __name__ == "__main__":
    print("="*80)
    print(">>> LIVE PAPER TRADING SYSTEM - NIFTY OPTIONS (V2 - 200 ITM + 100 Rounding)")
    print("="*80)
    print(f"Trading Hours: {TRADING_START_TIME} - {TRADING_END_TIME}")
    print(f"Max Trades/Day: {MAX_TRADES_PER_DAY}")
    print(f"Stop Loss: {STOP_LOSS_PCT}%")
    print(f"Target: {TARGET_POINTS} points")
    print(f"Min Entry Price: Rs.{MIN_ENTRY_PRICE}")
    print(f"Capital per Trade: Rs.{CAPITAL_PER_TRADE:,}")
    print(f"Lot Size: {LOT_SIZE}")
    print(f"\nSTRIKE SELECTION:")
    print(f"  - 10 ITM strikes (closest to ATM)")
    print(f"  - ATM strike")
    print(f"  - 10 OTM strikes (closest to ATM)")
    print(f"  - Total: 21 strikes")
    print(f"\nVOTING POOLS:")
    print(f"  - BULLISH: 10 ITM only (ATM NOT in voting)")
    print(f"  - BEARISH: 10 OTM only (ATM NOT in voting)")
    print(f"\nSIGNAL REQUIREMENTS:")
    print(f"  - OI Change Threshold: ±{OI_CHANGE_THRESHOLD_PCT}%")
    print(f"  - Min OI Absolute Change: {MIN_OI_ABSOLUTE:,} contracts")
    print(f"  - Min Votes Required: {MIN_VOTES_REQUIRED} strikes must agree")
    print(f"\nENTRY LOGIC (V2 - 200 ITM with 100 Rounding):")
    print(f"  1. Get actual NIFTY spot price from API")
    print(f"  2. Calculate ATM strike (nearest 50)")
    print(f"  3. Round ATM to nearest 100")
    print(f"  4. Entry strike calculation:")
    print(f"     • BULLISH (CALL): Rounded ATM - 200 (200 points ITM)")
    print(f"     • BEARISH (PUT): Rounded ATM + 200 (200 points ITM)")
    print(f"  5. Examples:")
    print(f"     • Spot 23545 → ATM 23550 → Round 23600 → CALL Entry 23400")
    print(f"     • Spot 23545 → ATM 23550 → Round 23600 → PUT Entry 23800")
    print(f"\nVALIDATIONS & FEATURES:")
    print(f"  ✓ Real-time NIFTY spot price from API (not estimated)")
    print(f"  ✓ ATM price validated before entry")
    print(f"  ✓ Entry strike price > Rs.{MIN_ENTRY_PRICE}")
    print(f"  ✓ Signal verification - exits if OI pattern reverses while in loss")
    print("="*80 + "\n")
    
    ACCESS_TOKEN = input("Enter Upstox Access Token: ").strip()
    
    if not ACCESS_TOKEN:
        print("[ERROR] Token required!")
        sys.exit(1)
    
    trader = LivePaperTrader(ACCESS_TOKEN)
    trader.start_trading()