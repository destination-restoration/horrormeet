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
    let { data: p } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
    const pending = JSON.parse(localStorage.getItem('hm_join') || 'null');
    if (pending?.u && p && !p.username) {
      const { error: applyErr } = await sb.from('profiles').update({
        username: pending.u, phone: pending.phone || null,
        fav_movie: pending.fav_movie || null, fav_haunt: pending.fav_haunt || null
      }).eq('id', session.user.id);
      if (!applyErr) { localStorage.removeItem('hm_join'); toast('Welcome to the board, @' + pending.u); }
      const { data: p2 } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
      p = p2;
    }
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
    $('filmAuthed')?.classList.remove('hidden');
    $('filmAnon')?.classList.add('hidden');
    if (!myProfile?.username) promptUsername();
  } else {
    chip.textContent = 'Sign in';
    chip.classList.remove('red');
    $('composerAuthed')?.classList.add('hidden');
    $('composerAnon')?.classList.remove('hidden');
    $('threadAuthed')?.classList.add('hidden');
    $('threadAnon')?.classList.remove('hidden');
    $('filmAuthed')?.classList.add('hidden');
    $('filmAnon')?.classList.remove('hidden');
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
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  $('sendCodeBtn').disabled = false;
  if (error) return toast(error.message.includes('not allowed') || error.message.includes('Signups') ? 'No account with that email yet. Hit Register below.' : error.message);
  toast('Check your email and click the sign-in link.');
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
  if (!session) {
    document.querySelector('.tab[data-tab="feed"]')?.click();
    $('emailInput')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => $('emailInput')?.focus(), 400);
    toast('Enter your email below: we send a code, no password.');
    return;
  }
  if (!myProfile?.username) return promptUsername();
  openAccount();
});

