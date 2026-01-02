import React, { useState, useMemo, useEffect } from 'react';
import { TrendingUp, TrendingDown, Clock, Target, AlertCircle, CheckCircle, XCircle, BarChart3, Activity, ArrowUpRight, ArrowDownRight, Calendar, RefreshCw, Loader, PieChart, LineChart, IndianRupee } from 'lucide-react';

const TradingDashboard = () => {
  const [activeStrategy, setActiveStrategy] = useState('ALL');
  const [activeTab, setActiveTab] = useState('table');
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });
  const [tradesData, setTradesData] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [logoError, setLogoError] = useState(false);
  const [selectedDate, setSelectedDate] = useState('ALL');

  // API Configuration
const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

  // Fetch trades from backend
  const fetchTrades = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE_URL}/trades`);
      const data = await response.json();
      
      if (data.success) {
        setTradesData(data.trades);
        setStats(data.stats);
        setLastUpdated(new Date());
      } else {
        setError(data.error || 'Failed to fetch trades');
      }
    } catch (err) {
      setError('Unable to connect to backend server. Make sure it\'s running on port 3001.');
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrades();
  }, []);

  const filteredTrades = useMemo(() => {
    let filtered = tradesData;
    
    // Filter by strategy
    if (activeStrategy !== 'ALL') {
      filtered = filtered.filter(trade => trade.strategy === activeStrategy);
    }
    
    // Filter by date
    if (selectedDate !== 'ALL') {
      filtered = filtered.filter(trade => trade.date === selectedDate);
    }
    
    return filtered;
  }, [tradesData, activeStrategy, selectedDate]);

  const currentStats = useMemo(() => {
    if (!stats) return null;
    return stats[activeStrategy] || stats.ALL;
  }, [stats, activeStrategy]);

  const handleSort = (key) => {
    setSortConfig({
      key,
      direction: sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc'
    });
  };

  const sortedTrades = useMemo(() => {
    const sorted = [...filteredTrades];
    sorted.sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];
      
      if (sortConfig.key === 'entry_time' || sortConfig.key === 'exit_time' || sortConfig.key === 'date') {
        aVal = new Date(aVal);
        bVal = new Date(bVal);
      }
      
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredTrades, sortConfig]);

  const tradesByDate = useMemo(() => {
    const grouped = {};
    filteredTrades.forEach(trade => {
      const date = trade.date;
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(trade);
    });
    return grouped;
  }, [filteredTrades]);

  const dailyPnL = useMemo(() => {
    const daily = [];
    Object.keys(tradesByDate).sort().forEach(date => {
      const trades = tradesByDate[date];
      const pnl = trades.reduce((sum, t) => sum + t.net_pnl, 0);
      const winners = trades.filter(t => t.net_pnl > 0).length;
      const losers = trades.filter(t => t.net_pnl < 0).length;
      daily.push({ date, pnl, trades: trades.length, winners, losers });
    });
    return daily;
  }, [tradesByDate]);

  const cumulativePnL = useMemo(() => {
    let cumulative = 0;
    return dailyPnL.map(day => {
      cumulative += day.pnl;
      return { ...day, cumulative };
    });
  }, [dailyPnL]);

  // Get unique dates for filter dropdown
  const uniqueDates = useMemo(() => {
    const dates = [...new Set(tradesData.map(trade => trade.date))].filter(Boolean).sort().reverse();
    return dates;
  }, [tradesData]);

  // Get strategy display name and position type
  const getStrategyDisplay = (strategy) => {
    const displays = {
      'iTrack': { name: 'iTrack', subtitle: 'Live', positionType: 'SHORT' },
      'TrendFlo': { name: 'TrendFlo', subtitle: 'Paper', positionType: 'LONG' },
      'GBlast': { name: 'G-Blast', subtitle: 'Paper', positionType: 'OPTIONS' }
    };
    return displays[strategy] || { name: strategy, subtitle: '', positionType: '' };
  };

  const formatTime = (timestamp) => {
    try {
      if (!timestamp) return 'N/A';
      if (timestamp.includes(':') && timestamp.length <= 5) {
        return timestamp;
      }
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return timestamp;
      return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch {
      return timestamp || 'N/A';
    }
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) return date;
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return date;
    }
  };

  const formatPrice = (price) => {
    return `₹${price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPnL = (pnl) => {
    const sign = pnl >= 0 ? '+' : '';
    return `${sign}₹${Math.abs(pnl).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPercentage = (pct) => {
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
  };

  const getExitReasonDisplay = (reason) => {
    const reasonMap = {
      'PROFIT_TRAILING_STOP_5MIN': 'Trailing Stop',
      'HARD_STOP_LOSS_915': 'Stop Loss',
      'EOD_EXIT': 'EOD Exit',
      'SESSION_END': 'Session End'
    };
    return reasonMap[reason] || reason.replace(/_/g, ' ');
  };

  const getExitReasonColor = (reason) => {
    if (reason.includes('PROFIT') || reason.includes('TRAILING')) return 'text-emerald-600';
    if (reason.includes('STOP_LOSS')) return 'text-red-600';
    return 'text-gray-600';
  };

  if (loading && tradesData.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#eaf4f7' }}>
        <div className="text-center">
          <Loader className="animate-spin mx-auto mb-4" size={48} style={{ color: '#1762C7' }} />
          <p className="text-xl font-semibold text-gray-700">Loading trades data...</p>
        </div>
      </div>
    );
  }

  if (error && tradesData.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#eaf4f7' }}>
        <div className="bg-white rounded-2xl p-8 shadow-xl max-w-md">
          <AlertCircle className="text-red-500 mx-auto mb-4" size={48} />
          <h2 className="text-2xl font-bold text-red-600 mb-2">Connection Error</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={fetchTrades}
            className="w-full py-3 rounded-lg font-bold text-white transition-all"
            style={{ background: 'linear-gradient(135deg, rgb(31, 168, 166) 0%, rgb(23, 98, 199) 100%)' }}
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6" style={{ background: '#eaf4f7' }}>
      {/* Header with Logo */}
      <div className="mb-8 flex justify-between items-start">
        <div className="flex items-center gap-6">
          {!logoError ? (
            <img 
              src="/logo.png" 
              alt="XIRR Logo" 
              className="h-16 w-auto object-contain"
              onError={() => setLogoError(true)}
            />
          ) : (
            <div className="h-16 w-16 rounded-xl flex items-center justify-center" 
                 style={{ background: 'linear-gradient(135deg, rgb(31, 168, 166) 0%, rgb(23, 98, 199) 100%)' }}>
              <BarChart3 className="text-white" size={32} />
            </div>
          )}
          
          <div>
            <h1 className="text-5xl font-bold mb-2" style={{ 
              background: 'linear-gradient(135deg, rgb(31, 168, 166) 0%, rgb(23, 98, 199) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              fontFamily: '"Montserrat", sans-serif'
            }}>
              Quant Strategies Analysis
            </h1>
            <p className="text-gray-600 text-lg"></p>
            {lastUpdated && (
              <p className="text-sm text-gray-500 mt-1">
                {/* Last updated: {lastUpdated.toLocaleTimeString('en-IN')} */}
              </p>
            )}
          </div>
        </div>
        
        <button
          onClick={fetchTrades}
          disabled={loading}
          className="px-6 py-3 rounded-xl font-bold text-white transition-all transform hover:scale-105 flex items-center gap-2"
          style={{ background: 'linear-gradient(135deg, rgb(31, 168, 166) 0%, rgb(23, 98, 199) 100%)' }}
        >
          <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Strategy Tabs - Updated Format */}
      <div className="flex gap-3 mb-8 flex-wrap">
        {['ALL', 'iTrack', 'TrendFlo', 'GBlast'].map((strategy) => {
          const display = strategy !== 'ALL' ? getStrategyDisplay(strategy) : null;
          return (
            <button
              key={strategy}
              onClick={() => setActiveStrategy(strategy)}
              className="px-8 py-4 rounded-xl font-bold text-lg transition-all duration-300 transform hover:scale-105 hover:shadow-2xl"
              style={{
                background: activeStrategy === strategy 
                  ? 'linear-gradient(135deg, rgb(31, 168, 166) 0%, rgb(23, 98, 199) 100%)'
                  : 'white',
                color: activeStrategy === strategy ? 'white' : '#1762C7',
                boxShadow: activeStrategy === strategy 
                  ? '0 8px 25px rgba(31, 168, 166, 0.4)' 
                  : '0 4px 12px rgba(0,0,0,0.1)'
              }}
            >
              {strategy === 'ALL' ? (
                'All Strategies'
              ) : (
                <div className="flex items-center gap-2">
                  <span>{display.name}</span>
                  <span className="text-sm font-normal opacity-90">({display.subtitle})</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Statistics Cards */}
      {currentStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-2xl p-6 shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 rounded-xl" style={{ background: 'linear-gradient(135deg, rgb(31, 168, 166) 0%, rgb(23, 98, 199) 100%)' }}>
                <BarChart3 className="text-white" size={28} />
              </div>
              <Activity className="text-gray-400" size={24} />
            </div>
            <h3 className="text-gray-500 text-sm font-semibold mb-2 uppercase tracking-wide">Total Trades</h3>
            <p className="text-4xl font-bold mb-2" style={{ color: '#1762C7' }}>{currentStats.totalTrades}</p>
            <div className="flex gap-3 text-xs mt-3">
              <span className="text-emerald-600 font-semibold">✓ {currentStats.winners}</span>
              <span className="text-red-600 font-semibold">✗ {currentStats.losers}</span>
              <span className="text-gray-500 font-semibold">⊗ {currentStats.breakeven}</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1">
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-xl ${currentStats.totalPnL >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}>
                <IndianRupee className="text-white" size={28} />
              </div>
              {currentStats.totalPnL >= 0 ? 
                <ArrowUpRight className="text-emerald-500" size={28} /> : 
                <ArrowDownRight className="text-red-500" size={28} />
              }
            </div>
            <h3 className="text-gray-500 text-sm font-semibold mb-2 uppercase tracking-wide">Net P&L</h3>
            <p className={`text-4xl font-bold mb-2 ${currentStats.totalPnL >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {formatPnL(currentStats.totalPnL)}
            </p>
            <p className="text-xs text-gray-500 mt-3">
              Avg per trade: <span className={`font-semibold ${currentStats.avgPnLPerTrade >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {formatPnL(currentStats.avgPnLPerTrade)}
              </span>
            </p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 rounded-xl" style={{ background: 'linear-gradient(135deg, rgb(31, 168, 166) 0%, rgb(23, 98, 199) 100%)' }}>
                <Target className="text-white" size={28} />
              </div>
              <div className="text-right">
                <div className="w-16 h-16 rounded-full border-4 flex items-center justify-center" style={{ borderColor: '#1762C7' }}>
                  <span className="text-lg font-bold" style={{ color: '#1762C7' }}>
                    {currentStats.winRate.toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
            <h3 className="text-gray-500 text-sm font-semibold mb-2 uppercase tracking-wide">Win Rate</h3>
            <p className="text-4xl font-bold" style={{ color: '#1762C7' }}>
              {currentStats.winRate.toFixed(1)}%
            </p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500 to-red-500">
                <Activity className="text-white" size={28} />
              </div>
            </div>
            <h3 className="text-gray-500 text-sm font-semibold mb-2 uppercase tracking-wide">Avg Profit/Loss</h3>
            <div className="space-y-2">
              <div>
                <p className="text-xs text-gray-500 mb-1">Avg Win</p>
                <p className="text-2xl font-bold text-emerald-600">{formatPnL(currentStats.avgProfit)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Avg Loss</p>
                <p className="text-2xl font-bold text-red-600">{formatPnL(currentStats.avgLoss)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Tabs */}
      <div className="flex gap-3 mb-6 flex-wrap">
        {[
          { id: 'table', icon: BarChart3, label: 'Table View' },
          { id: 'charts', icon: LineChart, label: 'Performance Charts' },
          { id: 'distribution', icon: PieChart, label: 'Distribution' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-6 py-3 rounded-lg font-semibold transition-all flex items-center gap-2"
            style={{
              background: activeTab === tab.id ? '#1762C7' : 'white',
              color: activeTab === tab.id ? 'white' : '#1762C7',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}
          >
            <tab.icon size={18} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table View */}
      {activeTab === 'table' && (
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Date Filter Header */}
          <div className="p-6 border-b border-gray-200 flex justify-between items-center" style={{ background: selectedDate !== 'ALL' ? '#f0f9ff' : 'white' }}>
            <div>
              <h3 className="text-lg font-bold text-gray-800">Trade History</h3>
              {selectedDate !== 'ALL' && (
                <p className="text-sm text-blue-600 mt-1 flex items-center gap-2">
                  <Calendar size={14} />
                  Filtered: {formatDate(selectedDate)}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg border-2 transition-all" style={{ borderColor: selectedDate !== 'ALL' ? '#1762C7' : '#d1d5db' }}>
                <Calendar size={20} style={{ color: '#1762C7' }} />
                <input
                  type="date"
                  value={selectedDate === 'ALL' ? '' : selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value || 'ALL')}
                  min={uniqueDates[uniqueDates.length - 1]}
                  max={uniqueDates[0]}
                  className="font-semibold text-gray-700 focus:outline-none cursor-pointer"
                  style={{ border: 'none', background: 'transparent' }}
                  placeholder="Select date"
                />
              </div>
              {selectedDate !== 'ALL' && (
                <button
                  onClick={() => setSelectedDate('ALL')}
                  className="px-4 py-2 rounded-lg text-white font-semibold text-sm transition-all transform hover:scale-105 flex items-center gap-2"
                  style={{ background: 'linear-gradient(135deg, rgb(31, 168, 166) 0%, rgb(23, 98, 199) 100%)' }}
                >
                  <XCircle size={16} />
                  Clear
                </button>
              )}
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ background: 'linear-gradient(135deg, rgb(31, 168, 166) 0%, rgb(23, 98, 199) 100%)' }}>
                  <th className="px-6 py-5 text-left text-white font-bold cursor-pointer hover:bg-white/10 transition-colors" onClick={() => handleSort('date')}>
                    <div className="flex items-center gap-2">Date <Calendar size={16} /></div>
                  </th>
                  <th className="px-6 py-5 text-left text-white font-bold cursor-pointer hover:bg-white/10 transition-colors" onClick={() => handleSort('symbol')}>
                    <div className="flex items-center gap-2">Symbol <Activity size={16} /></div>
                  </th>
                  <th className="px-6 py-5 text-left text-white font-bold cursor-pointer hover:bg-white/10 transition-colors" onClick={() => handleSort('entry_time')}>
                    <div className="flex items-center gap-2">Entry Time <Clock size={16} /></div>
                  </th>
                  <th className="px-6 py-5 text-left text-white font-bold cursor-pointer hover:bg-white/10 transition-colors" onClick={() => handleSort('exit_time')}>
                    <div className="flex items-center gap-2">Exit Time <Clock size={16} /></div>
                  </th>
                  <th className="px-6 py-5 text-left text-white font-bold cursor-pointer hover:bg-white/10 transition-colors" onClick={() => handleSort('entry_price')}>
                    Entry Price
                  </th>
                  <th className="px-6 py-5 text-left text-white font-bold cursor-pointer hover:bg-white/10 transition-colors" onClick={() => handleSort('exit_price')}>
                    Exit Price
                  </th>
                  <th className="px-6 py-5 text-left text-white font-bold cursor-pointer hover:bg-white/10 transition-colors" onClick={() => handleSort('net_pnl')}>
                    <div className="flex items-center gap-2">P&L <IndianRupee size={16} /></div>
                  </th>
                  <th className="px-6 py-5 text-left text-white font-bold cursor-pointer hover:bg-white/10 transition-colors" onClick={() => handleSort('profit_pct')}>
                    Profit %
                  </th>
                  <th className="px-6 py-5 text-left text-white font-bold">Exit Reason</th>
                </tr>
              </thead>
              <tbody>
                {sortedTrades.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <Calendar size={48} className="text-gray-400" />
                        <p className="text-xl font-semibold text-gray-600">No trades found</p>
                        <p className="text-sm text-gray-500">
                          {selectedDate !== 'ALL' 
                            ? `No trades on ${formatDate(selectedDate)}` 
                            : 'No trades available for the selected filters'}
                        </p>
                        {selectedDate !== 'ALL' && (
                          <button
                            onClick={() => setSelectedDate('ALL')}
                            className="mt-2 px-4 py-2 rounded-lg text-white font-semibold text-sm"
                            style={{ background: 'linear-gradient(135deg, rgb(31, 168, 166) 0%, rgb(23, 98, 199) 100%)' }}
                          >
                            Show All Dates
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  sortedTrades.map((trade, index) => {
                  const display = getStrategyDisplay(trade.strategy);
                  return (
                    <tr 
                      key={index}
                      className="border-b border-gray-100 hover:bg-gradient-to-r hover:from-cyan-50 hover:to-blue-50 transition-all duration-200"
                      style={{ animation: `slideIn 0.4s ease-out ${index * 0.05}s both` }}
                    >
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2">
                          <Calendar size={16} className="text-gray-400" />
                          <span className="font-semibold text-gray-700">{formatDate(trade.date)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className={`p-3 rounded-xl shadow-md ${trade.position_type === 'LONG' ? 'bg-gradient-to-br from-emerald-400 to-emerald-600' : 'bg-gradient-to-br from-red-400 to-red-600'}`}>
                            {trade.position_type === 'LONG' ? <TrendingUp className="text-white" size={20} /> : <TrendingDown className="text-white" size={20} />}
                          </div>
                          <div>
                            <p className="font-bold text-gray-900 text-lg">{trade.symbol}</p>
                            <p className="text-xs font-semibold" style={{ color: '#1762C7' }}>
                              {display.name} ({display.subtitle})
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2">
                          <Clock size={18} className="text-gray-400" />
                          <span className="text-gray-700 font-medium">{formatTime(trade.entry_time)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2">
                          <Clock size={18} className="text-gray-400" />
                          <span className="text-gray-700 font-medium">{formatTime(trade.exit_time)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5 font-bold text-gray-800 text-lg">{formatPrice(trade.entry_price)}</td>
                      <td className="px-6 py-5 font-bold text-gray-800 text-lg">{formatPrice(trade.exit_price)}</td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2">
                          {trade.net_pnl >= 0 ? <ArrowUpRight size={20} className="text-emerald-600" /> : <ArrowDownRight size={20} className="text-red-600" />}
                          <span className={`font-bold text-lg ${trade.net_pnl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {formatPnL(trade.net_pnl)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <span className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-bold shadow-md ${
                          trade.profit_pct >= 0 ? 'bg-gradient-to-r from-emerald-400 to-emerald-600 text-white' : 'bg-gradient-to-r from-red-400 to-red-600 text-white'
                        }`}>
                          {formatPercentage(trade.profit_pct)}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2">
                          {trade.exit_reason.includes('PROFIT') || trade.exit_reason.includes('TRAILING') ? (
                            <CheckCircle size={18} className="text-emerald-600" />
                          ) : trade.exit_reason.includes('STOP_LOSS') ? (
                            <XCircle size={18} className="text-red-600" />
                          ) : (
                            <AlertCircle size={18} className="text-gray-600" />
                          )}
                          <span className={`text-sm font-semibold ${getExitReasonColor(trade.exit_reason)}`}>
                            {getExitReasonDisplay(trade.exit_reason)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Performance Charts View - Combined */}
      {activeTab === 'charts' && (
        <div className="space-y-6">
          {/* Daily P&L Chart */}
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-3" style={{ color: '#1762C7' }}>
              <LineChart size={28} />
              Daily P&L Performance
            </h2>
            <div className="space-y-4">
              {dailyPnL.map((day, index) => {
                const maxAbsPnL = Math.max(...dailyPnL.map(d => Math.abs(d.pnl)));
                const barWidth = maxAbsPnL > 0 ? (Math.abs(day.pnl) / maxAbsPnL) * 100 : 0;
                
                return (
                  <div 
                    key={index} 
                    className="p-5 rounded-xl hover:shadow-lg transition-all"
                    style={{ background: day.pnl >= 0 ? '#f0fdf4' : '#fef2f2' }}
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex-shrink-0 w-32">
                        <Calendar size={20} style={{ color: '#1762C7' }} className="mb-1" />
                        <p className="font-bold text-gray-800">{formatDate(day.date)}</p>
                        <p className="text-xs text-gray-600">{day.trades} trades</p>
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-4 mb-2">
                          <p className={`text-2xl font-bold ${day.pnl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {formatPnL(day.pnl)}
                          </p>
                          <div className="flex gap-2 text-sm">
                            <span className="text-emerald-600 font-semibold">✓ {day.winners}</span>
                            <span className="text-red-600 font-semibold">✗ {day.losers}</span>
                          </div>
                        </div>
                        
                        <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className={`absolute h-full transition-all duration-500 ${day.pnl >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cumulative P&L Chart */}
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-3" style={{ color: '#1762C7' }}>
              <TrendingUp size={28} />
              Cumulative P&L Growth
            </h2>
            <div className="space-y-3">
              {cumulativePnL.map((day, index) => {
                const maxCumulative = Math.max(...cumulativePnL.map(d => Math.abs(d.cumulative)));
                const progressWidth = maxCumulative > 0 ? (Math.abs(day.cumulative) / maxCumulative) * 100 : 0;
                
                return (
                  <div 
                    key={index} 
                    className="p-4 rounded-xl hover:shadow-lg transition-all bg-gradient-to-r from-gray-50 to-white"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <Calendar size={18} className="text-gray-400" />
                        <span className="font-semibold text-gray-700">{formatDate(day.date)}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className={`text-sm font-semibold ${day.pnl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          Daily: {formatPnL(day.pnl)}
                        </span>
                        <span className={`text-xl font-bold ${day.cumulative >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {formatPnL(day.cumulative)}
                        </span>
                      </div>
                    </div>
                    
                    <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-700 ${day.cumulative >= 0 ? 'bg-gradient-to-r from-emerald-400 to-emerald-600' : 'bg-gradient-to-r from-red-400 to-red-600'}`}
                        style={{ width: `${progressWidth}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            
            {cumulativePnL.length > 0 && (
              <div className="mt-8 p-6 rounded-xl" style={{ background: 'linear-gradient(135deg, rgb(31, 168, 166) 0%, rgb(23, 98, 199) 100%)' }}>
                <div className="text-center text-white">
                  <p className="text-sm uppercase tracking-wide mb-2">Final Cumulative P&L</p>
                  <p className="text-4xl font-bold">
                    {formatPnL(cumulativePnL[cumulativePnL.length - 1].cumulative)}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Distribution View */}
      {activeTab === 'distribution' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <h2 className="text-2xl font-bold mb-6" style={{ color: '#1762C7' }}>Strategy Distribution</h2>
            {stats && (
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="font-semibold text-gray-700">iTrack (Live)</span>
                    <span className="font-bold" style={{ color: '#1762C7' }}>{stats.iTrack.totalTrades} trades</span>
                  </div>
                  <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full"
                      style={{ 
                        width: `${(stats.iTrack.totalTrades / stats.ALL.totalTrades) * 100}%`,
                        background: 'linear-gradient(135deg, rgb(31, 168, 166) 0%, rgb(23, 98, 199) 100%)'
                      }}
                    />
                  </div>
                  <p className={`text-sm mt-2 font-semibold ${stats.iTrack.totalPnL >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    P&L: {formatPnL(stats.iTrack.totalPnL)}
                  </p>
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="font-semibold text-gray-700">TrendFlo (Paper)</span>
                    <span className="font-bold" style={{ color: '#1762C7' }}>{stats.TrendFlo.totalTrades} trades</span>
                  </div>
                  <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full"
                      style={{ 
                        width: `${(stats.TrendFlo.totalTrades / stats.ALL.totalTrades) * 100}%`,
                        background: 'linear-gradient(135deg, rgb(31, 168, 166) 0%, rgb(23, 98, 199) 100%)'
                      }}
                    />
                  </div>
                  <p className={`text-sm mt-2 font-semibold ${stats.TrendFlo.totalPnL >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    P&L: {formatPnL(stats.TrendFlo.totalPnL)}
                  </p>
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="font-semibold text-gray-700">G-Blast (Paper)</span>
                    <span className="font-bold" style={{ color: '#1762C7' }}>{stats.GBlast.totalTrades} trades</span>
                  </div>
                  <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full"
                      style={{ 
                        width: `${(stats.GBlast.totalTrades / stats.ALL.totalTrades) * 100}%`,
                        background: 'linear-gradient(135deg, rgb(31, 168, 166) 0%, rgb(23, 98, 199) 100%)'
                      }}
                    />
                  </div>
                  <p className={`text-sm mt-2 font-semibold ${stats.GBlast.totalPnL >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    P&L: {formatPnL(stats.GBlast.totalPnL)}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-8">
            <h2 className="text-2xl font-bold mb-6" style={{ color: '#1762C7' }}>Win/Loss Distribution</h2>
            {currentStats && (
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="font-semibold text-emerald-700">Winners</span>
                    <span className="font-bold text-emerald-600">{currentStats.winners} trades</span>
                  </div>
                  <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500"
                      style={{ width: `${(currentStats.winners / currentStats.totalTrades) * 100}%` }}
                    />
                  </div>
                  <p className="text-sm mt-2 font-semibold text-emerald-600">
                    Avg: {formatPnL(currentStats.avgProfit)}
                  </p>
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="font-semibold text-red-700">Losers</span>
                    <span className="font-bold text-red-600">{currentStats.losers} trades</span>
                  </div>
                  <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-red-500"
                      style={{ width: `${(currentStats.losers / currentStats.totalTrades) * 100}%` }}
                    />
                  </div>
                  <p className="text-sm mt-2 font-semibold text-red-600">
                    Avg: {formatPnL(currentStats.avgLoss)}
                  </p>
                </div>
                {currentStats.breakeven > 0 && (
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="font-semibold text-gray-700">Breakeven</span>
                      <span className="font-bold text-gray-600">{currentStats.breakeven} trades</span>
                    </div>
                    <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gray-400"
                        style={{ width: `${(currentStats.breakeven / currentStats.totalTrades) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-8 text-center">
        <p className="text-gray-500 text-sm">
          Showing {sortedTrades.length} trade{sortedTrades.length !== 1 ? 's' : ''} for {
            activeStrategy === 'ALL' ? 'all strategies' : 
            `${getStrategyDisplay(activeStrategy).name} (${getStrategyDisplay(activeStrategy).subtitle})`
          }
          {selectedDate !== 'ALL' && ` on ${formatDate(selectedDate)}`}
        </p>
      </div>

      {/* CSS */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap');
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        * { scroll-behavior: smooth; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 10px; }
        ::-webkit-scrollbar-thumb { 
          background: linear-gradient(135deg, rgb(31, 168, 166) 0%, rgb(23, 98, 199) 100%); 
          border-radius: 10px; 
        }
        ::-webkit-scrollbar-thumb:hover { 
          background: linear-gradient(135deg, rgb(23, 98, 199) 0%, rgb(31, 168, 166) 100%); 
        }
        
        /* Date picker styling */
        input[type="date"] {
          font-family: 'Montserrat', sans-serif;
          color: #374151;
          min-width: 150px;
        }
        input[type="date"]::-webkit-calendar-picker-indicator {
          cursor: pointer;
          opacity: 0.6;
          filter: invert(35%) sepia(89%) saturate(1347%) hue-rotate(188deg) brightness(91%) contrast(89%);
        }
        input[type="date"]::-webkit-calendar-picker-indicator:hover {
          opacity: 1;
        }
        input[type="date"]:focus {
          outline: none;
        }
      `}</style>
    </div>
  );
};

export default TradingDashboard;