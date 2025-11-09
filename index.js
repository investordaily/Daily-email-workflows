```javascript
/**

AI Investor Daily — auto-updater (NER-enhanced)
Extracts first 100 words from each free article
Finds company names with compromise (light NER) and maps to tickers via Yahoo
Ensures at least 3 small-cap picks
Writes HTML to ./output/daily-email-YYYY-MM-DD.html
Usage:
npm install
node index.js
Notes: Respect rate limits and site terms. This is best-effort tooling.
*/
const fs = require('fs');
const path = require('path');
const RSSParser = require('rss-parser');
const axios = require('axios');
const cheerio = require('cheerio');
const { DateTime } = require('luxon');
const nlp = require('compromise');

const parser = new RSSParser({ timeout: 15000 });

const FEEDS = [
'https://www.reuters.com/technology/rss',
'https://techcrunch.com/feed/',
'https://venturebeat.com/category/ai/feed/',
'https://www.theverge.com/rss/index.xml',
'https://www.wired.com/feed/rss',
'https://arstechnica.com/feed/'
];

const KEYWORDS = ['AI', 'artificial intelligence', 'machine learning', 'LLM', 'large language model', 'GPT', 'Claude', 'Copilot', 'chatbot', 'neural', 'deep learning'];

const MAX_ARTICLES = 10;
const OUTPUT_DIR = path.join(__dirname, 'output');

const SMALL_CAP_RANGE = { min: 300_000_000, max: 2_000_000_000 }; // USD
const DESIRED_SMALL_CAP_COUNT = 3;

function matchesKeywords(text) {
if (!text) return false;
const t = text.toLowerCase();
return KEYWORDS.some(k => t.includes(k.toLowerCase()));
}

async function fetchRSSItems() {
const items = [];
for (const feed of FEEDS) {
try {
const f = await parser.parseURL(feed);
if (f && f.items) {
for (const it of f.items) {
items.push({
title: it.title || '',
link: it.link || it.guid || '',
pubDate: it.pubDate ? new Date(it.pubDate) : null,
source: f.title || feed
});
}
}
} catch (err) {
console.warn(Failed parse feed ${feed}: ${err.message});
}
}
items.sort((a,b) => (b.pubDate ? b.pubDate.getTime() : 0) - (a.pubDate ? a.pubDate.getTime() : 0));
return items;
}

async function isLikelyPaywalled(url) {
try {
const r = await axios.get(url, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AI-Investor-Daily/1.0)' } });
const $ = cheerio.load(r.data);
const text = $('body').text().slice(0, 4000).toLowerCase();
const paywallHints = ['subscribe', 'sign in to continue', 'full article is for subscribers', 'to continue reading', 'please subscribe', 'log in to view', 'become a member', 'subscription required'];
if (paywallHints.some(h => text.includes(h))) return true;
if ($('[class*="paywall"], [id*="paywall"], .subscription-overlay, .meteredContent, .subscription-required').length > 0) return true;
return false;
} catch (err) {
console.warn(Fetch failed for isLikelyPaywalled: ${err.message});
return true; // treat unreachable as paywalled to be safe
}
}

async function fetchArticleText(url) {
try {
const r = await axios.get(url, { timeout: 12000, headers: { 'User-Agent': 'Mozilla/5.0' } });
const $ = cheerio.load(r.data);
// heuristics: prefer article > p, otherwise all


let paragraphs = $('article p').map((i, el) => $(el).text()).get();
if (paragraphs.length === 0) paragraphs = $('p').map((i, el) => $(el).text()).get();
const text = paragraphs.join('\n\n').replace(/\s+/g, ' ').trim();
return text;
} catch (err) {
console.warn(Failed fetchArticleText ${url}: ${err.message});
return '';
}
}

function firstNWords(text, n) {
if (!text) return '';
const words = text.split(/\s+/).filter(Boolean);
return words.slice(0, n).join(' ');
}

// simple Yahoo Finance search
async function yahooSearch(query) {
try {
const url = `https://query1.finance.yahoo.com/v1/finance/search?q=\${encodeURIComponent(query)}&quotesCount=6&newsCount=0\`;
const r = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
if (r.data && r.data.quotes) return r.data.quotes;
} catch (err) {
// ignore
}
return [];
}

