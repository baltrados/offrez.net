/**
 * ANALYSE/RETENTION.JS - Après les résultats : compléments cadeau, partage de la liste, rappel calendrier
 * =====================================================================================================
 * Tout est local : liens de recherche Amazon taggés (aucun appel API), partage natif ou presse-papiers,
 * fichier .ics généré dans le navigateur (rien n'est envoyé à OFFREZ).
 * Logique pure exportée (testée sous Node) ; renderRetentionTools gère le DOM.
 */

import { escapeHtml, buildProductUrl, buildAmazonSearchUrl } from '../security.js?v=2026112405';
import { AFFILIATE_TAG, GIFT_ADDONS, REMINDER_ALERT_DAYS } from './settings.js?v=2026112405';

const SITE = 'https://offrez.net';
const FEEDBACK_MS = 6000; // assez long pour lire le message (WCAG 2.2.1)

// ============================================
// Dates d'occasion
// ============================================

/** Dimanche de Pâques (calendrier grégorien, algorithme de Meeus/Jones/Butcher). */
export function easterSunday(year) {
    const a = year % 19, b = Math.floor(year / 100), c = year % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
}

function lastSundayOf(year, monthIndex) {
    const d = new Date(year, monthIndex + 1, 0); // dernier jour du mois
    d.setDate(d.getDate() - d.getDay());
    return d;
}

function nthSundayOf(year, monthIndex, n) {
    const d = new Date(year, monthIndex, 1);
    d.setDate(1 + ((7 - d.getDay()) % 7) + (n - 1) * 7);
    return d;
}

/** Fête des mères (France) : dernier dimanche de mai, ou 1er dimanche de juin si c'est la Pentecôte. */
export function mothersDay(year) {
    const candidate = lastSundayOf(year, 4);
    const pentecost = easterSunday(year);
    pentecost.setDate(pentecost.getDate() + 49);
    return candidate.getTime() === pentecost.getTime() ? nthSundayOf(year, 5, 1) : candidate;
}

/** Fête des pères (France) : 3e dimanche de juin. */
export function fathersDay(year) {
    return nthSundayOf(year, 5, 3);
}

const OCCASION_DATES = {
    'Noël': y => new Date(y, 11, 25),
    'Saint-Valentin': y => new Date(y, 1, 14),
    'Fête des Mères': mothersDay,
    'Fête des Pères': fathersDay
};

/**
 * Prochaine date de l'occasion, strictement après `from` (jour calendaire). Occasion sans date fixe :
 * même jour l'année suivante (l'utilisateur la corrige dans le formulaire).
 * @param {string} occasion
 * @param {Date} [from]
 * @returns {Date}
 */
export function nextOccasionDate(occasion, from = new Date()) {
    const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const rule = OCCASION_DATES[occasion];
    if (!rule) return new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
    const thisYear = rule(today.getFullYear());
    return thisYear > today ? thisYear : rule(today.getFullYear() + 1);
}

/** Date locale au format AAAA-MM-JJ (valeur d'un <input type="date">). */
export function toInputDate(date) {
    const p = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** AAAA-MM-JJ valide (date réelle) → Date locale, sinon null. */
export function parseInputDate(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!m) return null;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const date = new Date(y, mo - 1, d);
    return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? date : null;
}

// ============================================
// Fichier calendrier (.ics, RFC 5545)
// ============================================

/** Échappement d'un texte iCalendar (\ ; , et retours à la ligne). */
export function escapeIcsText(text) {
    return String(text ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r\n|\r|\n/g, '\\n');
}

const icsDate = d => toInputDate(d).replace(/-/g, '');
const utf8 = new TextEncoder();

/**
 * Pliage RFC 5545 §3.1 : lignes de 75 octets au plus, suites préfixées d'une espace (sans couper un caractère).
 * @param {string} line
 * @returns {string}
 */
export function foldIcsLine(line) {
    const parts = [];
    let current = '';
    let bytes = 0;
    for (const ch of line) {
        const n = utf8.encode(ch).length;
        if (bytes + n > 75) {
            parts.push(current);
            current = ' ';
            bytes = 1;
        }
        current += ch;
        bytes += n;
    }
    parts.push(current);
    return parts.join('\r\n');
}

/**
 * Rappel d'occasion : événement « journée entière » avec une alerte REMINDER_ALERT_DAYS jours avant,
 * et un lien vers l'outil pré-rempli. Aucun prénom n'y figure.
 * @param {{date: Date, occasion: string, now?: Date, uid?: string}} p
 * @returns {string}
 */
export function buildIcs({ date, occasion, now = new Date(), uid = `${Date.now()}-${Math.random().toString(36).slice(2)}` }) {
    const label = String(occasion || 'Occasion').slice(0, 60);
    const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    const link = `${SITE}/config.html?occasion=${encodeURIComponent(label)}`;
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    return [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//OFFREZ//Rappel cadeau//FR',
        'CALSCALE:GREGORIAN',
        'BEGIN:VEVENT',
        `UID:${String(uid).replace(/[^A-Za-z0-9-]/g, '')}@offrez.net`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${icsDate(date)}`,
        `DTEND;VALUE=DATE:${icsDate(end)}`,
        `SUMMARY:${escapeIcsText(`🎁 ${label} : penser au cadeau`)}`,
        `DESCRIPTION:${escapeIcsText(`Trouvez une idée en 30 secondes avec OFFREZ : ${link}`)}`,
        `URL:${link}`,
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeIcsText(`Penser au cadeau (${label})`)}`,
        `TRIGGER:-P${REMINDER_ALERT_DAYS}D`,
        'END:VALARM',
        'END:VEVENT',
        'END:VCALENDAR'
    ].map(foldIcsLine).join('\r\n') + '\r\n';
}

