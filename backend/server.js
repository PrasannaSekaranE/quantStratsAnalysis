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

/**
 * Dynamically detect trade files in the 'trades' folder and its subdirectories
 * This handles both local development and Vercel (via GitHub API)
 */
async function getTradeFileList() {
  const tradesDir = path.join(__dirname, '..', 'trades');
  const subDirs = ['LIVE - V1', 'LIVE - V2'];

  // Helper for recursive local scan
  function scanDirLocally(dir, relativePath = '') {
    let results = [];
    if (!fs.existsSync(dir)) return results;

    const list = fs.readdirSync(dir);
    list.forEach(file => {
      const fullPath = path.join(dir, file);
      const relPath = relativePath ? `${relativePath}/${file}` : file;
      const stat = fs.statSync(fullPath);

      if (stat && stat.isDirectory()) {
        results = results.concat(scanDirLocally(fullPath, relPath));
      } else if (file.endsWith('.csv') || file.endsWith('.log')) {
        results.push(relPath);
      }
    });
    return results;
  }

  // Try local filesystem first
  if (fs.existsSync(tradesDir)) {
    try {
      const tradeFiles = scanDirLocally(tradesDir);
      console.log(`✓ Detected ${tradeFiles.length} trade files locally (including subdirs)`);
      return tradeFiles;
    } catch (error) {
      console.error('✗ Error reading local trades directory:', error);
    }
  }

  // Fallback to GitHub API (for Vercel production)
  try {
    async function fetchGitHubDir(folderPath) {
      // Properly encode the folder path (e.g. "LIVE - V1" -> "LIVE%20-%20V1")
      const encodedPath = folderPath.split('/').map(segment => encodeURIComponent(segment)).join('/');
      const url = `https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/contents/${encodedPath}?ref=${GITHUB_BRANCH}`;
      const options = { headers: { 'User-Agent': 'Node.js' } };

      const response = await new Promise((resolve, reject) => {
        https.get(url, options, (res) => {
          if (res.statusCode !== 200) {
            reject(new Error(`GitHub API returned ${res.statusCode} for ${folderPath}`));
            return;
          }
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
      });

      let files = [];
      for (const item of response) {
        if (item.type === 'file' && (item.name.endsWith('.csv') || item.name.endsWith('.log'))) {
          files.push(folderPath === 'trades' ? item.name : `${folderPath.replace('trades/', '')}/${item.name}`);
        } else if (item.type === 'dir' && subDirs.includes(item.name)) {
          const subFiles = await fetchGitHubDir(`${folderPath}/${item.name}`);
          files = files.concat(subFiles);
        }
      }
      return files;
    }

    const tradeFiles = await fetchGitHubDir('trades');
    console.log(`✓ Detected ${tradeFiles.length} trade files from GitHub API (including subdirs)`);
    return tradeFiles;
  } catch (error) {
    console.error('✗ Error fetching file list from GitHub:', error.message);
    return [];
  }
}

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

  // Handle log files differently
  if (filename.endsWith('.log')) {
    return parseBlazeLog(filename);
  }

  // Fall back to GitHub
  return new Promise((resolve, reject) => {
    // Properly encode the filename/path (e.g. "LIVE - V1/file.csv" -> "LIVE%20-%20V1/file.csv")
    const encodedFilename = filename.split('/').map(segment => encodeURIComponent(segment)).join('/');
    const url = `https://raw.githubusercontent.com/${GITHUB_USERNAME}/${GITHUB_REPO}/${GITHUB_BRANCH}/trades/${encodedFilename}`;

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
    } else if (type === 'v3') {
      strategy = 'BlazeV3';
    } else if (type === 'v4') {
      strategy = 'BlazeV4';
    } else {
      strategy = 'Blaze';
    }

    // Handle both nifty_signal and sensex_signal
    const niftySignal = (row.nifty_signal || row.Nifty_Signal || row.NIFTY_SIGNAL || '').toUpperCase();
    const sensexSignal = (row.sensex_signal || row.Sensex_Signal || row.SENSEX_SIGNAL || '').toUpperCase();

    if (niftySignal === 'BULLISH' || sensexSignal === 'BULLISH') {
      positionType = 'LONG';
    } else if (niftySignal === 'BEARISH' || sensexSignal === 'BEARISH') {
      positionType = 'SHORT';
    }
  } else if (isGBlast) {
    const tradeType = row.type || row.Type || row.TYPE || '';
    if (filename.includes('LIVE - V1')) {
      strategy = filename.includes('hybrid') ? 'V1_LIVE_HYBRID' : 'V1_LIVE_KITE';
    } else if (filename.includes('LIVE - V2')) {
      strategy = filename.includes('hybrid') ? 'V2_LIVE_HYBRID' : 'V2_LIVE_KITE';
    } else if (tradeType === 'version_3') {
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
 * Parse Blaze V4 trades from log files
 */
async function parseBlazeLog(filename) {
  let content = '';
  const localPath = path.join(__dirname, '..', 'trades', filename);

  // Try local file first (for development)
  if (fs.existsSync(localPath)) {
    try {
      content = fs.readFileSync(localPath, 'utf8');
      console.log(`✓ Loaded log ${filename} from local`);
    } catch (error) {
      console.error(`✗ Error reading local log ${filename}:`, error);
    }
  }

  // Fall back to GitHub if content is still empty
  if (!content) {
    try {
      const url = `https://raw.githubusercontent.com/${GITHUB_USERNAME}/${GITHUB_REPO}/${GITHUB_BRANCH}/trades/${filename}`;
      const fetchResponse = await new Promise((resolve, reject) => {
        https.get(url, (response) => {
          if (response.statusCode !== 200) {
            reject(new Error(`Failed to fetch log ${filename} from GitHub: ${response.statusCode}`));
            return;
          }
          let data = '';
          response.on('data', chunk => data += chunk);
          response.on('end', () => resolve(data));
        }).on('error', reject);
      });
      content = fetchResponse;
      console.log(`✓ Loaded log ${filename} from GitHub`);
    } catch (error) {
      console.error(`✗ Error fetching log ${filename} from GitHub:`, error.message);
      return { filename, trades: [] };
    }
  }

  if (!content) {
    return { filename, trades: [] };
  }

  try {
    const lines = content.split('\n');
    const trades = [];
    let currentTrade = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Detect Trade Entry
      if (line.includes('[TRADE ENTRY] BLAZE TRADE ENTERED')) {
        currentTrade = {
          strategy: 'BlazeV4',
          source_file: filename,
          status: 'CLOSED' // Assume closed if we find an exit later
        };
        // The timestamp is at the beginning of the line
        const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
        if (timestampMatch) {
          currentTrade.entry_time = timestampMatch[1];
          currentTrade.date = timestampMatch[1].split(' ')[0];
        }
        continue;
      }

      if (currentTrade) {
        // Parse Entry Details
        if (line.includes('SENSEX Signal:')) {
          const signalMatch = line.match(/SENSEX Signal: (\w+)/);
          if (signalMatch) {
            currentTrade.position_type = signalMatch[1] === 'BULLISH' ? 'LONG' : 'SHORT';
          }
        } else if (line.includes('SENSEX Entry:')) {
          const entryMatch = line.match(/SENSEX Entry: (.*?) @ Rs\.(.*)/);
          if (entryMatch) {
            currentTrade.symbol = `SENSEX ${entryMatch[1]}`;
            currentTrade.entry_price = parseFloat(entryMatch[2].replace(/,/g, ''));
          }
        } else if (line.includes('Quantity:')) {
          const qtyMatch = line.match(/Quantity: (\d+)/);
          if (qtyMatch) {
            currentTrade.quantity = parseInt(qtyMatch[1]);
          }
        }

        // Detect Trade Exit (Search ahead for performance or just process sequentially)
        // For simplicity and since logs are small enough, process sequentially
        if (line.includes('[TRADE EXIT] TRADE CLOSED')) {
          const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
          if (timestampMatch) {
            currentTrade.exit_time = timestampMatch[1];
          }
          const reasonMatch = line.match(/TRADE CLOSED - (\w+)/);
          if (reasonMatch) {
            currentTrade.exit_reason = reasonMatch[1];
          }
        } else if (line.includes('Entry: Rs.') && line.includes('-> Exit: Rs.')) {
          const priceMatch = line.match(/Entry: Rs\.(.*?) -> Exit: Rs\.(.*)/);
          if (priceMatch) {
            currentTrade.exit_price = parseFloat(priceMatch[2].replace(/,/g, ''));
          }
        } else if (line.includes('P&L: Rs.')) {
          const pnlMatch = line.match(/P&L: Rs\.(.*?) \((.*?)\%\)/);
          if (pnlMatch) {
            currentTrade.net_pnl = parseFloat(pnlMatch[1].replace(/,/g, ''));
            currentTrade.profit_pct = parseFloat(pnlMatch[2]);
          }
        } else if (line.includes('Holding:')) {
          const holdingMatch = line.match(/Holding: (\d+)/);
          if (holdingMatch) {
            currentTrade.holding_minutes = parseInt(holdingMatch[1]);
          }

          // Exit details are usually the last part of a trade block
          if (currentTrade.symbol && currentTrade.entry_price && currentTrade.exit_price !== undefined) {
            trades.push(currentTrade);
            currentTrade = null;
          }
        }
      }
    }

    console.log(`✓ Parsed ${trades.length} BlazeV4 trades from ${filename}`);
    return { filename, trades };
  } catch (error) {
    console.error(`✗ Error parsing content from ${filename}:`, error);
    return { filename, trades: [] };
  }
}

/**
 * Load trades from GitHub
 */
async function loadTradesFromGitHub() {
  try {
    const csvFiles = await getTradeFileList();
    console.log(`Fetching ${csvFiles.length} files...`);

    const fetchPromises = csvFiles.map(file => fetchCSVFromGitHub(file));
    const results = await Promise.allSettled(fetchPromises);

    const allTrades = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const { filename, trades } = result.value;
        console.log(`✓ Loaded ${trades.length} trades from ${filename}`);

        let validTrades = [];
        if (filename.endsWith('.log')) {
          // Log trades are already normalized by parseBlazeLog
          validTrades = trades;
        } else {
          const normalizedTrades = trades.map(row => normalizeTrade(row, filename));
          validTrades = normalizedTrades.filter(trade =>
            trade.symbol && trade.position_type && trade.date
          );
        }

        // Apply 2:00 PM filter to ALL Blaze trades (v1, v2, v3, v4)
        const isBlaze = filename.toLowerCase().startsWith('blaze_');
        if (isBlaze) {
          const beforeFilterCount = validTrades.length;
          const beforeFilterPnL = validTrades.reduce((sum, t) => sum + t.net_pnl, 0);

          validTrades = validTrades.filter(trade => {
            // EXEMPT BlazeV4 (log trades) from the 2:00 PM filter
            if (trade.strategy === 'BlazeV4') return true;

            // Filter: time < 14:00 (before 2:00 PM) for other versions (V1-V3)
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

          const afterFilterCount = validTrades.length;
          const afterFilterPnL = validTrades.reduce((sum, t) => sum + t.net_pnl, 0);
          const filteredOutCount = beforeFilterCount - afterFilterCount;

          console.log(`📊 Blaze Filter Applied to ${filename}:`);
          console.log(`   ✓ Before Filter: ${beforeFilterCount} trades, PnL: ₹${beforeFilterPnL.toFixed(2)}`);
          console.log(`   ✓ After Filter (< 2:00 PM): ${afterFilterCount} trades, PnL: ₹${afterFilterPnL.toFixed(2)}`);
          console.log(`   ✗ Filtered Out: ${filteredOutCount} trades`);
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
      BlazeV2: calculateStats(trades.filter(t => t.strategy === 'BlazeV2')),
      BlazeV3: calculateStats(trades.filter(t => t.strategy === 'BlazeV3')),
      BlazeV4: calculateStats(trades.filter(t => t.strategy === 'BlazeV4')),
      V1_LIVE_HYBRID: calculateStats(trades.filter(t => t.strategy === 'V1_LIVE_HYBRID')),
      V1_LIVE_KITE: calculateStats(trades.filter(t => t.strategy === 'V1_LIVE_KITE')),
      V2_LIVE_HYBRID: calculateStats(trades.filter(t => t.strategy === 'V2_LIVE_HYBRID')),
      V2_LIVE_KITE: calculateStats(trades.filter(t => t.strategy === 'V2_LIVE_KITE')),
      GBLAST_LIVE: calculateStats(trades.filter(t =>
        ['V1_LIVE_HYBRID', 'V1_LIVE_KITE', 'V2_LIVE_HYBRID', 'V2_LIVE_KITE'].includes(t.strategy)
      ))
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