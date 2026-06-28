const fs = require('fs');
const path = require('path');

// Chemins des fichiers logs
const SEARCHES_FILE = path.join(__dirname, 'searches.csv');
const CLICKS_FILE = path.join(__dirname, 'clicks.csv');

// Fonction utilitaire pour compter les lignes d'un CSV
function countLines(filePath) {
    if (!fs.existsSync(filePath)) return 0;
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim() !== '');
    return Math.max(0, lines.length - 1); // -1 pour le header
}

// Fonction pour lire les dates et faire des stats sur 24h
function getTodaysCount(filePath) {
    if (!fs.existsSync(filePath)) return 0;
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').slice(1);

    const today = new Date().toISOString().split('T')[0];

    let count = 0;
    lines.forEach(line => {
        if (line.includes(today)) count++;
    });
    return count;
}

// --- AFFICHAGE DASHBOARD ---

console.log('\n\x1b[36m%s\x1b[0m', '📊 TABLEAU DE BORD OFFREZ');
console.log('\x1b[36m%s\x1b[0m', '===================================');

const totalSearches = countLines(SEARCHES_FILE);
const totalClicks = countLines(CLICKS_FILE);

const todaySearches = getTodaysCount(SEARCHES_FILE);
const todayClicks = getTodaysCount(CLICKS_FILE);

// Calcul CTR (Taux de Clic Amazon)
const clickRate = totalSearches > 0
    ? ((totalClicks / totalSearches) * 100).toFixed(1)
    : 0;

console.log('\n📅 AUJOURD\'HUI :');
console.log(`- Visiteurs (Recherches) : \x1b[33m${todaySearches}\x1b[0m`);
console.log(`- Clics Amazon (Sorties) : \x1b[35m${todayClicks}\x1b[0m`);

console.log('\n📈 TOTAL DEPUIS LE DÉBUT :');
console.log(`- Total Recherches : ${totalSearches}`);
console.log(`- Total Clics : ${totalClicks}`);

console.log('\n🏆 PERFORMANCE :');
console.log(`- Taux de Clic (CTR) : \x1b[1m${clickRate}%\x1b[0m (C'est ce qui fait l'argent)`);

console.log('\n📧 EMAILS :');
console.log('Gérés par Brevo → \x1b[34mhttps://app.brevo.com\x1b[0m');

console.log('\n💰 CÔTÉ ARGENT :');
console.log('Regarde tes commissions sur : \x1b[34mhttps://affiliate-program.amazon.fr/home\x1b[0m');
console.log('\n');
