const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const path = require('path');

const app = express();
const PORT = 3001;

// Middleware
// Configure CORS for production
const corsOptions = {
  origin: [
    'http://localhost:3000',  // Local development
    'https://trading-dashboard-frontend-ch96yb5id-prasannasekaranes-projects.vercel.app',  // Replace with YOUR frontend URL
    /\.vercel\.app$/  // Allow all Vercel preview deployments
  ],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// Configuration - Update this path to your CSV directory
// const CSV_DIRECTORY = 'D:/QUANT_DASHBAORD/Trade_Logs';

// Production-ready CSV directory handling
const CSV_DIRECTORY = process.env.CSV_DIR || 
                      process.env.VERCEL 
                        ? '/tmp/trades'  // Vercel temporary storage
                        : path.join(__dirname, '../trades'); // Local development

// Create directory if it doesn't exist (local dev only)
if (!process.env.VERCEL && !fs.existsSync(CSV_DIRECTORY)) {
  fs.mkdirSync(CSV_DIRECTORY, { recursive: true });
}

/**
 * Parse CSV file and return trade data
 */
async function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const trades = [];
    
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        trades.push(row);
      })
      .on('end', () => {
        resolve(trades);
      })
      .on('error', (error) => {
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
    // Handle different time formats
    if (entryTime.includes('T')) {
      date = entryTime.split('T')[0];
    } else if (entryTime.includes(' ')) {
      // Handle "2025-12-31 10:28:38" format
      date = entryTime.split(' ')[0];
    } else if (entryTime.includes(':') && entryTime.length <= 5) {
      // Handle "09:52" format - use current date or extract from filename
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

  // Get position type from CSV
  let positionType = (row.position_type || row.Position_Type || row.POSITION_TYPE || '').toUpperCase();
  
  // Determine strategy based on filename and position type
  let strategy = 'Unknown';
  const filenameLower = filename.toLowerCase();
  
  // Check for G-Blast files (live_trades pattern or nifty in filename)
  const isGBlast = filenameLower.includes('live_trades') || 
                   filenameLower.includes('gblast') || 
                   filenameLower.includes('g-blast') ||
                   filenameLower.includes('g_blast');
  
  if (isGBlast) {
    strategy = 'GBlast';
    // For G-Blast: BUY_CALL = LONG, BUY_PUT = SHORT
    const direction = (row.direction || row.Direction || row.DIRECTION || '').toUpperCase();
    if (direction === 'BUY_CALL') {
      positionType = 'LONG';
    } else if (direction === 'BUY_PUT') {
      positionType = 'SHORT';
    } else {
      // Fallback: check signal_type
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

  // Parse numeric values helper
  const parseFloatSafe = (val) => {
    if (!val || val === '') return 0;
    return Number(val);
  };

  // Extract symbol - for G-Blast, use NIFTY with strike info
  let symbol = row.symbol || row.Symbol || row.SYMBOL || '';
  if (isGBlast && !symbol) {
    const strike = row.entry_strike || row.Entry_Strike || row.ENTRY_STRIKE || '';
    const optionType = row.option_type || row.Option_Type || row.OPTION_TYPE || '';
    symbol = strike && optionType ? `NIFTY ${strike} ${optionType}` : 'NIFTY';
  }

  // Extract P&L - G-Blast uses total_pnl
  const pnl = parseFloatSafe(row.total_pnl || row.net_pnl || row.pnl || row.Net_PnL || row.PNL || row.Total_PnL);
  
  // Extract profit percentage - G-Blast uses pnl_pct
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
    source_file: path.basename(filename)
  };
}

/**
 * Read all CSV files from directory and return normalized trade data
 */
async function loadTradesFromDirectory() {
  try {
    const files = fs.readdirSync(CSV_DIRECTORY)
      .filter(file => file.endsWith('.csv'));

    console.log(`Found ${files.length} CSV files in ${CSV_DIRECTORY}`);

    const allTrades = [];

    for (const file of files) {
      const filePath = path.join(CSV_DIRECTORY, file);
      console.log(`Processing: ${file}`);
      
      try {
        const rows = await parseCSV(filePath);
        const normalizedTrades = rows.map(row => normalizeTrade(row, file));
        
        // Filter out invalid trades
        const validTrades = normalizedTrades.filter(trade => 
          trade.symbol && trade.position_type && trade.date
        );
        
        console.log(`  - Loaded ${validTrades.length} valid trades`);
        allTrades.push(...validTrades);
      } catch (error) {
        console.error(`Error processing ${file}:`, error.message);
      }
    }

    // Sort by date (newest first)
    allTrades.sort((a, b) => {
      const dateA = new Date(a.date + ' ' + (a.entry_time || '00:00:00'));
      const dateB = new Date(b.date + ' ' + (b.entry_time || '00:00:00'));
      return dateB - dateA;
    });

    console.log(`Total trades loaded: ${allTrades.length}`);
    return allTrades;
  } catch (error) {
    console.error('Error loading trades:', error);
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
      avgPnLPerTrade: 0,
      maxDrawdown: 0,
      drawdownPeriods: 0,
      timeUnderwater: 0
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

  // Calculate Drawdown Metrics
  const drawdownMetrics = calculateDrawdownMetrics(trades);

  return {
    totalTrades: trades.length,
    totalPnL,
    winners: winners.length,
    losers: losers.length,
    breakeven: breakeven.length,
    winRate,
    avgProfit,
    avgLoss,
    avgPnLPerTrade,
    ...drawdownMetrics
  };
}

/**
 * Calculate drawdown metrics from trades (same logic as SSE_Metrics.py)
 */
function calculateDrawdownMetrics(trades) {
  if (trades.length === 0) {
    return {
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      drawdownPeriods: 0,
      avgDrawdownDuration: 0,
      maxDrawdownDuration: 0,
      timeUnderwater: 0,
      currentDrawdown: 0,
      drawdownHistory: []
    };
  }

  // Sort trades by date and time
  const sortedTrades = [...trades].sort((a, b) => {
    const dateA = new Date(a.date + ' ' + (a.entry_time || '00:00:00'));
    const dateB = new Date(b.date + ' ' + (b.entry_time || '00:00:00'));
    return dateA - dateB;
  });

  // Calculate cumulative equity curve
  let cumulativePnL = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let maxDrawdownPercent = 0;
  let currentDrawdown = 0;
  let drawdownPeriods = [];
  let inDrawdown = false;
  let drawdownStart = null;
  let drawdownDays = 0;
  let totalDaysInDrawdown = 0;

  const equityCurve = sortedTrades.map((trade, index) => {
    cumulativePnL += trade.net_pnl;
    
    // Update peak
    if (cumulativePnL > peak) {
      peak = cumulativePnL;
      
      // If we were in drawdown, end it
      if (inDrawdown) {
        drawdownPeriods.push({
          start: drawdownStart,
          end: trade.date,
          duration: drawdownDays,
          maxDD: maxDrawdown
        });
        inDrawdown = false;
        drawdownDays = 0;
      }
    }
    
    // Calculate current drawdown
    const drawdown = cumulativePnL - peak;
    const drawdownPercent = peak !== 0 ? (drawdown / peak) * 100 : 0;
    
    // Track if we're in drawdown
    if (drawdown < 0) {
      if (!inDrawdown) {
        inDrawdown = true;
        drawdownStart = trade.date;
        drawdownDays = 1;
      } else {
        drawdownDays++;
      }
      totalDaysInDrawdown++;
    }
    
    // Update max drawdown
    if (drawdown < maxDrawdown) {
      maxDrawdown = drawdown;
    }
    if (drawdownPercent < maxDrawdownPercent) {
      maxDrawdownPercent = drawdownPercent;
    }
    
    currentDrawdown = drawdown;
    
    return {
      date: trade.date,
      equity: cumulativePnL,
      peak: peak,
      drawdown: drawdown,
      drawdownPercent: drawdownPercent
    };
  });

  // If still in drawdown at the end
  if (inDrawdown && sortedTrades.length > 0) {
    drawdownPeriods.push({
      start: drawdownStart,
      end: sortedTrades[sortedTrades.length - 1].date,
      duration: drawdownDays,
      maxDD: maxDrawdown
    });
  }

  // Calculate average drawdown duration
  const avgDrawdownDuration = drawdownPeriods.length > 0
    ? drawdownPeriods.reduce((sum, p) => sum + p.duration, 0) / drawdownPeriods.length
    : 0;

  // Calculate max drawdown duration
  const maxDrawdownDuration = drawdownPeriods.length > 0
    ? Math.max(...drawdownPeriods.map(p => p.duration))
    : 0;

  // Calculate time underwater percentage
  const timeUnderwater = sortedTrades.length > 0
    ? (totalDaysInDrawdown / sortedTrades.length) * 100
    : 0;

  return {
    maxDrawdown: Math.abs(maxDrawdown),
    maxDrawdownPercent: Math.abs(maxDrawdownPercent),
    drawdownPeriods: drawdownPeriods.length,
    avgDrawdownDuration: avgDrawdownDuration,
    maxDrawdownDuration: maxDrawdownDuration,
    timeUnderwater: timeUnderwater,
    currentDrawdown: currentDrawdown,
    drawdownHistory: equityCurve
  };
}

// API Routes

/**
 * GET /api/trades - Get all trades
 */
app.get('/api/trades', async (req, res) => {
  try {
    const trades = await loadTradesFromDirectory();
    
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

/**
 * GET /api/trades/by-strategy/:strategy - Get trades by strategy
 */
app.get('/api/trades/by-strategy/:strategy', async (req, res) => {
  try {
    const { strategy } = req.params;
    const allTrades = await loadTradesFromDirectory();
    
    const filteredTrades = strategy === 'ALL' 
      ? allTrades 
      : allTrades.filter(t => t.strategy === strategy);

    res.json({
      success: true,
      strategy,
      trades: filteredTrades,
      stats: calculateStats(filteredTrades),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching trades by strategy:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/trades/by-date/:date - Get trades by date
 */
app.get('/api/trades/by-date/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const allTrades = await loadTradesFromDirectory();
    
    const filteredTrades = allTrades.filter(t => t.date === date);

    res.json({
      success: true,
      date,
      trades: filteredTrades,
      stats: calculateStats(filteredTrades),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching trades by date:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/drawdown - Get detailed drawdown analysis
 */
app.get('/api/drawdown', async (req, res) => {
  try {
    const allTrades = await loadTradesFromDirectory();
    const stats = {
      ALL: calculateStats(allTrades),
      iTrack: calculateStats(allTrades.filter(t => t.strategy === 'iTrack')),
      TrendFlo: calculateStats(allTrades.filter(t => t.strategy === 'TrendFlo')),
      GBlast: calculateStats(allTrades.filter(t => t.strategy === 'GBlast'))
    };

    res.json({
      success: true,
      drawdownMetrics: {
        ALL: {
          maxDrawdown: stats.ALL.maxDrawdown,
          maxDrawdownPercent: stats.ALL.maxDrawdownPercent,
          drawdownPeriods: stats.ALL.drawdownPeriods,
          avgDrawdownDuration: stats.ALL.avgDrawdownDuration,
          maxDrawdownDuration: stats.ALL.maxDrawdownDuration,
          timeUnderwater: stats.ALL.timeUnderwater,
          currentDrawdown: stats.ALL.currentDrawdown,
          drawdownHistory: stats.ALL.drawdownHistory
        },
        iTrack: {
          maxDrawdown: stats.iTrack.maxDrawdown,
          maxDrawdownPercent: stats.iTrack.maxDrawdownPercent,
          drawdownPeriods: stats.iTrack.drawdownPeriods,
          timeUnderwater: stats.iTrack.timeUnderwater
        },
        TrendFlo: {
          maxDrawdown: stats.TrendFlo.maxDrawdown,
          maxDrawdownPercent: stats.TrendFlo.maxDrawdownPercent,
          drawdownPeriods: stats.TrendFlo.drawdownPeriods,
          timeUnderwater: stats.TrendFlo.timeUnderwater
        },
        GBlast: {
          maxDrawdown: stats.GBlast.maxDrawdown,
          maxDrawdownPercent: stats.GBlast.maxDrawdownPercent,
          drawdownPeriods: stats.GBlast.drawdownPeriods,
          timeUnderwater: stats.GBlast.timeUnderwater
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error calculating drawdown:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/health - Health check
 */
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Trading Dashboard API is running',
    csvDirectory: CSV_DIRECTORY,
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║         Trading Dashboard Backend Server                 ║
╚═══════════════════════════════════════════════════════════╝

🚀 Server running on: http://localhost:${PORT}
📁 CSV Directory: ${CSV_DIRECTORY}
📊 API Endpoints:
   - GET /api/health
   - GET /api/trades
   - GET /api/trades/by-strategy/:strategy
   - GET /api/trades/by-date/:date
   - GET /api/drawdown

Ready to serve trade data!
  `);
});

module.exports = app;