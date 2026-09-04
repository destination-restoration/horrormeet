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
  if (chip) chip.innerHTML = `\u{1F9DF} <b>${count}</b> member${count === 1 ? '' : 's'}`;
}
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
