import { sb } from './app-core.js';

/* the Séance view counter. what filmmakers want to see is how many people
   HorrorMeet sent to their work, so every Séance video counts a person once
   per visit: either when the embedded video starts playing (YouTube's player
   API reports it) or when they click through to watch on YouTube, whichever
   comes first. markup it reads:
     <iframe data-seance="ID" src="...youtube-nocookie.com/embed/VID">
     <a data-seance-yt="ID" href="https://www.youtube.com/watch?v=VID">
     <span data-seance-count="ID"></span>   (filled with the running total) */

const counted = (id) => { try { return sessionStorage.getItem('hm_sv_' + id) === '1'; } catch (_) { return false; } };
const mark = (id) => { try { sessionStorage.setItem('hm_sv_' + id, '1'); } catch (_) {} };

const totals = new Map();
function paint(id) {
  const n = totals.get(id) || 0;
  document.querySelectorAll(`[data-seance-count="${id}"]`).forEach((el) => {
    el.textContent = n
      ? `▶ ${n.toLocaleString('en-US')} ${n === 1 ? 'person' : 'people'} watched from HorrorMeet`
      : '▶ Be the first to watch it from HorrorMeet';
  });
}

function count(id, kind) {
  if (!id || counted(id)) return;
  mark(id);
  totals.set(id, (totals.get(id) || 0) + 1);
  paint(id);
  sb.rpc('count_seance_view', { p_id: id, p_kind: kind }).then(() => {}, () => {});
}

export async function initSeanceCounters(root = document) {
  const ids = [...new Set([...root.querySelectorAll('[data-seance-count],[data-seance]')]
    .map((el) => Number(el.dataset.seanceCount || el.dataset.seance)).filter(Boolean))];
  if (!ids.length) return;

  const { data } = await sb.from('seance_sittings').select('id,plays,yt_clicks').in('id', ids);
  for (const r of data || []) totals.set(r.id, (r.plays || 0) + (r.yt_clicks || 0));
  ids.forEach(paint);

  root.querySelectorAll('[data-seance-yt]').forEach((a) => {
    a.addEventListener('click', () => count(Number(a.dataset.seanceYt), 'youtube'));
  });

  const frames = [...root.querySelectorAll('iframe[data-seance]')];
  if (!frames.length) return;
  frames.forEach((f, i) => {
    if (!f.id) f.id = 'hm-yt-' + f.dataset.seance + '-' + i;
    if (!/enablejsapi=1/.test(f.src)) {
      f.src += (f.src.includes('?') ? '&' : '?') + 'enablejsapi=1&origin=' + encodeURIComponent(location.origin);
    }
  });
  const hook = () => frames.forEach((f) => {
    // eslint-disable-next-line no-undef
    new YT.Player(f.id, { events: { onStateChange: (e) => { if (e.data === 1) count(Number(f.dataset.seance), 'play'); } } });
  });
  if (window.YT && window.YT.Player) { hook(); return; }
  const prev = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => { if (prev) prev(); hook(); };
  if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  }
}
