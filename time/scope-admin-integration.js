(function () {
  const SUPABASE_URL = "https://akofsmmsxtfqduebetga.supabase.co";
  const SUPABASE_KEY = "sb_publishable_5IC3CkcNPr9-XrMBymBcoQ_XrL66k4y";

  const state = {
    authStore: null,
    session: null,
    profile: null,
    jobSites: [],
    mappings: [],
    projects: [],
    selectedSiteId: "",
    isMounted: false,
    isLoading: false,
    isCheckingMount: false,
    syncResult: null,
  };

  const els = {};

  function installStyles() {
    if (document.getElementById("scope-admin-integration-styles")) return;
    const style = document.createElement("style");
    style.id = "scope-admin-integration-styles";
    style.textContent = `
      .scope-admin-shell {
        width: 100%;
        max-width: 56rem;
        margin: 0 auto;
      }

      .scope-admin-topbar,
      .scope-admin-card-head,
      .scope-admin-row-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.75rem;
      }

      .scope-admin-topbar {
        align-items: center;
        margin-bottom: 1rem;
      }

      .scope-admin-title {
        margin: 0;
        font-size: clamp(1.5rem, 6vw, 2.25rem);
        line-height: 1.05;
        font-weight: 800;
      }

      .scope-admin-subtitle {
        margin: 0.5rem 0 0;
        max-width: 44rem;
        color: var(--color-muted, #a8a29e);
        font-size: 0.95rem;
        line-height: 1.4;
      }

      .scope-admin-kicker {
        margin: 0 0 0.25rem;
        color: var(--color-accent, #da7756);
        font-size: 0.75rem;
        font-weight: 800;
        letter-spacing: 0.16em;
        text-transform: uppercase;
      }

      .scope-admin-layout {
        display: grid;
        gap: 1rem;
      }

      .scope-admin-card,
      .scope-admin-row,
      .scope-admin-notice,
      .scope-admin-error {
        border: 1px solid var(--color-border, #44403c);
        border-radius: 0.375rem;
        background: var(--color-card, #292524);
        box-shadow: 0 8px 24px var(--color-shadow, rgba(0, 0, 0, 0.3));
      }

      .scope-admin-card {
        display: grid;
        gap: 0.875rem;
        padding: 1rem;
      }

      .scope-admin-form,
      .scope-admin-list {
        display: grid;
        gap: 0.75rem;
      }

      .scope-admin-field {
        display: grid;
        gap: 0.375rem;
      }

      .scope-admin-label {
        color: var(--color-muted, #a8a29e);
        font-size: 0.875rem;
        font-weight: 700;
      }

      .scope-admin-input,
      .scope-admin-select {
        width: 100%;
        min-width: 0;
        min-height: 3rem;
        border: 1px solid var(--color-input-border, #57534e);
        border-radius: 0.375rem;
        background: var(--color-input-bg, #292524);
        color: var(--color-ink, #e7e5e4);
        padding: 0.625rem 0.75rem;
        font: inherit;
      }

      .scope-admin-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.625rem;
      }

      .scope-admin-button {
        min-height: 2.75rem;
        border: 0;
        border-radius: 0.375rem;
        background: var(--color-accent, #da7756);
        color: white;
        padding: 0 1rem;
        font: inherit;
        font-weight: 800;
      }

      .scope-admin-button.secondary {
        border: 1px solid var(--color-border, #44403c);
        background: transparent;
        color: var(--color-muted-strong, #d6d3d1);
      }

      .scope-admin-button:disabled {
        opacity: 0.55;
      }

      .scope-admin-row {
        display: grid;
        gap: 0.5rem;
        padding: 0.75rem;
        background: var(--color-card-alt, #1c1917);
      }

      .scope-admin-row-title {
        min-width: 0;
        overflow-wrap: anywhere;
        font-weight: 800;
      }

      .scope-admin-muted {
        color: var(--color-muted, #a8a29e);
      }

      .scope-admin-small {
        font-size: 0.875rem;
        line-height: 1.35;
      }

      .scope-admin-pill {
        display: inline-flex;
        align-items: center;
        min-height: 2rem;
        border-radius: 999px;
        background: var(--color-badge-neutral, #44403c);
        color: var(--color-badge-neutral-text, #d6d3d1);
        padding: 0.35rem 0.625rem;
        font-size: 0.8125rem;
        font-weight: 800;
      }

      .scope-admin-pill.good {
        background: var(--color-success-bg, #052e16);
        color: var(--color-success, #7cb894);
      }

      .scope-admin-notice,
      .scope-admin-error {
        padding: 0.75rem;
        font-weight: 700;
        overflow-wrap: anywhere;
      }

      .scope-admin-notice {
        border-color: var(--color-success-border, #166534);
        background: var(--color-success-bg, #052e16);
        color: var(--color-success, #7cb894);
      }

      .scope-admin-error {
        border-color: var(--color-error-border, #991b1b);
        background: var(--color-error-bg, #450a0a);
        color: var(--color-error-text, #fca5a5);
      }

      .scope-admin-hidden {
        display: none !important;
      }
    `;
    document.head.append(style);
  }

  function getStoredAuth() {
    const key = Object.keys(localStorage).find((candidate) => (
      candidate.startsWith("sb-") && candidate.endsWith("-auth-token")
    ));
    if (!key) return null;
    try {
      const saved = JSON.parse(localStorage.getItem(key));
      return { key, saved, session: saved?.currentSession || saved?.session || saved };
    } catch { return null; }
  }

  function saveStoredSession(authStore, session) {
    if (!authStore?.key || !session) return;
    const saved = authStore.saved || {};
    if (saved.currentSession || saved.session) { saved.currentSession = session; saved.session = session; }
    else { Object.assign(saved, session); }
    localStorage.setItem(authStore.key, JSON.stringify(saved));
    authStore.saved = saved;
    authStore.session = session;
  }

  function sessionNeedsRefresh(session) {
    if (!session?.refresh_token) return false;
    if (!session.expires_at) return true;
    return Math.floor(Date.now() / 1000) > Number(session.expires_at) - 60;
  }

  async function refreshSession(authStore) {
    if (!authStore?.session?.refresh_token) return authStore?.session || null;
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: authStore.session.refresh_token }),
    });
    if (!response.ok) throw new Error("Your Time Clock sign-in has expired. Sign in again.");
    const refreshed = await response.json();
    saveStoredSession(authStore, refreshed);
    return refreshed;
  }

  function headers(extra = {}) {
    return {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${state.session?.access_token || SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...extra,
    };
  }

  async function request(path, options = {}, hasRetried = false) {
    const response = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers: headers(options.headers) });
    if (!response.ok) {
      const text = await response.text();
      if (!hasRetried && (text.includes("PGRST303") || text.includes("JWT expired")) && state.authStore?.session?.refresh_token) {
        state.session = await refreshSession(state.authStore);
        return request(path, options, true);
      }
      throw new Error(formatError(text || `Request failed with ${response.status}`));
    }
    if (response.status === 204) return null;
    return response.json();
  }

  function formatError(message) {
    try {
      const parsed = JSON.parse(message);
      if (parsed.code === "PGRST303" || String(parsed.message || "").includes("JWT expired")) {
        return "Your Time Clock sign-in expired. Sign in again.";
      }
      return parsed.message || parsed.error || message;
    } catch { return message; }
  }

  function option(value, label) {
    const node = document.createElement("option");
    node.value = value;
    node.textContent = label;
    return node;
  }

  function activeSite() { return state.jobSites.find((site) => site.id === state.selectedSiteId) || null; }
  function activeMapping() { return state.mappings.find((m) => m.job_site_id === state.selectedSiteId) || null; }
  function visibleProjects() { return state.projects.filter((p) => p.job_site_id === state.selectedSiteId); }

  function setMessage(kind, message) {
    if (!els.message) return;
    els.message.className = kind === "error" ? "scope-admin-error" : "scope-admin-notice";
    els.message.textContent = message;
    els.message.classList.toggle("scope-admin-hidden", !message);
  }

  function clearMessage() { setMessage("notice", ""); }

  async function checkAdminProfile() {
    state.authStore = getStoredAuth();
    state.session = state.authStore?.session || null;
    if (!state.session?.access_token || !state.session?.user?.id) return null;
    if (sessionNeedsRefresh(state.session)) state.session = await refreshSession(state.authStore);
    const rows = await request(`/rest/v1/profiles?select=id,first_name,last_name,role,is_active&id=eq.${state.session.user.id}&limit=1`);
    const profile = rows[0] || null;
    if (profile?.is_active && profile.role === "admin") { state.profile = profile; return profile; }
    return null;
  }

  async function loadData() {
    if (state.isLoading) return;
    state.isLoading = true;
    try {
      await checkAdminProfile();
      const [jobSites, mappings, projects] = await Promise.all([
        request("/rest/v1/job_sites?select=*&order=name.asc"),
        request("/rest/v1/scope_notion_databases?select=*&order=title.asc"),
        request("/rest/v1/scope_projects?select=*&order=unit_name.asc"),
      ]);
      state.jobSites = jobSites;
      state.mappings = mappings;
      state.projects = projects;
      if (!state.selectedSiteId) state.selectedSiteId = jobSites[0]?.id || "";
      renderPanel();
    } finally { state.isLoading = false; }
  }

  /* ── Mount into React placeholder ────────────────────── */

  function mount(root) {
    if (state.isMounted) return;
    state.isMounted = true;
    installStyles();
    buildPanel(root);
    renderPanel();
    loadData().catch((error) => setMessage("error", error.message));
  }

  function unmount() {
    state.isMounted = false;
    Object.keys(els).forEach((key) => { els[key] = null; });
  }

  function buildPanel(root) {
    const shell = document.createElement("div");
    shell.className = "scope-admin-shell";
    shell.innerHTML = `
      <header class="scope-admin-topbar">
        <div>
          <p class="scope-admin-kicker">Admin</p>
          <h1 class="scope-admin-title">Scope</h1>
          <p class="scope-admin-subtitle">Choose a property, paste the Notion scope database link, and the app will match rows automatically where Notion's Job Code equals the Time app job code.</p>
        </div>
      </header>
      <div id="scope-admin-message" class="scope-admin-notice scope-admin-hidden"></div>
      <div class="scope-admin-layout">
        <section class="scope-admin-card">
          <div class="scope-admin-card-head">
            <div>
              <p class="scope-admin-kicker">Connect</p>
              <h2 class="scope-admin-title" style="font-size: 1.35rem;">Property scope database</h2>
            </div>
            <span class="scope-admin-pill" id="scope-mapping-pill">Loading</span>
          </div>
          <form class="scope-admin-form" id="scope-connect-form">
            <label class="scope-admin-field">
              <span class="scope-admin-label">Property</span>
              <select class="scope-admin-select" id="scope-job-site"></select>
            </label>
            <label class="scope-admin-field">
              <span class="scope-admin-label">Notion scope database URL</span>
              <input class="scope-admin-input" id="scope-database-url" type="url" autocomplete="off" placeholder="https://www.notion.so/..." required />
            </label>
            <div class="scope-admin-actions">
              <button class="scope-admin-button" type="submit" id="scope-connect-button">Connect / Refresh from Notion</button>
            </div>
          </form>
        </section>
        <section class="scope-admin-card">
          <div>
            <p class="scope-admin-kicker">Detected Matches</p>
            <h2 class="scope-admin-title" style="font-size: 1.35rem;">What the app found</h2>
          </div>
          <div class="scope-admin-list" id="scope-match-list"></div>
        </section>
        <section class="scope-admin-card">
          <div>
            <p class="scope-admin-kicker">Current Links</p>
            <h2 class="scope-admin-title" style="font-size: 1.35rem;">Active scope projects</h2>
          </div>
          <div class="scope-admin-list" id="scope-project-list"></div>
        </section>
        <section class="scope-admin-card">
          <div>
            <p class="scope-admin-kicker">Review</p>
            <h2 class="scope-admin-title" style="font-size: 1.35rem;">Needs attention</h2>
          </div>
          <div class="scope-admin-list" id="scope-review-list"></div>
        </section>
      </div>
    `;
    root.replaceChildren(shell);

    els.message = shell.querySelector("#scope-admin-message");
    els.mappingPill = shell.querySelector("#scope-mapping-pill");
    els.form = shell.querySelector("#scope-connect-form");
    els.siteSelect = shell.querySelector("#scope-job-site");
    els.databaseUrl = shell.querySelector("#scope-database-url");
    els.connectButton = shell.querySelector("#scope-connect-button");
    els.matchList = shell.querySelector("#scope-match-list");
    els.projectList = shell.querySelector("#scope-project-list");
    els.reviewList = shell.querySelector("#scope-review-list");

    els.siteSelect.addEventListener("change", () => {
      state.selectedSiteId = els.siteSelect.value;
      state.syncResult = null;
      clearMessage();
      renderPanel();
    });
    els.form.addEventListener("submit", (event) => {
      syncDatabase(event).catch((error) => setMessage("error", error.message));
    });
  }

  function row(title, detail, pillText, pillGood = false) {
    const item = document.createElement("article");
    item.className = "scope-admin-row";
    const head = document.createElement("div");
    head.className = "scope-admin-row-head";
    const titleNode = document.createElement("p");
    titleNode.className = "scope-admin-row-title";
    titleNode.textContent = title;
    head.append(titleNode);
    if (pillText) {
      const pill = document.createElement("span");
      pill.className = `scope-admin-pill${pillGood ? " good" : ""}`;
      pill.textContent = pillText;
      head.append(pill);
    }
    const detailNode = document.createElement("p");
    detailNode.className = "scope-admin-muted scope-admin-small";
    detailNode.textContent = detail;
    item.append(head, detailNode);
    return item;
  }

  function renderPanel() {
    if (!state.isMounted || !els.form) return;
    const mapping = activeMapping();
    els.siteSelect.replaceChildren(...state.jobSites.map((site) => option(site.id, site.name)));
    els.siteSelect.value = state.selectedSiteId;
    els.databaseUrl.value = mapping?.notion_database_url || "";
    els.mappingPill.textContent = mapping ? "Connected" : "Not connected";
    els.mappingPill.classList.toggle("good", Boolean(mapping));
    renderMatches();
    renderProjects();
    renderReview();
  }

  function renderMatches() {
    const result = state.syncResult;
    if (!result) {
      els.matchList.replaceChildren(row("No refresh run yet", "Paste a Notion database URL and refresh. The app will match rows using the Job Code property.", null));
      return;
    }
    const fragment = document.createDocumentFragment();
    if (result.matched.length === 0) {
      fragment.append(row("No matches found", "No Notion rows had a Job Code that matched this property's Time app job codes.", null));
    } else {
      result.matched.forEach((match) => {
        fragment.append(row(match.title, `${match.jobCode} | ${match.jobCodeName || "Job code"} | ${match.insertedItems} new checklist items`, "Matched", true));
      });
    }
    els.matchList.replaceChildren(fragment);
  }

  function renderProjects() {
    const projects = visibleProjects();
    if (projects.length === 0) {
      els.projectList.replaceChildren(row("No scope projects linked", "Refresh from Notion to create links automatically.", null));
      return;
    }
    const fragment = document.createDocumentFragment();
    projects.forEach((project) => {
      fragment.append(row(project.unit_name, `${project.sync_status || "linked"} | ${project.is_active ? "Active" : "Inactive"}`, project.job_code_id ? "Linked" : "No job code", Boolean(project.job_code_id)));
    });
    els.projectList.replaceChildren(fragment);
  }

  function renderReview() {
    const result = state.syncResult;
    const fragment = document.createDocumentFragment();
    if (!result) {
      fragment.append(row("Matching rule", 'Each Notion row needs a property named exactly "Job Code". Its value should match the Time app job code, like QS0358.', "Convention", true));
      els.reviewList.replaceChildren(fragment);
      return;
    }
    result.unmatchedNotion.forEach((item) => {
      fragment.append(row(item.title, `${item.jobCode || "No job code"} | ${item.reason}`, "Notion"));
    });
    result.unmatchedJobCodes.forEach((item) => {
      fragment.append(row(item.code, `${item.name} has no matching Notion scope row.`, "Time app"));
    });
    if (!fragment.childNodes.length) {
      fragment.append(row("Everything matched", "No unmatched Notion rows or Time app job codes were found for this property.", "Clean", true));
    }
    els.reviewList.replaceChildren(fragment);
  }

  async function syncDatabase(event) {
    event.preventDefault();
    clearMessage();
    const site = activeSite();
    const notionDatabaseUrl = els.databaseUrl.value.trim();
    if (!site || !notionDatabaseUrl) {
      setMessage("error", "Choose a property and paste the Notion database URL.");
      return;
    }
    els.connectButton.disabled = true;
    els.connectButton.textContent = "Refreshing...";
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/sync-scope-database`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${state.session?.access_token || ""}`,
          apikey: SUPABASE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ jobSiteId: site.id, notionDatabaseUrl }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Scope sync failed.");
      state.syncResult = payload;
      setMessage("notice", `Synced ${payload.summary.matched} scope match${payload.summary.matched === 1 ? "" : "es"} from Notion.`);
      await loadData();
      state.syncResult = payload;
      renderPanel();
    } finally {
      els.connectButton.disabled = false;
      els.connectButton.textContent = "Connect / Refresh from Notion";
    }
  }

  /* ── Watch for React placeholder ─────────────────────── */

  async function reconcileMount() {
    const root = document.getElementById("scope-content-root");
    if (!root) {
      if (state.isMounted) unmount();
      return;
    }
    if (state.isMounted || state.isCheckingMount) return;

    state.isCheckingMount = true;
    try {
      const profile = await checkAdminProfile().catch(() => null);
      if (profile?.role === "admin") mount(root);
    } finally {
      state.isCheckingMount = false;
    }
  }

  const observer = new MutationObserver(() => {
    reconcileMount();
  });

  window.addEventListener("load", () => {
    observer.observe(document.body, { childList: true, subtree: true });
    reconcileMount();
  });
})();
