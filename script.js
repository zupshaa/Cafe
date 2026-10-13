const $ = s => document.querySelector(s), app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = d => d ? new Date(d + 'T00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
const okUrl = u => { try { return /^https?:$/.test(new URL(u).protocol); } catch { return false; } };
const rot = id => ([...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 5) - 2;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + Math.random().toString(16).slice(2)).replace(/[^A-Za-z0-9]/g, '');
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const COL = { cafe: 'cafes', topic: 'topics', visit: 'visits', media: 'media' };
const ICON = { YouTube: '▶️', TikTok: '🎵', Instagram: '📸' };
let S = { cafes: [], topics: [], visits: [], media: [] }, ME = null;
const find = (a, id) => a.find(x => x.id === id);
const vis = id => S.visits.filter(v => v.cafe_id === id).sort((a, b) => b.visit_date.localeCompare(a.visit_date));
const meds = id => S.media.filter(m => m.visit_id === id);
const btn = (a, id, t, c = '') => `<button class="btn sm ${c}" data-a="${a}" data-id="${esc(id)}">${t}</button>`;
function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 3500); }

/* ---------- Local state updates (after the server confirms) ---------- */
function apply(type, op, res, id) {
  const k = COL[type];
  if (op === 'add') {
    if (!S[k].some(x => x.id === res.record.id)) S[k].push(res.record);
    if (res.cafe) S.cafes = S.cafes.map(c => c.id === res.cafe.id ? res.cafe : c);
  } else if (op === 'update') S[k] = S[k].map(x => x.id === res.record.id ? res.record : x);
  else {
    S[k] = S[k].filter(x => x.id !== id);
    if (type === 'cafe') { S.visits = S.visits.filter(v => v.cafe_id !== id); S.media = S.media.filter(m => m.cafe_id !== id); }
    if (type === 'visit') S.media = S.media.filter(m => m.visit_id !== id);
  }
  route();
}
function fail(x, type) {
  if (x.code === 'unauthorized') { logout(x.message); return x.message; }
  if (x.code === 'conflict' && x.current && type) { S[COL[type]] = S[COL[type]].map(r => r.id === x.current.id ? x.current : r); route(); }
  return x.message;
}
async function mutate(type, op, data, rid) { // resolves to null on success, or an error message
  try {
    const res = op === 'add' ? await API.add(type, data, rid) : op === 'update' ? await API.update(type, data) : await API.del(type, data);
    apply(type, op, res, data.id); return null;
  } catch (x) { return fail(x, type); }
}

/* ---------- Photos ---------- */
const photoCache = new Map();
async function loadPhotos() {
  const imgs = [...document.querySelectorAll('img[data-pid]:not([data-busy])')];
  imgs.forEach(i => i.dataset.busy = '1');
  for (let i = 0; i < imgs.length; i += 2) await Promise.all(imgs.slice(i, i + 2).map(async im => {
    const id = im.dataset.pid;
    try { if (!photoCache.has(id)) photoCache.set(id, (await API.photo(id)).data); im.src = photoCache.get(id); }
    catch (_) { im.alt = 'Photo could not be loaded'; }
  }));
}
async function uploadPhoto(file, rid) {
  const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('This browser cannot read that photo. Try a JPEG or PNG.')); i.src = URL.createObjectURL(file); });
  const enc = (max, qs, lim) => {
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    for (const q of qs) { const b = c.toDataURL('image/jpeg', q).split(',')[1]; if (b.length * 0.75 <= lim) return b; }
    throw new Error('This photo is too large even after shrinking. Try another one.');
  };
  return API.upload(rid, enc(1600, [.85, .7, .55], 1.4e6), enc(400, [.7, .5], 140000));
}

