const express = require('express');
const cors = require('cors');
const https = require('https');
const csv = require('csv-parser');

const app = express();
const PORT = process.env.PORT || 3001;

// Production CORS configuration
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'https://trading-dashboard-frontend-sepia.vercel.app',
    'https://trading-dashboard-frontend-fnwqxynkk-prasannasekaranes-projects.vercel.app',
    /\.vercel\.app$/
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json());

// IMPORTANT: Update these with your GitHub repository details
const GITHUB_USERNAME = 'PrasannaSekaranE';  // ← Change this!
const GITHUB_REPO = 'quantStratsAnalysis';
const GITHUB_BRANCH = 'main';

// List of CSV files to fetch from GitHub
// Add all your CSV filenames here
const CSV_FILES = [
  'confluence_trades_2025-12-04_153100.csv',
  'confluence_trades_2025-12-09_153104.csv',
  'confluence_trades_2025-12-15_153101.csv',
  'confluence_trades_2025-12-17_153104.csv',
  'confluence_trades_2025-12-18_153102.csv',
  'confluence_trades_2025-12-19_153103.csv',
  'confluence_trades_2025-12-23_150626.csv',
  'confluence_trades_2025-12-24_153104.csv',
  'confluence_trades_2025-12-26_153101.csv',
  'confluence_trades_2025-12-29_153101.csv',
  'confluence_trades_2025-12-30_153100.csv',
  'confluence_trades_2026-01-02_153100.csv',
  'live_trades_20260108_120558.csv',
  'trades_20260108.csv',
  'trades_20260109.csv',
  'live_trades_20260109_115838.csv',
  'live_trades_20260112_094418.csv',
  'confluence_trades_2026-01-12_153101.csv',
  'trades_20260112.csv',
  'confluence_trades_2026-01-09_153101.csv',
  'confluence_trades_2026-01-08_153103.csv',
  'trades_20260102.csv',
  'live_trades_20251231_152554.csv',
  'live_trades_20260102_115833.csv',
  'live_trades_20260105_102034.csv',
  'trades_20260105.csv',
  'confluence_trades_2026-01-05_153102.csv',
  'live_trades_20260106_093737.csv',
  'confluence_trades_2026-01-06_153104.csv',
  'confluence_trades_2026-01-07_153101.csv',
  'live_trades_20260107_150815.csv',
  'v1_14 (1).csv',
  'v2_14 (1).csv',
  'trades_20260114.csv',
  'confluence_trades_2026-01-14_153105.csv',
  'live_trades_20260122_100406.csv',
  'live_trades_20260122_100401.csv',
  'confluence_trades_2026-01-22_153105.csv',
  'trades_20260122.csv',
  'live_trades_20260114_160500..csv',
  'live_trades_20260114_160459.csv',
  'live_trades_20260113_094418.csv',
  'live_trades_20260113_094018.csv',
  'live_trades_20260119_090500.csv',
  'live_trades_20260119_100500.csv',
  'trades_20260120.csv',
  'trades_20260119.csv',
  'confluence_trades_2026-01-20_153103.csv',
  'confluence_trades_2026-01-19_153102.csv',
  'live_trades_20260120_100500.csv',
  'live_trades_20260120_100400.csv',
  'live_trades_20260121_100500.csv',
  'trades_20260107.csv',
  'live_trades_20260129_095654.csv',
  'V3_20260129_095629.csv',
  'V1_20260129_095619.csv',
  'trades_20260106.csv',
  'trades_20251223.csv',
  'trades_20251224.csv',
  'trades_20251226.csv',
  'trades_20251229.csv',
  'trades_20251230.csv',
  'trades_20251231.csv',
  'live_trades_20260112_160459.csv',
  'live_trades_20260127_155504.csv',
  'confluence_trades_2026-01-28_153100.csv',
  'trades_20260128.csv',
  'live_trades_20260123_101431.csv',
  'V3_20260123_101337.csv',
  'V3_20260127_155500.csv',
  'V1_20260127_155455.csv',
  'V1_20260123_101921.csv',
  'confluence_trades_2026-01-29_153102.csv',
  'trades_20260129.csv',
  'BLAZE_20260129_151440.csv',
  'V3_20260130_153630.csv',
  'V1_20260130_153623.csv',
  'trades_20260130.csv',
  'live_trades_20260130_153627.csv',
  'confluence_trades_2026-01-30_153101.csv',
  'BLAZE_20260130_153541.csv',
  'BLAZE_20260201_153122.csv',
  'live_trades_20260201_153039.csv',
  'V3_20260201_153045.csv',
  'V1_20260201_153032.csv',
  'V1_20260202_154323.csv',
  'V1_20260202_154313.csv',
  'trades_20260202.csv',
  'confluence_trades_2026-02-02_153101.csv',
  'BLAZE_20260202_153211.csv',
  'V1_20260203_111931.csv',
  'V1_20260203_111923.csv',
  'live_trades_20260203_111927.csv',
  'BLAZE_20260203_153018.csv',
  'BLAZE_20260203_153008.csv',
  'trades_20260204.csv',
  'live_trades_20260204_155140.csv',
  'confluence_trades_2026-02-04_153102.csv',
  'confluence_trades_2026-02-03_153104.csv',
  'BLAZE_20260204_155115.csv',
  'BLAZE_20260204_155108.csv',
  'V1_20260204_155143.csv',
  'V1_20260204_155136.csv'

];

