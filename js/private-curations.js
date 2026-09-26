(() => {
  'use strict';
  const API = 'https://datanexus-private.imjuno.workers.dev';
  const KEY = 'dn-private-session-v1';
  const box = document.getElementById('private-curations');
  if (!box) return;
  const login = document.getElementById('private-login');
  const logout = document.getElementById('private-logout');
  const status = document.getElementById('private-status');
  const list = document.querySelector('[data-private-target]') || document.getElementById('posts-container');
  const toggle = document.getElementById('private-toggle');
  const VISIBILITY_KEY = 'dn-private-visible';
  let privateArticles = [], authorized = false;
  const reader = document.getElementById('private-reader');
  let popup, poll, expiry, generation = 0, token = '';
  let privateArticleHTML = '', readerStyles;
  // Use the same stylesheet order and selectors as a regular post. Keep the
  // private HTML in its script-free, opaque-origin sandbox.
  async function renderPrivateBody() {
    const frame = document.getElementById('private-body');
    if (!frame || !privateArticleHTML) return;
    const html = privateArticleHTML;
    if (!readerStyles) {
      readerStyles = Promise.all([...document.head.querySelectorAll('link[rel~="stylesheet"], style')].map(async node => {
        if (node.tagName === 'STYLE') return node.textContent;
        const url = new URL(node.href, location.href);
        if (url.origin !== location.origin) return '';
        const result = await fetch(url.href);
        if (!result.ok) throw new Error('본문 스타일을 불러오지 못했습니다. 새로고침해 주세요.');
        return result.text();
      })).catch(error => { readerStyles = undefined; throw error; });
    }
    const styles = await readerStyles;
    if (html !== privateArticleHTML) return;
    const doc = document.implementation.createHTMLDocument('비공개 게시글 본문');
    doc.documentElement.lang = document.documentElement.lang || 'ko';
    const csp = doc.createElement('meta');
    csp.httpEquiv = 'Content-Security-Policy';
    csp.content = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'";
    doc.head.prepend(csp);
    for (const text of styles) {
      const style = doc.createElement('style'); style.textContent = text; doc.head.append(style);
    }
    doc.body.classList.toggle('dark', document.body.classList.contains('dark'));
    const post = doc.createElement('article'); post.className = 'post-single';
    const content = doc.createElement('div'); content.className = 'post-content';
    content.innerHTML = html;
    post.append(content); doc.body.append(post);
    frame.srcdoc = '<!doctype html>' + doc.documentElement.outerHTML;
  }
  if (reader) {
    new MutationObserver(() => { renderPrivateBody().catch(error => { status.textContent = error.message; }); })
      .observe(document.body, {attributes: true, attributeFilter: ['class']});
  }
  function removePrivateRows() {
    list?.querySelectorAll('[data-private-entry]').forEach(row => row.remove());
  }
  function refreshList() {
    removePrivateRows();
    if (authorized && toggle?.checked && list) {
      const month = (box.dataset.path || '').match(/^\/curations\/(\d{4}-\d{2})\//)?.[1];
      for (const article of privateArticles.filter(a => !month || a.date.startsWith(month))) {
        const row = document.createElement('article'); row.className = 'post-entry';
        row.dataset.privateEntry = article.id; row.dataset.published = article.date;
        const header = document.createElement('header'); header.className = 'entry-header';
        const heading = document.createElement('h2'); heading.className = 'entry-hint-parent';
        heading.textContent = '🔒 ' + article.title; header.append(heading);
        const summary = document.createElement('div'); summary.className = 'entry-content';
        const paragraph = document.createElement('p'); paragraph.textContent = article.summary; summary.append(paragraph);
        const a = document.createElement('a'); a.className = 'entry-link';
        a.href = '/private-reader/?id=' + encodeURIComponent(article.id);
        a.setAttribute('aria-label', '비공개 글: ' + article.title);
        row.append(header, summary, a);
        const following = [...list.children].find(el => el.matches('article.post-entry') && Date.parse(el.dataset.published) <= Date.parse(article.date));
        if (following) list.insertBefore(row, following); else list.append(row);
      }
    }
    document.getElementById('posts-container')?.dispatchEvent(new Event('dn:posts-changed'));
  }
  if (toggle) toggle.addEventListener('change', () => {
    if (!authorized) { toggle.checked = false; login.click(); return; }
    try { sessionStorage.setItem(VISIBILITY_KEY, toggle.checked ? '1' : '0'); } catch {}
    refreshList();
  });
  try { token = localStorage.getItem(KEY) || sessionStorage.getItem(KEY) || ''; } catch {}
  function clear(message) {
    generation++;
    privateArticleHTML = '';
    token = '';
    clearTimeout(expiry);
    try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch {}
    authorized = false; privateArticles = [];
    if (toggle) toggle.checked = false;
    refreshList();
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
      try { localStorage.setItem(KEY, token); sessionStorage.removeItem(KEY); } catch {}
      authorized = true;
      privateArticles = data.articles;
      if (toggle) {
        let show = true;
        try { show = sessionStorage.getItem(VISIBILITY_KEY) !== '0'; } catch {}
        toggle.checked = show;
      }
      if (reader) {
        const id = new URLSearchParams(location.search).get('id');
        if (!data.articles.some(a => a.id === id)) throw new Error('해당 비공개 글을 찾을 수 없습니다.');
        const article = await (await api('/api/articles/' + encodeURIComponent(id))).json();
        if (run !== generation) return;
        document.getElementById('private-title').textContent = article.title;
        privateArticleHTML = article.html;
        await renderPrivateBody();
        if (run !== generation) return;
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
        refreshList();
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
    try { sessionStorage.setItem(VISIBILITY_KEY, '1'); } catch {}
    try { localStorage.setItem(KEY, token); } catch {}
    load();
  });
  logout.onclick = () => clear('로그아웃했습니다.');
  window.addEventListener('pageshow', e => { if (e.persisted) { try { token = localStorage.getItem(KEY) || sessionStorage.getItem(KEY) || ''; } catch {} if (token) load(); else clear('로그인하면 비공개 글을 볼 수 있습니다.'); } });
  window.addEventListener('storage', event => {
    if (event.key !== KEY || event.storageArea !== localStorage) return;
    if (!event.newValue) { clear('로그아웃했습니다.'); return; }
    token = event.newValue;
    try { sessionStorage.removeItem(VISIBILITY_KEY); } catch {}
    load();
  });
  if (token) load();
})();
