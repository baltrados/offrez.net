'use strict';
// Résumé d'erreur sûr pour les journaux : jamais d'objet brut, d'URL ni de texte entre guillemets
// (fetch inclut la valeur d'un en-tête invalide entre guillemets doubles dans son message).

function safeErrorInfo(err) {
    if (!err) return 'Erreur inconnue';
    const parts = [err.name || 'Error'];
    if (err.code) parts.push(String(err.code));
    if (err.type) parts.push(String(err.type));
    const msg = String(err.message || '')
        .replace(/https?:\/\/\S+/gi, '[url]')
        .replace(/"[^"]*"/g, '"[masqué]"') // avant la troncature : une valeur longue ne doit pas fuiter à moitié
        .slice(0, 200);
    if (msg) parts.push(msg);
    return parts.join(' | ');
}

module.exports = { safeErrorInfo };
