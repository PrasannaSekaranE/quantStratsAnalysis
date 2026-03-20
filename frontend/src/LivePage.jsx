import React, { useState, useEffect, useMemo } from 'react';
import {
    TrendingUp, Activity, IndianRupee,
    RefreshCw, BarChart3,
    ArrowUpRight, ArrowDownRight, Target, Calendar,
    AlertCircle, ChevronUp, ChevronDown
} from 'lucide-react';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

/* ── Helper Functions ── */
const formatDate = (dateStr) => {
    if (!dateStr || dateStr === 'ALL') return 'Overall';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
};

const formatTime = (timestamp) => {
    try {
        if (!timestamp) return 'N/A';
        const d = timestamp.includes(' ') ? new Date(timestamp.replace(' ', 'T')) : new Date(timestamp);
        if (isNaN(d.getTime())) return timestamp;
        const hours = d.getHours();
        const minutes = d.getMinutes();
        const period = hours >= 12 ? 'pm' : 'am';
        const displayHour = hours % 12 || 12;
        return `${displayHour}:${minutes.toString().padStart(2, '0')} ${period}`;
    } catch (e) { return timestamp; }
};

const formatPnL = (val) => {
    const absVal = Math.abs(val);
    const formatted = new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
    }).format(absVal);
    return val >= 0 ? `+${formatted}` : `-${formatted}`;
};

const formatCurRaw = (val) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
    }).format(val);
};

/* ── Loader Component ── */
const BarLoader = () => (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#eaf4f7' }}>
        <div className="text-center">
            <div className="mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 100" width="200" height="166" style={{ display: 'block', margin: '0 auto' }}>
                    <rect x="12" y="60" width="10" height="40" fill="#034C8C" rx="1">
                        <animate attributeName="height" values="40;70;40" dur="1s" begin="0s" repeatCount="indefinite" keyTimes="0;0.5;1" calcMode="spline" keySplines="0.4 0 0.2 1;0.4 0 0.2 1" />
                        <animate attributeName="y" values="60;30;60" dur="1s" begin="0s" repeatCount="indefinite" keyTimes="0;0.5;1" calcMode="spline" keySplines="0.4 0 0.2 1;0.4 0 0.2 1" />
                    </rect>
                    <rect x="37" y="60" width="10" height="40" fill="#03738C" rx="1">
                        <animate attributeName="height" values="40;60;40" dur="1s" begin="0.18s" repeatCount="indefinite" keyTimes="0;0.5;1" calcMode="spline" keySplines="0.4 0 0.2 1;0.4 0 0.2 1" />
                        <animate attributeName="y" values="60;40;60" dur="1s" begin="0.18s" repeatCount="indefinite" keyTimes="0;0.5;1" calcMode="spline" keySplines="0.4 0 0.2 1;0.4 0 0.2 1" />
                    </rect>
                    <rect x="62" y="60" width="10" height="40" fill="#038C8C" rx="1">
                        <animate attributeName="height" values="40;80;40" dur="1s" begin="0.36s" repeatCount="indefinite" keyTimes="0;0.5;1" calcMode="spline" keySplines="0.4 0 0.2 1;0.4 0 0.2 1" />
                        <animate attributeName="y" values="60;20;60" dur="1s" begin="0.36s" repeatCount="indefinite" keyTimes="0;0.5;1" calcMode="spline" keySplines="0.4 0 0.2 1;0.4 0 0.2 1" />
                    </rect>
                    <rect x="87" y="60" width="10" height="40" fill="#038C7F" rx="1">
                        <animate attributeName="height" values="40;65;40" dur="1s" begin="0.54s" repeatCount="indefinite" keyTimes="0;0.5;1" calcMode="spline" keySplines="0.4 0 0.2 1;0.4 0 0.2 1" />
                        <animate attributeName="y" values="60;35;60" dur="1s" begin="0.54s" repeatCount="indefinite" keyTimes="0;0.5;1" calcMode="spline" keySplines="0.4 0 0.2 1;0.4 0 0.2 1" />
                    </rect>
                </svg>
            </div>
            <p className="text-xl font-semibold text-gray-700">Loading trading data...</p>
        </div>
    </div>
);