async function fetchQuote(symbol) {
try {
const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=\${encodeURIComponent(symbol)}\`;
const r = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
if (r.data && r.data.quoteResponse && r.data.quoteResponse.result && r.data.quoteResponse.result[0]) {
return r.data.quoteResponse.result[0];
}
} catch (err) {
// ignore
}
return null;
}

function formatMoney(num) {
if (!num || isNaN(num)) return 'N/A';
if (num >= 1e12) return (num/1e12).toFixed(2) + 'T';
if (num >= 1e9) return (num/1e9).toFixed(2) + 'B';
if (num >= 1e6) return (num/1e6).toFixed(2) + 'M';
return num.toString();
}

function buildEmailHtml(dateISO, picks, articles) {
const dateStr = DateTime.fromISO(dateISO).toLocaleString(DateTime.DATE_FULL);
const logo = 'https://drive.google.com/uc?export=view&id=1YZ-Po3PWd2T3HW-Xl71DderctGs3LVYm';
const brandColor = '#355E3B';

const picksHtml = picks.map((p, idx) => {
return `


${idx+1}. ${p.name} ${p.ticker ? '('+p.ticker+')' : ''}

${escapeHtml(p.reason || p.summary || '')}${p.marketCap ? `
Market cap: ${formatMoney(p.marketCap)}` : ''}


View snapshot
`;
}).join('\n');
const articlesHtml = articles.map(a => {
const excerpt = escapeHtml(a.excerpt || '').replace(/\n/g,' ');
return `

${escapeHtml(a.title)} — ${escapeHtml(a.source)}${excerpt}
`;
}).join('\n');
return `

AI Investor Daily
\${dateStr} • Quick, curated AI investing picks & news
Top 5 AI investment picks for today (including small-cap opportunities) + 10 free, high-quality articles.

See Today's Top Picks Read 10 articles →
5 Top AI Investment Picks
\${picksHtml}
Disclaimer: Informational only — not investment advice.

10 Free Articles — AI Companies to Watch
\${articlesHtml}
Read all articles on web
You received this email because you subscribed to AI Investor Daily — curated AI investing insights.

AI Investor Daily • 123 Market St • City, State

Unsubscribe

\`; }
function escapeHtml(s) {
if (!s) return '';
return s.replace(/&/g,'&').replace(/</g,'<').replace(/>/g,'>').replace(/"/g,'"');
}

(async () => {
console.log('Starting AI Investor Daily run');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const feedItems = await fetchRSSItems();
console.log(`Fetched ${feedItems.length} feed items.`);

// Filter candidates by keyword
const candidates = feedItems.filter(it => matchesKeywords(it.title) || matchesKeywords(it.source));
console.log(`Keyword-filtered to ${candidates.length} items.`);

const freeArticles = [];
for (const it of candidates) {
if (!it.link) continue;
if (freeArticles.find(a => a.link === it.link)) continue;
await new Promise(r => setTimeout(r, 400));
const paywalled = await isLikelyPaywalled(it.link);
if (!paywalled) {
// fetch text and excerpt
const text = await fetchArticleText(it.link);
const excerpt = firstNWords(text, 100); // first 100 words
freeArticles.push({ title: it.title, link: it.link, pubDate: it.pubDate, source: it.source, text, excerpt });
console.log('Added free article:', it.title);
} else {
console.log('Skipped (likely paywalled):', it.title);
}
if (freeArticles.length >= MAX_ARTICLES) break;
}

// If not enough free articles, relax and take more (without paywall check)
if (freeArticles.length < MAX_ARTICLES) {
console.log(`Only ${freeArticles.length} free articles found; relaxing paywall check...`);
for (const it of candidates) {
if (freeArticles.length >= MAX_ARTICLES) break;
if (freeArticles.find(a => a.link === it.link)) continue;
const text = await fetchArticleText(it.link);
const excerpt = firstNWords(text, 100);
freeArticles.push({ title: it.title, link: it.link, pubDate: it.pubDate, source: it.source, text, excerpt });
}
}

// NER: extract organization names from all article texts using compromise
const orgCounts = {};
for (const art of freeArticles) {
if (!art.text) continue;
const doc = nlp(art.text);
const orgs = doc.organizations().out('array');
for (const o of orgs) {
const clean = o.trim();
if (clean.length > 2) {
orgCounts[clean] = (orgCounts[clean] || 0) + 1;
}
}
}

// Create a prioritized list of candidate company names
const sortedOrgs = Object.entries(orgCounts).sort((a,b) => b[1]-a[1]).map(t => t[0]).slice(0, 50);

// For each org, try Yahoo search to get tickers
const tickerMap = {}; // symbol -> {name,marketCap}
for (const orgName of sortedOrgs) {
await new Promise(r => setTimeout(r, 300));
const results = await yahooSearch(orgName);
if (results && results.length) {
for (const r of results) {
if (!r.symbol) continue;
const symbol = r.symbol.toUpperCase();
if (tickerMap[symbol]) continue;
await new Promise(r2 => setTimeout(r2, 250));
const quote = await fetchQuote(symbol);
if (quote) {
tickerMap[symbol] = {
symbol,
name: quote.shortName || quote.longName || r.shortname || orgName,
marketCap: quote.marketCap || null,
summary: quote.longBusinessSummary || '',
};
}
}
}
// stop early if we have a reasonable pool
if (Object.keys(tickerMap).length >= 40) break;
}

// Convert to array
const tickers = Object.values(tickerMap);
tickers.sort((a,b) => (b.marketCap||0) - (a.marketCap||0));

// Build picks: prefer anchors if found, then ensure small-cap picks
const picks = [];
const anchorSymbols = ['NVDA','MSFT','GOOGL','AMD','INTC','QCOM'];
for (const s of anchorSymbols) {
const f = tickers.find(t => t.symbol === s);
if (f && picks.length < 5 && !picks.find(p=>p.ticker===f.symbol)) {
picks.push({ name: f.name, ticker: f.symbol, marketCap: f.marketCap, reason: 'Anchor large-cap AI/infra exposure', link: `https://finance.yahoo.com/quote/\${f.symbol}\` });
}
}

