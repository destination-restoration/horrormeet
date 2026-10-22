import { sb, toast } from './app-core.js';

/* dead letters: member-to-member messages.
   every rule lives server side (dm_send / dm_respond): opt-in letterbox with 18+
   attestation, one-letter requests that must be accepted, 3-day account age, 5 new
   conversations a day, no links in a first letter, blocks, reports. this page only
   draws what the server allows. */

const $ = (id) => document.getElementById(id);
const esc = (s) => { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; };
const when = (t) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const show = (id, on) => $(id).classList.toggle('hidden', !on);

const { data: { session } } = await sb.auth.getSession();
const params = new URLSearchParams(location.search);
let me = null, tab = 'inbox', rows = [], openThread = null, target = null;

if (!session) {
  show('anon', true);
} else {
  const { data } = await sb.from('profiles').select('id,username,dm_open').eq('id', session.user.id).single();
  me = data;
  render();
}

async function render() {
  if (!me.dm_open) {
    show('optin', true); show('box', false);
    return;
  }
  show('optin', false); show('box', true);
  $('lbState').textContent = 'Your letterbox is open.';
  $('lbToggle').textContent = 'Close it';
  await loadInbox();
  const to = params.get('to');
  if (to && !target) startCompose(to, params.get('listing'));
}

$('oBtn')?.addEventListener('click', async () => {
  if (!$('oAdult').checked || !$('oRules').checked) return toast('Tick both boxes to open your letterbox.');
  const { error } = await sb.rpc('dm_set_open', { p_open: true, p_adult: true, p_rules: true });
  if (error) return toast(error.message);
  me.dm_open = true; toast('Letterbox open.'); render();
});

$('lbToggle')?.addEventListener('click', async () => {
  if (!confirm('Close your letterbox? Nobody new can write to you. Your existing letters stay here.')) return;
  const { error } = await sb.rpc('dm_set_open', { p_open: false });
  if (error) return toast(error.message);
  me.dm_open = false; render();
});

async function loadInbox() {
  const { data, error } = await sb.rpc('dm_inbox');
  if (error) { $('list').innerHTML = `<div class="empty">${esc(error.message)}</div>`; return; }
  rows = data || [];
  const inbox = rows.filter((r) => r.status === 'accepted' || r.started_by_me);
  const reqs = rows.filter((r) => r.status === 'request' && !r.started_by_me);
  $('nInbox').textContent = inbox.filter((r) => r.unread).length ? `(${inbox.filter((r) => r.unread).length})` : '';
  $('nReq').textContent = reqs.length ? `(${reqs.length})` : '';
  const set = tab === 'inbox' ? inbox : reqs;
  $('list').innerHTML = set.length ? set.map((r) => `
    <div class="letter lrow ${r.unread ? 'unread' : ''}" data-id="${r.thread_id}">
      <div class="lhead"><b>@${esc(r.other_username || '?')}</b> · ${r.last_at ? when(r.last_at) : ''}
        ${r.status === 'request' && r.started_by_me ? ' · <span class="tag">waiting for them</span>' : ''}
        ${r.listing_id ? ' · <span class="tag">about a listing</span>' : ''}</div>
      <div class="lbody">${r.last_from_me ? 'You: ' : ''}${esc((r.last_body || '').slice(0, 140))}</div>
    </div>`).join('')
    : `<div class="empty">${tab === 'inbox' ? 'No letters yet. Write to a filmmaker from the shelf, or a seller in the Estate Sale.' : 'No requests waiting.'}</div>`;
}

document.querySelector('.lb-tabs')?.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  tab = b.dataset.tab;
  document.querySelectorAll('.lb-tabs button').forEach((x) => x.classList.toggle('on', x === b));
  closeThread(); loadInbox();
});

$('list')?.addEventListener('click', (e) => {
  const row = e.target.closest('.lrow');
  if (row) openThreadView(Number(row.dataset.id));
});

