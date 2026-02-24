const fs = require('fs');
const path = require('path');

// Actual function from server.js for local scan
async function getTradeFileList() {
    const tradesDir = path.join(__dirname, '..', 'trades');

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

    // Try local filesystem
    try {
        const tradeFiles = scanDirLocally(tradesDir);
        console.log(`✓ Detected ${tradeFiles.length} trade files locally (including subdirs)`);
        return tradeFiles;
    } catch (error) {
        console.error('✗ Error reading local trades directory:', error);
        return [];
    }
}

getTradeFileList().then(files => {
    const subDirFiles = files.filter(f => f.includes('/'));
    console.log(`Total files: ${files.length}`);
    console.log(`Files in subdirs: ${subDirFiles.length}`);
    if (subDirFiles.length > 0) {
        console.log('Sample subdir files:', subDirFiles.slice(0, 5));
    } else {
        console.warn('⚠ NO FILES FOUND IN SUBDIRECTORIES!');
    }
});
