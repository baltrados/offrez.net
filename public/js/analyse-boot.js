/**
 * ANALYSE-BOOT.JS - Garde-fou de démarrage de analyse.html (script classique, syntaxe ES5)
 * ======================================================================================
 * analyse.js est un module qui dépend d'une douzaine d'autres modules. Si un seul ne peut pas être
 * chargé (connexion instable, bloqueur de contenu, échec réseau du service worker) ou lu (navigateur
 * trop ancien, copie périmée en cache), le navigateur abandonne tout le module sans rien afficher : la
 * page restait bloquée sur « 0% - Initialisation... ».
 * Ce script, volontairement sans module ni syntaxe récente :
 *  1. au premier échec de chargement ou de lecture, répare seul : service worker désinscrit, caches du
 *     site vidés, fichiers JS re-téléchargés sans le cache HTTP, puis un seul rechargement automatique
 *     (drapeau en sessionStorage, pas de boucle) ;
 *  2. si l'échec persiste (ou après le délai de garde), affiche un message avec « Réessayer » (qui refait
 *     la même réparation) et un code de diagnostic lisible sur une capture d'écran.
 * Les profils sont encore dans le localStorage (l'analyse n'a pas démarré) : le rechargement relance
 * l'analyse normalement.
 * analyse.js signale son démarrage avec l'attribut data-analyse-boot sur <html>.
 */
