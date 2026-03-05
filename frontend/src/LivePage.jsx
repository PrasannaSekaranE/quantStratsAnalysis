import React, { useState, useEffect, useMemo } from 'react';
import {
    TrendingUp, TrendingDown, Activity, IndianRupee,
    ChevronDown, ChevronUp, RefreshCw, BarChart3
} from 'lucide-react';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
const STARTING_CAPITAL = 50000;

const fmt = (n) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n);
const fmtCur = (n) => '₹' + fmt(Math.abs(n));
const fmtTime = (s) => {
    if (!s) return '—';
    const d = s.includes('T') ? new Date(s) : new Date(s.replace(' ', 'T'));
    return isNaN(d) ? s : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};
const fmtDate = (s) => {
    if (!s) return '—';
    const d = s.includes('T') ? new Date(s) : new Date(s.replace(' ', 'T'));
    return isNaN(d) ? s : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

/* ── Stat Card ── */
const StatCard = ({ label, value, sub, color = '#1F62C7', icon: Icon }) => (
    <div className="rounded-2xl p-5 flex flex-col gap-1"
        style={{ background: 'white', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
        <div className="flex items-center gap-2 mb-1">
            {Icon && <Icon size={16} color={color} />}
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</span>
        </div>
        <span className="text-2xl font-bold" style={{ color }}>{value}</span>
        {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
);

/* ── Version Panel ── */
const VersionPanel = ({ version, data, accentColor, accentLight }) => {
    const [expanded, setExpanded] = useState(true);
    const [filterDate, setFilterDate] = useState('ALL');

    const { trades = [], stats = {} } = data;
    const dates = useMemo(() => [...new Set(trades.map(t => t.date))].filter(Boolean).sort().reverse(), [trades]);
    const filtered = useMemo(() =>
        filterDate === 'ALL' ? trades : trades.filter(t => t.date === filterDate),
        [trades, filterDate]
    );

    const totalReturn = stats.currentCapital
        ? ((stats.currentCapital - STARTING_CAPITAL) / STARTING_CAPITAL * 100).toFixed(2)
        : '0.00';

    return (
        <div className="rounded-3xl overflow-hidden shadow-xl mb-8"
            style={{ background: 'white' }}>

            {/* Panel header */}
            <div className="p-6 flex justify-between items-center cursor-pointer"
                style={{ background: `linear-gradient(135deg, ${accentColor} 0%, #1F62C7 100%)` }}
                onClick={() => setExpanded(e => !e)}>
                <div className="flex items-center gap-3">
                    <Activity size={24} className="text-white" />
                    <div>
                        <h2 className="text-2xl font-bold text-white">G Blast Live — {version}</h2>
                        <p className="text-white/70 text-sm">
                            {version === 'V1' ? 'Hybrid Live Trades' : 'Kite Live Trades'} · Starting ₹50,000
                        </p>
                    </div>
                </div>
                {expanded ? <ChevronUp className="text-white" /> : <ChevronDown className="text-white" />}
            </div>

            {expanded && (
                <div className="p-6">
                    {/* Stats row */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                        <StatCard label="Trades" value={stats.totalTrades || 0} icon={BarChart3} color={accentColor} />
                        <StatCard label="Win Rate" value={`${stats.winRate ?? 0}%`}
                            icon={TrendingUp} color={stats.winRate >= 50 ? '#16a34a' : '#dc2626'} />
                        <StatCard label="Total P&L"
                            value={(stats.totalPnL >= 0 ? '+' : '') + fmtCur(stats.totalPnL || 0)}
                            icon={stats.totalPnL >= 0 ? TrendingUp : TrendingDown}
                            color={stats.totalPnL >= 0 ? '#16a34a' : '#dc2626'} />
                        <StatCard label="Current Capital"
                            value={fmtCur(stats.currentCapital || STARTING_CAPITAL)}
                            icon={IndianRupee} color={accentColor} />
                        <StatCard label="Overall Return"
                            value={`${totalReturn}%`}
                            sub={`from ₹50,000`}
                            color={parseFloat(totalReturn) >= 0 ? '#16a34a' : '#dc2626'} />
                    </div>

                    {/* Date filter */}
                    <div className="flex items-center gap-3 mb-5">
                        <span className="text-sm font-semibold text-gray-500">Filter by date:</span>
                        <select
                            className="border rounded-lg px-3 py-2 text-sm font-semibold"
                            style={{ borderColor: accentColor, color: accentColor }}
                            value={filterDate}
                            onChange={e => setFilterDate(e.target.value)}>
                            <option value="ALL">All Dates</option>
                            {dates.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                        <span className="text-xs text-gray-400">{filtered.length} trade{filtered.length !== 1 ? 's' : ''}</span>
                    </div>

                    {/* Trades table */}
                    {filtered.length === 0 ? (
                        <div className="text-center text-gray-400 py-12">No trades found.</div>
                    ) : (
                        <div className="overflow-x-auto rounded-2xl" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr style={{ background: accentLight }}>
                                        {['#', 'Date', 'Symbol', 'Dir', 'Entry ₹', 'Exit ₹', 'P&L', 'Return%', 'Capital', 'Reason'].map(h => (
                                            <th key={h} className="px-4 py-3 text-left font-bold text-xs uppercase tracking-wide"
                                                style={{ color: accentColor }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((t, i) => {
                                        const isWin = t.total_pnl > 0;
                                        return (
                                            <tr key={i}
                                                className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                                                style={{ background: i % 2 === 0 ? 'white' : '#fafbff' }}>
                                                <td className="px-4 py-3 font-bold text-gray-400">{t.trade_no}</td>
                                                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                                                    <div>{fmtDate(t.entry_time)}</div>
                                                    <div className="text-xs text-gray-400">{fmtTime(t.entry_time)}</div>
                                                </td>
                                                <td className="px-4 py-3 font-semibold text-gray-800 max-w-[140px] truncate"
                                                    title={t.symbol}>{t.symbol}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold
                            ${t.direction === 'PUT' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                                        {t.direction}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-gray-700 font-mono">{fmt(t.entry_price)}</td>
                                                <td className="px-4 py-3 text-gray-700 font-mono">{fmt(t.exit_price)}</td>
                                                <td className="px-4 py-3 font-bold font-mono"
                                                    style={{ color: isWin ? '#16a34a' : '#dc2626' }}>
                                                    {isWin ? '+' : ''}{fmtCur(t.total_pnl)}
                                                </td>
                                                <td className="px-4 py-3 font-bold text-xs"
                                                    style={{ color: isWin ? '#16a34a' : '#dc2626' }}>
                                                    {isWin ? '+' : ''}{t.return_pct}%
                                                </td>
                                                <td className="px-4 py-3 text-gray-700 font-mono text-xs">
                                                    <div className="text-gray-400 text-[10px]">{fmtCur(t.starting_capital)}</div>
                                                    <div className="font-bold" style={{ color: accentColor }}>{fmtCur(t.ending_capital)}</div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold
                            ${t.exit_reason === 'TARGET' || t.exit_reason === 'TARGET_HIT'
                                                            ? 'bg-green-100 text-green-700'
                                                            : t.exit_reason === 'STOP_LOSS'
                                                                ? 'bg-red-100 text-red-700'
                                                                : 'bg-gray-100 text-gray-600'}`}>
                                                        {t.exit_reason || '—'}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

/* ── Main LivePage ── */
const LivePage = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

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

    // Combined portfolio summary
    const combined = useMemo(() => {
        if (!data) return null;
        const v1 = data.v1.stats;
        const v2 = data.v2.stats;
        const totalPnL = (v1.totalPnL || 0) + (v2.totalPnL || 0);
        const totalCapital = (v1.currentCapital || STARTING_CAPITAL) + (v2.currentCapital || STARTING_CAPITAL);
        return {
            totalPnL,
            totalCapital,
            overallReturn: ((totalCapital - 100000) / 100000 * 100).toFixed(2),
        };
    }, [data]);

    return (
        <div style={{ background: '#eaf4f7', minHeight: '100vh', padding: '24px', zoom: 0.9 }}>
            {/* Page header */}
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-4xl font-bold mb-1"
                        style={{
                            background: 'linear-gradient(135deg, #1FA8A6, #1F62C7)',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                            fontFamily: '"Montserrat", sans-serif'
                        }}>
                        📡 G Blast Live
                    </h1>
                    <p className="text-gray-500 text-sm">Live trades · Sequential compounding · ₹50K per version</p>
                </div>
                <div className="flex items-center gap-4">
                    {combined && (
                        <div className="rounded-2xl px-6 py-3 text-right"
                            style={{ background: 'white', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
                            <div className="text-xs text-gray-400 uppercase tracking-wide">Portfolio (₹1L)</div>
                            <div className="text-xl font-bold"
                                style={{ color: combined.totalPnL >= 0 ? '#16a34a' : '#dc2626' }}>
                                {combined.totalPnL >= 0 ? '+' : ''}{fmtCur(combined.totalPnL)}
                                <span className="text-sm ml-2">({combined.overallReturn}%)</span>
                            </div>
                            <div className="text-xs text-gray-500">Current: ₹{fmt(combined.totalCapital)}</div>
                        </div>
                    )}
                    <button onClick={fetchData} disabled={loading}
                        className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-white transition-all transform hover:scale-105"
                        style={{ background: 'linear-gradient(135deg, #1FA8A6, #1F62C7)' }}>
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                </div>
            </div>

            {loading && (
                <div className="text-center py-24 text-gray-400 text-xl font-semibold">
                    <RefreshCw size={40} className="animate-spin mx-auto mb-4" />
                    Loading live trades…
                </div>
            )}

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-6 text-center font-semibold">
                    ⚠️ {error}
                </div>
            )}

            {data && !loading && (
                <>
                    <VersionPanel
                        version="V1"
                        data={data.v1}
                        accentColor="#1FA8A6"
                        accentLight="#edfafa"
                    />
                    <VersionPanel
                        version="V2"
                        data={data.v2}
                        accentColor="#1F62C7"
                        accentLight="#eff4ff"
                    />
                </>
            )}
        </div>
    );
};

export default LivePage;