const fs = require('fs');
const path = require('path');

/**
 * Fetch CSV content - tries local file first, then falls back to GitHub
 */
async function fetchCSVFromGitHub(filename) {
  // Try local file first (for development)
  const localPath = path.join(__dirname, '..', 'trades', filename);

  if (fs.existsSync(localPath)) {
    return new Promise((resolve, reject) => {
      const trades = [];
      fs.createReadStream(localPath)
        .pipe(csv())
        .on('data', (row) => {
          trades.push(row);
        })
        .on('end', () => {
          console.log(`✓ Loaded ${filename} from local (${trades.length} trades)`);
          resolve({ filename, trades });
        })
        .on('error', (error) => {
          reject(error);
        });
    });
  }

  // Fall back to GitHub
  return new Promise((resolve, reject) => {
    const url = `https://raw.githubusercontent.com/${GITHUB_USERNAME}/${GITHUB_REPO}/${GITHUB_BRANCH}/trades/${filename}`;

    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to fetch ${filename}: ${response.statusCode}`));
        return;
      }

      const trades = [];
      response
        .pipe(csv())
        .on('data', (row) => {
          trades.push(row);
        })
        .on('end', () => {
          resolve({ filename, trades });
        })
        .on('error', (error) => {
          reject(error);
        });
    }).on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Normalize trade data from different CSV formats
 */
function normalizeTrade(row, filename) {
  // Extract date from entry_time or exit_time
  let date = null;
  const entryTime = row.entry_time || row.Entry_Time || row.ENTRY_TIME;
  const exitTime = row.exit_time || row.Exit_Time || row.EXIT_TIME;

  if (entryTime) {
    if (entryTime.includes('T')) {
      date = entryTime.split('T')[0];
    } else if (entryTime.includes(' ')) {
      date = entryTime.split(' ')[0];
    } else {
      // Time-only format (MM:SS.ms or similar) - extract date from filename
      const dateMatch = filename.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (dateMatch) {
        date = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
      } else {
        const dateMatch2 = filename.match(/(\d{8})/);
        if (dateMatch2) {
          const dateStr = dateMatch2[1];
          date = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
        }
      }
    }
  } else if (exitTime) {
    if (exitTime.includes('T')) {
      date = exitTime.split('T')[0];
    } else if (exitTime.includes(' ')) {
      date = exitTime.split(' ')[0];
    }
  }

  let positionType = (row.position_type || row.Position_Type || row.POSITION_TYPE || '').toUpperCase();

  let strategy = 'Unknown';
  const filenameLower = filename.toLowerCase();

  const isBlaze = filenameLower.startsWith('blaze_');

  const isGBlast = filenameLower.includes('live_trades') ||
    filenameLower.includes('gblast') ||
    filenameLower.includes('g-blast') ||
    filenameLower.includes('g_blast') ||
    filenameLower.startsWith('v1_') ||
    filenameLower.startsWith('v2_') ||
    filenameLower.startsWith('v3_');

  if (isBlaze) {
    const type = row.type || row.Type || row.TYPE || '';
    if (type === 'v2') {
      strategy = 'BlazeV2';
    } else {
      strategy = 'Blaze';
    }
    const niftySignal = (row.nifty_signal || row.Nifty_Signal || row.NIFTY_SIGNAL || '').toUpperCase();
    if (niftySignal === 'BULLISH') {
      positionType = 'LONG';
    } else if (niftySignal === 'BEARISH') {
      positionType = 'SHORT';
    }
  } else if (isGBlast) {
    const tradeType = row.type || row.Type || row.TYPE || '';
    if (tradeType === 'version_3') {
      strategy = 'GBlastV3';
    } else if (tradeType === 'version_2') {
      strategy = 'GBlastV2';
    } else {
      strategy = 'GBlast';
    }
    const direction = (row.direction || row.Direction || row.DIRECTION || '').toUpperCase();
    if (direction === 'BUY_CALL') {
      positionType = 'LONG';
    } else if (direction === 'BUY_PUT') {
      positionType = 'SHORT';
    } else {
      const signalType = (row.signal_type || row.Signal_Type || row.SIGNAL_TYPE || '').toUpperCase();
      if (signalType === 'BULLISH') {
        positionType = 'LONG';
      } else if (signalType === 'BEARISH') {
        positionType = 'SHORT';
      }
    }
  } else if (positionType === 'SHORT') {
    strategy = 'iTrack';
  } else if (positionType === 'LONG') {
    strategy = 'TrendFlo';
  }

  const parseFloatSafe = (val) => {
    if (!val || val === '') return 0;
    return Number(val);
  };

  let symbol = row.symbol || row.Symbol || row.SYMBOL || '';
  if (isGBlast && !symbol) {
    const strike = row.entry_strike || row.Entry_Strike || row.ENTRY_STRIKE || '';
    const optionType = row.option_type || row.Option_Type || row.OPTION_TYPE || '';
    symbol = strike && optionType ? `NIFTY ${strike} ${optionType}` : 'NIFTY';
  }
  if (isBlaze && !symbol) {
    const strike = row.entry_strike || row.Entry_Strike || row.ENTRY_STRIKE || '';
    const optionType = row.option_type || row.Option_Type || row.OPTION_TYPE || '';
    symbol = strike && optionType ? `SENSEX ${strike} ${optionType}` : 'SENSEX';
  }

  const pnl = parseFloatSafe(row.total_pnl || row.net_pnl || row.pnl || row.Net_PnL || row.PNL || row.Total_PnL);
  const profitPct = parseFloatSafe(row.pnl_pct || row.profit_pct || row.return_pct || row.Profit_Pct || row.PROFIT_PCT);

  return {
    symbol: symbol,
    entry_time: entryTime || '',
    exit_time: exitTime || '',
    date: date,
    entry_price: parseFloatSafe(row.entry_price || row.Entry_Price || row.ENTRY_PRICE),
    exit_price: parseFloatSafe(row.exit_price || row.Exit_Price || row.EXIT_PRICE),
    position_type: positionType,
    net_pnl: pnl,
    profit_pct: profitPct,
    exit_reason: row.exit_reason || row.Exit_Reason || row.EXIT_REASON || '',
    quantity: parseFloatSafe(row.quantity || row.quantity_lots || row.Quantity || row.QUANTITY),
    holding_minutes: parseFloatSafe(row.holding_minutes || row.Holding_Minutes || row.HOLDING_MINUTES),
    strategy: strategy,
    source_file: filename
  };
}

/**
 * Load trades from GitHub
 */
async function loadTradesFromGitHub() {
  try {
    console.log('Fetching CSV files from GitHub...');

    const fetchPromises = CSV_FILES.map(file => fetchCSVFromGitHub(file));
    const results = await Promise.allSettled(fetchPromises);

    const allTrades = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const { filename, trades } = result.value;
        console.log(`✓ Loaded ${trades.length} trades from ${filename}`);

        const normalizedTrades = trades.map(row => normalizeTrade(row, filename));
        let validTrades = normalizedTrades.filter(trade =>
          trade.symbol && trade.position_type && trade.date
        );

        // Specific filtering for Feb 3rd Blaze files
        if (filename === 'BLAZE_20260203_153008.csv' || filename === 'BLAZE_20260203_153018.csv') {
          console.log(`Applying filters to ${filename}...`);
          validTrades = validTrades.filter(trade => {
            // Filter 1: holding_minutes <= 9
            if (trade.holding_minutes > 9) return false;

            // Filter 2: time < 14:00
            let hour = 0;
            const timeStr = trade.entry_time;

            if (timeStr.includes(' ')) {
              // Format: "2026-02-03 09:17:03.973408"
              const timePart = timeStr.split(' ')[1];
              hour = parseInt(timePart.split(':')[0]);
            } else if (/^\d{1,2}:\d{2}\.\d+$/.test(timeStr)) {
              // Blaze MM:SS.ms format - treat as morning trade (hour 9)
              hour = 9;
            } else if (timeStr.includes(':')) {
              const parts = timeStr.split(':');
              if (parts.length >= 3) {
                // HH:MM:SS
                hour = parseInt(parts[0]);
              } else if (parts.length === 2) {
                // HH:MM
                hour = parseInt(parts[0]);
              }
            } else if (timeStr.includes('T')) {
              // ISO Format
              hour = new Date(timeStr).getHours();
            }

            if (isNaN(hour)) hour = 9; // Fallback to morning
            return hour < 14;
          });
        }

        allTrades.push(...validTrades);
      } else {
        console.error(`✗ Failed to load ${CSV_FILES[index]}:`, result.reason.message);
      }
    });

    allTrades.sort((a, b) => {
      const dateA = new Date(a.date + ' ' + (a.entry_time || '00:00:00'));
      const dateB = new Date(b.date + ' ' + (b.entry_time || '00:00:00'));
      return dateB - dateA;
    });

    console.log(`Total trades loaded: ${allTrades.length}`);
    return allTrades;
  } catch (error) {
    console.error('Error loading trades from GitHub:', error);
    return [];
  }
}

/**
 * Calculate statistics for trades
 */
function calculateStats(trades) {
  if (trades.length === 0) {
    return {
      totalTrades: 0,
      totalPnL: 0,
      winners: 0,
      losers: 0,
      breakeven: 0,
      winRate: 0,
      avgProfit: 0,
      avgLoss: 0,
      avgPnLPerTrade: 0
    };
  }

  const totalPnL = trades.reduce((sum, t) => sum + t.net_pnl, 0);
  const winners = trades.filter(t => t.net_pnl > 0);
  const losers = trades.filter(t => t.net_pnl < 0);
  const breakeven = trades.filter(t => t.net_pnl === 0);
  const winRate = (winners.length / trades.length) * 100;
  const avgProfit = winners.length > 0 ? winners.reduce((sum, t) => sum + t.net_pnl, 0) / winners.length : 0;
  const avgLoss = losers.length > 0 ? losers.reduce((sum, t) => sum + t.net_pnl, 0) / losers.length : 0;
  const avgPnLPerTrade = totalPnL / trades.length;

  return {
    totalTrades: trades.length,
    totalPnL,
    winners: winners.length,
    losers: losers.length,
    breakeven: breakeven.length,
    winRate,
    avgProfit,
    avgLoss,
    avgPnLPerTrade
  };
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'Trading Dashboard Backend is running'
  });
});

// Get all trades
app.get('/api/trades', async (req, res) => {
  try {
    const trades = await loadTradesFromGitHub();

    const stats = {
      ALL: calculateStats(trades),
      iTrack: calculateStats(trades.filter(t => t.strategy === 'iTrack')),
      TrendFlo: calculateStats(trades.filter(t => t.strategy === 'TrendFlo')),
      GBlast: calculateStats(trades.filter(t => t.strategy === 'GBlast')),
      GBlastV2: calculateStats(trades.filter(t => t.strategy === 'GBlastV2')),
      GBlastV3: calculateStats(trades.filter(t => t.strategy === 'GBlastV3')),
      Blaze: calculateStats(trades.filter(t => t.strategy === 'Blaze')),
      BlazeV2: calculateStats(trades.filter(t => t.strategy === 'BlazeV2'))
    };

    res.json({
      success: true,
      trades,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching trades:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// For Vercel serverless function
module.exports = app;

// For local development
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║         Trading Dashboard Backend Server                 ║
╚═══════════════════════════════════════════════════════════╝
🚀 Server running on: http://localhost:${PORT}
📁 Fetching CSVs from GitHub
📊 API Endpoints:
   - GET /api/health
   - GET /api/trades
Ready to serve trade data!
    `);
  });
}