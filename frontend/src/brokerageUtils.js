/**
 * brokerageUtils.js
 * Zerodha Brokerage Calculator (verified against Zerodha's own calculator)
 *
 * Confirmed rates (FY 2024-25):
 *   F&O Options:   STT 0.15% on sell premium, Exchange Txn 0.0355%, Stamp 0.0025% on buy
 *   Equity Intra:  STT 0.025% on sell, Exchange Txn 0.00345%, Stamp 0.003% on buy
 *   GST 18% on (brokerage + exchange txn + SEBI) for both
 */

// ─── Rate Constants ───────────────────────────────────────────────────────────

const FO_RATES = {
  brokeragePerOrder : 20,       // ₹20 flat per order (× 2 per round-trip)
  sttPct            : 0.0015,   // 0.15% on SELL premium value
  nseTxnPct         : 0.000355, // 0.0355% on total turnover (NSE F&O)
  bseTxnPct         : 0.000355, // 0.0355% on total turnover (BSE F&O) — same currently
  sebiPct           : 0.000001, // 0.0001% on total turnover
  stampPct          : 0.000025, // 0.0025% on BUY value only
  gstPct            : 0.18,     // 18% on (brokerage + txn + SEBI)
};

const EQ_INTRADAY_RATES = {
  brokeragePct      : 0.0003,   // 0.03% per order
  brokerageMax      : 20,       // capped at ₹20 per order
  sttPct            : 0.00025,  // 0.025% on SELL value (intraday)
  nseTxnPct         : 0.0000345,// 0.00345% on total turnover (NSE EQ)
  sebiPct           : 0.000001, // 0.0001% on total turnover
  stampPct          : 0.00003,  // 0.003% on BUY value only
  gstPct            : 0.18,     // 18% on (brokerage + txn + SEBI)
};

// ─── F&O Options Brokerage ───────────────────────────────────────────────────

/**
 * Calculate Zerodha brokerage for a single F&O Options trade.
 *
 * @param {number} entryPrice  - Buy premium per unit
 * @param {number} exitPrice   - Sell premium per unit
 * @param {number} quantity    - Total quantity (lots × lot_size)
 * @param {string} exchange    - "NSE" or "BSE"
 * @returns {{ brokerage, stt, exchangeTxn, gst, sebi, stampDuty, totalCharges, netPnl, grossPnl }}
 */
export function calcFOBrokerage(entryPrice, exitPrice, quantity, exchange = 'NSE') {
  const r = FO_RATES;
  const buyValue   = entryPrice * quantity;
  const sellValue  = exitPrice  * quantity;
  const turnover   = buyValue + sellValue;
  const grossPnl   = sellValue - buyValue;

  const brokerage   = r.brokeragePerOrder * 2;
  const stt         = r.sttPct * sellValue;
  const txnRate     = exchange.toUpperCase() === 'BSE' ? r.bseTxnPct : r.nseTxnPct;
  const exchangeTxn = txnRate * turnover;
  const sebi        = r.sebiPct * turnover;
  const stampDuty   = r.stampPct * buyValue;
  const gst         = r.gstPct * (brokerage + exchangeTxn + sebi);
  const totalCharges = brokerage + stt + exchangeTxn + gst + sebi + stampDuty;

  return {
    grossPnl    : round2(grossPnl),
    brokerage   : round2(brokerage),
    stt         : round2(stt),
    exchangeTxn : round2(exchangeTxn),
    gst         : round2(gst),
    sebi        : round2(sebi),
    stampDuty   : round2(stampDuty),
    totalCharges: round2(totalCharges),
    netPnl      : round2(grossPnl - totalCharges),
  };
}

// ─── Equity Intraday Brokerage (NiftyBeES / B-20) ────────────────────────────

/**
 * Calculate Zerodha brokerage for an Equity Intraday trade.
 *
 * @param {number} entryPrice  - Entry price per share
 * @param {number} exitPrice   - Exit price per share
 * @param {number} quantity    - Number of shares
 * @param {string} direction   - "BUY" (long) or "SELL" (short)
 * @returns {{ brokerage, stt, exchangeTxn, gst, sebi, stampDuty, totalCharges, netPnl, grossPnl }}
 */
export function calcEquityIntradayBrokerage(entryPrice, exitPrice, quantity, direction = 'BUY') {
  const r = EQ_INTRADAY_RATES;
  const buyValue   = entryPrice * quantity;
  const sellValue  = exitPrice  * quantity;
  const turnover   = buyValue + sellValue;

  const isShort  = direction.toUpperCase() === 'SELL';
  const grossPnl = isShort
    ? (entryPrice - exitPrice) * quantity   // short: profit if price fell
    : (exitPrice  - entryPrice) * quantity; // long:  profit if price rose
  const sttValue = isShort ? buyValue : sellValue; // STT on sell side

  const brokPerOrder = Math.min(r.brokeragePct * buyValue, r.brokerageMax);
  const brokerage    = brokPerOrder * 2;
  const stt          = r.sttPct * sttValue;
  const exchangeTxn  = r.nseTxnPct * turnover;
  const sebi         = r.sebiPct * turnover;
  const stampDuty    = r.stampPct * buyValue;
  const gst          = r.gstPct * (brokerage + exchangeTxn + sebi);
  const totalCharges = brokerage + stt + exchangeTxn + gst + sebi + stampDuty;

  return {
    grossPnl    : round2(grossPnl),
    brokerage   : round2(brokerage),
    stt         : round2(stt),
    exchangeTxn : round2(exchangeTxn),
    gst         : round2(gst),
    sebi        : round2(sebi),
    stampDuty   : round2(stampDuty),
    totalCharges: round2(totalCharges),
    netPnl      : round2(grossPnl - totalCharges),
  };
}

// ─── Strategy-Aware Router ────────────────────────────────────────────────────

/**
 * Automatically pick the right calculator based on strategy name.
 *
 * @param {object} trade   - Normalised trade object from the backend
 * @param {string} strategy - Strategy identifier string
 * @returns {object}  brokerage breakdown
 */
export function calcBrokerageForTrade(trade, strategy = '') {
  const s = (strategy || '').toUpperCase();

  // B-20 / NiftyBeES → Equity Intraday
  if (s === 'B20' || s.includes('NIFTY') || s.includes('B-20') || s.includes('B20')) {
    const entryPrice = trade.entry_price || 0;
    const exitPrice  = trade.exit_price  || 0;
    const quantity   = trade.quantity    || 0;
    const direction  = trade.position_type === 'SHORT' ? 'SELL' : 'BUY';
    return calcEquityIntradayBrokerage(entryPrice, exitPrice, quantity, direction);
  }

  // All Blaze versions + G-Blast → F&O Options
  const entryPrice = trade.entry_price || 0;
  const exitPrice  = trade.exit_price  || 0;
  const quantity   = trade.quantity    || 0;

  // BSE for SENSEX (Blaze), NSE for NIFTY (G-Blast)
  const exchange = (trade.source_file || '').includes('BSE') ? 'BSE' : 'NSE';
  return calcFOBrokerage(entryPrice, exitPrice, quantity, exchange);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function round2(val) {
  return Math.round(val * 100) / 100;
}