function openAccount() {
  document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
  for (const name of ['feed', 'board', 'films', 'news', 'map', 'meetups', 'me']) {
    $('tab-' + name).classList.toggle('hidden', name !== 'me');
  }
  loadMe();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- tabs ---------- */
function throughTheDoor(fn) {
  const fx = document.getElementById('doorFx');
  if (!fx || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { fn(); return; }
  fx.classList.remove('go');
  void fx.offsetWidth;
  fx.classList.add('go');
  setTimeout(fn, 300);
  setTimeout(() => fx.classList.remove('go'), 700);
}
document.querySelectorAll('.tab').forEach((t) =>
  t.addEventListener('click', () => {
    if (t.classList.contains('active')) return;
    document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
    t.classList.add('active');
    throughTheDoor(() => {
      for (const name of ['feed', 'board', 'films', 'news', 'map', 'meetups', 'me']) {
        $('tab-' + name).classList.toggle('hidden', t.dataset.tab !== name);
      }
      if (t.dataset.tab === 'board') loadThreads();
      if (t.dataset.tab === 'films') loadFilms();
      if (t.dataset.tab === 'news') loadNews();
      if (t.dataset.tab === 'map') loadMap();
      if (t.dataset.tab === 'me') loadMe();
    });
  })
);



/* ---------- the atlas (map) ---------- */
let map = null, mapLayer = null, mapCat = 'all', addMode = false, pendingPin = null;
async function loadMap() {
  if (!window.L) { setTimeout(loadMap, 300); return; }
  if (!map) {
    map = L.map('mapEl', { worldCopyJump: true }).setView([37.5, -96], 4);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors', maxZoom: 19, className: 'dark-tiles'
    }).addTo(map);
    mapLayer = L.layerGroup().addTo(map);
    map.on('click', (e) => {
      if (!addMode) return;
      pendingPin?.remove();
      pendingPin = L.circleMarker(e.latlng, { radius: 9, color: '#fff', fillColor: '#b3121b', fillOpacity: 1 }).addTo(map);
      $('spotCoords').textContent = `Pin dropped at ${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;
      $('spotForm').classList.remove('hidden');
      $('spotForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
  setTimeout(() => map.invalidateSize(), 100);
  let q = sb.from('map_spots').select('id,title,category,description,lat,lng,profiles(username)').eq('status', 'approved');
  if (mapCat !== 'all') q = q.eq('category', mapCat);
  const { data } = await q;
  mapLayer.clearLayers();
  (data || []).forEach((s) => {
    const isFilm = s.category === 'film';
    L.circleMarker([s.lat, s.lng], {
      radius: 8, weight: 2,
      color: isFilm ? '#b3121b' : '#e8d9a0',
      fillColor: isFilm ? '#b3121b' : '#e8d9a0',
      fillOpacity: 0.75
    }).bindPopup(
      `<div class="cat">${isFilm ? '🎬 Filming location' : '👻 Real horror'}</div>` +
      `<b>${esc(s.title)}</b><br>${esc(s.description || '')}` +
      (s.profiles?.username ? `<br><span style="color:#8b7f84;font-size:12px">added by @${esc(s.profiles.username)}</span>` : '')
    ).addTo(mapLayer);
  });
}
for (const [id, cat] of [['mapAll', 'all'], ['mapFilm', 'film'], ['mapReal', 'real']]) {
  $(id)?.addEventListener('click', () => { mapCat = cat; loadMap(); });
}
$('mapAddBtn')?.addEventListener('click', () => {
  if (!session) return toast('Sign in on the Sightings tab to add locations.');
  addMode = !addMode;
  document.body.classList.toggle('addmode', addMode);
  $('mapAddBtn').textContent = addMode ? 'Click the map to drop your pin...' : '+ Add a location';
  if (!addMode) { $('spotForm').classList.add('hidden'); pendingPin?.remove(); pendingPin = null; }
});
$('spotCancel')?.addEventListener('click', () => {
  addMode = false; document.body.classList.remove('addmode');
  $('mapAddBtn').textContent = '+ Add a location';
  $('spotForm').classList.add('hidden'); pendingPin?.remove(); pendingPin = null;
});
$('spotSubmit')?.addEventListener('click', async () => {
  if (!session || !pendingPin) return;
  const title = $('spotTitle').value.trim();
  if (!title) return toast('Name the place.');
  const ll = pendingPin.getLatLng();
  const { error } = await sb.from('map_spots').insert({
    title, category: $('spotCat').value, description: $('spotDesc').value.trim() || null,
    lat: ll.lat, lng: ll.lng, submitter: session.user.id, status: 'pending'
  });
  if (error) return toast(error.message);
  toast('Submitted. A mod will walk the grounds before it posts.');
  $('spotTitle').value = ''; $('spotDesc').value = '';
  $('spotCancel').click();
});

/* ---------- the wire (news) ---------- */
let newsCat = 'all';
async function loadNews() {
  const el = $('news');
  let q = sb.from('news_items').select('title,url,source,category,summary,published_at').order('published_at', { ascending: false }).limit(60);
  if (newsCat !== 'all') q = q.eq('category', newsCat);
  const { data, error } = await q;
  if (error) { el.innerHTML = `<div class="empty">${esc(error.message)}</div>`; return; }
  el.innerHTML = (data || []).length ? data.map((n) => `
    <div class="card"><div class="pad">
      <div class="post-head"><span class="chip ${n.category === 'paranormal' ? '' : 'red'}">${n.category === 'paranormal' ? '👻 PARANORMAL' : '🎬 HORROR'}</span> · ${esc(n.source)} · ${timeAgo(n.published_at)}</div>
      <h3><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a></h3>
      ${n.summary ? `<p class="body-text" style="font-size:14px">${esc(n.summary)}</p>` : ''}
    </div></div>`).join('') : `<div class="empty">The wire is quiet. Suspiciously quiet.</div>`;
}
for (const [id, cat] of [['newsAll', 'all'], ['newsHorror', 'horror'], ['newsPara', 'paranormal']]) {
  $(id)?.addEventListener('click', () => { newsCat = cat; loadNews(); });
}

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
      ${s.photo_url ? (/\.(mp4|mov|webm)(\?|$)/i.test(s.photo_url)
        ? `<video class="photo" src="${esc(s.photo_url)}" controls playsinline preload="metadata" style="width:100%"></video>`
        : `<img class="photo" src="${esc(s.photo_url)}" alt="sighting photo" loading="lazy">`) : ''}
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
  const kinds = [
    ['festival', 'Partner festivals'],
    ['convention', 'Conventions · take the crew'],
    ['meetup', 'Meetups'],
  ];
  for (const [kindKey, kindLabel] of kinds) {
    const group = data.filter((e) => (e.kind || 'meetup') === kindKey);
    if (!group.length) continue;
    const head = document.createElement('div');
    head.className = 'section-note';
    head.textContent = kindLabel;
    box.appendChild(head);
    if (kindKey === 'convention') {
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.style.margin = '0 0 8px';
      hint.textContent = 'Every convention needs a HorrorMeet captain: the member who rallies the crew, picks the meeting spot, wears the metaphorical flag. Want a captaincy? Message the admins on the board and your name goes up.';
      box.appendChild(hint);
    }
  for (const ev of group) {
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
        ${(ev.kind || 'meetup') !== 'meetup' ? (ev.captain
          ? `<div class="hint" style="margin-top:4px">🧭 HorrorMeet captain: <b>@${esc(ev.captain)}</b>. Talk to them about going.</div>`
          : `<div class="hint" style="margin-top:4px">🧭 No captain yet. Claim it on the board.</div>`) : ''}
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

/* ---------- films ---------- */
$('filmBtn')?.addEventListener('click', async () => {
  if (!session) return toast('Sign in first.');
  const title = $('fTitle').value.trim();
  const watch_url = $('fWatch').value.trim();
  if (!title || !watch_url.startsWith('http')) return toast('Title and a valid watch link are required.');
  $('filmBtn').disabled = true;
  let poster_url = null;
  try {
    const file = $('fPoster').files[0];
    if (file) {
      const blob = await resizeImage(file, 800);
      const path = `${session.user.id}/${Date.now()}.jpg`;
      const { error: upErr } = await sb.storage.from('posters').upload(path, blob, { contentType: 'image/jpeg' });
      if (upErr) throw upErr;
      poster_url = sb.storage.from('posters').getPublicUrl(path).data.publicUrl;
    }
    const { error } = await sb.from('films').insert({
      submitter: session.user.id, title, watch_url,
      year: Number($('fYear').value) || null,
      runtime_min: Number($('fRuntime').value) || null,
      subgenre: $('fSubgenre').value.trim() || null,
      roles: $('fRoles').value.trim() || null,
      synopsis: $('fSynopsis').value.trim() || null,
      trailer_url: $('fTrailer').value.trim() || null,
      poster_url
    });
    if (error) throw error;
    ['fTitle','fYear','fRuntime','fSubgenre','fRoles','fSynopsis','fWatch','fTrailer','fPoster'].forEach((id) => ($(id).value = ''));
    toast('Submitted. A mod will review it before it hits the shelf.');
  } catch (e) { toast(e.message || 'Submission failed.'); }
  $('filmBtn').disabled = false;
});

let filmRatings = {};
async function loadFilms() {
  const { data: rats } = await sb.from('film_ratings').select('film_id,rating,user_id');
  filmRatings = {};
  (rats || []).forEach((r) => {
    (filmRatings[r.film_id] = filmRatings[r.film_id] || []).push(r);
  });
  const { data, error } = await sb
    .from('films')
    .select('id,title,year,roles,synopsis,watch_url,trailer_url,poster_url,runtime_min,subgenre,featured,created_at,profiles!submitter(username)')
    .eq('status', 'approved')
    .order('featured', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50);
  const box = $('films');
  if (error) { box.innerHTML = `<div class="empty">Signal lost. Refresh.</div>`; return; }
  if (!data.length) { box.innerHTML = `<div class="empty">The shelf is waiting for its first film. Filmmakers: that could be yours.</div>`; return; }
  box.innerHTML = data.map((f) => `
    <article class="card">
      ${f.poster_url ? `<img class="photo" src="${esc(f.poster_url)}" alt="${esc(f.title)} poster" loading="lazy" style="max-height:340px">` : ''}
      <div class="pad">
        <div class="post-head">${f.featured ? '🏆 ' : ''}submitted by <span class="u">@${esc(f.profiles?.username || '?')}</span>${f.roles ? ' · ' + esc(f.roles) : ''}</div>
        <h3>${esc(f.title)}${f.year ? ` <span style="color:var(--faint);font-weight:400">(${f.year})</span>` : ''}</h3>
        <div class="hint" style="margin-bottom:6px">${[f.subgenre, f.runtime_min ? f.runtime_min + ' min' : null].filter(Boolean).map(esc).join(' · ')}</div>
        ${f.synopsis ? `<p class="body-text">${esc(f.synopsis)}</p>` : ''}
      <div class="hint film-rate" data-film="${f.id}" style="margin-top:6px">${(() => {
        const rs = filmRatings[f.id] || [];
        const avg = rs.length ? (rs.reduce((s, r) => s + r.rating, 0) / rs.length) : 0;
        const mine = session ? rs.find((r) => r.user_id === session.user.id)?.rating : null;
        let stones = '';
        for (let i = 1; i <= 5; i++) stones += `<span class="stone" data-v="${i}" style="cursor:${session ? 'pointer' : 'default'};opacity:${i <= Math.round(avg) ? 1 : 0.3}">🪦</span>`;
        return stones + ` <span>${rs.length ? avg.toFixed(1) + ' · ' + rs.length + ' rating' + (rs.length > 1 ? 's' : '') : 'unrated'}${mine ? ' · yours: ' + mine : ''}</span>`;
      })()}</div>
        <div class="admin-row">
          <a class="btn" href="${esc(f.watch_url)}" target="_blank" rel="noopener">▶ Watch</a>
          ${f.trailer_url ? `<a class="btn ghost" href="${esc(f.trailer_url)}" target="_blank" rel="noopener">Trailer</a>` : ''}
        </div>
      </div>
    </article>`).join('');
}

/* ---------- profile editor ---------- */
function fillEditor() {
  if (!myProfile) return;
  const d = myProfile.details || {};
  if (myProfile.avatar_url) $('eAvatarPreview').src = myProfile.avatar_url;
  $('ePhone').value = myProfile.phone || '';
  $('eWebsite').value = myProfile.website_url || '';
  $('eShortFilm').value = myProfile.short_film_url || '';
  $('eFavMovie').value = myProfile.fav_movie || '';
  $('eFavHaunt').value = myProfile.fav_haunt || '';
  $('eSubgenre').value = d.subgenre || '';
  $('eEra').value = d.era || '';
  $('eArchetype').value = d.archetype || '';
  $('eVillain').value = d.villain || '';
  $('eFirstHorror').value = d.first_horror || '';
  $('eComfort').value = d.comfort_movie || '';
  $('eHotTake').value = d.hot_take || '';
}

$('eAvatar')?.addEventListener('change', () => {
  const f = $('eAvatar').files[0];
  if (f) $('eAvatarPreview').src = URL.createObjectURL(f);
});

$('saveProfileBtn')?.addEventListener('click', async () => {
  if (!session) return toast('Sign in first.');
  $('saveProfileBtn').disabled = true;
  try {
    let avatar_url = myProfile?.avatar_url || null;
    const f = $('eAvatar').files[0];
    if (f) {
      const blob = await resizeImage(f, 400);
      const path = `${session.user.id}/avatar.jpg`;
      const { error: upErr } = await sb.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if (upErr) throw upErr;
      avatar_url = sb.storage.from('avatars').getPublicUrl(path).data.publicUrl + '?t=' + Date.now();
    }
    const { error } = await sb.from('profiles').update({
      avatar_url,
      phone: $('ePhone').value.trim() || null,
      website_url: $('eWebsite').value.trim() || null,
      short_film_url: $('eShortFilm').value.trim() || null,
      fav_movie: $('eFavMovie').value.trim() || null,
      fav_haunt: $('eFavHaunt').value.trim() || null,
      details: {
        subgenre: $('eSubgenre').value || null,
        era: $('eEra').value || null,
        archetype: $('eArchetype').value || null,
        villain: $('eVillain').value.trim() || null,
        first_horror: $('eFirstHorror').value.trim() || null,
        comfort_movie: $('eComfort').value.trim() || null,
        hot_take: $('eHotTake').value.trim() || null
      }
    }).eq('id', session.user.id);
    if (error) throw error;
    await refreshSession();
    toast('Profile saved. Looking sharp.');
  } catch (e) { toast(e.message || 'Save failed.'); }
  $('saveProfileBtn').disabled = false;
});

/* ---------- me / history ---------- */
async function loadMe() {
  const prof = $('meProfile');
  if (!session) { prof.innerHTML = `<span class="hint">Sign in on the Sightings tab to see your profile and history.</span>`; $('meEditorWrap')?.classList.add('hidden'); return; }
  const d = myProfile?.details || {};
  const badges = (myProfile?.badges || []).map((b) => `<span class="badge">${esc(b)}</span>`).join(' ');
  const identity = [
    d.subgenre && `Subgenre: <b>${esc(d.subgenre)}</b>`,
    d.era && `Era: <b>${esc(d.era)}</b>`,
    d.archetype && `Archetype: <b>${esc(d.archetype)}</b>`,
    d.villain && `Villain: <b>${esc(d.villain)}</b>`,
    myProfile?.fav_movie && `Favorite: <b>${esc(myProfile.fav_movie)}</b>`,
    d.comfort_movie && `Comfort watch: <b>${esc(d.comfort_movie)}</b>`,
    d.first_horror && `First scar: <b>${esc(d.first_horror)}</b>`,
    myProfile?.fav_haunt && `Scariest place: <b>${esc(myProfile.fav_haunt)}</b>`
  ].filter(Boolean).map((x) => `<div class="hint" style="margin:2px 0">${x}</div>`).join('');
  prof.innerHTML = `
    <div style="display:flex;gap:14px;align-items:flex-start">
      <img src="${esc(myProfile?.avatar_url || 'icon-180.png')}" alt="avatar" style="width:72px;height:72px;object-fit:cover;border:2px solid var(--red)">
      <div style="flex:1">
        <h3 style="margin:0 0 4px">@${esc(myProfile?.username || 'no username yet')}</h3>
        <div style="margin:0 0 6px"><button class="btn danger" id="logoutBtn" style="font-size:12px;padding:4px 12px">Log out</button></div>
        <div class="hint">Member since ${new Date(myProfile?.created_at).toLocaleDateString()}${myProfile?.is_admin ? ' · <b style="color:var(--red)">MOD</b> · <a href="admin.html">admin panel</a>' : ''}</div>
        <div style="margin:8px 0 6px">${badges || '<span class="hint">No badges yet.</span>'}</div>
        ${d.hot_take ? `<div class="body-text" style="font-style:italic;font-size:14px">"${esc(d.hot_take)}"</div>` : ''}
      </div>
    </div>
    ${identity ? `<div style="margin-top:12px;border-top:1px dashed var(--line);padding-top:10px">${identity}</div>` : ''}
    ${myProfile?.short_film_url ? `<div class="hint" style="margin-top:8px">Short film pick: <a href="${esc(myProfile.short_film_url)}" target="_blank" rel="noopener">watch</a></div>` : ''}
    ${myProfile?.website_url ? `<div class="hint">Site: <a href="${esc(myProfile.website_url)}" target="_blank" rel="noopener">${esc(myProfile.website_url)}</a></div>` : ''}`;
  $('logoutBtn').onclick = async () => {
    await sb.auth.signOut();
    await refreshSession();
    toast('Logged out. Sleep with the lights on.');
    document.querySelector('.tab[data-tab="feed"]')?.click();
  };
  $('meEditorWrap')?.classList.remove('hidden');
  fillEditor();

  const { data: myF } = await sb.from('films').select('id,title,status,created_at').eq('submitter', session.user.id).order('created_at', { ascending: false });
  $('myFilms').innerHTML = (myF || []).length
    ? myF.map((f) => `<div class="card"><div class="pad"><div class="post-head">${timeAgo(f.created_at)} · <span class="pill ${f.status === 'pending' ? 'pending' : ''}">${f.status.toUpperCase()}</span></div><h3>${esc(f.title)}</h3></div></div>`).join('')
    : `<div class="empty">No films submitted yet.</div>`;

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


/* ---------- tombstone rating clicks (delegated) ---------- */
document.addEventListener('click', async (e) => {
  const stone = e.target.closest('.stone');
  if (!stone || !session) return;
  const wrap = stone.closest('.film-rate');
  if (!wrap) return;
  const film_id = Number(wrap.dataset.film);
  const rating = Number(stone.dataset.v);
  const { error } = await sb.from('film_ratings').upsert({ film_id, user_id: session.user.id, rating });
  if (error) return toast(error.message);
  toast(`Rated ${rating} tombstone${rating > 1 ? 's' : ''}.`);
  loadFilms();
});

/* ---------- this day in horror ---------- */
async function loadAlmanac() {
  const el = $('almanac');
  if (!el) return;
  const now = new Date();
  const { data } = await sb.from('almanac').select('year,entry').eq('month', now.getMonth() + 1).eq('day', now.getDate());
  if (!data?.length) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.innerHTML = `<div class="pad"><div class="post-head">☠️ THIS DAY IN HORROR</div>` +
    data.map((d) => `<p class="body-text" style="font-size:14.5px">${d.year ? `<b>${d.year}.</b> ` : ''}${esc(d.entry)}</p>`).join('') + `</div>`;
}
loadAlmanac();


/* deep-link tabs: index.html#films etc */
const wantedTab = location.hash.slice(1);
if (wantedTab) {
  const btn = document.querySelector(`.tab[data-tab="${wantedTab}"]`);
  if (btn && !btn.classList.contains('active')) btn.click();
}
