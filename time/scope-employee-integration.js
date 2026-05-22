(function () {
  const SUPABASE_URL = "https://akofsmmsxtfqduebetga.supabase.co";
  const SUPABASE_KEY = "sb_publishable_5IC3CkcNPr9-XrMBymBcoQ_XrL66k4y";

  const state = {
    authStore: null,
    session: null,
    profile: null,
    openEntry: null,
    project: null,
    items: [],
    sections: [],
    sectionOrder: [],
    sectionOrderProjectId: "",
    collapsedSections: new Set(),
    isMounted: false,
    isLoading: false,
    isCheckingMount: false,
    hasLoaded: false,
    isSavingReorder: false,
    drag: null,
    root: null,
    config: {
      forcedJobCode: "",
      allowIdleView: false,
      forceMount: false,
    },
    usingForcedJobCode: false,
    flushTimerId: 0,
  };

  const els = {};

  function installStyles() {
    if (document.getElementById("scope-employee-integration-styles")) return;
    const style = document.createElement("style");
    style.id = "scope-employee-integration-styles";
    style.textContent = `
      .scope-employee-shell {
        width: 100%;
        max-width: 48rem;
        margin: 0 auto;
        display: grid;
        gap: 1rem;
      }

      .scope-employee-topbar,
      .scope-employee-section-toggle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
      }

      .scope-employee-title {
        margin: 0;
        font-size: clamp(1.6rem, 7vw, 2.5rem);
        line-height: 1.05;
        font-weight: 900;
      }

      .scope-employee-kicker {
        margin: 0 0 0.25rem;
        color: var(--color-accent, #da7756);
        font-size: 0.75rem;
        font-weight: 900;
        letter-spacing: 0.16em;
        text-transform: uppercase;
      }

      .scope-employee-card,
      .scope-employee-error {
        min-width: 0;
        border: 1px solid var(--color-border, #44403c);
        border-radius: 0.5rem;
        background: var(--color-card, #292524);
        box-shadow: 0 8px 24px var(--color-shadow, rgba(0, 0, 0, 0.3));
      }

      .scope-employee-card {
        display: grid;
        gap: 1rem;
        padding: 1rem;
      }

      .scope-employee-loading {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        min-height: 4.5rem;
        color: var(--color-muted-strong, #d6d3d1);
        font-weight: 900;
      }

      .scope-employee-spinner {
        width: 1.75rem;
        height: 1.75rem;
        flex: 0 0 auto;
        border: 3px solid var(--color-badge-neutral, #44403c);
        border-top-color: var(--color-accent, #da7756);
        border-radius: 999px;
        animation: scope-employee-spin 0.8s linear infinite;
      }

      @keyframes scope-employee-spin {
        to {
          transform: rotate(360deg);
        }
      }

      .scope-employee-button {
        min-height: 2.75rem;
        border: 0;
        border-radius: 0.375rem;
        background: var(--color-accent, #da7756);
        color: white;
        padding: 0 1rem;
        font: inherit;
        font-weight: 900;
      }

      .scope-employee-button:disabled {
        opacity: 0.55;
      }

      .scope-employee-pills {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }

      .scope-employee-pill {
        display: inline-flex;
        align-items: center;
        min-height: 2rem;
        border-radius: 999px;
        background: var(--color-badge-neutral, #44403c);
        color: var(--color-badge-neutral-text, #d6d3d1);
        padding: 0.35rem 0.625rem;
        font-size: 0.8125rem;
        font-weight: 900;
      }

      .scope-employee-pill.good {
        background: var(--color-success-bg, #052e16);
        color: var(--color-success, #7cb894);
      }

      .scope-employee-status,
      .scope-employee-muted {
        color: var(--color-muted, #a8a29e);
        line-height: 1.4;
      }

      .scope-employee-sections {
        display: grid;
        gap: 0.75rem;
      }

      .scope-employee-section {
        border-top: 1px solid var(--color-app-border-subtle, rgba(255, 255, 255, 0.08));
        padding-top: 0.75rem;
      }

      .scope-employee-section:first-child {
        border-top: 0;
        padding-top: 0;
      }

      .scope-employee-section-toggle {
        width: 100%;
        min-height: 2.75rem;
        border: 0;
        background: transparent;
        color: var(--color-muted-strong, #d6d3d1);
        padding: 0;
        text-align: left;
      }

      .scope-employee-section-title {
        min-width: 0;
        margin: 0;
        overflow-wrap: anywhere;
        font-size: 0.9rem;
        font-weight: 900;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .scope-employee-section-action {
        display: grid;
        width: 2.5rem;
        height: 2.5rem;
        flex: 0 0 auto;
        place-items: center;
        border: 1px solid rgba(218, 119, 86, 0.45);
        border-radius: 0.5rem;
        background: rgba(218, 119, 86, 0.16);
        color: var(--color-accent, #da7756);
        font-size: 1.3rem;
        font-weight: 900;
      }

      .scope-employee-section.collapsed .scope-employee-section-action {
        border-color: var(--color-border, #44403c);
        background: rgba(255, 255, 255, 0.04);
        color: var(--color-muted-strong, #d6d3d1);
      }

      .scope-employee-section.collapsed .scope-employee-items {
        display: none;
      }

      .scope-employee-items,
      .scope-employee-form {
        display: grid;
        gap: 0.625rem;
      }

      .scope-employee-item {
        display: grid;
        grid-template-columns: 2rem minmax(0, 1fr) 2.1rem;
        gap: 0.625rem;
        align-items: start;
        border: 1px solid var(--color-app-border-subtle, rgba(255, 255, 255, 0.08));
        border-radius: 0.5rem;
        background: var(--color-card-alt, #1c1917);
        padding: 0.75rem;
        transition: box-shadow 0.15s ease, transform 0.15s ease, border-color 0.15s ease;
      }

      .scope-employee-item input {
        width: 1.5rem;
        height: 1.5rem;
        margin: 0.15rem 0 0;
        accent-color: var(--color-accent, #da7756);
      }

      .scope-employee-item.done .scope-employee-item-text {
        color: var(--color-muted, #a8a29e);
        text-decoration: line-through;
      }

      .scope-employee-item-text {
        min-width: 0;
        overflow-wrap: anywhere;
        line-height: 1.35;
      }

      .scope-employee-source {
        margin-top: 0.25rem;
        color: var(--color-muted, #a8a29e);
        font-size: 0.75rem;
        font-weight: 800;
      }

      .scope-employee-handle {
        display: grid;
        place-items: center;
        width: 2rem;
        min-height: 2rem;
        border: 1px solid var(--color-border, #44403c);
        border-radius: 0.5rem;
        background: rgba(255, 255, 255, 0.03);
        color: var(--color-muted, #a8a29e);
        font-size: 1rem;
        font-weight: 900;
        line-height: 1;
        cursor: grab;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
      }

      .scope-employee-handle:disabled {
        opacity: 0.45;
        cursor: default;
      }

      .scope-employee-item-placeholder {
        border-style: dashed;
        border-color: rgba(218, 119, 86, 0.55);
        background: rgba(218, 119, 86, 0.08);
      }

      .scope-employee-item-floating {
        position: fixed;
        z-index: 9999;
        pointer-events: none;
        box-shadow: 0 18px 38px rgba(0, 0, 0, 0.42);
        border-color: rgba(218, 119, 86, 0.65);
        transform: scale(1.02);
      }

      .scope-employee-item-floating .scope-employee-handle {
        cursor: grabbing;
      }

      .scope-employee-field {
        display: grid;
        gap: 0.375rem;
      }

      .scope-employee-label {
        color: var(--color-muted, #a8a29e);
        font-size: 0.875rem;
        font-weight: 800;
      }

      .scope-employee-input,
      .scope-employee-select {
        width: 100%;
        min-width: 0;
        min-height: 3rem;
        border: 1px solid var(--color-input-border, #57534e);
        border-radius: 0.5rem;
        background: var(--color-input-bg, #292524);
        color: var(--color-ink, #e7e5e4);
        padding: 0.625rem 0.75rem;
        font: inherit;
      }

      .scope-employee-error {
        border-color: var(--color-error-border, #991b1b);
        background: var(--color-error-bg, #450a0a);
        color: var(--color-error-text, #fca5a5);
        padding: 0.75rem;
        font-weight: 800;
        overflow-wrap: anywhere;
      }

      .scope-employee-hidden {
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
    } catch {
      return null;
    }
  }

  function saveStoredSession(authStore, session) {
    if (!authStore?.key || !session) return;
    const saved = authStore.saved || {};
    if (saved.currentSession || saved.session) {
      saved.currentSession = session;
      saved.session = session;
    } else {
      Object.assign(saved, session);
    }
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
    if (!response.ok) throw new Error("Your Time Clock sign-in expired. Sign in again.");
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
    } catch {
      return message;
    }
  }

  async function loadProfile() {
    state.authStore = getStoredAuth();
    state.session = state.authStore?.session || null;
    if (!state.session?.access_token || !state.session?.user?.id) return null;
    if (sessionNeedsRefresh(state.session)) state.session = await refreshSession(state.authStore);
    const rows = await request(`/rest/v1/profiles?select=id,first_name,last_name,role,is_active&id=eq.${state.session.user.id}&limit=1`);
    state.profile = rows[0] || null;
    return state.profile;
  }

  function getRootConfig(root) {
    return {
      forcedJobCode: String(root?.dataset?.scopeJobCode || "").trim().toUpperCase(),
      allowIdleView: root?.dataset?.scopeAllowIdleView === "true",
      forceMount: root?.dataset?.scopeForceMount === "true" || root?.hasAttribute("data-scope-employee-root"),
    };
  }

  async function resolveProjectForJobCode(jobCode) {
    if (!jobCode) return null;
    const jobRows = await request(`/rest/v1/job_codes?select=id,code&code=eq.${encodeURIComponent(jobCode)}&is_active=eq.true&limit=1`);
    const resolvedJob = jobRows[0] || null;
    if (!resolvedJob?.id) return null;
    const projectRows = await request(`/rest/v1/scope_projects?select=*&is_active=eq.true&job_code_id=eq.${resolvedJob.id}&limit=1`);
    return projectRows[0] || null;
  }

  function hasMatchingOpenPunch() {
    return Boolean(state.openEntry?.job_code_id && state.project?.job_code_id && state.openEntry.job_code_id === state.project.job_code_id);
  }

  function canMutateScope() {
    return Boolean(
      state.profile?.is_active &&
      state.project?.id &&
      (state.profile?.role === "admin" || hasMatchingOpenPunch())
    );
  }

  function userDisplayName() {
    if (!state.profile) return "Not signed in";
    return `${state.profile.first_name || ""} ${state.profile.last_name || ""}`.trim();
  }

  function normalizeItemIdentity(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/gi, " ").trim();
  }

  function dedupeScopeItems(items) {
    const seen = new Set();
    return items.filter((item) => {
      const key = `${item.section || "Scope"}\n${normalizeItemIdentity(item.item_text)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function refreshScopeData() {
    const profile = await loadProfile();
    state.openEntry = null;
    state.project = null;
    state.items = [];
    state.sections = [];
    state.usingForcedJobCode = false;

    if (!profile || !profile.is_active) {
      state.hasLoaded = true;
      return;
    }

    const openRows = await request(`/rest/v1/time_entries?select=id,job_code_id,clock_in,event_type&user_id=eq.${state.session.user.id}&event_type=eq.work&clock_out=is.null&order=clock_in.desc&limit=1`);
    state.openEntry = openRows[0] || null;

    if (state.openEntry?.job_code_id) {
      const projectRows = await request(`/rest/v1/scope_projects?select=*&is_active=eq.true&job_code_id=eq.${state.openEntry.job_code_id}&limit=1`);
      state.project = projectRows[0] || null;
    }

    if (!state.project && !state.openEntry && state.config.allowIdleView && state.config.forcedJobCode) {
      state.project = await resolveProjectForJobCode(state.config.forcedJobCode);
      state.usingForcedJobCode = Boolean(state.project);
    }

    if (!state.project) {
      state.hasLoaded = true;
      return;
    }

    const [sections, items] = await Promise.all([
      request(`/rest/v1/scope_sections?select=*&scope_project_id=eq.${state.project.id}&is_active=eq.true&order=sort_order.asc`).catch(() => []),
      request(`/rest/v1/scope_items?select=*&scope_project_id=eq.${state.project.id}&is_active=eq.true&order=section.asc,sort_order.asc,created_at.asc`),
    ]);
    state.sections = sections;
    state.items = dedupeScopeItems(items);
    state.hasLoaded = true;
  }

  async function prefetchScopeData() {
    if (state.isLoading) return;
    state.isLoading = true;
    try {
      await refreshScopeData();
    } catch {
      state.hasLoaded = false;
    } finally {
      state.isLoading = false;
      if (state.isMounted && state.hasLoaded) render();
    }
  }

  function mount(root) {
    if (state.isMounted) return;
    state.root = root;
    state.config = getRootConfig(root);
    state.isMounted = true;
    installStyles();
    buildPanel(root);
    if (state.hasLoaded) render();
    else showLoading();
    load()
      .then(() => flushDueSyncs({ reload: true }).catch(() => {}))
      .catch((error) => {
        showError(error.message);
        showNoScope("Scope could not be loaded.");
      });
    if (state.flushTimerId) window.clearInterval(state.flushTimerId);
    state.flushTimerId = window.setInterval(() => {
      flushDueSyncs({ reload: true }).catch(() => {});
    }, 30_000);
  }

  function unmount() {
    if (state.drag) finishReorder(true);
    if (state.flushTimerId) {
      window.clearInterval(state.flushTimerId);
      state.flushTimerId = 0;
    }
    state.root = null;
    state.isMounted = false;
    Object.keys(els).forEach((key) => { els[key] = null; });
  }

  function buildPanel(root) {
    const shell = document.createElement("div");
    shell.className = "scope-employee-shell";
    shell.innerHTML = `
      <header class="scope-employee-topbar">
        <div>
          <p class="scope-employee-kicker">Scope</p>
          <h1 class="scope-employee-title">Scope</h1>
        </div>
      </header>

      <section class="scope-employee-card scope-employee-hidden" id="scope-employee-hero-card">
        <div>
          <p class="scope-employee-kicker" id="scope-employee-eyebrow">Loading scope</p>
          <h2 class="scope-employee-title" id="scope-employee-title" style="font-size: 1.5rem;">Checking active job</h2>
        </div>
        <div class="scope-employee-pills">
          <span class="scope-employee-pill" id="scope-employee-profile">Checking sign-in</span>
          <span class="scope-employee-pill" id="scope-employee-job">Checking current job</span>
          <span class="scope-employee-pill good" id="scope-employee-progress">0 / 0 complete</span>
        </div>
        <p class="scope-employee-status" id="scope-employee-status">Reading your active Time Clock session.</p>
      </section>

      <section class="scope-employee-card" id="scope-employee-loading-card">
        <div class="scope-employee-loading">
          <span class="scope-employee-spinner" aria-hidden="true"></span>
          <span>Loading scope</span>
        </div>
      </section>

      <section class="scope-employee-card scope-employee-hidden" id="scope-employee-list-card">
        <div id="scope-employee-error" class="scope-employee-error scope-employee-hidden"></div>
        <div id="scope-employee-sections" class="scope-employee-sections"></div>
      </section>

      <section class="scope-employee-card scope-employee-hidden" id="scope-employee-add-card">
        <div>
          <p class="scope-employee-kicker">Add item</p>
          <h2 class="scope-employee-title" style="font-size: 1.35rem;">New line item</h2>
        </div>
        <form class="scope-employee-form" id="scope-employee-add-form">
          <label class="scope-employee-field">
            <span class="scope-employee-label">Section</span>
            <select class="scope-employee-select" id="scope-employee-section"></select>
          </label>
          <label class="scope-employee-field">
            <span class="scope-employee-label">Item</span>
            <input class="scope-employee-input" id="scope-employee-item-text" type="text" autocomplete="off" placeholder="Add a scope item" />
          </label>
          <button class="scope-employee-button" type="submit">Add Item</button>
        </form>
        <p class="scope-employee-muted" id="scope-employee-form-status">New items are saved to this scope and synced to Notion.</p>
      </section>
    `;
    root.replaceChildren(shell);

    els.heroCard = shell.querySelector("#scope-employee-hero-card");
    els.loadingCard = shell.querySelector("#scope-employee-loading-card");
    els.listCard = shell.querySelector("#scope-employee-list-card");
    els.eyebrow = shell.querySelector("#scope-employee-eyebrow");
    els.title = shell.querySelector("#scope-employee-title");
    els.profile = shell.querySelector("#scope-employee-profile");
    els.job = shell.querySelector("#scope-employee-job");
    els.progress = shell.querySelector("#scope-employee-progress");
    els.status = shell.querySelector("#scope-employee-status");
    els.error = shell.querySelector("#scope-employee-error");
    els.sections = shell.querySelector("#scope-employee-sections");
    els.addCard = shell.querySelector("#scope-employee-add-card");
    els.form = shell.querySelector("#scope-employee-add-form");
    els.section = shell.querySelector("#scope-employee-section");
    els.itemText = shell.querySelector("#scope-employee-item-text");
    els.formStatus = shell.querySelector("#scope-employee-form-status");

    els.form.addEventListener("submit", (event) => {
      event.preventDefault();
      addItem().catch((error) => {
        els.formStatus.textContent = "Item was not saved.";
        showError(error.message);
      });
    });
  }

  function showError(message) {
    if (!els.error) return;
    els.error.textContent = formatError(message);
    els.error.classList.remove("scope-employee-hidden");
  }

  function clearError() {
    if (!els.error) return;
    els.error.textContent = "";
    els.error.classList.add("scope-employee-hidden");
  }

  function showLoading() {
    if (els.loadingCard) els.loadingCard.classList.remove("scope-employee-hidden");
    if (els.heroCard) els.heroCard.classList.add("scope-employee-hidden");
    if (els.listCard) els.listCard.classList.add("scope-employee-hidden");
    if (els.addCard) els.addCard.classList.add("scope-employee-hidden");
  }

  function showLoadedShell() {
    if (els.loadingCard) els.loadingCard.classList.add("scope-employee-hidden");
    if (els.heroCard) els.heroCard.classList.remove("scope-employee-hidden");
    if (els.listCard) els.listCard.classList.remove("scope-employee-hidden");
  }

  function showNoScope(message) {
    showLoadedShell();
    state.hasLoaded = true;
    state.project = null;
    state.items = [];
    if (els.eyebrow) els.eyebrow.textContent = "Scope";
    if (els.title) els.title.textContent = "No active scope";
    if (els.progress) els.progress.textContent = "0 / 0 complete";
    if (els.status) els.status.textContent = message || "No scope available at this time.";
    if (els.sections) els.sections.replaceChildren();
    if (els.section) els.section.replaceChildren();
    if (els.listCard && els.error?.classList.contains("scope-employee-hidden")) {
      els.listCard.classList.add("scope-employee-hidden");
    }
    if (els.addCard) els.addCard.classList.add("scope-employee-hidden");
  }

  function groupItems(items) {
    return items.reduce((groups, item) => {
      const section = item.section || "Scope";
      const list = groups.get(section) || [];
      list.push(item);
      groups.set(section, list);
      return groups;
    }, new Map());
  }

  function syncSectionUiState(groups) {
    const projectId = state.project?.id || "";
    const knownSections = state.sections
      .map((section) => section.section)
      .filter((section) => groups.has(section));
    const sectionNames = [
      ...knownSections,
      ...Array.from(groups.keys()).filter((section) => !knownSections.includes(section)),
    ];
    if (state.sectionOrderProjectId !== projectId) {
      state.sectionOrderProjectId = projectId;
      state.sectionOrder = [...sectionNames];
      state.collapsedSections = new Set(sectionNames);
      return sectionNames;
    }

    const retained = state.sectionOrder.filter((section) => groups.has(section));
    const additions = sectionNames.filter((section) => !retained.includes(section));
    state.sectionOrder = [...retained, ...additions];
    additions.forEach((section) => state.collapsedSections.add(section));

    Array.from(state.collapsedSections).forEach((section) => {
      if (!groups.has(section)) state.collapsedSections.delete(section);
    });

    return state.sectionOrder.filter((section) => groups.has(section));
  }

  function renderFormState() {
    if (!els.form || !els.formStatus) return;
    const canMutate = canMutateScope();
    const disabled = !state.project || !canMutate;
    Array.from(els.form.elements).forEach((field) => {
      field.disabled = disabled;
    });

    if (!state.project) {
      els.formStatus.textContent = "No scope is available to update yet.";
      return;
    }

    if (canMutate) {
      els.formStatus.textContent = "New items are saved to this scope and synced to Notion.";
      return;
    }

    if (state.usingForcedJobCode && state.config.forcedJobCode) {
      els.formStatus.textContent = `Clock into ${state.config.forcedJobCode} to add or reorder scope items.`;
      return;
    }

    els.formStatus.textContent = "Clock into this job to update scope items.";
  }

  function render() {
    if (!state.isMounted) return;
    showLoadedShell();
    const completed = state.items.filter((item) => item.completed_at).length;
    els.progress.textContent = `${completed} / ${state.items.length} complete`;
    els.profile.textContent = userDisplayName();

    if (state.usingForcedJobCode && state.config.forcedJobCode && !hasMatchingOpenPunch()) {
      els.job.textContent = `${state.config.forcedJobCode} mirror`;
    } else if (hasMatchingOpenPunch()) {
      els.job.textContent = "Clocked into matching job";
    } else {
      els.job.textContent = "No active punch";
    }

    if (!state.project) {
      showNoScope(state.openEntry ? "No scope available at this time." : "Clock into a scoped job to see its scope of work.");
      return;
    }

    els.addCard.classList.remove("scope-employee-hidden");
    els.eyebrow.textContent = state.project.unit_name || "Scope";
    els.title.textContent = state.project.property_name || "Active scope";
    els.status.textContent = state.usingForcedJobCode && state.config.forcedJobCode && !hasMatchingOpenPunch()
      ? `Live mirror of ${state.config.forcedJobCode}. Clock into this job to update items.`
      : "Scope loaded from your active job code.";

    const groups = groupItems(state.items);
    const orderedSections = syncSectionUiState(groups);
    els.section.replaceChildren(...orderedSections.map((section) => {
      const option = document.createElement("option");
      option.value = section;
      option.textContent = section;
      return option;
    }));

    renderFormState();

    const fragment = document.createDocumentFragment();
    orderedSections.forEach((section) => {
      const items = groups.get(section) || [];
      const sectionEl = document.createElement("section");
      sectionEl.className = "scope-employee-section";
      const isCollapsed = state.collapsedSections.has(section);
      if (isCollapsed) sectionEl.classList.add("collapsed");

      const toggle = document.createElement("button");
      toggle.className = "scope-employee-section-toggle";
      toggle.type = "button";
      toggle.setAttribute("aria-expanded", String(!isCollapsed));
      toggle.addEventListener("click", () => {
        if (state.collapsedSections.has(section)) state.collapsedSections.delete(section);
        else state.collapsedSections.add(section);
        render();
      });

      const heading = document.createElement("h3");
      heading.className = "scope-employee-section-title";
      heading.textContent = section;

      const action = document.createElement("span");
      action.className = "scope-employee-section-action";
      action.textContent = isCollapsed ? "+" : "-";

      toggle.append(heading, action);
      sectionEl.append(toggle);

      const list = document.createElement("div");
      list.className = "scope-employee-items";
      list.dataset.section = section;

      const reorderEnabled = canMutateScope() && items.length > 1 && !state.isSavingReorder;

      items.forEach((item) => {
        const row = document.createElement("div");
        row.className = `scope-employee-item${item.completed_at ? " done" : ""}`;
        row.dataset.itemId = item.id;
        row.dataset.section = section;

        const handle = document.createElement("button");
        handle.type = "button";
        handle.className = "scope-employee-handle";
        handle.textContent = "≡";
        handle.ariaLabel = reorderEnabled ? `Reorder ${item.item_text}` : "Reorder unavailable";
        handle.disabled = !reorderEnabled;
        handle.addEventListener("pointerdown", (event) => {
          beginReorder(event, section, item.id, row, list);
        });

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = Boolean(item.completed_at);
        checkbox.disabled = !canMutateScope();
        checkbox.addEventListener("change", () => toggleItem(item.id, checkbox.checked));

        const body = document.createElement("div");
        const text = document.createElement("div");
        text.className = "scope-employee-item-text";
        text.textContent = item.item_text;
        body.append(text);

        if (item.source === "employee") {
          const source = document.createElement("div");
          source.className = "scope-employee-source";
          source.textContent = "Added on site";
          body.append(source);
        }

        row.append(checkbox, body, handle);
        list.append(row);
      });

      sectionEl.append(list);
      fragment.append(sectionEl);
    });
    els.sections.replaceChildren(fragment);
  }

  async function load() {
    if (state.isLoading) return;
    state.isLoading = true;
    clearError();
    if (!state.hasLoaded) showLoading();
    try {
      await refreshScopeData();
      if (!state.profile) {
        if (els.profile) els.profile.textContent = "Not signed in";
        if (els.job) els.job.textContent = "Open Time Clock first";
        showNoScope("Sign into the Time Clock first.");
        return;
      }
      if (!state.profile.is_active) {
        showNoScope("This profile is not active.");
        return;
      }

      if (!state.project) {
        if (state.openEntry?.job_code_id) showNoScope("No scope available at this time.");
        else if (state.config.allowIdleView && state.config.forcedJobCode) {
          showNoScope(`No live scope is linked to ${state.config.forcedJobCode} yet.`);
        } else {
          showNoScope("Clock into a scoped job to see its scope of work.");
        }
        return;
      }

      render();
    } finally {
      state.isLoading = false;
    }
  }

  async function toggleItem(itemId, completed) {
    clearError();
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/sync-scope-action`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ action: "toggle", itemId, completed }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Unable to update scope item.");
      }
      await load();
    } catch (error) {
      await load().catch(() => {});
      showError(error.message);
    }
  }

  function getSectionOrderIds(section, sourceItems = state.items) {
    return sourceItems.filter((item) => item.section === section).map((item) => item.id);
  }

  function applySectionOrder(section, orderedIds) {
    const grouped = groupItems(state.items);
    const original = grouped.get(section) || [];
    const byId = new Map(original.map((item) => [item.id, item]));
    grouped.set(section, orderedIds.map((id, index) => ({
      ...byId.get(id),
      sort_order: (index + 1) * 10,
    })).filter(Boolean));

    const rebuilt = [];
    for (const [groupName, groupItemsList] of grouped.entries()) {
      if (groupName === section) rebuilt.push(...(grouped.get(section) || []));
      else rebuilt.push(...groupItemsList);
    }
    state.items = rebuilt;
  }

  function beginReorder(event, section, itemId, row, list) {
    if (!canMutateScope() || state.isSavingReorder || state.drag) return;
    if (event.button != null && event.button !== 0) return;
    event.preventDefault();
    if (typeof event.currentTarget?.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    const rect = row.getBoundingClientRect();
    const placeholder = document.createElement("div");
    placeholder.className = "scope-employee-item scope-employee-item-placeholder";
    placeholder.style.height = `${rect.height}px`;
    placeholder.dataset.itemId = itemId;

    const startOrderIds = Array.from(list.querySelectorAll(".scope-employee-item")).map((item) => item.dataset.itemId);

    list.insertBefore(placeholder, row);
    row.classList.add("scope-employee-item-floating");
    row.style.width = `${rect.width}px`;
    row.style.left = `${rect.left}px`;
    row.style.top = `${rect.top}px`;
    document.body.appendChild(row);

    state.drag = {
      pointerId: event.pointerId,
      section,
      itemId,
      handle: event.currentTarget,
      row,
      list,
      placeholder,
      offsetY: event.clientY - rect.top,
      left: rect.left,
      startOrderIds,
    };

    window.addEventListener("pointermove", onDragMove, { passive: false });
    window.addEventListener("pointerup", onDragEnd, { passive: false });
    window.addEventListener("pointercancel", onDragCancel, { passive: false });
    updateDragPosition(event.clientY);
  }

  function updateDragPosition(clientY) {
    if (!state.drag) return;
    state.drag.row.style.left = `${state.drag.left}px`;
    state.drag.row.style.top = `${clientY - state.drag.offsetY}px`;
  }

  function repositionPlaceholder(clientY) {
    if (!state.drag) return;
    const { list, placeholder } = state.drag;
    const siblings = Array.from(list.querySelectorAll(".scope-employee-item"))
      .filter((item) => item !== placeholder);
    const target = siblings.find((item) => clientY < item.getBoundingClientRect().top + item.getBoundingClientRect().height / 2);
    if (target) list.insertBefore(placeholder, target);
    else list.appendChild(placeholder);
  }

  function onDragMove(event) {
    if (!state.drag || event.pointerId !== state.drag.pointerId) return;
    event.preventDefault();
    updateDragPosition(event.clientY);
    repositionPlaceholder(event.clientY);
  }

  function clearDragListeners() {
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragEnd);
    window.removeEventListener("pointercancel", onDragCancel);
  }

  function finishReorder(cancelled = false) {
    if (!state.drag) return;
    const { row, list, placeholder, section, startOrderIds, handle, pointerId } = state.drag;
    clearDragListeners();
    if (handle && typeof handle.releasePointerCapture === "function") {
      try { handle.releasePointerCapture(pointerId); } catch {}
    }

    row.classList.remove("scope-employee-item-floating");
    row.style.width = "";
    row.style.left = "";
    row.style.top = "";
    list.replaceChild(row, placeholder);

    const orderedIds = Array.from(list.querySelectorAll(".scope-employee-item")).map((item) => item.dataset.itemId);
    state.drag = null;

    if (cancelled) {
      render();
      return;
    }

    if (JSON.stringify(startOrderIds) !== JSON.stringify(orderedIds)) {
      saveReorder(section, orderedIds).catch((error) => {
        showError(error.message);
      });
      return;
    }

    render();
  }

  function onDragEnd(event) {
    if (!state.drag || event.pointerId !== state.drag.pointerId) return;
    event.preventDefault();
    finishReorder(false);
  }

  function onDragCancel(event) {
    if (!state.drag || event.pointerId !== state.drag.pointerId) return;
    event.preventDefault();
    finishReorder(true);
  }

  async function saveReorder(section, orderedIds) {
    if (!state.project) return;
    clearError();
    const previousItems = state.items.map((item) => ({ ...item }));
    state.isSavingReorder = true;
    applySectionOrder(section, orderedIds);
    render();

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/sync-scope-action`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          action: "reorder",
          scopeProjectId: state.project.id,
          section,
          itemIds: orderedIds,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Unable to save the new scope order.");
      }

      if (Array.isArray(payload.items) && payload.items.length) {
        applySectionOrder(section, payload.items.map((item) => item.id));
      }

      if (payload.notionSyncError) {
        showError(`Order saved in Time Clock. Notion sync still needs a retry: ${payload.notionSyncError}`);
      }

      setTimeout(() => {
        load().catch((error) => showError(error.message));
      }, payload.notionSyncQueued ? 2200 : 800);
    } catch (error) {
      state.items = previousItems;
      render();
      throw error;
    } finally {
      state.isSavingReorder = false;
      render();
    }
  }

  async function addItem() {
    clearError();
    if (!state.project) return;
    const text = els.itemText.value.trim();
    if (!text) return;

    els.formStatus.textContent = "Saving item...";
    const response = await fetch(`${SUPABASE_URL}/functions/v1/sync-scope-action`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        action: "add",
        scopeProjectId: state.project.id,
        section: els.section.value,
        itemText: text,
      }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Unable to add scope item.");
    }
    els.itemText.value = "";
    els.formStatus.textContent = "Item added.";
    await load();
  }

  async function flushDueSyncs({ reload = false } = {}) {
    if (!state.session?.access_token) return { processed: 0, outbound: 0, inbound: 0 };
    const response = await fetch(`${SUPABASE_URL}/functions/v1/sync-scope-action`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        action: "flush-due",
        scopeProjectId: state.project?.id || "",
      }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Unable to flush pending scope syncs.");
    }
    const payload = await response.json().catch(() => ({ processed: 0, outbound: 0, inbound: 0 }));
    if (reload && payload.processed > 0) {
      await load();
    }
    return payload;
  }

  function getMountRoot() {
    return document.getElementById("scope-content-root") || document.querySelector("[data-scope-employee-root]");
  }

  async function reconcileMount() {
    const root = getMountRoot();
    if (!root) {
      if (state.isMounted) unmount();
      return;
    }
    if (state.isMounted || state.isCheckingMount) return;

    state.isCheckingMount = true;
    try {
      const config = getRootConfig(root);
      if (config.forceMount) {
        mount(root);
        return;
      }

      const profile = await loadProfile().catch(() => null);
      if (profile && profile.role !== "admin") mount(root);
    } finally {
      state.isCheckingMount = false;
    }
  }

  function refreshVisibleScope() {
    if (!state.isMounted || document.hidden) return;
    flushDueSyncs({ reload: true })
      .then((payload) => {
        if (!payload.processed) return load();
        return null;
      })
      .catch((error) => showError(error.message));
  }

  const observer = new MutationObserver(() => {
    reconcileMount();
  });

  window.addEventListener("load", () => {
    observer.observe(document.body, { childList: true, subtree: true });
    reconcileMount();
    prefetchScopeData();
  });

  window.addEventListener("focus", refreshVisibleScope);
  document.addEventListener("visibilitychange", refreshVisibleScope);
})();
