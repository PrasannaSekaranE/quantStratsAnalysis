const express = require('express');
const cors = require('cors');
const https = require('https');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');

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
  const subDirs = [
    'LIVE - V1', 'LIVE - V2', 'G - Blast - Paper (Upgrade 2.0)', 'G - BLAST - Ratchet', 
    'G - BLAST - LIVE',
    'Blaze v1 - v1', 'Blaze v2 -v2', 'Blaze v3 - v3', 'Blaze v4 - v4',
    'Blaze v4.2 - v4.2', 'Blaze 5 - v5', 'B - 20 - Nifty BEES'
  ];

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

  // 1. Detect Strategy & PositionType Indicators
  let strategy = 'Unknown';
  const baseName = path.basename(filename).toLowerCase();
  const filenameLower = filename.toLowerCase();
  const typeCol = (row.type || row.Type || row.TYPE || '').toLowerCase().trim();

  const isBlaze = baseName.startsWith('blaze_') || filenameLower.includes('blaze');
  const isGBlast = filenameLower.includes('live - v1') || 
                   filenameLower.includes('live - v2') || 
                   filenameLower.includes('g - blast') ||
                   baseName.startsWith('v1_') ||
                   baseName.startsWith('v2_') ||
                   baseName.startsWith('v3_');

  // Folder-based Detection (highest priority)
  if (filenameLower.includes('blaze v1 - v1')) {
    strategy = 'Blaze';
  } else if (filenameLower.includes('blaze v2 -v2')) {
    strategy = 'BlazeV2';
  } else if (filenameLower.includes('blaze v3 - v3')) {
    strategy = 'BlazeV3';
  } else if (filenameLower.includes('blaze v4.2 - v4.2')) {
    strategy = 'BlazeV4_2';
  } else if (filenameLower.includes('blaze v4 - v4')) {
    strategy = 'BlazeV4';
  } else if (filenameLower.includes('blaze 5 - v5')) {
    strategy = 'BlazeV5';
  } else if (filenameLower.includes('b - 20 - nifty bees')) {
    strategy = 'B20';
  } else if (filenameLower.includes('live - v1')) {
    strategy = filenameLower.includes('hybrid') ? 'V1_LIVE_HYBRID' : 'V1_LIVE_KITE';
  } else if (filenameLower.includes('live - v2')) {
    strategy = filenameLower.includes('hybrid') ? 'V2_LIVE_HYBRID' : 'V2_LIVE_KITE';
  } else if (filenameLower.includes('g - blast - paper (upgrade 2.0)')) {
    strategy = 'GBlastV2_Upgrade';
  } else if (filenameLower.includes('g - blast - ratchet')) {
    strategy = 'GBlastRatchet';
  }

  // Fallback to manual 'type' column or filename patterns
  if (strategy === 'Unknown') {
    if (typeCol === 'v1' || baseName.includes('_v1')) strategy = 'Blaze';
    else if (typeCol === 'v2' || baseName.includes('_v2')) strategy = 'BlazeV2';
    else if (typeCol === 'v3' || baseName.includes('_v3')) strategy = 'BlazeV3';
    else if (typeCol === 'v4' || baseName.includes('_v4')) strategy = 'BlazeV4';
    else if (typeCol === 'v4.2' || typeCol === 'v42' || baseName.includes('_v4.2') || baseName.includes('_v5.csv')) strategy = 'BlazeV4_2';
    else if (typeCol === 'v5' || typeCol === 'v6' || baseName.includes('_v5') || baseName.includes('_v6')) strategy = 'BlazeV5';
    else if (baseName.includes('niftybees') || baseName.includes('b-20') || baseName.includes('b20')) strategy = 'B20';
    else if (baseName.startsWith('v1_')) strategy = 'Blaze';
    else if (baseName.startsWith('v2_')) strategy = 'BlazeV2';
    else if (baseName.startsWith('v3_')) strategy = 'BlazeV3';
  }

  // 2. Extract Position Type
  let positionType = (row.position_type || row.Position_Type || row.POSITION_TYPE || '').toUpperCase();
  const niftySignal = (row.nifty_signal || row.Nifty_Signal || row.NIFTY_SIGNAL || '').toUpperCase();
  const sensexSignal = (row.sensex_signal || row.Sensex_Signal || row.SENSEX_SIGNAL || '').toUpperCase();
  const b20Signal = (row.signal_type || row.Signal_Type || row.SIGNAL_TYPE || '').toUpperCase();

  if (!positionType) {
    if (niftySignal === 'BULLISH' || sensexSignal === 'BULLISH' || b20Signal === 'BULLISH' || row.direction === 'BUY_CALL') {
      positionType = 'LONG';
    } else if (niftySignal === 'BEARISH' || sensexSignal === 'BEARISH' || b20Signal === 'BEARISH' || row.direction === 'BUY_PUT') {
      positionType = 'SHORT';
    } else if (row.direction || row.Direction || row.DIRECTION) {
      positionType = (row.direction || row.Direction || row.DIRECTION).toUpperCase();
    }
  }

  // Final catch-all for TrendFlo/iTrack
  if (strategy === 'Unknown') {
    if (positionType === 'SHORT') strategy = 'iTrack';
    else if (positionType === 'LONG') strategy = 'TrendFlo';
  }

  const parseFloatSafe = (val) => {
    if (!val || val === '') return 0;
    const cleaned = String(val).replace(/[₹,%]/g, '');
    return Number(cleaned) || 0;
  };

  // 3. Extract Symbol
  let symbol = row.symbol || row.Symbol || row.SYMBOL || row.kite_symbol || row.tradingsymbol || row.instrument || row.instrument_key || '';
  if ((isGBlast || isBlaze) && !symbol) {
    const strike = row.entry_strike || row.Entry_Strike || row.ENTRY_STRIKE || '';
    const optionType = row.option_type || row.Option_Type || row.OPTION_TYPE || '';
    const base = isGBlast ? 'NIFTY' : 'SENSEX';
    symbol = strike && optionType ? `${base} ${strike} ${optionType}` : base;
  }

  const pnl = parseFloatSafe(row.total_pnl || row.net_pnl || row.pnl || row.Net_PnL || row.PNL || row.Total_PnL);
  const profitPct = parseFloatSafe(row.pnl_pct || row.profit_pct || row.return_pct || row.Profit_Pct || row.PROFIT_PCT);

  return {
    symbol: symbol,
    entry_time: entryTime || '',
    exit_time: exitTime || '',
    date: date,
    entry_price: parseFloatSafe(row.entry_price || row.Entry_Price || row.ENTRY_PRICE),
    exit_price: parseFloatSafe(row.exit_price || row.Exit_Price || row.EXIT_PRICE || row.niftybees_exit_price),
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
        let logStrategy = 'Blaze';
        if (filename.toUpperCase().includes('V2')) logStrategy = 'BlazeV2';
        else if (filename.toUpperCase().includes('V3')) logStrategy = 'BlazeV3';
        else if (filename.toUpperCase().includes('V4')) logStrategy = 'BlazeV4';
        else if (filename.toUpperCase().includes('V5')) logStrategy = 'BlazeV5';

        currentTrade = {
          strategy: logStrategy,
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
        const isBlaze = path.basename(filename).toLowerCase().startsWith('blaze_');
        if (isBlaze) {
          const beforeFilterCount = validTrades.length;
          const beforeFilterPnL = validTrades.reduce((sum, t) => sum + t.net_pnl, 0);

          validTrades = validTrades.filter(trade => {
            // EXEMPT all Blaze versions and B-20 from the 2:00 PM filter
            const blazeStrategies = ['Blaze', 'BlazeV2', 'BlazeV3', 'BlazeV4', 'BlazeV4_2', 'BlazeV5'];
            if (blazeStrategies.includes(trade.strategy) || trade.strategy === 'B20') return true;

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
      GBlastV2_Upgrade: calculateStats(trades.filter(t => t.strategy === 'GBlastV2_Upgrade')),
      GBlastV3: calculateStats(trades.filter(t => t.strategy === 'GBlastV3')),
      Blaze: calculateStats(trades.filter(t => t.strategy === 'Blaze')),
      BlazeV2: calculateStats(trades.filter(t => t.strategy === 'BlazeV2')),
      BlazeV3: calculateStats(trades.filter(t => t.strategy === 'BlazeV3')),
      BlazeV4: calculateStats(trades.filter(t => t.strategy === 'BlazeV4')),
      BlazeV4_2: calculateStats(trades.filter(t => t.strategy === 'BlazeV4_2')),
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

// ─── G-BLAST LIVE: /api/live-trades ────────────────────────────────────────
const LIVE_FOLDER = path.join(__dirname, '..', 'trades', 'G - BLAST - LIVE');
const INITIAL_CAPITAL = 150000; // Total ₹1.5 Lakhs for all versions
const V2_UPGRADE_CAPITAL = 50000; // ₹50K for V2 Upgrade
const STARTING_CAPITAL_V1 = 50000; // ₹50K per sub-version of V1

function parseCSVFile(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    if (!fs.existsSync(filePath)) return resolve([]);
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', row => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

async function loadLiveVersion(githubSubPath, filePattern, normaliser, startingCapital) {
  const localFolder = path.join(__dirname, '..', 'trades', githubSubPath);
  let files = [];

  if (fs.existsSync(localFolder)) {
    // Local development: scan folder directly
    files = fs.readdirSync(localFolder)
      .filter(f => f.match(filePattern) && f.endsWith('.csv'))
      .sort()
      .map(f => `${githubSubPath}/${f}`);
  } else {
    // Production (Vercel): list files via GitHub API
    try {
      const encodedPath = githubSubPath.split('/').map(s => encodeURIComponent(s)).join('/');
      const apiUrl = `https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/contents/trades/${encodedPath}?ref=${GITHUB_BRANCH}`;
      const listing = await new Promise((resolve, reject) => {
        https.get(apiUrl, { headers: { 'User-Agent': 'Node.js' } }, res => {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => {
            try { resolve(JSON.parse(data)); }
            catch (e) { reject(e); }
          });
        }).on('error', reject);
      });
      if (Array.isArray(listing)) {
        files = listing
          .filter(item => item.type === 'file' && item.name.match(filePattern) && item.name.endsWith('.csv'))
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(item => `${githubSubPath}/${item.name}`);
      }
    } catch (e) {
      console.error(`[live-trades] Failed to list GitHub dir ${githubSubPath}:`, e.message);
    }
  }

  let allRows = [];
  for (const relPath of files) {
    try {
      const result = await fetchCSVFromGitHub(relPath);
      allRows = allRows.concat(result.trades.map(r => normaliser(r)));
    } catch (e) {
      console.error(`[live-trades] Failed to load ${relPath}:`, e.message);
    }
  }

  // Sort by entry_time ascending, then apply compounding
  allRows.sort((a, b) => new Date(a.entry_time) - new Date(b.entry_time));

  let capital = startingCapital;
  return allRows.map((trade, idx) => {
    const entry = { ...trade, trade_no: idx + 1, starting_capital: capital };
    capital = Math.round((capital + (trade.total_pnl || 0)) * 100) / 100;
    entry.ending_capital = capital;
    entry.return_pct = Math.round(((trade.total_pnl || 0) / entry.starting_capital) * 10000) / 100;
    return entry;
  });
}

function normaliseV1(row) {
  const signal = (row.signal_type || '').toUpperCase();
  const pnl = parseFloat(row.total_pnl) || 0;
  return {
    entry_time: row.entry_time || '',
    exit_time: row.exit_time || '',
    symbol: row.kite_symbol || '',
    direction: signal === 'BEARISH' ? 'PUT' : 'CALL',
    option_type: row.option_type || '',
    entry_price: parseFloat(row.entry_price) || 0,
    exit_price: parseFloat(row.exit_price) || 0,
    lots: parseInt(row.lots) || 0,
    quantity: parseInt(row.quantity) || 0,
    total_pnl: pnl,
    pnl_pct: parseFloat(row.pnl_pct) || 0,
    exit_reason: row.exit_reason || '',
    status: row.status || '',
    date: (row.entry_time || '').split(' ')[0],
    version: 'V1',
  };
}

function normaliseV2(row) {
  const signal = (row.signal_type || '').toUpperCase();
  const pnl = parseFloat(row.total_pnl) || 0;
  return {
    entry_time: row.entry_time || '',
    exit_time: row.exit_time || '',
    symbol: row.tradingsymbol || '',
    direction: signal === 'BEARISH' ? 'PUT' : 'CALL',
    option_type: row.option_type || row.option_type || '',
    entry_price: parseFloat(row.entry_price) || 0,
    exit_price: parseFloat(row.exit_price) || 0,
    lots: parseInt(row.lots) || 0,
    quantity: parseInt(row.quantity) || 0,
    total_pnl: pnl,
    pnl_pct: parseFloat(row.pnl_pct) || 0,
    exit_reason: row.exit_reason || '',
    status: row.status || '',
    date: (row.entry_time || '').split(' ')[0],
    version: 'V2',
  };
}

function calcLiveStats(trades, startingCapital) {
  if (!trades.length) return {
    totalTrades: 0,
    totalPnL: 0,
    winRate: 0,
    currentCapital: startingCapital,
    overallReturn: 0
  };
  const winners = trades.filter(t => t.total_pnl > 0);
  const totalPnL = trades.reduce((s, t) => s + t.total_pnl, 0);
  return {
    totalTrades: trades.length,
    totalPnL: Math.round(totalPnL * 100) / 100,
    winners: winners.length,
    losers: trades.filter(t => t.total_pnl < 0).length,
    winRate: Math.round((winners.length / trades.length) * 10000) / 100,
    currentCapital: trades[trades.length - 1]?.ending_capital ?? (startingCapital + totalPnL),
    overallReturn: Math.round(((totalPnL / startingCapital) * 10000)) / 100,
  };
}

app.get('/api/live-trades', async (req, res) => {
  try {
    const [v1Trades, v2Trades, upgradeTrades] = await Promise.all([
      loadLiveVersion('G - BLAST - LIVE/V1', /^hybrid_trades_live_/, normaliseV1, STARTING_CAPITAL_V1),
      loadLiveVersion('G - BLAST - LIVE/V2', /^kite_live_trades_/, normaliseV2, STARTING_CAPITAL_V1),
      loadLiveVersion('G - BLAST - LIVE/V2 Upgrade', /^hybrid_trades_live_/, normaliseV1, V2_UPGRADE_CAPITAL),
    ]);

    res.json({
      success: true,
      v1: {
        trades: v1Trades,
        stats: calcLiveStats(v1Trades, STARTING_CAPITAL_V1),
        label: "V1 (40% SL)",
        startingCapital: STARTING_CAPITAL_V1
      },
      v1_1: {
        trades: v2Trades,
        stats: calcLiveStats(v2Trades, STARTING_CAPITAL_V1),
        label: "V1.1 (25% SL)",
        startingCapital: STARTING_CAPITAL_V1,
        isDiscontinued: true
      },
      v2_upgrade: {
        trades: upgradeTrades,
        stats: calcLiveStats(upgradeTrades, V2_UPGRADE_CAPITAL),
        label: "V2 Upgrade",
        startingCapital: V2_UPGRADE_CAPITAL
      },
      summary: {
        startingCapital: INITIAL_CAPITAL,
        v2UpgradeCapital: V2_UPGRADE_CAPITAL
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching live trades:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/gblast-reconciliation
 * Returns consolidated reconciliation data for G-Blast Live
 */
app.get('/api/gblast-reconciliation', async (req, res) => {
  try {
    let reconData;
    const fs = require('fs');
    const path = require('path');
    const localPath = path.join(__dirname, '..', 'trades', 'G - BLAST - LIVE', 'gblast_live_reconciliation.json');
    
    // Try local filesystem first
    if (fs.existsSync(localPath)) {
      reconData = JSON.parse(fs.readFileSync(localPath, 'utf8'));
    } else {
      // Fallback to GitHub for Vercel production
      const url = `https://raw.githubusercontent.com/${GITHUB_USERNAME}/${GITHUB_REPO}/${GITHUB_BRANCH}/trades/G%20-%20BLAST%20-%20LIVE/gblast_live_reconciliation.json`;
      const https = require('https');
      const response = await new Promise((resolve, reject) => {
        https.get(url, (resp) => {
          let body = '';
          resp.on('data', chunk => body += chunk);
          resp.on('end', () => {
             if(resp.statusCode === 200) resolve(body);
             else reject(new Error(`Failed to fetch from Github with status: ${resp.statusCode}`));
          });
        }).on('error', reject);
      });
      reconData = JSON.parse(response);
    }
    
    res.json({ success: true, data: reconData });
  } catch (error) {
    console.error('Error fetching reconciliation data:', error);
    res.status(500).json({ success: false, error: 'Failed to read reconciliation data' });
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