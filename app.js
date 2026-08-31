import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const SUPABASE_URL = 'https://lwwtlsxvbzmddwdcbsnj.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_HexDGBDO-zSLkasLjsR6rw__Vi8JMZD';
export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);
const toastEl = $('toast');
let session = null;
let myProfile = null;

export function toast(msg, ms = 2600) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), ms);
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s ?? '';
  return d.innerHTML;
}

function timeAgo(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/* ---------- auth ---------- */
async function refreshSession() {
  const { data } = await sb.auth.getSession();
  session = data.session;
  if (session) {
    const { data: p } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
    myProfile = p;
  } else {
    myProfile = null;
  }
  renderAuthState();
}

function renderAuthState() {
  const chip = $('authChip');
  if (session) {
    chip.textContent = myProfile?.username ? '@' + myProfile.username : 'Set username';
    chip.classList.add('red');
    $('composerAuthed')?.classList.remove('hidden');
    $('composerAnon')?.classList.add('hidden');
    $('threadAuthed')?.classList.remove('hidden');
    $('threadAnon')?.classList.add('hidden');
    if (!myProfile?.username) promptUsername();
  } else {
    chip.textContent = 'Sign in';
    chip.classList.remove('red');
    $('composerAuthed')?.classList.add('hidden');
    $('composerAnon')?.classList.remove('hidden');
    $('threadAuthed')?.classList.add('hidden');
    $('threadAnon')?.classList.remove('hidden');
  }
}

async function promptUsername() {
  const u = prompt('Pick a username (3-24 letters, numbers, underscores). This is your handle on the board.');
  if (!u) return;
  const { error } = await sb.from('profiles').update({ username: u.trim() }).eq('id', session.user.id);
  if (error) { toast(error.message.includes('duplicate') ? 'Username taken. Try another.' : 'Invalid username.'); return promptUsername(); }
  await refreshSession();
  toast('Welcome to the board, @' + u.trim());
}

$('sendCodeBtn')?.addEventListener('click', async () => {
  const email = $('emailInput').value.trim();
  if (!email) return toast('Enter your email first.');
  $('sendCodeBtn').disabled = true;
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  $('sendCodeBtn').disabled = false;
  if (error) return toast(error.message);
  $('codeRow').classList.remove('hidden');
  toast('Code sent. Check your email (and spam).');
});

$('verifyBtn')?.addEventListener('click', async () => {
  const email = $('emailInput').value.trim();
  const token = $('codeInput').value.trim();
  const { error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
  if (error) return toast('Wrong or expired code.');
  await refreshSession();
  toast('Signed in.');
  loadFeed(); loadEvents();
});

$('authChip')?.addEventListener('click', async () => {
  if (!session) { $('emailInput')?.focus(); return; }
  if (!myProfile?.username) return promptUsername();
  if (confirm('Sign out of HORRORMEET?')) { await sb.auth.signOut(); await refreshSession(); }
});

/* ---------- tabs ---------- */
document.querySelectorAll('.tab').forEach((t) =>
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
    t.classList.add('active');
    for (const name of ['feed', 'board', 'meetups', 'me']) {
      $('tab-' + name).classList.toggle('hidden', t.dataset.tab !== name);
    }
    if (t.dataset.tab === 'board') loadThreads();
    if (t.dataset.tab === 'me') loadMe();
  })
);

/* ---------- posting ---------- */
async function resizeImage(file, maxW = 1280) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, maxW / img.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
}

$('postBtn')?.addEventListener('click', async () => {
  if (!session) return toast('Sign in first.');
  const title = $('postTitle').value.trim();
  const body = $('postBody').value.trim();
  if (title.length < 3 || !body) return toast('Give it a title and a story.');
  $('postBtn').disabled = true;
  let photo_url = null;
  const file = $('postPhoto').files[0];
  try {
    if (file) {
      const blob = await resizeImage(file);
      const path = `${session.user.id}/${Date.now()}.jpg`;
      const { error: upErr } = await sb.storage.from('sighting-photos').upload(path, blob, { contentType: 'image/jpeg' });
      if (upErr) throw upErr;
      photo_url = sb.storage.from('sighting-photos').getPublicUrl(path).data.publicUrl;
    }
    const { error } = await sb.from('sightings').insert({ author: session.user.id, title, body, photo_url });
    if (error) throw error;
    $('postTitle').value = ''; $('postBody').value = ''; $('postPhoto').value = '';
    toast('Submitted. A human will review it. The mods keep the walls.');
  } catch (e) {
    toast(e.message || 'Post failed.');
  }
  $('postBtn').disabled = false;
});