/* ---------- Pieces ---------- */
const lastPic = c => (vis(c.id).find(v => v.thumb_id) || {}).thumb_id;
const cafeCard = (c, full) => { const pid = lastPic(c); return `<article class="card" style="--r:${rot(c.id)}deg"><i class="tape"></i><div class="polaroid">${pid ? `<img data-pid="${esc(pid)}" alt="${esc(c.name)}">` : '<div class="ph" aria-hidden="true">☕</div>'}<p class="cap">${esc(c.name)}</p></div>
<p><span class="stamp ${c.status === 'Visited' ? 'visited' : 'want'}">${esc(c.status)}</span></p>${c.location ? `<p><small>📍 ${esc(c.location)}</small></p>` : ''}<p><small>Added by ${esc(c.added_by)}</small></p>
<div class="row">${full ? '' : `<a class="btn alt sm" href="#/cafe/${esc(c.id)}">Open journal</a>`}${okUrl(c.maps_url) ? `<a href="${esc(c.maps_url)}" target="_blank" rel="noopener noreferrer">Google Maps</a>` : ''}</div></article>`; };
const topicCard = t => `<article class="card note" style="--r:${rot(t.id)}deg"><i class="tape"></i><span class="stamp topic">Topic idea</span><h3>${esc(t.topic)}</h3>${t.notes ? `<p style="white-space:pre-wrap">${esc(t.notes)}</p>` : ''}<p><small>Added by ${esc(t.added_by)}</small></p><div class="row">${btn('editTopic', t.id, 'Edit', 'alt')}${btn('delTopic', t.id, 'Delete', 'danger')}</div></article>`;
const linkH = m => `<div class="keep ${esc(String(m.platform).toLowerCase())}"><a href="${okUrl(m.url) ? esc(m.url) : '#'}" target="_blank" rel="noopener noreferrer"><b>${ICON[m.platform] || '🔗'} ${esc(m.platform)}</b>: ${esc(m.title || m.url)}</a>${m.description ? `<br><small>${esc(m.description)}</small>` : ''} ${btn('delLink', m.id, 'remove', 'danger')}</div>`;
const visitHtml = (v, i) => `<section class="paper ${i % 2 ? 'p' : 's'}"><h3>${fmt(v.visit_date)} <small>· ${esc(v.author)}</small></h3>${v.photo_id ? `<img class="visit-photo" data-pid="${esc(v.photo_id)}" alt="Photo from this visit">` : ''}
${v.ordered ? `<p style="white-space:pre-wrap"><b>Ordered:</b> ${esc(v.ordered)}</p>` : ''}${v.experience ? `<p><b>Overall:</b> ${esc(v.experience)}</p>` : ''}${v.conversation ? `<h3>What we talked about</h3><p style="white-space:pre-wrap">${esc(v.conversation)}</p>` : ''}${v.notes ? `<h3>Notes</h3><p style="white-space:pre-wrap">${esc(v.notes)}</p>` : ''}
${meds(v.id).map(linkH).join('')}<div class="row">${btn('addLink', v.id, '＋ Add link')}${btn('editVisit', v.id, 'Edit visit', 'alt')}${btn('delVisit', v.id, 'Delete visit', 'danger')}</div></section>`;