async function openThreadView(id) {
  const r = rows.find((x) => x.thread_id === id);
  if (!r) return;
  openThread = r;
  show('list', false); document.querySelector('.lb-tabs').classList.add('hidden'); show('thread', true);
  $('tWho').textContent = '@' + (r.other_username || '?');
  const { data } = await sb.from('dm_messages').select('sender,body,created_at').eq('thread_id', id).order('created_at');
  $('tMsgs').innerHTML = (data || []).map((m) => `
    <div class="letter ${m.sender === me.id ? 'mine' : ''}"><div class="lhead">${m.sender === me.id ? 'you' : '@' + esc(r.other_username)} · ${when(m.created_at)}</div>
    <div class="lbody">${esc(m.body)}</div></div>`).join('');
  const isReq = r.status === 'request' && !r.started_by_me;
  const waiting = r.status === 'request' && r.started_by_me;
  show('tReq', isReq); show('tWait', waiting); show('tReply', !isReq && !waiting);
  sb.rpc('dm_mark_read', { p_thread: id }).then(() => {}, () => {});
}

function closeThread() {
  openThread = null;
  show('thread', false); show('list', true); document.querySelector('.lb-tabs').classList.remove('hidden');
}
$('tBack')?.addEventListener('click', () => { closeThread(); loadInbox(); });

$('thread')?.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]');
  if (!b || !openThread) return;
  const act = b.dataset.act;
  if (act === 'report') {
    const reason = prompt('What happened? A moderator will read this conversation.');
    if (!reason) return;
    const { error } = await sb.from('reports').insert({ target_type: 'dm_thread', target_id: openThread.thread_id, reporter: me.id, reason: reason.slice(0, 500) });
    if (error) return toast(error.message);
    if (confirm('Reported. Block them too?')) await sb.rpc('dm_respond', { p_thread: openThread.thread_id, p_action: 'block' });
    closeThread(); return loadInbox();
  }
  if (act === 'block' && !confirm('Block @' + openThread.other_username + '? They will not be able to write to you again, and they are not told.')) return;
  const { error } = await sb.rpc('dm_respond', { p_thread: openThread.thread_id, p_action: act });
  if (error) return toast(error.message);
  toast(act === 'accept' ? 'Accepted. You can write back now.' : act === 'decline' ? 'Declined. They are not told.' : 'Blocked.');
  if (act === 'accept') { await loadInbox(); return openThreadView(openThread.thread_id); }
  closeThread(); loadInbox();
});

$('rSend')?.addEventListener('click', async () => {
  const body = $('rBody').value.trim();
  if (!body || !openThread) return;
  $('rSend').disabled = true;
  const { error } = await sb.rpc('dm_send', { p_to: openThread.other_id, p_body: body, p_listing: openThread.listing_id });
  $('rSend').disabled = false;
  if (error) return toast(error.message);
  $('rBody').value = '';
  await loadInbox(); openThreadView(openThread.thread_id);
});

/* compose from ?to=username (film cards, member names) or ?to=...&listing=ID (Estate Sale) */
async function startCompose(username, listing) {
  const { data } = await sb.from('profiles').select('id,username,dm_open').ilike('username', username).maybeSingle();
  if (!data) return toast('No member called @' + username + '.');
  if (data.id === me.id) return;
  const existing = rows.find((r) => r.other_id === data.id);
  if (existing) return openThreadView(existing.thread_id);
  if (!data.dm_open && !listing) {
    show('compose', true);
    $('cTo').textContent = '@' + data.username;
    $('cNote').textContent = ' has not opened their letterbox yet, so letters to them are not possible.';
    $('cBody').classList.add('hidden'); $('cSend').classList.add('hidden');
    return;
  }
  target = { id: data.id, username: data.username, listing: listing ? Number(listing) : null };
  show('compose', true);
  $('cTo').textContent = '@' + data.username;
  $('cNote').textContent = '. This is a request: one letter, no links, until they accept.';
  $('cBody').focus();
}
$('cCancel')?.addEventListener('click', () => { show('compose', false); target = null; history.replaceState(null, '', 'letters.html'); });
$('cSend')?.addEventListener('click', async () => {
  const body = $('cBody').value.trim();
  if (!body || !target) return;
  $('cSend').disabled = true;
  const { error } = await sb.rpc('dm_send', { p_to: target.id, p_body: body, p_listing: target.listing });
  $('cSend').disabled = false;
  if (error) return toast(error.message);
  toast('Sent. It waits as a request until they accept.');
  $('cBody').value = ''; show('compose', false); target = null;
  history.replaceState(null, '', 'letters.html');
  loadInbox();
});
