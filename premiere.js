import { sb } from './app-core.js';

/* site-wide banner for the next Séance premiere. it reads seance_sittings rows
   that have a premiere_at, shows from 72 hours before until 3 hours after, and
   links to the card on the Séance page (which embeds YouTube's own premiere
   room). nothing shows when no premiere is scheduled. */
try {
  const since = new Date(Date.now() - 3 * 3600e3).toISOString();
  const { data } = await sb.from('seance_sittings').select('guest,premiere_at')
    .eq('status', 'published').gte('premiere_at', since).order('premiere_at').limit(1);
  const r = data && data[0];
  const at = r && new Date(r.premiere_at);
  if (r && at.getTime() - Date.now() < 72 * 3600e3 && !sessionStorage.getItem('hm_prem_x_' + r.premiere_at)) {
    const here = new URL('./seance.html#premiere', import.meta.url).href;
    const el = document.createElement('div');
    el.id = 'hmPrem';
    el.style.cssText = 'position:relative;z-index:1200;background:#b3121b;color:#fff;font:600 13.5px/1.35 Helvetica,Arial,sans-serif;text-align:center;padding:8px 36px';
    const live = () => Date.now() >= at.getTime();
    const when = at.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' });
    const paint = () => {
      el.innerHTML = (live() ? '\u{1F534} LIVE NOW: ' : '\u{1F56F} THE SÉANCE PREMIERE \u00b7 ' + when + ' PT \u00b7 ')
        + r.guest.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + ' <a href="' + here + '" style="color:#fff;text-decoration:underline;margin-left:6px">'
        + (live() ? 'Watch now' : 'Watch it live') + '</a>'
        + '<button aria-label="Close" style="position:absolute;right:8px;top:4px;background:none;border:0;color:#fff;font-size:18px;cursor:pointer">\u00d7</button>';
      el.querySelector('button').onclick = () => { try { sessionStorage.setItem('hm_prem_x_' + r.premiere_at, '1'); } catch (_) {} el.remove(); };
    };
    paint(); setInterval(paint, 60e3);
    document.body.prepend(el);
  }
} catch (_) { /* a banner must never break a page */ }
