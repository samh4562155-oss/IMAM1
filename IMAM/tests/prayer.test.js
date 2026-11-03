'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeArabic, classifyPhrase, createPrayerState, transitionPrayer } = require('../lib/prayer');

test('Arabic normalization removes tashkeel and normalizes hamza variants', () => {
  assert.equal(normalizeArabic('اللّٰهُ أَكْبَرُ'), 'الله اكبر');
});
test('only the two exact supported phrases are classified', () => {
  assert.equal(classifyPhrase('الله أكبر'), 'TAKBIR');
  assert.equal(classifyPhrase('سَمِعَ اللهُ لِمَنْ حَمِدَه'), 'SAMI');
  assert.equal(classifyPhrase('الله أكبر يا جماعة'), null);
  assert.equal(classifyPhrase('سبحان ربي العظيم'), null);
});
test('normal prayer movement sequence advances in order', () => {
  let s = createPrayerState('fajr');
  for (const phrase of ['TAKBIR','TAKBIR','SAMI','TAKBIR','TAKBIR','TAKBIR']) s = transitionPrayer(s, phrase);
  assert.equal(s.state, 'SUJUD_2');
  s = transitionPrayer(s, 'TAKBIR');
  assert.equal(s.state, 'QIYAM');
  assert.equal(s.rakah, 2);
});
test('four-rakah prayer reaches middle tashahhud after second rakah', () => {
  let s = createPrayerState('dhuhr');
  const cycle = () => { for (const p of ['TAKBIR','SAMI','TAKBIR','TAKBIR','TAKBIR','TAKBIR']) s = transitionPrayer(s,p); };
  s = transitionPrayer(s, 'TAKBIR'); cycle(); cycle();
  assert.equal(s.state, 'TASHAHHUD_MIDDLE');
  assert.equal(s.rakah, 2);
});
test('final tashahhud is not represented as prayer completion', () => {
  let s = createPrayerState('fajr');
  s = transitionPrayer(s, 'TAKBIR');
  const cycle = () => { for (const p of ['TAKBIR','SAMI','TAKBIR','TAKBIR','TAKBIR','TAKBIR']) s = transitionPrayer(s,p); };
  cycle(); cycle();
  assert.equal(s.state, 'TASHAHHUD_FINAL');
  assert.notEqual(s.state, 'COMPLETED');
});
test('unrelated phrase and invalid transition do not change state', () => {
  const s = createPrayerState('asr');
  assert.equal(classifyPhrase('الحمد لله'), null);
  assert.deepEqual(transitionPrayer(s, 'SAMI'), { ...s, changed: false });
});

const { createResultFilter } = require('../lib/prayer');
const CYCLE = ['TAKBIR','SAMI','TAKBIR','TAKBIR','TAKBIR','TAKBIR'];
function toFinalTashahhud(prayer) {
  let s = createPrayerState(prayer);
  s = transitionPrayer(s, 'TAKBIR');
  for (let r = 0; r < require('../lib/prayer').RAKAH_COUNTS[prayer]; r++) {
    for (const p of ['TAKBIR', ...CYCLE.slice(1)]) s = transitionPrayer(s, p);
    if (s.state === 'TASHAHHUD_MIDDLE') s = transitionPrayer(s, 'TAKBIR');
  }
  return s;
}
test('salam phrase is classified, including taa marbuta and tashkeel variants', () => {
  assert.equal(classifyPhrase('السلام عليكم ورحمة الله'), 'SALAM');
  assert.equal(classifyPhrase('السَّلَامُ عَلَيْكُمْ وَرَحْمَةُ اللهِ'), 'SALAM');
  assert.equal(classifyPhrase('السلام عليكم'), null);
  assert.equal(classifyPhrase('السلام عليكم ورحمة الله يا أخي'), null);
});
for (const prayer of ['fajr','maghrib','dhuhr']) {
  test(`${prayer}: reaches final tashahhud, then exactly two tasleems complete the prayer`, () => {
    let s = toFinalTashahhud(prayer);
    assert.equal(s.state, 'TASHAHHUD_FINAL');
    assert.equal(s.completed, false);
    s = transitionPrayer(s, 'SALAM');
    assert.equal(s.state, 'TASLEEM_RIGHT');
    assert.equal(s.completed, false);
    s = transitionPrayer(s, 'SALAM');
    assert.equal(s.state, 'TASLEEM_LEFT');
    assert.equal(s.completed, true);
  });
}
test('after completion nothing restarts the prayer or asks for a third tasleem', () => {
  let s = toFinalTashahhud('fajr');
  s = transitionPrayer(transitionPrayer(s, 'SALAM'), 'SALAM');
  for (const p of ['SALAM','TAKBIR','SAMI']) {
    const n = transitionPrayer(s, p);
    assert.equal(n.changed, false);
    assert.equal(n.state, 'TASLEEM_LEFT');
    assert.equal(n.rakah, s.rakah);
  }
});
test('salam cannot finish the prayer early', () => {
  let s = createPrayerState('fajr');
  s = transitionPrayer(s, 'TAKBIR');
  assert.equal(transitionPrayer(s, 'SALAM').changed, false);
  let m = createPrayerState('dhuhr'); m = transitionPrayer(m, 'TAKBIR');
  for (let i = 0; i < 2; i++) for (const p of CYCLE) m = transitionPrayer(m, p);
  assert.equal(m.state, 'TASHAHHUD_MIDDLE');
  assert.equal(transitionPrayer(m, 'SALAM').changed, false);
});
test('stages are never skipped: wrong phrase in a stage does nothing', () => {
  let s = transitionPrayer(createPrayerState('fajr'), 'TAKBIR');
  s = transitionPrayer(s, 'TAKBIR');
  assert.equal(s.state, 'RUKU');
  assert.equal(transitionPrayer(s, 'TAKBIR').changed, false);
});
test('result filter ignores interim, low-confidence, duplicate and unrelated results', () => {
  const f = createResultFilter();
  const msg = (t, extra = {}) => ({ type: 'Results', is_final: true, start: 1, channel: { alternatives: [{ transcript: t, confidence: 0.95 }] }, ...extra });
  assert.equal(f.accept(msg('الله أكبر', { is_final: false }), 0), null);
  assert.equal(f.accept(msg('الله أكبر', { channel: { alternatives: [{ transcript: 'الله أكبر', confidence: 0.4 }] } }), 0), null);
  assert.equal(f.accept(msg('الحمد لله'), 0), null);
  assert.equal(f.accept(msg('الله أكبر'), 1000), 'TAKBIR');
  assert.equal(f.accept(msg('الله أكبر', { start: 1 }), 5000), null, 'same segment twice');
  assert.equal(f.accept(msg('الله أكبر', { start: 2 }), 1500), null, 'within duplicate window');
  assert.equal(f.accept(msg('الله أكبر', { start: 6 }), 6000), 'TAKBIR');
  assert.equal(f.accept(msg('السلام عليكم ورحمة الله', { start: 9 }), 9000), 'SALAM');
  assert.equal(f.accept(msg('السلام عليكم ورحمة الله', { start: 12 }), 12000), 'SALAM');
});
