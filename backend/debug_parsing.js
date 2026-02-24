const fs = require('fs');
const path = require('path');

// Replicating the UPDATED normalizeTrade logic for final verification
function debugNormalize(row, filename) {
    const filenameLower = filename.toLowerCase();
    const baseName = path.basename(filename).toLowerCase();

    const isBlaze = baseName.startsWith('blaze_');
    const isGBlast = filenameLower.includes('live - v1') ||
        filenameLower.includes('live - v2') ||
        baseName.includes('live_trades') ||
        baseName.includes('gblast') ||
        baseName.includes('g-blast') ||
        baseName.includes('g_blast') ||
        baseName.includes('hybrid_trades') ||
        baseName.includes('paper_trades') ||
        baseName.startsWith('v1_') ||
        baseName.startsWith('v2_') ||
        baseName.startsWith('v3_');

    console.log(`Debug File: ${filename}`);
    console.log(`  - isBlaze: ${isBlaze}`);
    console.log(`  - isGBlast: ${isGBlast}`);

    let strategy = 'Unknown';
    let positionType = '';

    if (isBlaze) {
        const type = row.type || row.Type || row.TYPE || '';
        if (type === 'v2') strategy = 'BlazeV2';
        else if (type === 'v3') strategy = 'BlazeV3';
        else if (type === 'v4') strategy = 'BlazeV4';
        else strategy = 'Blaze';

        const niftySignal = (row.nifty_signal || row.Nifty_Signal || '').toUpperCase();
        if (niftySignal === 'BULLISH') positionType = 'LONG';
        else if (niftySignal === 'BEARISH') positionType = 'SHORT';

    } else if (isGBlast) {
        if (filename.includes('LIVE - V1')) {
            strategy = filename.includes('hybrid') ? 'V1_LIVE_HYBRID' : 'V1_LIVE_KITE';
        } else if (filename.includes('LIVE - V2')) {
            strategy = filename.includes('hybrid') ? 'V2_LIVE_HYBRID' : 'V2_LIVE_KITE';
        } else {
            strategy = 'GBlast';
        }

        const signalType = (row.signal_type || row.Signal_Type || '').toUpperCase();
        if (signalType === 'BULLISH') positionType = 'LONG';
        else if (signalType === 'BEARISH') positionType = 'SHORT';
    }

    const symbol = row.symbol || row.kite_symbol || row.tradingsymbol || 'NIFTY';
    const entryTime = row.entry_time || '';
    const date = entryTime.split(' ')[0];

    return {
        strategy,
        positionType,
        symbol,
        date,
        isValid: !!(symbol && positionType && date)
    };
}

const testFiles = [
    {
        path: 'LIVE - V1/hybrid_trades_paper_20260223_104953.csv',
        row: { entry_time: '2026-02-23 09:19:24.887570', signal_type: 'BULLISH', kite_symbol: 'NIFTY26FEB25700CE' }
    },
    {
        path: 'LIVE - V1/paper_trades_20260223_105004.csv',
        row: { entry_time: '2026-02-23 09:19:19.024349', signal_type: 'BULLISH', tradingsymbol: 'NIFTY26FEB25700CE' }
    }
];

console.log('--- Final Verification Results ---');
testFiles.forEach(tf => {
    const result = debugNormalize(tf.row, tf.path);
    console.log(`Result: ${JSON.stringify(result, null, 2)}`);
    console.log('---------------------------');
});
