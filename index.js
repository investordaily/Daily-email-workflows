
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

const SMALL_CAP_RANGE = { min: 50_000_000, max: 2_000_000_000 };
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
      console.warn(`Failed parse feed ${feed}: ${err.message}`);
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
    console.warn(`Fetch failed for isLikelyPaywalled: ${err.message}`);
    return true;
  }
}

async function fetchArticleText(url) {
  try {
    const r = await axios.get(url, { timeout: 12000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(r.data);
    let paragraphs = $('article p').map((i, el) => $(el).text()).get();
    if (paragraphs.length === 0) paragraphs = $('p').map((i, el) => $(el).text()).get();
    const text = paragraphs.join('\n\n').replace(/\s+/g, ' ').trim();
    return text;
  } catch (err) {
    console.warn(`Failed fetchArticleText ${url}: ${err.message}`);
    return '';
  }
}

function firstNWords(text, n) {
  if (!text) return '';
  const words = text.split(/\s+/).filter(Boolean);
  return words.slice(0, n).join(' ');
}

async function yahooSearch(query) {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=6&newsCount=0`;
    const r = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (r.data && r.data.quotes) return r.data.quotes;
  } catch (err) {
    // ignore
  }
  return [];
}

async function fetchQuote(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
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

function shuffleArray(arr) {
  return arr.sort(() => Math.random() - 0.5);
}

function buildEmailHtml(dateISO, picks, articles) {
  const dateStr = DateTime.fromISO(dateISO).toLocaleString(DateTime.DATE_FULL);
  const logo = 'https://drive.google.com/uc?export=view&id=1YZ-Po3PWd2T3HW-Xl71DderctGs3LVYm';
  const brandColor = '#355E3B';

  const companyLinksHtml = picks
  .filter(p => !/(ETF|Fund|Trust|Index)/i.test(p.name)) // exclude funds/ETFs
  .slice(0, 5)
  .map((p, idx) => {
    const displayName = p.fullName || p.name || p.ticker;
    return `<div style="margin-bottom: 8px;">
      <a href="${p.link || '#'}" 
         style="color: ${brandColor}; text-decoration: none; font-weight: 600;">
         ${idx + 1}. ${displayName}${p.ticker ? ' (' + p.ticker + ')' : ''}
      </a>
    </div>`;
  })
  .join('');


  const articlesHtml = articles.map(a => {
    const excerpt = escapeHtml(a.excerpt || '').replace(/\n/g,' ');
    return `<li style="margin-bottom: 12px; line-height: 1.6;"><a href="${a.link}" style="color: ${brandColor}; text-decoration: none; font-weight: 600;">${escapeHtml(a.title)}</a> — <em style="color: #666;">${escapeHtml(a.source)}</em><div style="margin-top: 6px; color: #555; font-size: 13px;">${excerpt}</div></li>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="ie=edge" />
  <title>AI Investor Daily</title>
  <style type="text/css">
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: #f6f7f9;
      color: #111;
      line-height: 1.6;
    }
    .wrapper {
      width: 100%;
      max-width: 680px;
      margin: 0 auto;
      background-color: #fff;
      padding: 20px;
      box-sizing: border-box;
    }
    .header {
      display: block;
      padding-bottom: 16px;
      border-bottom: 1px solid #ececec;
      margin-bottom: 16px;
    }
    .logo {
      width: 208px;
      height: auto;
      display: block;
      margin-bottom: 12px;
    }
    .header h1 {
      margin: 0;
      font-size: 20px;
      color: #233728;
    }
    .header-subtitle {
      color: #666;
      font-size: 13px;
      margin: 4px 0 0 0;
    }
    .section {
      padding: 16px 0;
      border-bottom: 1px solid #f0f0f0;
    }
    .lead {
      margin: 10px 0 18px 0;
      color: #555;
      font-size: 14px;
    }
    .articles-list {
      margin: 12px 0;
      padding-left: 20px;
    }
    .footer {
      font-size: 12px;
      color: #888;
      padding-top: 14px;
      border-top: 1px solid #f0f0f0;
      margin-top: 16px;
    }
    .footer p {
      margin: 6px 0;
    }
    @media (max-width: 480px) {
      .wrapper {
        padding: 10px !important;
      }
      .header h1 {
        font-size: 18px;
      }
      .logo {
        width: 130px;
      }
    }
  </style>
</head>
<body>
  <center style="padding: 20px;">
    <div class="wrapper" role="article">
      <div class="header">
        <img src="${logo}" alt="AI Investor Daily logo" class="logo" />
        <h1>AI Investor Daily</h1>
        <div class="header-subtitle">${dateStr} • Curated AI investing picks & news</div>
      </div>
      <div class="section">
        <p class="lead">Today's top 5 AI investment picks + Today's top AI news.</p>
      </div>
      <div id="top-picks" class="section">
        <h2 style="font-size: 18px; margin: 0 0 10px 0; color: #233728;">Top 5 AI Investment Picks</h2>
        <div style="margin-bottom: 16px; padding: 12px; background: #f5f5f5; border-radius: 6px;">
          ${companyLinksHtml}
        </div>
        <strong>Disclaimer:</strong> Informational only — not investment advice.</p>
      </div>
      <div id="articles" class="section">
        <h2 style="font-size: 18px; margin: 0 0 10px 0; color: #233728;">Today's Top AI News</h2>
        <ol class="articles-list">
          ${articlesHtml}
        </ol>
      </div>
      <div class="footer">
        <p>You received this email because you subscribed to <a href="https://aiinvestordaily.com" style="color: ${brandColor}; text-decoration: none; font-weight: 600;">AI Investor Daily</a> — curated AI investing insights.</p>
        <p><a href="https://docs.google.com/forms/d/e/1FAIpQLSf3QdhPKrODDE1Fxghw8I9jH8lzjh1zGqYvuXDF7GNv2i4o5w/viewform?usp=pp_url&entry.638716b0={EMAIL}" style="color: ${brandColor}; text-decoration: none;">Unsubscribe</a></p>
      </div>
    </div>
  </center>
</body>
</html>`;
}

function escapeHtml(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

(async () => {
  console.log('Starting AI Investor Daily run');
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const feedItems = await fetchRSSItems();
  console.log(`Fetched ${feedItems.length} feed items.`);

  const candidates = feedItems.filter(it => matchesKeywords(it.title) || matchesKeywords(it.source));
  console.log(`Keyword-filtered to ${candidates.length} items.`);

  const freeArticles = [];
  for (const it of candidates) {
    if (!it.link) continue;
    if (freeArticles.find(a => a.link === it.link)) continue;
    await new Promise(r => setTimeout(r, 400));
    const paywalled = await isLikelyPaywalled(it.link);
    if (!paywalled) {
      const text = await fetchArticleText(it.link);
      const excerpt = firstNWords(text, 100);
      freeArticles.push({ title: it.title, link: it.link, pubDate: it.pubDate, source: it.source, text, excerpt });
      console.log('Added free article:', it.title);
    } else {
      console.log('Skipped (likely paywalled):', it.title);
    }
    if (freeArticles.length >= MAX_ARTICLES) break;
  }

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

  const sortedOrgs = Object.entries(orgCounts).sort((a,b) => b[1]-a[1]).map(t => t[0]).slice(0, 50);

  const tickerMap = {};
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
  name: quote.shortName || r.shortname || orgName,
  fullName: quote.longName || quote.shortName || r.shortname || orgName,
  marketCap: quote.marketCap || null,
  summary: quote.longBusinessSummary || '',
};

        }
      }
    }
    if (Object.keys(tickerMap).length >= 40) break;
  }

  const tickers = Object.values(tickerMap);
  tickers.sort((a,b) => (b.marketCap||0) - (a.marketCap||0));

  const picks = [];
  const allAnchorSymbols = ['NVDA','MSFT','GOOGL','AMD','INTC','QCOM','META','TSLA','AMZN','NFLX','AAPL'];
  const anchorSymbols = shuffleArray([...allAnchorSymbols]).slice(0, 2);

  for (const s of anchorSymbols) {
    const f = tickers.find(t => t.symbol === s);
    if (f && picks.length < 5 && !picks.find(p=>p.ticker===f.symbol)) {
      picks.push({ name: f.name, ticker: f.symbol, marketCap: f.marketCap, reason: 'Large-cap AI/tech exposure', link: `https://finance.yahoo.com/quote/${f.symbol}` });
    }
  }

  const smalls = tickers.filter(t => t.marketCap && t.marketCap >= SMALL_CAP_RANGE.min && t.marketCap <= SMALL_CAP_RANGE.max).slice(0, DESIRED_SMALL_CAP_COUNT);
  for (const s of smalls) {
    if (!picks.find(p => p.ticker === s.symbol)) {
      picks.push({ name: s.name, ticker: s.symbol, marketCap: s.marketCap, reason: 'Small-cap AI opportunity (news mentions & NER)', link: `https://finance.yahoo.com/quote/${s.symbol}` });
    }
    if (picks.length >= 5) break;
  }

  if (picks.length < 5) {
  for (const t of tickers) {
    if (picks.length >= 5) break;
    if (!picks.find(p => p.ticker === t.symbol) && !/(ETF|Fund|Trust|Index)/i.test(t.name)) {
      picks.push({
        name: t.name,
        fullName: t.fullName,
        ticker: t.symbol,
        marketCap: t.marketCap,
        reason: 'AI-related mention & market cap',
        link: `https://finance.yahoo.com/quote/${t.symbol}`
      });
    }
  }
}


  if (picks.length < 5) {
    const allFallback = ['NVDA','MSFT','GOOGL','AMD','BOTZ','QQQ','ARKF','ROBO','XLK','IVW'];
    const fallback = shuffleArray([...allFallback]).slice(0, 5);
    for (const sym of fallback) {
      if (picks.length >= 5) break;
      if (!picks.find(p=>p.ticker===sym)) {
        picks.push({ name: sym, ticker: sym, marketCap: null, reason: 'Popular AI/Tech ETF', link: `https://finance.yahoo.com/quote/${sym}` });
      }
    }
  }

  const today = DateTime.now().toISODate();
  const html = buildEmailHtml(today, picks, freeArticles.slice(0, MAX_ARTICLES).map(a => ({ title: a.title, link: a.link, source: a.source, excerpt: a.excerpt })));
  const outFile = path.join(OUTPUT_DIR, `daily-email-${today}.html`);
  fs.writeFileSync(outFile, html, 'utf8');
  console.log(`Wrote ${outFile}`);
  console.log(`Built ${picks.length} picks for email`);
  process.exit(0);
})();
