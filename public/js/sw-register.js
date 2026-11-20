/**
 * SW-REGISTER.JS — Enregistrement du Service Worker
 * ===================================================
 * Externalisé depuis index.html pour supprimer 'unsafe-inline' de la CSP.
 */
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => { });
    });
}
