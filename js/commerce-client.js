(() => {
  'use strict';

  // Commerce is a shared gateway. FLOW only receives short-lived OAuth URLs;
  // Shopify access tokens and API calls stay on commerce.synviocore.xyz.
  const gateway = 'https://commerce.synviocore.xyz/api/shopify';
  const sb = window.synvioSupabase;
  let organisationId = '';
  let activeConnection = null;
  let card;

  const css = `
    .commerce-flow-card{margin-top:18px;padding:18px;border:1px solid rgba(125,155,205,.24);border-radius:16px;background:rgba(24,35,55,.58);display:grid;gap:14px}
    .commerce-flow-card h3{margin:0;font-size:16px}.commerce-flow-card p{margin:0;color:#99a9c2;line-height:1.5;font-size:13px}
    .commerce-flow-row{display:flex;flex-wrap:wrap;gap:10px;align-items:end}.commerce-flow-row label{display:grid;gap:6px;min-width:220px;flex:1;font-size:12px;font-weight:700}
    .commerce-flow-card input,.commerce-flow-card textarea,.commerce-flow-card select{box-sizing:border-box;width:100%;border:1px solid rgba(125,155,205,.28);border-radius:10px;background:#101a2b;color:#edf4ff;padding:10px;font:inherit}
    .commerce-flow-card textarea{min-height:120px;resize:vertical;line-height:1.45}.commerce-flow-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
    .commerce-flow-card button{border:1px solid rgba(125,155,205,.35);border-radius:10px;background:#1f2d46;color:#eef5ff;padding:9px 12px;font-weight:700;cursor:pointer}.commerce-flow-card button.primary{background:#356fe4;border-color:#5a8cff}.commerce-flow-card button.danger{background:#321a25;border-color:#8a3c53;color:#ffc1cb}.commerce-flow-card button:disabled{opacity:.55;cursor:wait}
    .commerce-flow-status{min-height:18px;font-size:12px;color:#9eb0c9}.commerce-flow-status.ok{color:#55d79c}.commerce-flow-status.error{color:#ff9f9f}.commerce-flow-connection{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 12px;border:1px solid rgba(125,155,205,.24);border-radius:10px;background:rgba(11,20,34,.58);font-size:13px}
  `;
  const style = document.createElement('style'); style.textContent = css; document.head.append(style);

  function setStatus(message, type = '') { const el = card?.querySelector('[data-commerce-status]'); if (el) { el.textContent = message || ''; el.className = `commerce-flow-status ${type}`.trim(); } }
  async function authContext() {
    if (!sb) throw new Error('Sign in to configure Commerce.');
    const sessionResult = await sb.auth.getSession();
    const session = sessionResult.data.session;
    if (!session) throw new Error('Sign in again to configure Commerce.');
    const { data, error } = await sb.from('organization_members').select('organization_id').eq('user_id', session.user.id).order('organization_id').limit(1).maybeSingle();
    if (error || !data?.organization_id) throw new Error('No organization is linked to this account.');
    organisationId = data.organization_id;
    return session.access_token;
  }
  async function api(path, options = {}) {
    const token = await authContext();
    const response = await fetch(`${gateway}/${path}`, { ...options, cache: 'no-store', headers: { authorization: `Bearer ${token}`, 'x-synvio-organization-id': organisationId, 'x-synvio-caller-kind': 'flow', ...(options.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Commerce integration is unavailable.');
    return body;
  }
  function selectedBotId() { return document.querySelector('#bots')?.value || ''; }
  function renderConnection(connection) {
    activeConnection = connection || null;
    const host = card?.querySelector('[data-commerce-connection]'); if (!host) return; host.replaceChildren();
    if (!connection) { host.textContent = 'No Shopify store connected.'; return; }
    const row = document.createElement('div'); row.className = 'commerce-flow-connection';
    const label = document.createElement('strong'); label.textContent = `${connection.shop_domain} · ${connection.status}`;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'danger'; button.textContent = 'Disconnect'; button.onclick = async () => { if (!confirm(`Disconnect ${connection.shop_domain}?`)) return; button.disabled = true; try { await api('disconnect', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ connectionId: connection.id }) }); setStatus('Shopify store disconnected.', 'ok'); await refresh(); } catch (error) { setStatus(error.message, 'error'); button.disabled = false; } };
    row.append(label, button); host.append(row);
  }
  async function refresh() {
    try { const body = await api('status'); renderConnection((body.connections || []).find(item => item.status === 'active')); await loadPlaybook(); } catch (error) { setStatus(error.message, 'error'); }
  }
  async function loadPlaybook() {
    const botId = selectedBotId(); const suffix = `?target=flow${botId ? `&flow_bot_id=${encodeURIComponent(botId)}` : ''}`;
    const body = await api(`playbook${suffix}`); const textarea = card?.querySelector('[data-commerce-playbook]'); if (textarea) textarea.value = body.playbook?.prompt || ''; const version = card?.querySelector('[data-commerce-version]'); if (version) version.textContent = body.playbook?.version ? `Version ${body.playbook.version}` : 'Default playbook';
  }
  async function connect() {
    const input = card.querySelector('[data-commerce-shop]'); const shop = input.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) { setStatus('Enter a valid *.myshopify.com domain.', 'error'); return; }
    const button = card.querySelector('[data-commerce-connect]'); button.disabled = true; button.textContent = 'Opening Shopify…';
    try { const returnTo = `${location.origin}/?commerce=connected`; const body = await api(`oauth/start?shop=${encodeURIComponent(shop)}&return_to=${encodeURIComponent(returnTo)}&format=json`); if (!body.authorizeUrl) throw new Error('Shopify authorization could not be started.'); location.assign(body.authorizeUrl); } catch (error) { setStatus(error.message, 'error'); button.disabled = false; button.textContent = 'Connect Shopify'; }
  }
  function createCard(panel) {
    card = document.createElement('div'); card.className = 'commerce-flow-card'; card.innerHTML = `<div><h3>Shopify Commerce</h3><p>Connect one store through the central Commerce gateway. FLOW can check products, stock, orders and fulfilment using the editable playbook below; it never receives the Shopify token.</p></div><div data-commerce-connection>No Shopify store connected.</div><div class="commerce-flow-row"><label>Shop domain<input data-commerce-shop placeholder="store.myshopify.com" autocomplete="off"></label><div class="commerce-flow-actions"><button type="button" class="primary" data-commerce-connect>Connect Shopify</button><button type="button" data-commerce-refresh>Refresh</button></div></div><form data-commerce-playbook-form><label>FLOW Commerce playbook <span data-commerce-version>Default playbook</span><textarea data-commerce-playbook maxlength="20000" placeholder="Describe how the assistant may use Commerce data…"></textarea></label><div class="commerce-flow-actions"><button type="submit" class="primary">Save playbook</button></div></form><div data-commerce-status class="commerce-flow-status" role="status"></div>`;
    panel.append(card); card.querySelector('[data-commerce-connect]').onclick = connect; card.querySelector('[data-commerce-refresh]').onclick = refresh; card.querySelector('[data-commerce-playbook-form]').onsubmit = async event => { event.preventDefault(); const button = event.submitter; button.disabled = true; try { await api('playbook', { method: 'PUT', headers: {'content-type':'application/json'}, body: JSON.stringify({ target: 'flow', flow_bot_id: selectedBotId() || null, prompt: card.querySelector('[data-commerce-playbook]').value.trim(), enabled: true }) }); setStatus('Commerce playbook saved.', 'ok'); await loadPlaybook(); } catch (error) { setStatus(error.message, 'error'); } finally { button.disabled = false; } }; refresh();
  }
  function boot() { const panel = document.querySelector('[data-panel="connect"] .card'); if (!panel || panel.querySelector('.commerce-flow-card')) return; createCard(panel); }
  const observer = new MutationObserver(boot); observer.observe(document.documentElement, { childList: true, subtree: true }); setTimeout(boot, 350); window.addEventListener('popstate', boot);
})();