/* ---------- Views ---------- */
function journalView() {
  const v = S.cafes.filter(c => c.status === 'Visited').length, recent = [...S.visits].sort((a, b) => b.visit_date.localeCompare(a.visit_date)).slice(0, 3);
  return `<h2>Welcome back, ${esc(ME.name)}!</h2><div class="stats"><div class="paper k"><div class="big-num">${S.cafes.length}</div>cafés</div><div class="paper s"><div class="big-num">${v}</div>visited</div><div class="paper p"><div class="big-num">${S.cafes.length - v}</div>still to try</div><div class="paper"><div class="big-num">${S.topics.length}</div>topic ideas</div></div>
<h2>Recent memories</h2>${recent.map(x => { const c = find(S.cafes, x.cafe_id); return c ? `<div class="paper"><h3>${esc(c.name)} <small>· ${fmt(x.visit_date)}</small></h3><p>${esc((x.conversation || x.experience || '').slice(0, 180))}</p><a href="#/cafe/${esc(c.id)}">Read the full page</a></div>` : ''; }).join('') || '<p class="paper">No memories yet. Add a visit!</p>'}`;
}
const listView = k => `<h2>${k === 'visited' ? 'Visited cafés' : 'Bucket list'}</h2><p>${k === 'visited' ? btn('addVisit', '', '＋ Add a Visit') : btn('addEntry', '', '＋ Add to the list')}</p>
<div class="paper row"><input id="q" type="search" placeholder="Search…" aria-label="Search">${k === 'visited' ? '' : '<select id="f" aria-label="Filter"><option value="all">All Entries</option><option value="cafes">All Cafés</option><option value="want">Want to Visit</option><option value="visited">Visited</option><option value="topics">Topic Ideas</option></select>'}<select id="s" aria-label="Sort"></select></div><div id="out" class="grid"></div>`;
function setupList(k) {
  const run = () => {
    const f = k === 'visited' ? 'visited' : $('#f').value, q = $('#q').value.toLowerCase(), sel = $('#s'), cafesOnly = f !== 'all' && f !== 'topics';
    if (sel.dataset.mode !== String(cafesOnly)) { // "Latest Visit" is offered only when the list contains cafés only
      const prev = sel.value, o = [['name', 'Name A–Z'], ['new', 'Recently Added']].concat(cafesOnly ? [['visit', 'Latest Visit']] : []);
      sel.innerHTML = o.map(x => `<option value="${x[0]}">${x[1]}</option>`).join(''); sel.dataset.mode = String(cafesOnly); if (o.some(x => x[0] === prev)) sel.value = prev;
    }
    const items = [];
    if (f !== 'topics') S.cafes.filter(c => f === 'all' || f === 'cafes' || (f === 'want' && c.status === 'Want to Visit') || (f === 'visited' && c.status === 'Visited')).forEach(c => items.push({ t: 'c', r: c, name: c.name, txt: c.name + ' ' + c.location }));
    if (f === 'all' || f === 'topics') S.topics.forEach(x => items.push({ t: 't', r: x, name: x.topic, txt: x.topic + ' ' + x.notes }));
    const by = { name: (a, b) => a.name.localeCompare(b.name), new: (a, b) => b.r.created_at.localeCompare(a.r.created_at), visit: (a, b) => (vis(b.r.id)[0]?.visit_date || '').localeCompare(vis(a.r.id)[0]?.visit_date || '') };
    $('#out').innerHTML = items.filter(i => i.txt.toLowerCase().includes(q)).sort(by[sel.value]).map(i => i.t === 'c' ? cafeCard(i.r) : topicCard(i.r)).join('') || '<p class="paper">Nothing here yet.</p>';
    loadPhotos();
  };
  ['#q', '#f', '#s'].forEach(x => { const e = $(x); if (e) e.addEventListener('input', run); }); run();
}
function cafeView(id) {
  const c = find(S.cafes, id);
  if (!c) return '<h2>Page not found</h2><a href="#/bucket">Back to the bucket list</a>';
  return `<a href="#/bucket">← back</a><div class="grid" style="grid-template-columns:minmax(260px,420px)">${cafeCard(c, 1)}</div>
<div class="row">${btn('addVisit', id, '＋ Add a Visit')}${btn('editCafe', id, 'Edit café', 'alt')}${c.status !== 'Visited' ? btn('visitedCafe', id, 'Mark as visited', 'alt') : ''}${btn('delCafe', id, 'Delete', 'danger')}</div>
<h2>Visits</h2>${vis(id).map(visitHtml).join('') || '<p class="paper">No visits yet.</p>'}`;
}
const memView = () => '<h2>Our memories</h2><div class="paper"><input id="q" type="search" placeholder="Search conversations and notes…" aria-label="Search memories"></div><div id="out"></div>';
function setupMem() {
  const run = () => { const q = $('#q').value.toLowerCase();
    $('#out').innerHTML = S.visits.map(v => ({ v, c: find(S.cafes, v.cafe_id) })).filter(x => x.c && [x.c.name, x.v.ordered, x.v.experience, x.v.conversation, x.v.notes].join(' ').toLowerCase().includes(q)).sort((a, b) => b.v.visit_date.localeCompare(a.v.visit_date))
      .map(({ v, c }) => `<div class="paper"><h3>${esc(c.name)} <small>· ${fmt(v.visit_date)}</small></h3><p style="white-space:pre-wrap">${esc(v.conversation || v.experience)}</p><a href="#/cafe/${esc(c.id)}">Open page</a></div>`).join('') || '<p class="paper">No matching memories.</p>'; };
  $('#q').addEventListener('input', run); run();
}

