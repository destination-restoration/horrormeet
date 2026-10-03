import { sb } from './app-core.js';

/* first-party page counter. one row per page view: the path, the campaign tag
   (?ref= on QR codes, posts, podcast links), the referring site's host, and a
   per-tab random id so visits can be told apart from views. no IPs, no user
   agents, no user ids, no cookies. the first tag a visitor ever arrived with is
   kept so join.html can stamp it onto the account: that is how we learn which
   channel actually produces members, not just visits. */
try {
  const q = new URLSearchParams(location.search);
  const tag = (q.get('ref') || q.get('utm_source') || '').toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 80);
  let host = '';
  try { host = document.referrer ? new URL(document.referrer).hostname : ''; } catch (_) {}
  if (host === location.hostname) host = '';

  try {
    if (!localStorage.getItem('hm_ref') && (tag || host)) {
      localStorage.setItem('hm_ref', JSON.stringify({
        ref: tag || ('web:' + host.replace(/^www\./, '')).slice(0, 80),
        landing: location.pathname.slice(0, 120),
      }));
    }
  } catch (_) {}

  let sid = '';
  try {
    sid = sessionStorage.getItem('hm_sid') || '';
    if (!sid) { sid = Math.random().toString(36).slice(2, 12); sessionStorage.setItem('hm_sid', sid); }
  } catch (_) {}

  const { data } = await sb.auth.getSession();
  await sb.from('page_views').insert({
    path: (location.pathname + (location.hash || '')).slice(0, 200),
    ref: tag || null,
    referrer_host: host ? host.slice(0, 120) : null,
    sid: sid || null,
    member: !!(data && data.session),
  });
} catch (_) { /* counting must never break a page */ }
