import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import TradingDashboard from './TradingDashboard';
import LivePage from './LivePage';

const App = () => {
  const [page, setPage] = useState('paper');

  return (
    <div>
      {/* ── Top Nav ── */}
      <div style={{
        display: 'flex', gap: '8px', padding: '10px 24px',
        background: 'linear-gradient(135deg, #1FA8A6 0%, #1F62C7 100%)',
        position: 'sticky', top: 0, zIndex: 100,
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
      }}>

        {[
          { id: 'paper', label: 'Paper', desc: 'Back-tested strategies' },
          { id: 'live', label: 'Live', desc: 'G Blast Live' },
        ].map(({ id, label, desc }) => (
          <button
            key={id}
            onClick={() => setPage(id)}
            style={{
              padding: '8px 22px', borderRadius: '10px', border: 'none',
              fontWeight: 700, fontSize: '14px', cursor: 'pointer',
              transition: 'all 0.2s',
              background: page === id ? 'white' : 'rgba(255,255,255,0.15)',
              color: page === id ? '#1F62C7' : 'white',
              boxShadow: page === id ? '0 4px 12px rgba(0,0,0,0.2)' : 'none',
            }}
            title={desc}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Pages ── */}
      {page === 'paper' && <TradingDashboard />}
      {page === 'live' && <LivePage />}
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
