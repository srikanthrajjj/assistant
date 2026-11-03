import dns from 'node:dns/promises';
import net from 'node:net';

// ---- SSRF guard: never let the model fetch internal addresses ----
const isPrivate = (ip) => {
  if (net.isIPv6(ip)) return ip === '::1' || /^(fc|fd|fe80)/i.test(ip) || ip.startsWith('::ffff:') && isPrivate(ip.slice(7));
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
};
export async function assertPublic(urlStr) {
  const u = new URL(urlStr);
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('only http(s) allowed');
  const ips = net.isIP(u.hostname) ? [u.hostname] : (await dns.lookup(u.hostname, { all: true })).map(a => a.address);
  if (!ips.length || ips.some(isPrivate)) throw new Error('blocked: non-public address');
  return u;
}

export function htmlToText(html) {
  return html.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}

export async function fetchUrl(urlStr, max = 6000) {
  let url = urlStr;
  for (let hop = 0; hop < 4; hop++) {
    const u = await assertPublic(url);
    const r = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; AssistantBot/0.1)' } });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { url = new URL(r.headers.get('location'), u).href; continue; }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const raw = (await r.text()).slice(0, 1_500_000);
    const text = /html/i.test(r.headers.get('content-type') || '') ? htmlToText(raw) : raw;
    return { url: u.href, text: text.slice(0, max), truncated: text.length > max };
  }
  throw new Error('too many redirects');
}

export function parseDuckDuckGo(html) {
  const out = [];
  const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html)) && out.length < 6) {
    let href = m[1].replace(/&amp;/g, '&');
    const q = href.match(/[?&]uddg=([^&]+)/); if (q) href = decodeURIComponent(q[1]);
    if (href.startsWith('//')) href = 'https:' + href;
    out.push({ title: htmlToText(m[2]), url: href, snippet: htmlToText(m[3]) });
  }
  return out;
}

export async function webSearch(query) {
  if (process.env.TAVILY_API_KEY) {   // optional, much more reliable than scraping
    const r = await fetch('https://api.tavily.com/search', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY, query, max_results: 6 }), signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('search HTTP ' + r.status);
    return (await r.json()).results.map(x => ({ title: x.title, url: x.url, snippet: x.content?.slice(0, 300) }));
  }
  const r = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query), { signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; AssistantBot/0.1)' } });
  if (!r.ok) throw new Error('search HTTP ' + r.status);
  const res = parseDuckDuckGo(await r.text());
  if (!res.length) throw new Error('no results parsed (search page format may have changed)');
  return res;
}
