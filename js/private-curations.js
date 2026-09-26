(() => {
  'use strict';
  const API = 'https://datanexus-private.imjuno.workers.dev';
  const KEY = 'dn-private-session-v1';
  const box = document.getElementById('private-curations');
  if (!box) return;
  const login = document.getElementById('private-login');
  const logout = document.getElementById('private-logout');
  const status = document.getElementById('private-status');
  const list = document.getElementById('private-list');
  const reader = document.getElementById('private-reader');
  let popup, poll, expiry, generation = 0, token = '';
  try { token = sessionStorage.getItem(KEY) || ''; } catch {}
  function clear(message) {
    generation++;
    token = '';
    clearTimeout(expiry);
    try { sessionStorage.removeItem(KEY); } catch {}
    list.replaceChildren();
    if (reader) {
      reader.hidden = true;
      document.getElementById('private-body').srcdoc = '';
      document.getElementById('private-title').textContent = '비공개 큐레이션';
    }
    login.hidden = false;
    logout.hidden = true;
    status.textContent = message;
  }
  async function api(path) {
    const result = await fetch(API + path, {headers: {Authorization: 'Bearer ' + token}, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer'});
    if (result.status === 401 || result.status === 403) {
      clear('로그인이 필요하거나 열람 권한이 없습니다.');
      throw new Error('로그인이 필요하거나 열람 권한이 없습니다.');
    }
    if (!result.ok) throw new Error('비공개 글을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
    return result;
  }
  async function load() {
    const run = ++generation;
    status.textContent = '접근 권한을 확인하고 있습니다…';
    try {
      const data = await (await api('/api/curations')).json();
      if (run !== generation) return;
      login.hidden = true; logout.hidden = false;
      status.textContent = data.login + ' · 비공개 글 열람 중 (로그인 유지 1시간)';
      clearTimeout(expiry);
      expiry = setTimeout(() => clear('로그인이 만료되었습니다. 다시 로그인해 주세요.'), Math.max(0, data.expiresAt * 1000 - Date.now()));
      list.replaceChildren();
      if (reader) {
        const id = new URLSearchParams(location.search).get('id');
        if (!data.articles.some(a => a.id === id)) throw new Error('해당 비공개 글을 찾을 수 없습니다.');
        const article = await (await api('/api/articles/' + encodeURIComponent(id))).json();
        if (run !== generation) return;
        document.getElementById('private-title').textContent = article.title;
        const csp = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'";
        document.getElementById('private-body').srcdoc = '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="' + csp + '"><style>body{font:17px/1.8 system-ui,sans-serif;max-width:850px;margin:24px auto;padding:0 20px;color:#202124;overflow-wrap:anywhere}pre{background:#f4f4f5;padding:16px;overflow:auto}code{font-size:14px}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:8px}a{color:#2455aa}h2,h3{line-height:1.4}details{margin:20px 0}</style><body>' + article.html + '</body></html>';
        reader.hidden = false;
        document.getElementById('private-download').onclick = async () => {
          try {
            const r = await api('/api/articles/' + encodeURIComponent(id) + '/attachment');
            const blob = await r.blob();
            if (run !== generation) return;
            const url = URL.createObjectURL(blob), a = document.createElement('a');
            a.href = url; a.download = article.filename; a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          } catch (error) { status.textContent = error.message; }
        };
      } else {
        const month = (box.dataset.path || '').match(/^\/curations\/(\d{4}-\d{2})\//)?.[1];
        const articles = data.articles.filter(a => !month || a.date.startsWith(month));
        for (const article of articles) {
          const row = document.createElement('article'); row.className = 'post-entry';
          const heading = document.createElement('h2'), a = document.createElement('a'), summary = document.createElement('p');
          a.href = '/private-reader/?id=' + encodeURIComponent(article.id);
          a.textContent = '🔒 ' + article.title;
          heading.append(a); summary.textContent = article.summary;
          row.append(heading, summary); list.append(row);
        }
        if (!articles.length) list.textContent = '이 목록에는 비공개 글이 없습니다.';
      }
    } catch (error) { if (run === generation) status.textContent = error.message; }
  }
  login.onclick = () => {
    popup = window.open(API + '/auth/login', 'dn-private-login', 'popup,width=600,height=760');
    if (!popup) { status.textContent = '로그인을 위해 팝업을 허용해 주세요.'; return; }
    status.textContent = 'GitHub 로그인 창에서 계정을 선택해 주세요.';
    clearInterval(poll);
    poll = setInterval(() => { if (popup?.closed) { clearInterval(poll); popup = null; if (!token) status.textContent = '로그인 창이 닫혔습니다. 필요하면 다시 로그인해 주세요.'; } }, 700);
  };
  window.addEventListener('message', event => {
    if (event.origin !== API || !popup || event.source !== popup || event.data?.type !== 'dn-auth') return;
    clearInterval(poll); popup = null;
    if (event.data.error) { clear(event.data.error); return; }
    if (typeof event.data.token !== 'string') return;
    token = event.data.token;
    try { sessionStorage.setItem(KEY, token); } catch {}
    load();
  });
  logout.onclick = () => clear('로그아웃했습니다.');
  window.addEventListener('pageshow', e => { if (e.persisted) { try { token = sessionStorage.getItem(KEY) || ''; } catch {} if (token) load(); else clear('로그인하면 비공개 글을 볼 수 있습니다.'); } });
  if (token) load();
})();