/* ---------- feed ---------- */
async function loadFeed() {
  const { data, error } = await sb
    .from('sightings')
    .select('id,title,body,photo_url,status,created_at,author,profiles(username)')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(50);
  const feed = $('feed');
  if (error) { feed.innerHTML = `<div class="empty">Signal lost. Refresh.</div>`; return; }
  if (!data.length) { feed.innerHTML = `<div class="empty">No approved sightings yet. Be the first thing on this board.</div>`; return; }
  feed.innerHTML = data.map((s) => `
    <article class="card" data-id="${s.id}">
      <div class="pad">
        <div class="post-head"><span class="u">@${esc(s.profiles?.username || 'anonymous')}</span> · ${timeAgo(s.created_at)}</div>
        <h3>${esc(s.title)}</h3>
        <p class="body-text">${esc(s.body)}</p>
      </div>
      ${s.photo_url ? `<img class="photo" src="${esc(s.photo_url)}" alt="sighting photo" loading="lazy">` : ''}
      <div class="card-actions">
        <button class="c-toggle">💬 Comments</button>
        <button class="c-report">Report</button>
      </div>
      <div class="comments">
        <div class="c-list"><span class="hint">Loading...</span></div>
        <div class="comment-form"><input maxlength="1000" placeholder="Say something (nice)"><button>Send</button></div>
      </div>
    </article>`).join('');

  feed.querySelectorAll('.card').forEach((card) => {
    const id = card.dataset.id;
    card.querySelector('.c-toggle').addEventListener('click', async () => {
      const box = card.querySelector('.comments');
      box.classList.toggle('open');
      if (box.classList.contains('open')) loadComments(id, card);
    });
    card.querySelector('.c-report').addEventListener('click', async () => {
      if (!session) return toast('Sign in to report.');
      const reason = prompt('What is wrong with this post?');
      if (reason === null) return;
      await sb.from('reports').insert({ target_type: 'sighting', target_id: Number(id), reporter: session.user.id, reason });
      toast('Reported. Thank you for keeping the walls.');
    });
    const form = card.querySelector('.comment-form');
    form.querySelector('button').addEventListener('click', async () => {
      if (!session) return toast('Sign in to comment.');
      const input = form.querySelector('input');
      const body = input.value.trim();
      if (!body) return;
      const { error } = await sb.from('comments').insert({ sighting_id: Number(id), author: session.user.id, body });
      if (error) return toast(error.message);
      input.value = '';
      loadComments(id, card);
    });
  });
}

async function loadComments(id, card) {
  const { data } = await sb
    .from('comments')
    .select('body,created_at,profiles(username)')
    .eq('sighting_id', id)
    .order('created_at');
  const list = card.querySelector('.c-list');
  list.innerHTML = (data || []).length
    ? data.map((c) => `<div class="comment"><span class="u">@${esc(c.profiles?.username || 'anonymous')}</span>${esc(c.body)}</div>`).join('')
    : `<span class="hint">No comments yet.</span>`;
}

/* ---------- events ---------- */
async function loadEvents() {
  const { data, error } = await sb.from('events').select('*').gte('starts_at', new Date(Date.now() - 86400000).toISOString()).order('starts_at').limit(30);
  const box = $('events');
  if (error || !data?.length) { box.innerHTML = `<div class="empty">No meetups listed yet. Soon.</div>`; return; }
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  box.innerHTML = '';
  for (const ev of data) {
    const d = new Date(ev.starts_at);
    const { data: count } = await sb.rpc('rsvp_count', { event: ev.id });
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = `<div class="pad event">
      <div class="date"><div class="m">${months[d.getMonth()]}</div><div class="d">${d.getDate()}</div></div>
      <div style="flex:1">
        <h3>${esc(ev.title)}</h3>
        <div class="where">${esc([ev.venue, ev.city].filter(Boolean).join(' · '))} · ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
        <div class="going">${count ?? 0} going${ev.link ? ` · <a href="${esc(ev.link)}" target="_blank" rel="noopener">details</a>` : ''}</div>
      </div>
      <button class="btn ghost rsvp">RSVP</button>
    </div>`;
    el.querySelector('.rsvp').addEventListener('click', async () => {
      if (!session) return toast('Sign in to RSVP.');
      const { error: e2 } = await sb.from('rsvps').insert({ event_id: ev.id, user_id: session.user.id });
      if (e2 && e2.code === '23505') { await sb.from('rsvps').delete().match({ event_id: ev.id, user_id: session.user.id }); toast('RSVP removed.'); }
      else if (e2) toast(e2.message);
      else toast('See you there. Travel in pairs.');
      loadEvents();
    });
    box.appendChild(el);
  }
}

/* ---------- community board ---------- */
$('threadBtn')?.addEventListener('click', async () => {
  if (!session) return toast('Sign in first.');
  const title = $('threadTitle').value.trim();
  const body = $('threadBody').value.trim();
  if (title.length < 3 || !body) return toast('Give it a topic and a first post.');
  $('threadBtn').disabled = true;
  const { error } = await sb.from('threads').insert({ author: session.user.id, title, body });
  $('threadBtn').disabled = false;
  if (error) return toast(error.message);
  $('threadTitle').value = ''; $('threadBody').value = '';
  toast('Thread posted.');
  loadThreads();
});

