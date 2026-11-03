/*
 * IMAM prayer logic — shared by the Node tests and the browser (served at /lib/prayer.js).
 * Pure functions only: no DOM, no three.js, no network.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ImamPrayer = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RAKAH_COUNTS = Object.freeze({ fajr: 2, dhuhr: 4, asr: 4, maghrib: 3, isha: 4 });
  const STATES = Object.freeze([
    'WAITING', 'QIYAM', 'RUKU', 'ITIDAL', 'SUJUD_1', 'JALSA', 'SUJUD_2',
    'TASHAHHUD_MIDDLE', 'TASHAHHUD_FINAL', 'TASLEEM_RIGHT', 'TASLEEM_LEFT'
  ]);
  const PHRASES = Object.freeze(['TAKBIR', 'SAMI', 'SALAM']);
  const PHRASE_TEXT = Object.freeze({
    TAKBIR: 'الله أكبر',
    SAMI: 'سمع الله لمن حمده',
    SALAM: 'السلام عليكم ورحمة الله'
  });

  function normalizeArabic(value = '') {
    return String(value).normalize('NFD')
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
      .replace(/[إأآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/[.,،؛:!?؟]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Exact (normalized) matches only, so unrelated speech never moves the model.
  const SALAM_FORMS = new Set([
    'السلام عليكم ورحمه الله',
    'السلام عليكم و رحمه الله'
  ]);
  function classifyPhrase(value = '') {
    const text = normalizeArabic(value);
    if (text === 'الله اكبر') return 'TAKBIR';
    if (text === 'سمع الله لمن حمده') return 'SAMI';
    if (SALAM_FORMS.has(text)) return 'SALAM';
    return null;
  }

  function createPrayerState(prayer = 'fajr') {
    if (!RAKAH_COUNTS[prayer]) throw new Error('Unknown prayer');
    return { prayer, rakah: 0, state: 'WAITING', completed: false };
  }

  function transitionPrayer(current, phrase) {
    if (!current || !STATES.includes(current.state) || !PHRASES.includes(phrase) || current.completed) {
      return { ...current, changed: false };
    }
    const next = { ...current, changed: false };
    const total = RAKAH_COUNTS[current.prayer];
    const s = current.state;
    if (s === 'WAITING' && phrase === 'TAKBIR') { next.rakah = 1; next.state = 'QIYAM'; }
    else if (s === 'QIYAM' && phrase === 'TAKBIR') next.state = 'RUKU';
    else if (s === 'RUKU' && phrase === 'SAMI') next.state = 'ITIDAL';
    else if (s === 'ITIDAL' && phrase === 'TAKBIR') next.state = 'SUJUD_1';
    else if (s === 'SUJUD_1' && phrase === 'TAKBIR') next.state = 'JALSA';
    else if (s === 'JALSA' && phrase === 'TAKBIR') next.state = 'SUJUD_2';
    else if (s === 'SUJUD_2' && phrase === 'TAKBIR') {
      if (current.rakah >= total) next.state = 'TASHAHHUD_FINAL';
      else if (current.rakah === 2 && total > 2) next.state = 'TASHAHHUD_MIDDLE';
      else { next.rakah += 1; next.state = 'QIYAM'; }
    } else if (s === 'TASHAHHUD_MIDDLE' && phrase === 'TAKBIR') { next.rakah += 1; next.state = 'QIYAM'; }
    else if (s === 'TASHAHHUD_FINAL' && phrase === 'SALAM') next.state = 'TASLEEM_RIGHT';
    else if (s === 'TASLEEM_RIGHT' && phrase === 'SALAM') { next.state = 'TASLEEM_LEFT'; next.completed = true; }
    next.changed = next.state !== current.state || next.rakah !== current.rakah;
    return next;
  }

  /*
   * Filters raw Deepgram "Results" messages:
   *  - interim (non-final) results are ignored,
   *  - low-confidence results are ignored,
   *  - the same audio segment (start time) is never processed twice,
   *  - the same phrase within `windowMs` is treated as a duplicate.
   */
  function createResultFilter({ minConfidence = 0.72, windowMs = 1400 } = {}) {
    let lastPhrase = null, lastAt = -Infinity;
    const seenSegments = new Set();
    return {
      accept(data, now = Date.now()) {
        if (!data || data.type && data.type !== 'Results') return null;
        if (!data.is_final) return null;
        const alt = data.channel && data.channel.alternatives && data.channel.alternatives[0];
        if (!alt || Number(alt.confidence ?? 0) < minConfidence) return null;
        const phrase = classifyPhrase(alt.transcript);
        if (!phrase) return null;
        if (typeof data.start === 'number') {
          const key = data.start.toFixed(2) + ':' + phrase;
          if (seenSegments.has(key)) return null;
          seenSegments.add(key);
          if (seenSegments.size > 500) seenSegments.clear();
        }
        if (phrase === lastPhrase && now - lastAt < windowMs) return null;
        lastPhrase = phrase; lastAt = now;
        return phrase;
      },
      reset() { lastPhrase = null; lastAt = -Infinity; seenSegments.clear(); }
    };
  }

  return { RAKAH_COUNTS, STATES, PHRASES, PHRASE_TEXT, normalizeArabic, classifyPhrase, createPrayerState, transitionPrayer, createResultFilter };
});