/* ── Main Component ── */
const LivePage = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeVersion, setActiveVersion] = useState('ALL'); // 'ALL', 'V1', 'V1_1', 'V2_UPGRADE'
    const [selectedDate, setSelectedDate] = useState('ALL');
    const [sortConfig, setSortConfig] = useState({ key: 'entry_time', direction: 'desc' });

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${API_BASE_URL}/live-trades`);
            const json = await res.json();
            if (json.success) setData(json);
            else setError(json.error || 'Failed to load live trades');
        } catch (e) {
            setError('Cannot connect to backend. Make sure it is running.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    // Get current trades based on active version
    const activeTrades = useMemo(() => {
        if (!data) return [];
        if (activeVersion === 'V1') return data.v1.trades;
        if (activeVersion === 'V1_1') return data.v1_1.trades;
        if (activeVersion === 'V2_UPGRADE') return data.v2_upgrade.trades;
        // ALL: Combine
        return [...data.v1.trades, ...data.v1_1.trades, ...data.v2_upgrade.trades];
    }, [data, activeVersion]);

    // Handle Sorting
    const handleSort = (key) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    // Filtered & Sorted Trades
    const processedTrades = useMemo(() => {
        let result = [...activeTrades];

        // Date filter
        if (selectedDate !== 'ALL') {
            result = result.filter(t => t.date === selectedDate);
        }

        // Apply Sorting
        if (sortConfig.key) {
            result.sort((a, b) => {
                let valA = a[sortConfig.key];
                let valB = b[sortConfig.key];

                // Handle numbers
                if (typeof valA === 'number' && typeof valB === 'number') {
                    return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
                }

                // Handle dates/strings
                valA = valA?.toString().toLowerCase() || '';
                valB = valB?.toString().toLowerCase() || '';
                if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        } else {
            // Default sort by entry_time descending if no key set (shouldn't happen with state default)
            result.sort((a, b) => new Date(b.entry_time) - new Date(a.entry_time));
        }

        return result;
    }, [activeTrades, selectedDate, sortConfig]);

    // Calculate stats for current selection
    const currentStats = useMemo(() => {
        // Stats should be calculated on the DATE-FILTERED data, but maybe ignore sort for stats?
        // Actually stats depend on the set of trades, so processedTrades is fine (sort doesn't affect sum/avg)
        if (processedTrades.length === 0) {
            return {
                totalTrades: 0, totalPnL: 0, winners: 0, losers: 0, winRate: 0,
                avgProfit: 0, avgLoss: 0, avgPnL: 0, capital: activeVersion === 'ALL' ? 100000 : 50000
            };
        }

        const totalPnL = processedTrades.reduce((s, t) => s + (t.total_pnl || 0), 0);
        const winners = processedTrades.filter(t => t.total_pnl > 0);
        const losers = processedTrades.filter(t => t.total_pnl < 0);
        const winRate = (winners.length / processedTrades.length) * 100;

        const avgProfit = winners.length > 0 ? winners.reduce((s, t) => s + t.total_pnl, 0) / winners.length : 0;
        const avgLoss = losers.length > 0 ? losers.reduce((s, t) => s + t.total_pnl, 0) / losers.length : 0;

        let capital = 0;
        if (activeVersion === 'ALL') {
            const v1End = data.v1.trades[data.v1.trades.length - 1]?.ending_capital || data.v1.startingCapital;
            const v11End = data.v1_1.trades[data.v1_1.trades.length - 1]?.ending_capital || data.v1_1.startingCapital;
            const v2UpEnd = data.v2_upgrade.trades[data.v2_upgrade.trades.length - 1]?.ending_capital || data.v2_upgrade.startingCapital;
            capital = v1End + v11End + v2UpEnd;
        } else {
            const versionKey = activeVersion === 'V1' ? 'v1' : activeVersion === 'V1_1' ? 'v1_1' : 'v2_upgrade';
            const versionTrades = data[versionKey].trades;
            capital = versionTrades[versionTrades.length - 1]?.ending_capital || data[versionKey].startingCapital;
        }

        let initialCapital = 0;
        if (activeVersion === 'ALL') {
            initialCapital = (data.summary?.startingCapital || 100000) + (data.summary?.v2UpgradeCapital || 0);
        } else {
            const versionKey = activeVersion === 'V1' ? 'v1' : activeVersion === 'V1_1' ? 'v1_1' : 'v2_upgrade';
            initialCapital = data[versionKey].startingCapital || 50000;
        }

        return {
            totalTrades: processedTrades.length,
            totalPnL,
            winners: winners.length,
            losers: losers.length,
            winRate,
            avgProfit,
            avgLoss,
            avgPnL: totalPnL / processedTrades.length,
            capital,
            initialCapital
        };
    }, [processedTrades, activeVersion, data]);

    if (loading && !data) return <BarLoader />;

    if (error && !data) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: '#eaf4f7' }}>
                <div className="bg-white rounded-2xl p-8 shadow-xl max-w-md">
                    <AlertCircle className="text-red-500 mx-auto mb-4" size={48} />
                    <h2 className="text-2xl font-bold text-red-600 mb-2">Connection Error</h2>
                    <p className="text-gray-600 mb-4">{error}</p>
                    <button onClick={fetchData} className="w-full py-3 rounded-lg font-bold text-white transition-all shadow-lg"
                        style={{ background: 'linear-gradient(135deg, rgb(31, 168, 166) 0%, rgb(23, 98, 199) 100%)' }}>
                        Retry Connection
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-6" style={{ background: '#eaf4f7', zoom: 0.9 }}>
            {/* Header */}
            <div className="mb-8 flex justify-between items-start">
                <div className="flex items-center gap-6">
                    <div className="h-16 w-16 rounded-xl flex items-center justify-center shadow-lg"
                        style={{ background: 'linear-gradient(135deg, #1762C7 0%, #1FA8A6 100%)' }}>
                        <Activity className="text-white" size={32} />
                    </div>
                    <div>
                        <h1 className="text-5xl font-bold mb-2" style={{
                            background: 'linear-gradient(135deg, #1762C7 0%, #1FA8A6 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                            fontFamily: '"Montserrat", sans-serif'
                        }}>
                            G Blast Live
                        </h1>
                        <p className="text-gray-500 font-semibold tracking-widest text-sm uppercase">
                            Sequential Compounding Portfolio · {activeVersion === 'ALL' ? '₹1.5 Lakhs' : '₹50,000'} Initial
                        </p>
                    </div>
                </div>

                <button
                    onClick={fetchData}
                    disabled={loading}
                    className="px-6 py-3 rounded-xl font-bold text-white transition-all transform hover:scale-105 flex items-center gap-2 shadow-lg"
                    style={{ background: 'linear-gradient(135deg, rgb(31, 168, 166) 0%, rgb(23, 98, 199) 100%)' }}
                >
                    <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                    Refresh
                </button>
            </div>

            {/* Version Tabs */}
            <div className="flex gap-3 mb-8 flex-wrap">
                {[
                    { id: 'ALL', label: 'All Live', subtitle: 'Portfolio' },
                    { id: 'V1', label: 'V1 (40% SL)', subtitle: 'Live' },
                    { id: 'V1_1', label: 'V1.1 (25% SL)', subtitle: 'Discontinued' },
                    { id: 'V2_UPGRADE', label: 'V2 Upgrade', subtitle: 'Live' }
                ].map((v) => (
                    <button
                        key={v.id}
                        onClick={() => { setActiveVersion(v.id); setSelectedDate('ALL'); }}
                        className="px-8 py-4 rounded-xl font-bold text-lg transition-all duration-300 transform hover:scale-105 hover:shadow-2xl"
                        style={{
                            background: activeVersion === v.id
                                ? 'linear-gradient(135deg, rgb(31, 168, 166) 0%, rgb(23, 98, 199) 100%)'
                                : 'white',
                            color: activeVersion === v.id ? 'white' : '#1762C7',
                            boxShadow: activeVersion === v.id
                                ? '0 8px 25px rgba(31, 168, 166, 0.4)'
                                : '0 4px 12px rgba(0,0,0,0.1)'
                        }}
                    >
                        <div className="flex items-center gap-2">
                            <span>{v.label}</span>
                            <span className="text-sm font-normal opacity-90">({v.subtitle})</span>
                        </div>
                    </button>
                ))}
            </div>

            {/* Date Filter Banner */}
            {selectedDate !== 'ALL' && (
                <div className="mb-4 px-6 py-3 rounded-xl flex items-center gap-3"
                    style={{ background: 'linear-gradient(135deg, rgba(31, 168, 166, 0.1) 0%, rgba(23, 98, 199, 0.1) 100%)', border: '2px solid rgba(23, 98, 199, 0.3)' }}>
                    <Calendar size={20} style={{ color: '#1762C7' }} />
                    <span className="font-semibold" style={{ color: '#1762C7' }}>
                        Statistics filtered for: {formatDate(selectedDate)}
                    </span>
                    <button
                        onClick={() => setSelectedDate('ALL')}
                        className="ml-auto px-4 py-1 rounded-lg text-white font-semibold text-sm transition-all transform hover:scale-105"
                        style={{ background: 'linear-gradient(135deg, rgb(31, 168, 166) 0%, rgb(23, 98, 199) 100%)' }}
                    >
                        Show Overall Stats
                    </button>
                </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {/* Total Trades */}
                <div className="bg-white rounded-2xl p-6 shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 rounded-xl" style={{ background: 'linear-gradient(135deg, #1762C7 0%, #1FA8A6 100%)' }}>
                            <BarChart3 className="text-white" size={28} />
                        </div>
                        <Activity className="text-gray-400" size={24} />
                    </div>
                    <h3 className="text-gray-500 text-sm font-semibold mb-2 uppercase tracking-wide">Total Trades</h3>
                    <p className="text-4xl font-bold mb-2" style={{ color: '#1762C7' }}>{currentStats.totalTrades}</p>
                    <div className="flex gap-3 text-xs mt-3">
                        <span className="text-emerald-600 font-bold">✓ {currentStats.winners}</span>
                        <span className="text-red-600 font-bold">✗ {currentStats.losers}</span>
                        <span className="text-gray-400 font-bold">⊗ 0</span>
                    </div>
                </div>

                {/* Net P&L */}
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
                        Avg per trade: <span className={`font-semibold ${currentStats.avgPnL >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {formatPnL(currentStats.avgPnL)}
                        </span>
                    </p>
                </div>

                {/* Win Rate */}
                <div className="bg-white rounded-2xl p-6 shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 rounded-xl" style={{ background: 'linear-gradient(135deg, #1762C7 0%, #1FA8A6 100%)' }}>
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

                {/* Current Capital */}
                <div className="bg-white rounded-2xl p-6 shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700">
                            <TrendingUp className="text-white" size={28} />
                        </div>
                        <span className={`text-xs font-bold px-2 py-1 rounded-lg ${currentStats.totalPnL >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            {(currentStats.totalPnL / currentStats.initialCapital * 100).toFixed(1)}% Return
                        </span>
                    </div>
                    <h3 className="text-gray-500 text-sm font-semibold mb-2 uppercase tracking-wide">Current Capital</h3>
                    <p className="text-4xl font-bold text-gray-800">{formatCurRaw(currentStats.capital)}</p>
                    <p className="text-xs text-gray-500 mt-3">
                        Initial: {formatCurRaw(currentStats.initialCapital)}
                    </p>
                </div>
            </div>

            {/* Date Selection - Calendar Input */}
            <div className="mb-8 flex items-center gap-4 bg-white p-4 rounded-2xl shadow-sm">
                <div className="flex items-center gap-2 px-4 border-r border-gray-100">
                    <Calendar size={20} className="text-gray-400" />
                    <span className="font-bold text-gray-700 whitespace-nowrap">Filter by Date</span>
                </div>
                <div className="flex-1 flex items-center gap-3">
                    <input
                        type="date"
                        value={selectedDate === 'ALL' ? '' : selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value || 'ALL')}
                        className="bg-transparent outline-none font-semibold text-gray-600 cursor-pointer border rounded-lg px-4 py-1 focus:ring-2 focus:ring-blue-100 transition-all"
                        style={{ color: '#1762C7', borderColor: '#eef2ff' }}
                    />
                    {selectedDate !== 'ALL' && (
                        <button
                            onClick={() => setSelectedDate('ALL')}
                            className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1 rounded-lg text-xs font-bold transition-all"
                        >
                            CLEAR
                        </button>
                    )}
                </div>
                <div className="text-sm text-gray-400 font-medium px-4">
                    {processedTrades.length} Trades Found
                </div>
            </div>

            {/* Trades Table */}
            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr style={{ background: 'linear-gradient(135deg, #f8faff 0%, #eef2ff 100%)' }}>
                                {[
                                    { k: 'trade_no', l: '#' },
                                    { k: 'entry_time', l: 'Time' },
                                    { k: 'symbol', l: 'Instrument' },
                                    { k: 'direction', l: 'Dir' },
                                    { k: 'entry_price', l: 'Entry' },
                                    { k: 'exit_price', l: 'Exit' },
                                    { k: 'total_pnl', l: 'P&L' },
                                    { k: 'ending_capital', l: 'Capital' },
                                    { k: 'return_pct', l: 'Ret%' },
                                    { k: 'exit_reason', l: 'Outcome' }
                                ].map(h => (
                                    <th
                                        key={h.k}
                                        onClick={() => handleSort(h.k)}
                                        className="px-6 py-5 text-sm font-bold uppercase tracking-wider text-gray-500 cursor-pointer hover:text-blue-600 transition-colors group"
                                    >
                                        <div className="flex items-center gap-1">
                                            {h.l}
                                            <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                                                <ChevronUp size={10} className={sortConfig.key === h.k && sortConfig.direction === 'asc' ? 'text-blue-600' : 'text-gray-300'} />
                                                <ChevronDown size={10} className={sortConfig.key === h.k && sortConfig.direction === 'desc' ? 'text-blue-600' : 'text-gray-300'} />
                                            </div>
                                            {sortConfig.key === h.k && (
                                                <div className="flex flex-col">
                                                    {sortConfig.direction === 'asc' ? <ChevronUp size={10} className="text-blue-600" /> : <ChevronDown size={10} className="text-blue-600" />}
                                                </div>
                                            )}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {processedTrades.map((t, i) => {
                                const isWin = (t.total_pnl || 0) > 0;
                                return (
                                    <tr key={i} className="border-b border-gray-50 hover:bg-blue-50/30 transition-colors">
                                        <td className="px-6 py-4 font-bold text-gray-400">{t.trade_no || i + 1}</td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="font-bold text-gray-700">{formatDate(t.date)}</div>
                                            <div className="text-[10px] text-gray-400 uppercase font-bold">{formatTime(t.entry_time)}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-black text-gray-800">{t.symbol}</div>
                                            {activeVersion === 'ALL' && <div className="text-[10px] font-bold text-blue-500 uppercase">{t.version}</div>}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-3 py-1 rounded-lg text-[10px] font-black tracking-widest ${t.direction === 'CALL' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                                                }`}>
                                                {t.direction} {t.option_type}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 font-bold text-gray-600">₹{t.entry_price.toFixed(2)}</td>
                                        <td className="px-6 py-4 font-bold text-gray-600">₹{t.exit_price.toFixed(2)}</td>
                                        <td className={`px-6 py-4 font-black ${isWin ? 'text-emerald-600' : 'text-red-500'}`}>
                                            {formatPnL(t.total_pnl)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-gray-400 text-[10px] font-bold">START: {formatCurRaw(t.starting_capital)}</div>
                                            <div className="font-black text-blue-600">{formatCurRaw(t.ending_capital)}</div>
                                        </td>
                                        <td className={`px-6 py-4 font-black text-xs ${isWin ? 'text-emerald-500' : 'text-red-500'}`}>
                                            {isWin ? '+' : ''}{t.return_pct}%
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${t.exit_reason?.includes('TARGET') ? 'bg-emerald-50 text-emerald-600' :
                                                t.exit_reason?.includes('STOP') ? 'bg-red-50 text-red-600' :
                                                    'bg-gray-100 text-gray-500'
                                                }`}>
                                                {t.exit_reason || '—'}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default LivePage;
