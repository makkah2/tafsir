#!/usr/bin/env node
/*
 * استخراج «من فوائد الآيات» من «المختصر في تفسير القرآن الكريم» على QuranEnc.com
 * ---------------------------------------------------------------------------
 * - النص يُحفظ حرفياً كما في المصدر، دون أي تعديل أو إضافة أو حذف (شرط QuranEnc).
 * - طلب واحد لكل صفحة مصحف (604)، طلب واحد في كل مرة، مع تأخير ثانية بين الطلبات.
 * - يستخدم صفحات /ar/browse/ المسموحة في robots.txt (لا يستخدم /ajax المحجوب).
 * - الناتج: data/fawaid.json
 *
 * التشغيل (Node.js 18 أو أحدث):   node scripts/extract-fawaid.js
 */
const fs = require('fs');
const path = require('path');

const UA = 'TadabburApp-FawaidExtractor/1.0 (+https://github.com/makkah2/tafsir)';
const DELAY_MS = 1000;
const KEY = 'arabic_mokhtasar';
const OUT = path.join(__dirname, '..', 'data', 'fawaid.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url, json = false, tries = 4) {
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ar' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return json ? await r.json() : await r.text();
    } catch (e) {
      if (i === tries) throw new Error(`${url}: ${e.message}`);
      await sleep(DELAY_MS * 3 * i);
    }
  }
}

// فك ترميز كيانات HTML فقط (لا يغيّر النص نفسه)
const decode = s => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&nbsp;/g, '\u00A0').replace(/&amp;/g, '&');

// يعيد عناصر «من فوائد الآيات في هذه الصفحة» من صفحة HTML
function extract(html) {
  const head = html.indexOf('من فوائد الآيات');
  if (head < 0) return null;
  // حدود الصندوق: أقرب <div class="alert ..."> قبل العنوان، ثم نتتبع عمق الوسوم حتى يُغلق
  const start = html.lastIndexOf('<div class="alert', head);
  let depth = 0, end = -1;
  const tag = /<(\/?)div\b[^>]*>/g; tag.lastIndex = start;
  let m;
  while ((m = tag.exec(html))) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) { end = tag.lastIndex; break; }
  }
  const box = html.slice(start, end > 0 ? end : head + 30000);
  return [...box.matchAll(/<span>\s*•\s*([\s\S]*?)\s*<\/span>/g)].map(x => decode(x[1]).trim()).filter(Boolean);
}

(async () => {
  console.log('جلب رقم الإصدار وخريطة الآيات...');
  const ver = await get(`https://quranenc.com/api/v1/translations/updates?key=${KEY}`, true);
  const quran = await get('https://api.alquran.cloud/v1/quran/quran-simple-clean', true);

  const ayahToPage = {}, firstAyahOfPage = {};
  for (const s of quran.data.surahs) for (const a of s.ayahs) {
    ayahToPage[`${s.number}:${a.numberInSurah}`] = a.page;
    if (!firstAyahOfPage[a.page]) firstAyahOfPage[a.page] = `${s.number}/${a.numberInSurah}`;
  }
  const pageNums = Object.keys(firstAyahOfPage).map(Number).sort((a, b) => a - b);
  if (pageNums.length !== 604) throw new Error('عدد صفحات غير متوقع: ' + pageNums.length);

  const pages = {}, missing = [];
  for (const p of pageNums) {
    const url = `https://quranenc.com/ar/browse/${KEY}/${firstAyahOfPage[p]}`;
    const items = extract(await get(url));
    if (!items || !items.length) missing.push(p);
    pages[p] = items || [];
    if (p % 25 === 0) console.log(`صفحة ${p}/604`);
    await sleep(DELAY_MS);
  }

  const out = {
    pages,
    ayahToPage,
    source: 'المختصر في تفسير القرآن الكريم — مركز تفسير للدراسات القرآنية — QuranEnc.com',
    sourceUrl: `https://quranenc.com/ar/browse/${KEY}`,
    version: ver.version,
    extracted: new Date().toISOString().slice(0, 10),
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`تم: ${pageNums.length} صفحة، ${Object.values(pages).reduce((n, x) => n + x.length, 0)} فائدة، الإصدار ${ver.version}`);
  if (missing.length) console.log('صفحات بلا فوائد:', missing.join(', '));
})().catch(e => { console.error(e); process.exit(1); });
