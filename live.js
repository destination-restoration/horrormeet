import { sb } from './app-core.js';
import './track.js';
import './gate.js';
import './premiere.js';

/* member counter chip: visible to everyone, signed in or not */
const bar = document.querySelector('.app-bar');
let chip;
if (bar) {
  chip = document.createElement('span');
  chip.id = 'memberCount';
  bar.insertBefore(chip, bar.querySelector('.authStack') || bar.querySelector('#authChip'));
}
let count = 0;
async function refreshCount() {
  const { count: c } = await sb.from('profiles').select('id', { count: 'exact', head: true }).not('username', 'is', null);
  if (typeof c === 'number') { count = c; paint(); }
}
function paint() {
  if (!chip) return;
  const compact = window.innerWidth < 560;
  chip.innerHTML = compact ? `\u{1F9DF} <b>${count}</b>` : `\u{1F9DF} <b>${count}</b> member${count === 1 ? '' : 's'}`;
}
window.addEventListener('resize', paint);
refreshCount();

/* live drop: a small banner slides from the top when someone claims a handle */
const drop = document.createElement('div');
drop.id = 'liveDrop';
document.body.appendChild(drop);
let hideTimer;
function announce(name) {
  drop.textContent = `\u{1FAA6} @${name} just joined`;
  drop.classList.add('show');
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => drop.classList.remove('show'), 4200);
  count += 1; paint();
}
sb.channel('front-porch')
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (p) => {
    if (p.new?.username && !p.old?.username) announce(p.new.username);
  })
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profiles' }, (p) => {
    if (p.new?.username) announce(p.new.username);
  })
  .subscribe();

/* admin key: visible only to signed-in admins */
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (!session || !bar || document.getElementById('adminBtn')) return;
  const { data: p } = await sb.from('profiles').select('is_admin').eq('id', session.user.id).single();
  if (!p?.is_admin) return;
  const a = document.createElement('a');
  a.id = 'adminBtn';
  a.href = 'admin.html';
  a.textContent = '\u{1F5DD} ADMIN';
  a.style.cssText = 'color:var(--red);font-size:11.5px;letter-spacing:.06em;border:1px solid var(--red);padding:4px 9px;margin-right:8px;text-decoration:none;white-space:nowrap';
  bar.insertBefore(a, chip);
})();

/* letters: a big, labeled envelope button in the header for signed-in members, with the unread count */
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (!session || !bar || document.getElementById('lettersBtn')) return;
  if (!document.getElementById('lettersCss')) {
    const st = document.createElement('style');
    st.id = 'lettersCss';
    st.textContent = `
#lettersBtn{display:inline-flex;align-items:center;gap:7px;color:var(--white);background:var(--red);border:2px solid var(--red);
  padding:6px 12px 6px 10px;margin-right:8px;text-decoration:none;white-space:nowrap;position:relative;
  font-family:Georgia,serif;font-weight:700;font-size:13px;letter-spacing:.08em;text-transform:uppercase;box-shadow:3px 3px 0 var(--red-deep)}
#lettersBtn .env{font-size:26px;line-height:1}
#lettersBtn .n{position:absolute;top:-10px;right:-10px;background:var(--white);color:var(--red);font-size:12px;font-weight:700;
  border-radius:10px;padding:2px 6px;line-height:1.2;border:2px solid var(--red)}
@media (max-width:560px){#lettersBtn{padding:3px 7px;gap:0;margin-right:4px;box-shadow:2px 2px 0 var(--red-deep)}#lettersBtn .lbl{display:none}#lettersBtn .env{font-size:22px}#lettersBtn .n{top:-8px;right:-8px;font-size:10px;padding:1px 4px}}
@media (max-width:430px){.app-bar:has(#lettersBtn) #memberCount{display:none}}`;
    document.head.appendChild(st);
  }
  const a = document.createElement('a');
  a.id = 'lettersBtn';
  a.href = 'letters.html';
  a.title = 'Dead letters';
  a.innerHTML = '<span class="env">\u2709</span><span class="lbl">Letters</span>';
  bar.insertBefore(a, chip);
  const { data: n } = await sb.rpc('dm_unread_count');
  if (n > 0) {
    const b = document.createElement('span');
    b.className = 'n';
    b.textContent = n > 9 ? '9+' : String(n);
    a.appendChild(b);
  }
})();
