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
  'live_trades_20251231_152554.csv',
  'live_trades_20260102_115833.csv',
  'trades_20251223.csv',
  'trades_20251224.csv',
  'trades_20251226.csv',
  'trades_20251229.csv',
  'trades_20251230.csv',
  'trades_20251231.csv'
];


/**
 * Fetch CSV content from GitHub raw URL
 */
async function fetchCSVFromGitHub(filename) {
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
    } else if (entryTime.includes(':') && entryTime.length <= 5) {
      const dateMatch = filename.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (dateMatch) {
        date = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
      } else {
        const dateMatch2 = filename.match(/(\d{8})/);
        if (dateMatch2) {
          const dateStr = dateMatch2[1];
          date = `${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`;
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
  
  const isGBlast = filenameLower.includes('live_trades') || 
                   filenameLower.includes('gblast') || 
                   filenameLower.includes('g-blast') ||
                   filenameLower.includes('g_blast');
  
  if (isGBlast) {
    strategy = 'GBlast';
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
        const validTrades = normalizedTrades.filter(trade => 
          trade.symbol && trade.position_type && trade.date
        );
        
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
      GBlast: calculateStats(trades.filter(t => t.strategy === 'GBlast'))
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