// ============================================
// Partage de la liste
// ============================================

/** Lien affilié de l'élément affiché (produit ou idée en lien de recherche), ou '#'. */
export function itemLink(item) {
    if (!item) return '#';
    return item.kind === 'search' ? buildAmazonSearchUrl(item.term, AFFILIATE_TAG) : buildProductUrl(item, AFFILIATE_TAG);
}

/**
 * Texte de partage : une ligne par personne (élément actuellement affiché), avec son lien affilié.
 * @param {Array<{personne: {nom: string}, products: any[], currentIndex: number}>} personResults
 * @returns {string} '' si rien à partager
 */
export function buildShareText(personResults) {
    const lines = (Array.isArray(personResults) ? personResults : []).map(pr => {
        const item = pr?.products?.[pr.currentIndex] ?? pr?.products?.[0];
        const link = itemLink(item);
        if (link === '#') return null;
        const title = item.kind === 'search' ? `Idée : ${item.term}` : String(item.title || '').slice(0, 80);
        return `🎁 ${pr.personne?.nom || 'Cadeau'} : ${title}\n${link}`;
    }).filter(Boolean);
    return lines.length ? `Mes idées cadeaux trouvées avec OFFREZ :\n\n${lines.join('\n\n')}` : '';
}

// ============================================
// DOM
// ============================================

function addonLinksHtml() {
    return GIFT_ADDONS.map(addon => {
        const link = escapeHtml(buildAmazonSearchUrl(addon.term, AFFILIATE_TAG));
        const label = escapeHtml(addon.label);
        return `<li><a class="addon-link" href="${link}" target="_blank" rel="nofollow sponsored noopener" aria-label="${label} sur Amazon (nouvel onglet)"><span aria-hidden="true">${addon.icon}</span> ${label}</a></li>`;
    }).join('');
}

function downloadIcs(content) {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'offrez-rappel-cadeau.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000); // délai large : iOS Safari ouvre le fichier après coup
}

/**
 * Affiche les outils sous les résultats (compléments, partage, rappel). Le partage lit l'état courant
 * de personResults au moment du clic (suggestion affichée pour chaque personne).
 * @param {{container: HTMLElement|null, personResults: any[], contexte: string}} p
 */
export function renderRetentionTools({ container, personResults, contexte }) {
    if (!container) return;
    if (!Array.isArray(personResults) || personResults.length === 0) {
        container.innerHTML = '';
        return;
    }
    const occasion = typeof contexte === 'string' && contexte.trim() ? contexte.trim().slice(0, 60) : 'Anniversaire';
    container.innerHTML = `
        <section class="retention-tools" aria-labelledby="retentionTitle">
            <h3 id="retentionTitle">🎀 Pour compléter vos cadeaux</h3>
            <ul class="addon-links">${addonLinksHtml()}</ul>
            <div class="retention-actions">
                <button type="button" class="btn btn-secondary" id="shareListBtn"><i class="fas fa-share-alt" aria-hidden="true"></i> Partager ma liste</button>
            </div>
            <form class="reminder-form" id="reminderForm" novalidate>
                <label for="reminderDate">📅 Me rappeler la prochaine occasion (${escapeHtml(occasion)})</label>
                <div class="reminder-row">
                    <input type="date" id="reminderDate" aria-describedby="retentionFeedback" value="${toInputDate(nextOccasionDate(occasion))}" required>
                    <button type="submit" class="btn btn-secondary"><i class="fas fa-calendar-alt" aria-hidden="true"></i> Ajouter à mon agenda</button>
                </div>
                <p class="reminder-hint">Un fichier calendrier (.ics) est téléchargé, avec une alerte ${REMINDER_ALERT_DAYS} jours avant. Rien n'est envoyé à OFFREZ.</p>
            </form>
            <p id="retentionFeedback" class="retention-feedback" role="status" aria-live="polite"></p>
        </section>`;

    const feedback = container.querySelector('#retentionFeedback');
    const say = (message) => {
        if (!feedback) return;
        feedback.textContent = message;
        setTimeout(() => { if (feedback.textContent === message) feedback.textContent = ''; }, FEEDBACK_MS);
    };

    container.querySelector('#shareListBtn')?.addEventListener('click', async () => {
        const text = buildShareText(personResults);
        if (!text) return;
        if (navigator.share) {
            try { await navigator.share({ title: 'Mes idées cadeaux OFFREZ', text }); } catch { /* partage annulé */ }
            return;
        }
        try {
            await navigator.clipboard.writeText(text);
            say('Liste copiée !');
        } catch {
            say('Copie impossible sur ce navigateur.');
        }
    });

    container.querySelector('#reminderForm')?.addEventListener('submit', (event) => {
        event.preventDefault();
        const input = /** @type {HTMLInputElement|null} */ (container.querySelector('#reminderDate'));
        const date = parseInputDate(input?.value);
        input?.setAttribute('aria-invalid', String(!date));
        if (!date) {
            say('Choisissez une date valide.');
            input?.focus();
            return;
        }
        downloadIcs(buildIcs({ date, occasion }));
        say('Rappel téléchargé : ouvrez le fichier pour l\'ajouter à votre agenda.');
    });
}
