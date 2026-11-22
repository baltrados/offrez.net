/**
 * SW-REGISTER.JS — Enregistrement du Service Worker
 * ===================================================
 * Externalisé (pas de script inline, CSP script-src 'self'), chargé en `defer` dans le <head> de chaque page.
 * Silencieux en production : un échec d'enregistrement n'affecte pas le site (il fonctionne sans SW).
 */
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
            const host = window.location.hostname;
            if (host === 'localhost' || host === '127.0.0.1') {
                console.warn('[OFFREZ] Service worker non enregistré :', err && err.message);
            }
        });
    });
}
