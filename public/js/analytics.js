/**
 * Mesure d'audience sans cookies (Plausible ou Umami) — DÉSACTIVÉE tant que ANALYTICS_SRC est vide.
 * Activation : 1) définir ANALYTICS_ORIGIN (ex. https://plausible.io) sur Render (CSP),
 * 2) renseigner ANALYTICS_SRC (+ ANALYTICS_WEBSITE_ID pour Umami), 3) mettre à jour politique-confidentialite.html.
 */
(function () {
    'use strict';
    var ANALYTICS_SRC = '';          // ex. 'https://plausible.io/js/script.js' ou 'https://cloud.umami.is/script.js'
    var ANALYTICS_DOMAIN = 'offrez.net'; // Plausible : data-domain
    var ANALYTICS_WEBSITE_ID = '';   // Umami : data-website-id
    if (!ANALYTICS_SRC) return;
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return;
    var s = document.createElement('script');
    s.defer = true;
    s.src = ANALYTICS_SRC;
    if (ANALYTICS_WEBSITE_ID) s.setAttribute('data-website-id', ANALYTICS_WEBSITE_ID);
    else s.setAttribute('data-domain', ANALYTICS_DOMAIN);
    document.head.appendChild(s);
})();