(function () {
    'use strict';

    var script = document.currentScript;
    var timeoutAttr = script && script.getAttribute('data-timeout-ms');
    // 25 s : large, pour ne pas alerter à tort sur une connexion lente (le message est de toute façon
    // retiré par analyse.js si l'analyse finit par démarrer)
    var TIMEOUT_MS = /^\d{3,6}$/.test(timeoutAttr || '') ? Number(timeoutAttr) : 25000;
    // Scripts classiques facultatifs de la page : une erreur chez eux n'empêche pas l'analyse
    var OPTIONAL_SCRIPTS = ['/js/sw-register.js', '/js/analytics.js', '/js/analyse-boot.js'];
    // Drapeau de la réparation automatique (une seule par onglet tant que l'analyse n'a pas démarré)
    var REPAIR_KEY = 'offrezBootRepair';
    // Délai maximal de la réparation : le rechargement a lieu même si un nettoyage reste bloqué
    var REPAIR_MAX_MS = 4000;
    // Durée pendant laquelle une réparation compte comme « déjà faite » (anti-boucle)
    var REPAIR_TTL_MS = 10 * 60 * 1000;
    var shown = false;
    var repairing = false;
    var detail = { file: '', line: '', message: '' };

    function started() {
        return document.documentElement.getAttribute('data-analyse-boot') === 'started';
    }

    /**
     * État de la réparation dans cet onglet : 'none' (aucune récente), 'recent' (faite il y a moins de
     * REPAIR_TTL_MS) ou 'unavailable' (sessionStorage inaccessible : pas de réparation automatique,
     * faute de pouvoir empêcher une boucle). Le délai évite qu'un drapeau resté là (visiteur parti par
     * « Retour ») prive une analyse ultérieure de sa réparation automatique.
     */
    function repairState() {
        var value;
        try { value = sessionStorage.getItem(REPAIR_KEY); } catch (e) { return 'unavailable'; }
        var at = Number(value);
        return value !== null && at > 0 && Date.now() - at < REPAIR_TTL_MS ? 'recent' : 'none';
    }

    function writeRepairFlag() {
        try { sessionStorage.setItem(REPAIR_KEY, String(Date.now())); return true; } catch (e) { return false; }
    }

    function clearRepairFlag() {
        try { sessionStorage.removeItem(REPAIR_KEY); } catch (e) { /* stockage indisponible */ }
    }

    function baseName(url) {
        var path = String(url || '').split('#')[0].split('?')[0];
        return path.slice(path.lastIndexOf('/') + 1);
    }

    /** Fichiers JS du site déjà demandés par la page (pour les re-télécharger sans le cache HTTP). */
    function siteScriptUrls() {
        var urls = [];
        var origin = window.location.origin;
        try {
            var entries = performance.getEntriesByType('resource');
            for (var i = 0; i < entries.length; i++) {
                var name = entries[i].name;
                if (name.indexOf(origin + '/js/') === 0 && urls.indexOf(name) === -1) urls.push(name);
            }
        } catch (e) { /* Resource Timing indisponible */ }
        var modules = document.querySelectorAll('script[type="module"][src]');
        for (var j = 0; j < modules.length; j++) {
            if (urls.indexOf(modules[j].src) === -1) urls.push(modules[j].src);
        }
        return urls;
    }

    /**
     * Supprime ce qui peut servir une copie périmée ou abîmée : service worker, caches du site, cache
     * HTTP des fichiers JS (fetch « reload » : nouvelle copie depuis le serveur, qui remplace l'ancienne).
     * Le service worker est réinscrit par sw-register.js au chargement suivant.
     */
    function purgeThenReload() {
        if (repairing) return;
        repairing = true;
        var done = false;
        function reload() {
            if (done) return;
            done = true;
            window.location.reload();
        }
        setTimeout(reload, REPAIR_MAX_MS);

        if (typeof Promise === 'undefined') {
            reload();
            return;
        }
        // Un échec isolé (fichier encore bloqué, par exemple) n'empêche pas la suite
        function settle(tasks) {
            return Promise.all(tasks.map(function (t) { return t.then(null, function () { return null; }); }));
        }

        // Étape 1 : service worker et caches du site
        var purge = [];
        try {
            if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
                purge.push(navigator.serviceWorker.getRegistrations().then(function (regs) {
                    return Promise.all(regs.map(function (r) { return r.unregister(); }));
                }));
            }
            if (window.caches && caches.keys) {
                purge.push(caches.keys().then(function (keys) {
                    return Promise.all(keys.map(function (k) { return caches.delete(k); }));
                }));
            }
        } catch (e) { /* API absente : on continue */ }

        // Étape 2, APRÈS la purge : le service worker contrôle encore la page jusqu'au rechargement ; ses
        // caches étant vides, il transmet la requête (mode « reload » conservé) au réseau, ce qui remplace
        // aussi la copie du cache HTTP.
        settle(purge).then(function () {
            var refresh = [];
            try {
                if (window.fetch) {
                    var urls = siteScriptUrls();
                    for (var i = 0; i < urls.length; i++) {
                        refresh.push(fetch(urls[i], { cache: 'reload', credentials: 'same-origin' }));
                    }
                }
            } catch (e) { /* fetch absent : on recharge quand même */ }
            return settle(refresh);
        }).then(reload, reload);
    }

    /** Code de diagnostic affiché sous le message (lisible sur une capture d'écran). */
    function diagnosticCode(reason) {
        var parts = [reason];
        if (detail.file) parts.push(detail.file + (detail.line ? ':' + detail.line : ''));
        if (detail.message) parts.push(detail.message.slice(0, 140));
        var ua = navigator.userAgent || '';
        var os = ua.match(/OS (\d+)[._](\d+)/);
        var version = ua.match(/Version\/(\d+(?:\.\d+)?)/);
        if (os) parts.push('iOS ' + os[1] + '.' + os[2]);
        if (version) parts.push('Safari ' + version[1]);
        var controlled = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
        parts.push('SW ' + (controlled ? 'oui' : 'non'));
        var state = repairState();
        parts.push('réparation ' + (state === 'recent' ? 'faite' : state === 'unavailable' ? 'impossible' : 'non faite'));
        return parts.join(' · ');
    }

    function button(label, className, onClick) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = className;
        b.textContent = label;
        b.addEventListener('click', onClick);
        return b;
    }

    function showBootError(reason) {
        if (shown || started()) return;
        shown = true;

        var box = document.createElement('div');
        box.className = 'analysis-error boot-error';
        box.setAttribute('role', 'alert');
        box.setAttribute('data-reason', reason);

        var icon = document.createElement('div');
        icon.className = 'analysis-error-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = '🔌';

        var title = document.createElement('p');
        title.className = 'analysis-error-title';
        title.textContent = reason === 'unsupported'
            ? 'Navigateur non compatible'
            : "Le chargement de l'analyse a échoué";

        var message = document.createElement('p');
        message.className = 'analysis-error-text';
        message.textContent = reason === 'unsupported'
            ? "Votre navigateur est trop ancien pour lancer l'analyse. Mettez-le à jour, ou essayez avec un autre navigateur."
            : "La page n'a pas pu charger tous ses fichiers. Causes fréquentes : connexion instable, bloqueur de contenu ou navigateur pas à jour. Vos profils sont conservés : vous pouvez réessayer.";

        var code = document.createElement('p');
        code.className = 'analysis-error-text boot-error-code';
        code.style.fontSize = '0.75rem';
        code.style.wordBreak = 'break-word';
        code.textContent = 'Code : ' + diagnosticCode(reason);

        var actions = document.createElement('div');
        actions.className = 'analysis-error-actions';
        if (reason !== 'unsupported') {
            actions.appendChild(button('Réessayer', 'btn btn-primary', function () {
                writeRepairFlag();
                purgeThenReload();
            }));
        }
        actions.appendChild(button('Modifier ma recherche', 'btn btn-secondary', function () {
            // Même règle que l'action « Modifier ma recherche » de l'analyse : les profils ne restent pas
            try { localStorage.removeItem('finalData'); } catch (e) { /* stockage indisponible */ }
            try { sessionStorage.removeItem('finalData'); } catch (e) { /* stockage indisponible */ }
            clearRepairFlag();
            window.location.href = 'config.html';
        }));

        box.appendChild(icon);
        box.appendChild(title);
        box.appendChild(message);
        box.appendChild(code);
        box.appendChild(actions);

        var status = document.getElementById('statusIndicator');
        var results = document.getElementById('singleResult');
        if (status) status.style.display = 'none';
        if (results) {
            results.appendChild(box);
        } else {
            document.body.appendChild(box);
        }
        var first = actions.querySelector('button');
        if (first) first.focus();
    }

    /** Échec de chargement ou de lecture : réparation automatique une fois, puis message. */
    function onBootFailure(reason) {
        if (shown || repairing || started()) return;
        // Pas encore réparé dans cet onglet et drapeau enregistrable (sinon : risque de boucle)
        if (repairState() === 'none' && writeRepairFlag()) {
            purgeThenReload();
            return;
        }
        // Le message attend que le HTML soit lu (#singleResult) : un module en échec peut arriver avant
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () { showBootError(reason); });
        } else {
            showBootError(reason);
        }
    }

    // Navigateur sans modules ES : analyse.js ne s'exécutera jamais (aucune réparation possible).
    // Limite connue : Safari 10.1-10.3 gère les modules sans exposer noModule (message « non compatible »
    // à tort) ; ces versions (2017) ne sont plus mises à jour.
    if (!('noModule' in HTMLScriptElement.prototype)) {
        document.addEventListener('DOMContentLoaded', function () { showBootError('unsupported'); });
        return;
    }

    // Échec de chargement d'un script de la page (le module principal émet « error » si un module
    // de son arbre ne peut pas être téléchargé) : phase de capture, ces événements ne remontent pas.
    window.addEventListener('error', function (event) {
        var target = event.target;
        if (target && target.tagName === 'SCRIPT') {
            // Seul le module de l'analyse compte : un script facultatif bloqué (analytics.js par un
            // bloqueur de contenu, par exemple) ne doit pas afficher d'erreur.
            if (target.type === 'module') {
                if (!detail.file) detail.file = baseName(target.src);
                onBootFailure('load');
            }
            return;
        }
        // Module de l'analyse illisible (erreur de syntaxe, fonction non supportée) avant le démarrage
        var file = String(event.filename || '').split('?')[0];
        var optional = false;
        for (var i = 0; i < OPTIONAL_SCRIPTS.length; i++) {
            if (file.slice(-OPTIONAL_SCRIPTS[i].length) === OPTIONAL_SCRIPTS[i]) optional = true;
        }
        if (!started() && !optional && file.indexOf('/js/') !== -1) {
            detail.file = baseName(file);
            detail.line = event.lineno ? String(event.lineno) : '';
            detail.message = String(event.message || '');
            onBootFailure('script');
        }
    }, true);

    // Analyse démarrée : la réparation de cet onglet est oubliée (un échec futur pourra en refaire une)
    window.addEventListener('load', function () {
        if (started()) clearRepairFlag();
    });

    // Filet de sécurité : rien n'a démarré au bout du délai (réseau très lent ou bloqué sans erreur).
    // Pas de réparation automatique ici : sur une connexion lente, recharger relancerait tout le chargement.
    // Minuteur lancé tout de suite, pas sur DOMContentLoaded : un module en attente retarde justement cet
    // événement. Au déclenchement, le HTML est lu (un module différé ne bloque pas l'analyse du document).
    setTimeout(function () {
        if (!started() && !repairing) showBootError('timeout');
    }, TIMEOUT_MS);
})();
