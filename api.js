/* The only file that talks to the backend. The session token (not the PIN) is kept in localStorage. */
const API = {
  token: () => localStorage.getItem('token') || '',
  async call(body, ms = 30000) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), ms);
    let r;
    try {
      // text/plain avoids a CORS preflight, which Apps Script does not support
      r = await fetch(CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ token: API.token(), ...body }), signal: ctl.signal });
    } catch (e) {
      const x = new Error(e.name === 'AbortError' ? 'The server took too long. Please try again.' : 'No connection to the server. Check your internet and try again.');
      x.code = 'network'; throw x;
    } finally { clearTimeout(timer); }
    let j;
    try { j = await r.json(); } catch (_) { const x = new Error('Unexpected reply from the server.'); x.code = 'bad_reply'; throw x; }
    if (!j.ok) { const x = new Error(j.message || j.error); x.code = j.error; x.current = j.current; throw x; }
    return j.data;
  },
  login: (username, pin) => API.call({ action: 'login', username, pin }),
  me: () => API.call({ action: 'me' }),
  list: () => API.call({ action: 'list' }, 45000),
  add: (type, data, request_id) => API.call({ action: 'add', type, data, request_id }),
  update: (type, data) => API.call({ action: 'update', type, data }),
  del: (type, data) => API.call({ action: 'delete', type, data }),
  upload: (request_id, image, thumb) => API.call({ action: 'upload', request_id, image, thumb }, 90000),
  photo: id => API.call({ action: 'photo', id }, 45000),
  changePin: (oldPin, newPin) => API.call({ action: 'changePin', oldPin, newPin })
};