async function loadThreads() {
  const { data, error } = await sb
    .from('threads')
    .select('id,title,body,created_at,pinned,profiles(username)')
    .eq('status', 'approved')
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50);
  const box = $('threads');
  if (error) { box.innerHTML = `<div class="empty">Signal lost. Refresh.</div>`; return; }
  if (!data.length) { box.innerHTML = `<div class="empty">No threads yet. Start the first conversation.</div>`; return; }
  box.innerHTML = data.map((t) => `
    <article class="card" data-tid="${t.id}">
      <div class="pad">
        <div class="post-head">${t.pinned ? '📌 ' : ''}<span class="u">@${esc(t.profiles?.username || 'anonymous')}</span> · ${timeAgo(t.created_at)}</div>
        <h3>${esc(t.title)}</h3>
        <p class="body-text">${esc(t.body)}</p>
      </div>
      <div class="card-actions">
        <button class="t-toggle">💬 Replies</button>
        <button class="t-report">Report</button>
      </div>
      <div class="comments">
        <div class="t-list"><span class="hint">Loading...</span></div>
        <div class="comment-form"><input maxlength="2000" placeholder="Reply"><button>Send</button></div>
      </div>
    </article>`).join('');

  box.querySelectorAll('.card').forEach((card) => {
    const id = card.dataset.tid;
    card.querySelector('.t-toggle').addEventListener('click', () => {
      const c = card.querySelector('.comments');
      c.classList.toggle('open');
      if (c.classList.contains('open')) loadReplies(id, card);
    });
    card.querySelector('.t-report').addEventListener('click', async () => {
      if (!session) return toast('Sign in to report.');
      const reason = prompt('What is wrong with this thread?');
      if (reason === null) return;
      await sb.from('reports').insert({ target_type: 'thread', target_id: Number(id), reporter: session.user.id, reason });
      toast('Reported. Thank you for keeping the walls.');
    });
    const form = card.querySelector('.comment-form');
    form.querySelector('button').addEventListener('click', async () => {
      if (!session) return toast('Sign in to reply.');
      const input = form.querySelector('input');
      const body = input.value.trim();
      if (!body) return;
      const { error } = await sb.from('thread_replies').insert({ thread_id: Number(id), author: session.user.id, body });
      if (error) return toast(error.message);
      input.value = '';
      loadReplies(id, card);
    });
  });
}

async function loadReplies(id, card) {
  const { data } = await sb
    .from('thread_replies')
    .select('body,created_at,profiles(username)')
    .eq('thread_id', id)
    .order('created_at');
  const list = card.querySelector('.t-list');
  list.innerHTML = (data || []).length
    ? data.map((r) => `<div class="comment"><span class="u">@${esc(r.profiles?.username || 'anonymous')}</span>${esc(r.body)}</div>`).join('')
    : `<span class="hint">No replies yet.</span>`;
}

/* ---------- me / history ---------- */
async function loadMe() {
  const prof = $('meProfile');
  if (!session) { prof.innerHTML = `<span class="hint">Sign in on the Sightings tab to see your profile and history.</span>`; return; }
  const badges = (myProfile?.badges || []).map((b) => `<span class="badge">${esc(b)}</span>`).join(' ');
  prof.innerHTML = `
    <h3 style="margin:0 0 4px">@${esc(myProfile?.username || 'no username yet')}</h3>
    <div class="hint">Member since ${new Date(myProfile?.created_at).toLocaleDateString()}${myProfile?.is_admin ? ' · <b style="color:var(--red)">MOD</b> · <a href="admin.html">admin panel</a>' : ''}</div>
    <div style="margin-top:8px">${badges || '<span class="hint">No badges yet.</span>'}</div>`;

  const { data: mine } = await sb.from('sightings').select('id,title,status,created_at').eq('author', session.user.id).order('created_at', { ascending: false });
  $('mySightings').innerHTML = (mine || []).length
    ? mine.map((s) => `<div class="card"><div class="pad"><div class="post-head">${timeAgo(s.created_at)} · <span class="pill ${s.status === 'pending' ? 'pending' : ''}">${s.status.toUpperCase()}</span></div><h3>${esc(s.title)}</h3></div></div>`).join('')
    : `<div class="empty">No sightings submitted yet.</div>`;

  const { data: myT } = await sb.from('threads').select('id,title,status,created_at').eq('author', session.user.id).order('created_at', { ascending: false });
  $('myThreads').innerHTML = (myT || []).length
    ? myT.map((t) => `<div class="card"><div class="pad"><div class="post-head">${timeAgo(t.created_at)} · <span class="pill">${t.status.toUpperCase()}</span></div><h3>${esc(t.title)}</h3></div></div>`).join('')
    : `<div class="empty">No threads started yet.</div>`;
}

/* ---------- boot ---------- */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
await refreshSession();
loadFeed();
loadEvents();
