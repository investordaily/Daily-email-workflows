function buildEmailHtml(dateISO, picks, articles) {
  const dateStr = DateTime.fromISO(dateISO).toLocaleString(DateTime.DATE_FULL);
  const logo = 'https://drive.google.com/uc?export=view&id=1YZ-Po3PWd2T3HW-Xl71DderctGs3LVYm';
  const brandColor = '#355E3B';

  // Top 5 companies for grey box
  const topFivePicks = picks.slice(0, 5);
  
  const companyLinksHtml = topFivePicks.map((p, idx) => {
    return `<div style="margin-bottom: 8px;"><a href="${p.link || '#'}" style="color: ${brandColor}; text-decoration: none; font-weight: 600; font-size: 14px;">${idx+1}. ${p.name}${p.ticker ? ' (' + p.ticker + ')' : ''}</a></div>`;
  }).join('');

  // Detailed picks - all of them
  const picksHtml = picks.map((p, idx) => {
    return `<div style="margin-bottom: 16px; padding: 14px; border-left: 4px solid ${brandColor}; background: #f9faf8; border-radius: 8px;">
      <h3 style="margin: 0 0 6px 0; font-size: 16px; color: #2b4b3a;">${idx+1}. ${p.name} ${p.ticker ? '('+p.ticker+')' : ''}</h3>
      <p style="margin: 0 0 8px 0; color: #444; font-size: 14px;">${escapeHtml(p.reason || p.summary || '')}${p.marketCap ? `<br/><strong>Market cap:</strong> ${formatMoney(p.marketCap)}` : ''}</p>
      <a href="${p.link || '#'}" style="display: inline-block; padding: 8px 12px; background: #111; color: #fff; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 600;">View Chart &amp; News</a>
    </div>`;
  }).join('');

  const articlesHtml = articles.map(a => {
    const excerpt = escapeHtml(a.excerpt || '').replace(/\n/g,' ');
    return `<li style="margin-bottom: 12px; line-height: 1.6;"><a href="${a.link}" style="color: ${brandColor}; text-decoration: none; font-weight: 600;">${escapeHtml(a.title)}</a> &mdash; <em style="color: #666;">${escapeHtml(a.source)}</em><div style="margin-top: 6px; color: #555; font-size: 13px;">${excerpt}</div></li>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="ie=edge" />
  <title>AI Investor Daily</title>
  <style type="text/css">
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background-color: #f6f7f9; color: #111; }
    .wrapper { width: 100%; max-width: 680px; margin: 0 auto; background-color: #fff; padding: 20px; box-sizing: border-box; }
    .header { padding-bottom: 16px; border-bottom: 1px solid #ececec; margin-bottom: 16px; }
    .logo { width: 173px; height: auto; display: block; margin-bottom: 12px; }
    h1 { margin: 0; font-size: 20px; color: #233728; }
    .subtitle { color: #666; font-size: 13px; margin: 4px 0 0 0; }
    .section { padding: 16px 0; border-bottom: 1px solid #f0f0f0; }
    h2 { font-size: 18px; margin: 0 0 16px 0; color: #233728; }
    .grey-box { margin-bottom: 16px; padding: 14px; background: #f5f5f5; border-radius: 6px; }
    .articles-list { margin: 12px 0; padding-left: 20px; }
    .footer { font-size: 12px; color: #888; padding-top: 14px; border-top: 1px solid #f0f0f0; margin-top: 16px; }
    .footer p { margin: 6px 0; }
    @media (max-width: 480px) {
      .wrapper { padding: 10px !important; }
      h1 { font-size: 18px; }
      .logo { width: 130px; }
    }
  </style>
</head>
<body>
  <center style="padding: 20px;">
    <div class="wrapper">
      <div class="header">
        <img src="${logo}" alt="AI Investor Daily logo" class="logo" />
        <h1>AI Investor Daily</h1>
        <div class="subtitle">${dateStr} • Quick, curated AI investing picks &amp; news</div>
      </div>
      
      <div class="section">
        <p style="margin: 10px 0 18px 0; color: #555; font-size: 14px;">Top 5 AI investment picks for today (including small-cap opportunities) + 10 free, high-quality articles.</p>
      </div>
      
      <div class="section">
        <h2>5 Top AI Investment Picks</h2>
        
        <div class="grey-box">
          ${companyLinksHtml}
        </div>
        
        ${picksHtml}
        
        <p style="margin-top: 8px; font-size: 13px; color: #666;"><strong>Disclaimer:</strong> Informational only — not investment advice.</p>
      </div>
      
      <div class="section">
        <h2>10 Free Articles — AI Companies to Watch</h2>
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