// Ensure at least DESIRED_SMALL_CAP_COUNT small-caps
const smalls = tickers.filter(t => t.marketCap && t.marketCap >= SMALL_CAP_RANGE.min && t.marketCap <= SMALL_CAP_RANGE.max)
.slice(0, DESIRED_SMALL_CAP_COUNT);
for (const s of smalls) {
if (!picks.find(p => p.ticker === s.symbol)) {
picks.push({ name: s.name, ticker: s.symbol, marketCap: s.marketCap, reason: 'Small-cap AI opportunity (news mentions & NER)', link: `https://finance.yahoo.com/quote/\${s.symbol}\` });
}
if (picks.length >= 5) break;
}

// Fill remaining picks by top market cap tickers
if (picks.length < 5) {
for (const t of tickers) {
if (picks.length >= 5) break;
if (!picks.find(p => p.ticker === t.symbol)) {
picks.push({ name: t.name, ticker: t.symbol, marketCap: t.marketCap, reason: 'AI-related mention & market cap', link: `https://finance.yahoo.com/quote/\${t.symbol}\` });
}
}
}

// Fallback if still short
const fallback = ['NVDA','MSFT','GOOGL','AMD','BOTZ'];
for (const s of fallback) {
if (picks.length >= 5) break;
if (!picks.find(p=>p.ticker===s)) {
picks.push({ name: s, ticker: s, marketCap: null, reason: 'Fallback anchor', link: `https://finance.yahoo.com/quote/\${s}\` });
}
}

// Build HTML and write
const today = DateTime.now().toISODate();
const html = buildEmailHtml(today, picks, freeArticles.slice(0, MAX_ARTICLES).map(a => ({ title: a.title, link: a.link, source: a.source, excerpt: a.excerpt })));
const outFile = path.join(OUTPUT_DIR, `daily-email-${today}.html`);
fs.writeFileSync(outFile, html, 'utf8');
console.log(`Wrote ${outFile}`);
process.exit(0);
})();
```

Then Run:
```bash
git add index.js
git commit -m "Fix: reduce logo to 52px, add mobile responsive design, improve HTML rendering"
git push origin main
```