/* ---------- Forms ---------- */
function fieldHtml([k, l, t, o], init) {
  const v = init[k] ?? '', lab = `<label for="f_${k}">${l}</label>`;
  if (t === 'ro') return lab + `<input id="f_${k}" value="${esc(v)}" readonly aria-readonly="true" class="locked">`;
  if (t === 'photo') return `<label>${l}</label><div class="row"><label class="btn alt sm filebtn">Choose photo<input type="file" accept="image/*" id="f_photo" hidden></label><label class="btn alt sm filebtn">Take photo<input type="file" accept="image/*" capture="environment" id="f_cam" hidden></label></div><img id="pv" alt="Preview" hidden>`;
  if (t === 'sel') return lab + `<select id="f_${k}">${o.map(x => { const [a, b] = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(a)}"${String(v) === String(a) ? ' selected' : ''}>${esc(b)}</option>`; }).join('')}</select>`;
  if (t === 'textarea' || t === 'big') return lab + `<textarea id="f_${k}" class="${t === 'big' ? 'big' : ''}">${esc(v)}</textarea>`;
  if (t === 'pw') return lab + `<input id="f_${k}" type="password" inputmode="numeric" maxlength="4" autocomplete="off">`;
  return lab + `<input id="f_${k}" type="${t}" value="${esc(v)}">`;
}
function form(title, fields, init, submit) {
  const d = document.createElement('dialog'); d.className = 'paper';
  const st = { rid: uid(), file: null, up: null, upRid: uid() }; let busy = false;
  d.innerHTML = `<h3>${esc(title)}</h3><form novalidate>${fields.map(f => fieldHtml(f, init)).join('')}<p class="err" id="fe" role="alert"></p><div class="row"><button class="btn" id="fs">Save</button><button type="button" class="btn alt" id="fc">Cancel</button></div></form>`;
  d.querySelectorAll('input[type=file]').forEach(i => i.onchange = () => {
    const f = i.files[0]; if (!f) return;
    if (!/^image\//.test(f.type) || f.size > 15e6) { d.querySelector('#fe').textContent = 'Please choose an image under 15 MB.'; i.value = ''; return; }
    st.file = f; st.up = null; st.upRid = uid(); d.querySelector('#fe').textContent = '';
    const pv = d.querySelector('#pv'); pv.src = URL.createObjectURL(f); pv.hidden = false;
  });
  d.querySelector('form').onsubmit = async e => {
    e.preventDefault(); if (busy) return; busy = true;
    const b = d.querySelector('#fs'), er = d.querySelector('#fe'); b.disabled = true; b.textContent = 'Saving…'; er.textContent = '';
    try {
      const data = {}; fields.forEach(f => { if (f[2] !== 'ro' && f[2] !== 'photo') data[f[0]] = d.querySelector('#f_' + f[0]).value.trim(); });
      if (st.file) { if (!st.up) { b.textContent = 'Uploading photo…'; st.up = await uploadPhoto(st.file, st.upRid); } data.photo_id = st.up.photo_id; data.thumb_id = st.up.thumb_id; b.textContent = 'Saving…'; }
      const msg = await submit(data, st.rid);
      if (msg) er.textContent = msg; else { d.close(); toast('Saved ✓'); }
    } catch (x) { er.textContent = fail(x); }
    busy = false; b.disabled = false; b.textContent = 'Save';
  };
  d.querySelector('#fc').onclick = () => d.close(); d.onclose = () => d.remove(); document.body.append(d); d.showModal();
}
const cafeF = () => [['name', 'Café name', 'text'], ['location', 'Location', 'text'], ['maps_url', 'Google Maps link', 'url'], ['status', 'Status', 'sel', ['Want to Visit', 'Visited']], ['added_by', 'Added by', 'ro']];
const topicF = () => [['topic', 'Main topic', 'text'], ['notes', 'Notes (optional)', 'textarea'], ['added_by', 'Added by', 'ro']];
const visitF = withCafe => (withCafe ? [['cafe_id', 'Café', 'sel', [['', '— choose a café —']].concat(S.cafes.map(c => [c.id, c.name]))]] : []).concat([['visit_date', 'Visit date', 'date'], ['author', 'Who is writing', 'ro'], ['ordered', 'What we ordered', 'textarea'], ['experience', 'Overall experience', 'textarea'], ['conversation', 'What we talked about', 'big'], ['notes', 'Other notes', 'textarea'], ['photo', 'Photo', 'photo']]);
const MEDIA_F = [['platform', 'Platform', 'sel', ['YouTube', 'TikTok', 'Instagram']], ['url', 'Link', 'url'], ['title', 'Title (optional)', 'text'], ['description', 'Description (optional)', 'textarea']];
const del = async (type, r, ask) => { if (!confirm(ask)) return; const er = await mutate(type, 'delete', { id: r.id, expected_updated_at: r.updated_at }); toast(er || 'Deleted'); if (!er && type === 'cafe') location.hash = '#/bucket'; };
function chooser() {
  const d = document.createElement('dialog'); d.className = 'paper';
  d.innerHTML = '<h3>What would you like to add?</h3><div class="row"><button class="btn" data-x="c">☕ Add a Café</button><button class="btn alt" data-x="t">💭 Add a Topic Idea</button><button class="btn sm" data-x="x">Cancel</button></div>';
  d.onclick = e => { const x = e.target.dataset.x; if (!x) return; d.close(); if (x === 'c') H.addCafe(); if (x === 't') H.addTopic(); };
  d.onclose = () => d.remove(); document.body.append(d); d.showModal();
}
const H = {
  addEntry: chooser,
  addCafe: () => form('Add a Café', cafeF(), { status: 'Want to Visit', added_by: ME.name }, (d, rid) => mutate('cafe', 'add', d, rid)),
  editCafe: id => { const c = find(S.cafes, id); form('Edit café', cafeF(), c, d => mutate('cafe', 'update', { ...d, id, expected_updated_at: c.updated_at })); },
  visitedCafe: async id => { const er = await mutate('cafe', 'update', { id, status: 'Visited', expected_updated_at: find(S.cafes, id).updated_at }); toast(er || 'Marked as visited ✓'); },
  delCafe: id => del('cafe', find(S.cafes, id), 'Delete this café and all its visits?'),
  addTopic: () => form('Add a Topic Idea', topicF(), { added_by: ME.name }, (d, rid) => mutate('topic', 'add', d, rid)),
  editTopic: id => { const t = find(S.topics, id); form('Edit topic idea', topicF(), t, d => mutate('topic', 'update', { ...d, id, expected_updated_at: t.updated_at })); },
  delTopic: id => del('topic', find(S.topics, id), 'Delete this topic idea?'),
  addVisit: id => {
    if (!S.cafes.length) return toast('Add a café first.');
    form('Add a Visit', visitF(true), { cafe_id: id || '', visit_date: today(), author: ME.name }, (d, rid) => d.cafe_id ? mutate('visit', 'add', d, rid) : 'Please choose a café.');
  },
  editVisit: id => { const v = find(S.visits, id); form('Edit visit', visitF(false), v, d => mutate('visit', 'update', { ...d, id, expected_updated_at: v.updated_at })); },
  delVisit: id => del('visit', find(S.visits, id), 'Delete this visit and its links?'),
  addLink: id => form('Add a link', MEDIA_F, { platform: 'YouTube' }, (d, rid) => mutate('media', 'add', { ...d, visit_id: id }, rid)),
  delLink: id => del('media', find(S.media, id), 'Remove this link?'),
  changePin: () => form('Change PIN', [['oldPin', 'Current PIN', 'pw'], ['newPin', 'New PIN (4 digits)', 'pw'], ['newPin2', 'Repeat new PIN', 'pw']], {}, async d => {
    if (!/^\d{4}$/.test(d.newPin)) return 'The new PIN must be exactly 4 digits.';
    if (d.newPin !== d.newPin2) return 'The new PINs do not match.';
    try { await API.changePin(d.oldPin, d.newPin); return null; } catch (x) { return fail(x); }
  }),
  refresh: async () => { try { S = await API.list(); route(); toast('Up to date ✓'); } catch (x) { toast(fail(x)); } },
  logout: () => logout()
};
document.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b && H[b.dataset.a]) H[b.dataset.a](b.dataset.id); });
// User menu: the name button opens Refresh / Change PIN / Log out
const menu = open => { $('#umm').hidden = !open; $('#umb').setAttribute('aria-expanded', String(open)); };
$('#umb').onclick = e => { e.stopPropagation(); menu($('#umm').hidden); };
document.addEventListener('click', () => menu(false));
document.addEventListener('keydown', e => { if (e.key === 'Escape') menu(false); });

/* ---------- Routing, login, startup ---------- */
function route() {
  if (!ME) return;
  const [k, id] = (location.hash.replace('#/', '') || 'journal').split('/');
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('on', a.hash === '#/' + k));
  if (k === 'bucket' || k === 'visited') { app.innerHTML = listView(k); setupList(k); }
  else if (k === 'cafe') app.innerHTML = cafeView(id);
  else if (k === 'memories') { app.innerHTML = memView(); setupMem(); }
  else app.innerHTML = journalView();
  loadPhotos();
}
function logout(msg = '') { localStorage.removeItem('token'); ME = null; photoCache.clear(); document.querySelectorAll('dialog').forEach(d => d.close()); loginScreen(msg); }
function loginScreen(msg = '') {
  $('#nav').hidden = true;
  app.innerHTML = `<section class="cover"><h1>Our Little Café Scrapbook</h1><form id="lf" novalidate><label for="un">Name</label><input id="un" autocomplete="username" autocapitalize="none" value="${esc(localStorage.getItem('lastUser') || '')}"><label for="pn">PIN</label><input id="pn" type="password" inputmode="numeric" maxlength="4" autocomplete="current-password"><p class="err" id="pe" role="alert">${esc(msg)}</p><button class="btn" id="lb">Open Our Journal</button></form><p><small>A 4-digit PIN is a casual barrier, not strong security.</small></p></section>`;
  let busy = false;
  $('#lf').onsubmit = async e => {
    e.preventDefault(); if (busy) return; busy = true; const b = $('#lb'); b.disabled = true; b.textContent = 'Checking…';
    try { const r = await API.login($('#un').value.trim().toLowerCase(), $('#pn').value); localStorage.setItem('token', r.token); localStorage.setItem('lastUser', r.user.username); await start(); }
    catch (x) { $('#pe').textContent = x.message; b.disabled = false; b.textContent = 'Open Our Journal'; busy = false; }
  };
}
async function start() {
  if (!API.token()) return loginScreen();
  try { ME = await API.me(); S = await API.list(); }
  catch (x) { ME = null; if (x.code === 'unauthorized') return logout(x.message); app.innerHTML = `<p class="paper err">${esc(x.message)} <button class="btn sm" onclick="location.reload()">Try again</button></p>`; return; }
  $('#nav').hidden = false; $('#umb').textContent = ME.name + ' ▾'; route();
}
addEventListener('hashchange', route);
start();
