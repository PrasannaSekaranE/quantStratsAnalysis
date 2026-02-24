const fs = require('fs');
const path = require('path');

// Mock data and function for testing strategy mapping logic
function mockNormalize(row, filename) {
    let strategy = 'Unknown';
    const isBlaze = filename.toLowerCase().includes('blaze') ||
        filename.toLowerCase().includes('v1_') ||
        filename.toLowerCase().includes('trades_20') ||
        filename.includes('LIVE - V1') ||
        filename.includes('LIVE - V2');

    const isGBlast = filename.toLowerCase().includes('gblast') ||
        filename.toLowerCase().includes('live_trades');

    if (isBlaze) {
        const tradeType = row.type || row.Type || row.TYPE || '';
        if (filename.includes('LIVE - V1')) {
            strategy = filename.includes('hybrid') ? 'V1_LIVE_HYBRID' : 'V1_LIVE_KITE';
        } else if (filename.includes('LIVE - V2')) {
            strategy = filename.includes('hybrid') ? 'V2_LIVE_HYBRID' : 'V2_LIVE_KITE';
        } else if (tradeType === 'v4') {
            strategy = 'BlazeV4';
        } else if (tradeType === 'v3') {
            strategy = 'BlazeV3';
        } else if (tradeType === 'v2') {
            strategy = 'BlazeV2';
        } else {
            strategy = 'Blaze';
        }
    }
    return strategy;
}

const testCases = [
    { file: 'LIVE - V1/hybrid_trades_paper_20260223_104953.csv', expected: 'V1_LIVE_HYBRID' },
    { file: 'LIVE - V1/paper_trades_20260223_105004.csv', expected: 'V1_LIVE_KITE' },
    { file: 'LIVE - V2/hybrid_trades_paper_20260223_105009.csv', expected: 'V2_LIVE_HYBRID' },
    { file: 'LIVE - V2/paper_trades_20260223_105014.csv', expected: 'V2_LIVE_KITE' },
    { file: 'BLAZE_20260223_153624.csv', row: { type: 'v3' }, expected: 'BlazeV3' }
];

console.log('Testing strategy mapping:');
testCases.forEach(tc => {
    const result = mockNormalize(tc.row || {}, tc.file);
    console.log(`File: ${tc.file.padEnd(50)} | Expected: ${tc.expected.padEnd(15)} | Result: ${result}`);
    if (result !== tc.expected) {
        console.error(`  ✗ MISMATCH!`);
    } else {
        console.log(`  ✓ Match`);
    }
});
