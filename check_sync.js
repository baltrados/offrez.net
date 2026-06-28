const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const IGNORE_DIRS = ['node_modules', '.git', '.vscode', '.agents', 'tools'];
const IGNORE_EXTS = ['.csv', '.json', '.log', '.bak', '.md', '.py'];
const IGNORE_FILES = ['.env', '.gitignore', 'package-lock.json', 'package.json', 'check_sync.js', 'style.css', 'favicon.svg', 'robots.txt', 'sitemap.xml', 'manifest.json'];

function getLocalHashes(dir, baseDir, hashes = {}) {
    if (!fs.existsSync(dir)) return hashes;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
        
        if (IGNORE_DIRS.includes(file)) continue;
        
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            getLocalHashes(fullPath, baseDir, hashes);
        } else {
            const ext = path.extname(file);
            if (IGNORE_EXTS.includes(ext) || IGNORE_FILES.includes(file)) continue;
            
            const content = fs.readFileSync(fullPath);
            let digest;
            // Handle binary vs text for CRLF to LF normalization
            if (ext === '.html' || ext === '.js' || ext === '.css') {
                const normalized = content.toString('utf8').replace(/\r\n/g, '\n');
                digest = crypto.createHash('md5').update(normalized, 'utf8').digest('hex');
            } else {
                digest = crypto.createHash('md5').update(content).digest('hex');
            }
            hashes['./' + relPath] = digest;
        }
    }
    return hashes;
}

try {
    console.log("🔍 Generating local hashes...");
    const localHashes = getLocalHashes(__dirname, __dirname);

    console.log("🌐 Fetching remote hashes via SSH...");
    const remoteCmd = `ssh pi@192.168.1.100 "cd ~/offrly && find . -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -name '.*' -not -name '*.csv' -not -name '*.json' -not -name '*.log' -not -name '*.bak' -not -name '*.md' -not -name '*.py' -exec md5sum {} +"`;
    
    let remoteOutput = '';
    try {
        remoteOutput = execSync(remoteCmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
    } catch (sshErr) {
        console.error("❌ SSH Error. Vérifiez la connexion au serveur !");
        console.error(sshErr.message);
        process.exit(1);
    }

    const remoteHashes = {};
    remoteOutput.split('\n').forEach(line => {
        line = line.trim();
        if (!line) return;
        const [hash, file] = line.split(/\s+(.+)/);
        const filename = path.basename(file);
        const ext = path.extname(file);
        if (IGNORE_EXTS.includes(ext) || IGNORE_FILES.includes(filename)) return;
        remoteHashes[file] = hash;
    });

    const onlyLocal = [];
    const onlyRemote = [];
    const diffHash = [];

    for (const [file, hash] of Object.entries(localHashes)) {
        if (!remoteHashes[file]) {
            onlyLocal.push(file);
        } else if (remoteHashes[file] !== hash) {
            diffHash.push(file);
        }
    }

    for (const file of Object.keys(remoteHashes)) {
        if (!localHashes[file]) {
            onlyRemote.push(file);
        }
    }

    console.log("\n================ RAPPORT DE SYNCHRONISATION ================");
    console.log(`Fichiers Locaux  : ${Object.keys(localHashes).length}`);
    console.log(`Fichiers Serveur : ${Object.keys(remoteHashes).length}\n`);

    if (onlyLocal.length > 0) {
        console.log("⚠️  UNIQUEMENT EN LOCAL (Manquants sur le serveur) :");
        onlyLocal.forEach(f => console.log(`  - ${f}`));
        console.log("");
    }

    if (onlyRemote.length > 0) {
        console.log("⚠️  UNIQUEMENT SUR LE SERVEUR (Obsoletes ou créés là-bas) :");
        onlyRemote.forEach(f => console.log(`  - ${f}`));
        console.log("");
    }

    if (diffHash.length > 0) {
        console.log("🔄 FICHIERS MODIFIÉS (Désynchronisés) :");
        diffHash.forEach(f => console.log(`  - ${f}`));
        console.log("");
    }

    if (onlyLocal.length === 0 && onlyRemote.length === 0 && diffHash.length === 0) {
        console.log("✅ PARFAITEMENT SYNCHRONISÉ ! (Aucune différence détectée)");
    } else {
        console.log("❌ DES DIFFÉRENCES ONT ÉTÉ TROUVÉES.");
    }
    console.log("============================================================\n");

} catch(e) {
    console.error("Script Failed: ", e);
}
