import { sb } from './app-core.js';

/* member counter chip: visible to everyone, signed in or not */
const bar = document.querySelector('.app-bar');
let chip;
if (bar) {
  chip = document.createElement('span');
  chip.id = 'memberCount';
  bar.insertBefore(chip, bar.querySelector('#authChip'));
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
