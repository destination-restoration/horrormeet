import { sb } from './app-core.js';

/* the soft gate. reading stays open to everyone (search engines and first-time
   visitors from a shared link have to see the place before they will join), but
   doing anything takes an account. every "sign in first" dead end on the site
   routes through joinPrompt(), which offers the join page with the action tagged
   (?ref=gate-rsvp etc.) so signup_sources shows which actions convert. separately,
   a visitor who has looked at five pages without joining gets one closable nudge,
   then not again for a week. */

const JOIN = new URL('./join.html', import.meta.url).href;
const SIGNIN = new URL('./signin.html', import.meta.url).href;

const ACTIONS = {
  rsvp: 'RSVP to this meetup',
  post: 'post a sighting',
  comment: 'comment',
  reply: 'reply',
  thread: 'start a thread',
  film: 'put your film on the shelf',
  pin: 'add a place to the Atlas',
  save: 'save places to My Atlas',
  rate: 'rate films on the shelf',
  report: 'report a post',
  chat: 'talk in the Basement',
  sell: 'list in the Estate Sale',
  crew: 'join the crew list',
  morgue: 'write a file for the Morgue',
  profile: 'have a profile',
};

const css = `
#hmGate{position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:16px}
#hmGate .box{background:var(--panel,#141418);border:2px solid var(--red,#b3121b);max-width:420px;width:100%;padding:22px 20px 18px;position:relative;box-shadow:0 0 40px rgba(179,18,27,.35)}
#hmGate h3{font-family:'Rye',Georgia,serif;color:var(--white,#fff);font-size:20px;margin:0 0 8px;line-height:1.3}
#hmGate p{color:var(--dim,#bbb);font-size:14.5px;line-height:1.5;margin:0 0 16px}
#hmGate .row{display:flex;gap:10px;flex-wrap:wrap}
#hmGate .x{position:absolute;top:6px;right:10px;background:none;border:0;color:var(--faint,#888);font-size:22px;cursor:pointer}
#hmNudge{position:fixed;left:50%;bottom:14px;transform:translate(-50%,140%);z-index:8000;width:calc(100% - 24px);max-width:520px;
  background:var(--panel,#141418);border:2px solid var(--red,#b3121b);padding:14px 16px;transition:transform .45s ease;box-shadow:0 0 30px rgba(0,0,0,.6)}
#hmNudge.on{transform:translate(-50%,0)}
#hmNudge b{color:var(--white,#fff);font-family:'Rye',Georgia,serif;font-size:16px}
#hmNudge p{color:var(--dim,#bbb);font-size:13.5px;margin:6px 0 12px;line-height:1.45}
#hmNudge .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
#hmNudge .later{background:none;border:0;color:var(--faint,#888);font-size:13px;cursor:pointer;text-decoration:underline}
`;
function addStyle() {
  if (document.getElementById('hmGateCss')) return;
  const s = document.createElement('style');
  s.id = 'hmGateCss'; s.textContent = css;
  document.head.appendChild(s);
}

const remember = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
const recall = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };

export function joinPrompt(action) {
  addStyle();
  document.getElementById('hmGate')?.remove();
  const what = ACTIONS[action] || 'do that';
  remember('hm_gate', action || 'other');
  const el = document.createElement('div');
  el.id = 'hmGate';
  el.innerHTML = `<div class="box" role="dialog" aria-modal="true" aria-labelledby="hmGateT">
    <button class="x" aria-label="Close">&times;</button>
    <h3 id="hmGateT">Join HorrorMeet to ${what}</h3>
    <p>It's free and takes a minute. Members save places to My Atlas, RSVP to meetups, post sightings, rate the film shelf and talk in the Basement.</p>
    <div class="row">
      <a class="btn" href="${JOIN}?ref=gate-${encodeURIComponent(action || 'other')}">Join free</a>
      <a class="btn ghost" href="${SIGNIN}">I have an account</a>
    </div></div>`;
  const close = () => el.remove();
  el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('.x')) close(); });
  document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } });
  document.body.appendChild(el);
  el.querySelector('.btn')?.focus();
}
window.hmJoinPrompt = joinPrompt;

/* the five-page nudge */
(async () => {
  try {
    const page = location.pathname.split('/').pop() || 'index.html';
    if (/^(join|signin|admin|terms)\.html$/.test(page)) return;
    const { data } = await sb.auth.getSession();
    if (data && data.session) return;
    const n = Number(recall('hm_pv') || 0) + 1;
    remember('hm_pv', String(n));
    if (n < 5) return;
    if (Number(recall('hm_nudge_until') || 0) > Date.now()) return;
    addStyle();
    const el = document.createElement('div');
    el.id = 'hmNudge';
    el.innerHTML = `<b>You've been haunting the place.</b>
      <p>Join free and it becomes yours: save places to My Atlas, RSVP to meetups, post sightings, rate the shelf, and talk in the Basement.</p>
      <div class="row"><a class="btn" href="${JOIN}?ref=nudge">Join free</a><button class="later" type="button">Just looking</button></div>`;
    el.querySelector('.later').onclick = () => {
      remember('hm_nudge_until', String(Date.now() + 7 * 864e5));
      el.classList.remove('on');
      setTimeout(() => el.remove(), 500);
    };
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('on'), 4000);
  } catch (_) { /* a nudge must never break a page */ }
})();
