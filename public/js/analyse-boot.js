/**
 * ANALYSE-BOOT.JS - Garde-fou de démarrage de analyse.html (script classique, syntaxe ES5)
 * ======================================================================================
 * analyse.js est un module qui dépend d'une douzaine d'autres modules. Si un seul ne peut pas être
 * chargé (connexion instable, bloqueur de contenu, échec réseau du service worker) ou lu (navigateur
 * trop ancien), le navigateur abandonne tout le module sans rien afficher : la page restait bloquée
 * sur « 0% - Initialisation... ».
 * Ce script, volontairement sans module ni syntaxe récente, détecte ce cas et affiche un message
 * avec « Réessayer ». Les profils sont encore dans le localStorage (l'analyse n'a pas démarré),
 * le rechargement relance donc l'analyse normalement.
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
    var shown = false;

    function started() {
        return document.documentElement.getAttribute('data-analyse-boot') === 'started';
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

        var actions = document.createElement('div');
        actions.className = 'analysis-error-actions';
        if (reason !== 'unsupported') {
            actions.appendChild(button('Réessayer', 'btn btn-primary', function () { window.location.reload(); }));
        }
        actions.appendChild(button('Modifier ma recherche', 'btn btn-secondary', function () {
            // Même règle que l'action « Modifier ma recherche » de l'analyse : les profils ne restent pas
            try { localStorage.removeItem('finalData'); } catch (e) { /* stockage indisponible */ }
            try { sessionStorage.removeItem('finalData'); } catch (e) { /* stockage indisponible */ }
            window.location.href = 'config.html';
        }));

        box.appendChild(icon);
        box.appendChild(title);
        box.appendChild(message);
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

    // Navigateur sans modules ES : analyse.js ne s'exécutera jamais.
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
            if (target.type === 'module') showBootError('load');
            return;
        }
        // Module de l'analyse illisible (erreur de syntaxe, fonction non supportée) avant le démarrage
        var file = String(event.filename || '').split('?')[0];
        var optional = false;
        for (var i = 0; i < OPTIONAL_SCRIPTS.length; i++) {
            if (file.slice(-OPTIONAL_SCRIPTS[i].length) === OPTIONAL_SCRIPTS[i]) optional = true;
        }
        if (!started() && !optional && file.indexOf('/js/') !== -1) showBootError('script');
    }, true);

    // Filet de sécurité : rien n'a démarré au bout du délai (réseau très lent ou bloqué sans erreur).
    // Minuteur lancé tout de suite, pas sur DOMContentLoaded : un module en attente retarde justement cet
    // événement. Au déclenchement, le HTML est lu (un module différé ne bloque pas l'analyse du document).
    setTimeout(function () {
        if (!started()) showBootError('timeout');
    }, TIMEOUT_MS);
})();
