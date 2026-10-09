(function () {
  'use strict';

  if (typeof window === 'undefined') return;
  if (window.NeupID && typeof window.NeupID.init === 'function') return;

  const NeupID = {};

  let config = {};
  let ui = { container: null, teardown: null };

  NeupID.init = async function init(options) {
    config = normalizeOptions(options);

    if (config.autoPrompt) {
      await NeupID.prompt();
    }
  };

  NeupID.prompt = async function prompt() {
    destroyUI();

    const session = await checkSession();
    if (!session || session.error) return;

    if (session.loggedIn) {
      showOneTap(session);
    }
  };

  NeupID.getSession = async function getSession() {
    return await checkSession();
  };

  NeupID.logout = async function logout() {
    if (!config.endpoints || !config.endpoints.logout) {
      safeWarn('[NeupID] No logout endpoint configured (set init({ endpoints: { logout } }))');
      return { error: 'missing_logout_endpoint' };
    }

    try {
      const res = await fetch(apiUrl(config.endpoints.logout), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: config.clientId, origin: location.origin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return Object.assign({ error: 'request_failed', status: res.status }, data);
      return data;
    } catch (e) {
      safeWarn('[NeupID] Logout request failed', e);
      return { error: 'network_error' };
    }
  };

  NeupID.destroy = function destroy() {
    destroyUI();
    config = {};
  };

  function normalizeOptions(options) {
    const o = options && typeof options === 'object' ? options : {};
    const clientId = typeof o.clientId === 'string' ? o.clientId.trim() : '';
    const callback = typeof o.callback === 'function' ? o.callback : null;
    const autoPrompt = o.autoPrompt === false ? false : true;

    const sdkOrigin = getSdkOrigin();
    const apiBaseUrl = typeof o.apiBaseUrl === 'string' ? o.apiBaseUrl.replace(/\/+@base/, '') : sdkOrigin;

    const endpoints = Object.assign(
      {
        check: '/api/account/bridge/check',
        approve: '/api/account/bridge/approve',
      },
      o.endpoints && typeof o.endpoints === 'object' ? o.endpoints : {}
    );

    return { clientId, callback, autoPrompt, apiBaseUrl, endpoints };
  }

  function getSdkOrigin() {
    try {
      const s = document.currentScript;
      if (s && s.src) return new URL(s.src).origin;
    } catch {}
    return 'https://neupgroup.com';
  }

  function apiUrl(pathname) {
    const base = config.apiBaseUrl || 'https://neupgroup.com';
    if (/^https?:\/\//i.test(pathname)) return pathname;
    return base + pathname;
  }

  async function checkSession() {
    if (!config.clientId) {
      safeWarn('[NeupID] Missing `clientId` in NeupID.init({ clientId })');
      return { error: 'missing_client_id' };
    }

    try {
      const res = await fetch(apiUrl(config.endpoints.check), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: config.clientId,
          origin: location.origin,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) return Object.assign({ error: 'request_failed', status: res.status }, json);
      return json;
    } catch (e) {
      safeWarn('[NeupID] Session check failed', e);
      return { error: 'network_error' };
    }
  }

  function showOneTap(session) {
    onDomReady(() => {
      destroyUI();

      const user = session.user || session;
      const accounts = Array.isArray(session.accounts) ? session.accounts : null;
      let selectedAccountId =
        (accounts && accounts[0] && (accounts[0].id || accounts[0].accountId)) || (user && user.accountId) || null;
      const displayName =
        (user && typeof user.name === 'string' && user.name.trim()) ||
        (user && typeof user.displayName === 'string' && user.displayName.trim()) ||
        'your account';

      const container = document.createElement('div');
      container.setAttribute('data-neupid', 'one-tap');
      container.style.cssText =
        'position:fixed;top:20px;right:20px;z-index:99999;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial;';

      const card = document.createElement('div');
      card.style.cssText =
        'background:#fff;padding:14px 14px 12px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.12);min-width:260px;max-width:340px;border:1px solid rgba(0,0,0,.06);';

      const headerRow = document.createElement('div');
      headerRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;';

      const title = document.createElement('div');
      title.textContent = 'NeupID';
      title.style.cssText = 'font-weight:700;font-size:14px;color:#111;';

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.setAttribute('aria-label', 'Close');
      closeBtn.textContent = '×';
      closeBtn.style.cssText =
        'border:0;background:transparent;color:#555;font-size:18px;line-height:18px;cursor:pointer;padding:2px 6px;border-radius:8px;';

      headerRow.appendChild(title);
      headerRow.appendChild(closeBtn);

      const text = document.createElement('div');
      text.style.cssText = 'margin-top:10px;font-size:13px;color:#222;line-height:1.35;';
      text.appendChild(document.createTextNode('Continue as '));
      const strong = document.createElement('strong');
      strong.textContent = displayName;
      text.appendChild(strong);
      text.appendChild(document.createTextNode('.'));

      let chooser = null;
      if (accounts && accounts.length > 1) {
        chooser = document.createElement('select');
        chooser.setAttribute('aria-label', 'Choose account');
        chooser.style.cssText =
          'width:100%;margin-top:10px;border:1px solid rgba(0,0,0,.15);border-radius:10px;padding:10px 12px;font-size:13px;background:#fff;color:#111;';

        for (let i = 0; i < accounts.length; i++) {
          const a = accounts[i] || {};
          const id = a.id || a.accountId || '';
          const name =
            (typeof a.name === 'string' && a.name.trim()) ||
            (typeof a.displayName === 'string' && a.displayName.trim()) ||
            String(id || 'Account');

          const opt = document.createElement('option');
          opt.value = String(id);
          opt.textContent = name;
          chooser.appendChild(opt);
        }

        chooser.value = selectedAccountId ? String(selectedAccountId) : chooser.value;
        selectedAccountId = chooser.value || selectedAccountId;
        strong.textContent = chooser.options[chooser.selectedIndex]?.textContent || displayName;
      }

      const actions = document.createElement('div');
      actions.style.cssText = 'margin-top:12px;display:flex;gap:10px;align-items:center;';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'neupid-continue-btn';
      btn.textContent = 'Continue';
      btn.style.cssText =
        'flex:1;border:0;background:#111;color:#fff;padding:10px 12px;border-radius:10px;cursor:pointer;font-weight:600;font-size:13px;';

      const secondary = document.createElement('button');
      secondary.type = 'button';
      secondary.textContent = 'Not you?';
      secondary.style.cssText =
        'border:1px solid rgba(0,0,0,.15);background:#fff;color:#111;padding:10px 12px;border-radius:10px;cursor:pointer;font-weight:600;font-size:13px;';

      actions.appendChild(btn);
      actions.appendChild(secondary);

      const footer = document.createElement('div');
      footer.style.cssText = 'margin-top:10px;font-size:11px;color:#666;';
      footer.textContent = 'One-tap sign-in via NeupID.';

      card.appendChild(headerRow);
      card.appendChild(text);
      if (chooser) card.appendChild(chooser);
      card.appendChild(actions);
      card.appendChild(footer);
      container.appendChild(card);
      document.body.appendChild(container);

      const teardown = () => {
        closeBtn.onclick = null;
        btn.onclick = null;
        secondary.onclick = null;
        if (chooser) chooser.onchange = null;
        if (container.parentNode) container.parentNode.removeChild(container);
      };

      closeBtn.onclick = () => destroyUI();
      secondary.onclick = () => destroyUI();
      if (chooser) {
        chooser.onchange = () => {
          selectedAccountId = chooser.value || selectedAccountId;
          strong.textContent = chooser.options[chooser.selectedIndex]?.textContent || strong.textContent;
        };
      }
      btn.onclick = () => approveLogin(selectedAccountId);

      ui = { container, teardown };
    });
  }

  async function approveLogin(accountId) {
    if (!config.clientId) return;

    try {
      const res = await fetch(apiUrl(config.endpoints.approve), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: config.clientId,
          origin: location.origin,
          accountId: accountId || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        safeWarn('[NeupID] Approve failed', data);
        return;
      }

      destroyUI();
      if (config.callback) config.callback(data);
    } catch (e) {
      safeWarn('[NeupID] Approve request failed', e);
    }
  }

  function onDomReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  function destroyUI() {
    if (ui && typeof ui.teardown === 'function') ui.teardown();
    ui = { container: null, teardown: null };
  }

  function safeWarn() {
    try {
      // eslint-disable-next-line no-console
      console.warn.apply(console, arguments);
    } catch {}
  }

  window.NeupID = NeupID;
})();
