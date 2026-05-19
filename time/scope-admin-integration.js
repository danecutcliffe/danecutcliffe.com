(function () {
  const SUPABASE_URL = "https://akofsmmsxtfqduebetga.supabase.co";
  const SUPABASE_KEY = "sb_publishable_5IC3CkcNPr9-XrMBymBcoQ_XrL66k4y";
  const JOB_CODE_PROPERTY = "Job Code";

  const state = {
    authStore: null,
    session: null,
    profile: null,
    jobSites: [],
    jobCodes: [],
    mappings: [],
    projects: [],
    selectedSiteId: "",
    selectedProjectId: "",
    isOpen: false,
    isLoading: false,
  };

  const els = {};

  function installStyles() {
    if (document.getElementById("scope-admin-integration-styles")) return;
    const style = document.createElement("style");
    style.id = "scope-admin-integration-styles";
    style.textContent = `
      .scope-admin-tab {
        appearance: none;
      }

      .scope-admin-overlay {
        position: fixed;
        inset: 0;
        z-index: 45;
        overflow: auto;
        background: var(--color-paper, #1c1917);
        color: var(--color-ink, #e7e5e4);
        padding: calc(env(safe-area-inset-top) + 16px) 16px calc(env(safe-area-inset-bottom) + 84px);
      }

      .scope-admin-shell {
        width: min(100%, 72rem);
        margin: 0 auto;
      }

      .scope-admin-topbar,
      .scope-admin-panel-head,
      .scope-admin-item-head {
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

      .scope-admin-panel,
      .scope-admin-item,
      .scope-admin-notice,
      .scope-admin-error {
        border: 1px solid var(--color-border, #44403c);
        border-radius: 0.375rem;
        background: var(--color-card, #292524);
        box-shadow: 0 8px 24px var(--color-shadow, rgba(0, 0, 0, 0.3));
      }

      .scope-admin-panel {
        display: grid;
        gap: 0.875rem;
        padding: 1rem;
      }

      .scope-admin-form {
        display: grid;
        gap: 0.75rem;
      }

      .scope-admin-grid {
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

      .scope-admin-checkrow {
        display: flex;
        align-items: center;
        gap: 0.625rem;
        min-height: 2.75rem;
        color: var(--color-muted-strong, #d6d3d1);
        font-weight: 700;
      }

      .scope-admin-checkrow input {
        width: 1.25rem;
        height: 1.25rem;
        accent-color: var(--color-accent, #da7756);
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

      .scope-admin-list {
        display: grid;
        gap: 0.625rem;
      }

      .scope-admin-item {
        display: grid;
        gap: 0.5rem;
        padding: 0.75rem;
        background: var(--color-card-alt, #1c1917);
      }

      .scope-admin-item-title {
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

      .scope-admin-code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        overflow-wrap: anywhere;
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

      @media (min-width: 840px) {
        .scope-admin-layout {
          grid-template-columns: 0.95fr 1.05fr;
          align-items: start;
        }

        .scope-admin-grid.two {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .scope-admin-span-2 {
          grid-column: span 2;
        }
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
      return {
        key,
        saved,
        session: saved?.currentSession || saved?.session || saved,
      };
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
      headers: {
        apikey: SUPABASE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refresh_token: authStore.session.refresh_token }),
    });
    if (!response.ok) {
      throw new Error("Your Time Clock sign-in has expired. Sign in again, then reopen Scopes.");
    }
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
    const response = await fetch(`${SUPABASE_URL}${path}`, {
      ...options,
      headers: headers(options.headers),
    });
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
        return "Your Time Clock sign-in expired. Sign in again, then reopen Scopes.";
      }
      return parsed.message || message;
    } catch {
      return message;
    }
  }

  function encode(value) {
    return encodeURIComponent(value);
  }

  function option(value, label) {
    const node = document.createElement("option");
    node.value = value;
    node.textContent = label;
    return node;
  }

  function extractNotionId(value) {
    const compact = String(value || "").split("?")[0].replace(/-/g, "");
    const matches = compact.match(/[0-9a-f]{32}/gi);
    return matches ? matches[matches.length - 1] : "";
  }

  function activeSite() {
    return state.jobSites.find((site) => site.id === state.selectedSiteId) || null;
  }

  function activeMapping() {
    return state.mappings.find((mapping) => mapping.job_site_id === state.selectedSiteId) || null;
  }

  function visibleProjects() {
    return state.projects.filter((project) => project.job_site_id === state.selectedSiteId);
  }

  function activeProject() {
    return state.projects.find((project) => project.id === state.selectedProjectId) || null;
  }

  function jobCodeLabel(jobCodeId) {
    const jobCode = state.jobCodes.find((code) => code.id === jobCodeId);
    if (!jobCode) return "No job code";
    return [jobCode.code, jobCode.name].filter(Boolean).join(" | ");
  }

  function setMessage(kind, message) {
    if (!els.message) return;
    els.message.className = kind === "error" ? "scope-admin-error" : "scope-admin-notice";
    els.message.textContent = message;
    els.message.classList.toggle("scope-admin-hidden", !message);
  }

  function clearMessage() {
    setMessage("notice", "");
  }

  async function checkAdminProfile() {
    state.authStore = getStoredAuth();
    state.session = state.authStore?.session || null;
    if (!state.session?.access_token || !state.session?.user?.id) return null;
    if (sessionNeedsRefresh(state.session)) {
      state.session = await refreshSession(state.authStore);
    }
    const rows = await request(`/rest/v1/profiles?select=id,first_name,last_name,role,is_active&id=eq.${state.session.user.id}&limit=1`);
    const profile = rows[0] || null;
    if (profile?.is_active && profile.role === "admin") {
      state.profile = profile;
      return profile;
    }
    return null;
  }

  async function loadData() {
    if (state.isLoading) return;
    state.isLoading = true;
    try {
      await checkAdminProfile();
      const [jobSites, jobCodes, mappings, projects] = await Promise.all([
        request("/rest/v1/job_sites?select=*&order=name.asc"),
        request("/rest/v1/job_codes?select=*&order=name.asc"),
        request("/rest/v1/scope_notion_databases?select=*&order=title.asc"),
        request("/rest/v1/scope_projects?select=*&order=unit_name.asc"),
      ]);
      state.jobSites = jobSites;
      state.jobCodes = jobCodes;
      state.mappings = mappings;
      state.projects = projects;
      if (!state.selectedSiteId) state.selectedSiteId = jobSites[0]?.id || "";
      if (state.selectedProjectId && !projects.some((project) => project.id === state.selectedProjectId)) {
        state.selectedProjectId = "";
      }
      renderPanel();
    } finally {
      state.isLoading = false;
    }
  }

  function findAdminNavButtons() {
    const buttons = Array.from(document.querySelectorAll("button"));
    const labels = new Set(buttons.map((button) => button.textContent.trim()));
    if (!labels.has("Dashboard") || !labels.has("Reports")) return [];
    return buttons.filter((button) => ["Dashboard", "Timesheets", "Employees", "Reports"].includes(button.textContent.trim()));
  }

  function installNavTab() {
    if (!state.profile || state.profile.role !== "admin") return;
    const navButtons = findAdminNavButtons();
    const reportButtons = navButtons.filter((button) => button.textContent.trim() === "Reports");
    reportButtons.forEach((reportButton) => {
      const parent = reportButton.parentElement;
      if (!parent || parent.querySelector("[data-scope-admin-tab='true']")) return;
      const tab = reportButton.cloneNode(true);
      tab.dataset.scopeAdminTab = "true";
      tab.type = "button";
      tab.textContent = "Scopes";
      tab.className = reportButton.className;
      tab.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openPanel();
      });
      parent.insertBefore(tab, reportButton.nextSibling);
    });
  }

  function closePanel() {
    state.isOpen = false;
    document.getElementById("scope-admin-overlay")?.remove();
  }

  function openPanel() {
    state.isOpen = true;
    installStyles();
    if (!document.getElementById("scope-admin-overlay")) {
      buildPanel();
    }
    renderPanel();
    loadData().catch((error) => setMessage("error", error.message));
  }

  function field(label, input) {
    const wrap = document.createElement("label");
    wrap.className = "scope-admin-field";
    const text = document.createElement("span");
    text.className = "scope-admin-label";
    text.textContent = label;
    wrap.append(text, input);
    return wrap;
  }

  function input(id, type = "text") {
    const node = document.createElement("input");
    node.id = id;
    node.type = type;
    node.className = "scope-admin-input";
    node.autocomplete = "off";
    return node;
  }

  function select(id) {
    const node = document.createElement("select");
    node.id = id;
    node.className = "scope-admin-select";
    return node;
  }

  function button(label, variant = "") {
    const node = document.createElement("button");
    node.type = "button";
    node.className = `scope-admin-button${variant ? ` ${variant}` : ""}`;
    node.textContent = label;
    return node;
  }

  function buildPanel() {
    const overlay = document.createElement("div");
    overlay.id = "scope-admin-overlay";
    overlay.className = "scope-admin-overlay";
    overlay.innerHTML = `
      <div class="scope-admin-shell">
        <header class="scope-admin-topbar">
          <div>
            <p class="scope-admin-kicker">Admin</p>
            <h1 class="scope-admin-title">Scope Mapping</h1>
          </div>
          <button class="scope-admin-button secondary" type="button" data-scope-close>Close</button>
        </header>
        <div id="scope-admin-message" class="scope-admin-notice scope-admin-hidden"></div>
        <div class="scope-admin-layout">
          <section class="scope-admin-panel">
            <div class="scope-admin-panel-head">
              <div>
                <p class="scope-admin-kicker">Property Database</p>
                <h2 class="scope-admin-title" style="font-size: 1.35rem;">Notion link</h2>
              </div>
              <span class="scope-admin-pill" id="scope-mapping-pill">Loading</span>
            </div>
            <div id="scope-mapping-form"></div>
          </section>
          <section class="scope-admin-panel">
            <div class="scope-admin-panel-head">
              <div>
                <p class="scope-admin-kicker">Scope Project</p>
                <h2 class="scope-admin-title" style="font-size: 1.35rem;">Job code link</h2>
              </div>
              <span class="scope-admin-pill good">Uses Notion: Job Code</span>
            </div>
            <div id="scope-project-form"></div>
          </section>
          <section class="scope-admin-panel">
            <div>
              <p class="scope-admin-kicker">Saved Links</p>
              <h2 class="scope-admin-title" style="font-size: 1.35rem;">Projects</h2>
            </div>
            <div class="scope-admin-list" id="scope-project-list"></div>
          </section>
          <section class="scope-admin-panel">
            <div>
              <p class="scope-admin-kicker">Resolution</p>
              <h2 class="scope-admin-title" style="font-size: 1.35rem;">Current match</h2>
            </div>
            <div class="scope-admin-list" id="scope-resolution-list"></div>
          </section>
        </div>
      </div>
    `;
    document.body.append(overlay);
    overlay.querySelector("[data-scope-close]").addEventListener("click", closePanel);
    els.message = overlay.querySelector("#scope-admin-message");
    els.mappingPill = overlay.querySelector("#scope-mapping-pill");
    els.mappingForm = overlay.querySelector("#scope-mapping-form");
    els.projectForm = overlay.querySelector("#scope-project-form");
    els.projectList = overlay.querySelector("#scope-project-list");
    els.resolutionList = overlay.querySelector("#scope-resolution-list");
    buildForms();
  }

  function buildForms() {
    const siteSelect = select("scope-job-site");
    els.siteSelect = siteSelect;
    const mappingTitle = input("scope-mapping-title");
    const mappingUrl = input("scope-mapping-url", "url");
    const mappingDatabaseId = input("scope-mapping-database-id");
    const mappingDataSourceId = input("scope-mapping-data-source-id");
    const mappingActive = document.createElement("input");
    mappingActive.type = "checkbox";
    els.mappingTitle = mappingTitle;
    els.mappingUrl = mappingUrl;
    els.mappingDatabaseId = mappingDatabaseId;
    els.mappingDataSourceId = mappingDataSourceId;
    els.mappingActive = mappingActive;

    const mappingForm = document.createElement("form");
    mappingForm.className = "scope-admin-form";
    mappingForm.append(
      field("Property", siteSelect),
      field("Notion database title", mappingTitle),
      field("Notion database URL", mappingUrl),
      field("Notion database ID", mappingDatabaseId),
      field("Notion data source ID", mappingDataSourceId)
    );
    const mappingCheck = document.createElement("label");
    mappingCheck.className = "scope-admin-checkrow";
    mappingCheck.append(mappingActive, document.createTextNode("Active mapping"));
    const mappingActions = document.createElement("div");
    mappingActions.className = "scope-admin-actions";
    const saveMappingButton = button("Save Property Mapping");
    saveMappingButton.type = "submit";
    const extractDatabaseButton = button("Extract ID from URL", "secondary");
    mappingActions.append(saveMappingButton, extractDatabaseButton);
    mappingForm.append(mappingCheck, mappingActions);
    els.mappingForm.replaceChildren(mappingForm);

    const projectSelect = select("scope-project-select");
    const projectTitle = input("scope-project-title");
    const projectUnit = input("scope-project-unit");
    const projectJobCode = select("scope-project-job-code");
    const projectUrl = input("scope-project-url", "url");
    const projectPageId = input("scope-project-page-id");
    const projectDataSourceId = input("scope-project-data-source-id");
    const projectActive = document.createElement("input");
    projectActive.type = "checkbox";
    els.projectSelect = projectSelect;
    els.projectTitle = projectTitle;
    els.projectUnit = projectUnit;
    els.projectJobCode = projectJobCode;
    els.projectUrl = projectUrl;
    els.projectPageId = projectPageId;
    els.projectDataSourceId = projectDataSourceId;
    els.projectActive = projectActive;

    const projectForm = document.createElement("form");
    projectForm.className = "scope-admin-form";
    const projectGrid = document.createElement("div");
    projectGrid.className = "scope-admin-grid two";
    projectGrid.append(
      field("Existing scope project", projectSelect),
      field("Job code", projectJobCode),
      field("Scope title", projectTitle),
      field("Unit / area", projectUnit)
    );
    const projectUrlField = field("Notion page URL", projectUrl);
    projectUrlField.classList.add("scope-admin-span-2");
    const pageIdField = field("Notion page ID", projectPageId);
    const dataSourceField = field("Notion data source ID", projectDataSourceId);
    projectGrid.append(projectUrlField, pageIdField, dataSourceField);
    const projectCheck = document.createElement("label");
    projectCheck.className = "scope-admin-checkrow";
    projectCheck.append(projectActive, document.createTextNode("Active scope project"));
    const projectActions = document.createElement("div");
    projectActions.className = "scope-admin-actions";
    const saveProjectButton = button("Save Scope Project");
    saveProjectButton.type = "submit";
    const newProjectButton = button("New Project", "secondary");
    const extractPageButton = button("Extract ID from URL", "secondary");
    projectActions.append(saveProjectButton, newProjectButton, extractPageButton);
    projectForm.append(projectGrid, projectCheck, projectActions);
    els.projectForm.replaceChildren(projectForm);

    siteSelect.addEventListener("change", () => {
      state.selectedSiteId = siteSelect.value;
      state.selectedProjectId = "";
      clearMessage();
      renderPanel();
    });
    projectSelect.addEventListener("change", () => {
      state.selectedProjectId = projectSelect.value;
      clearMessage();
      renderPanel();
    });
    mappingForm.addEventListener("submit", (event) => {
      saveMapping(event).catch((error) => setMessage("error", error.message));
    });
    projectForm.addEventListener("submit", (event) => {
      saveProject(event).catch((error) => setMessage("error", error.message));
    });
    newProjectButton.addEventListener("click", () => {
      state.selectedProjectId = "";
      clearMessage();
      renderPanel();
    });
    extractDatabaseButton.addEventListener("click", () => {
      const id = extractNotionId(els.mappingUrl.value);
      if (id) {
        els.mappingDatabaseId.value = id;
        setMessage("notice", "Database ID extracted from the URL.");
      } else {
        setMessage("error", "I could not find a Notion ID in that URL.");
      }
    });
    extractPageButton.addEventListener("click", () => {
      const id = extractNotionId(els.projectUrl.value);
      if (id) {
        els.projectPageId.value = id;
        setMessage("notice", "Page ID extracted from the URL.");
      } else {
        setMessage("error", "I could not find a Notion ID in that URL.");
      }
    });
  }

  function renderPanel() {
    if (!state.isOpen || !els.mappingForm) return;
    const site = activeSite();
    const mapping = activeMapping();
    const project = activeProject();
    els.mappingPill.textContent = mapping ? "Database linked" : "Database not linked";
    els.mappingPill.classList.toggle("good", Boolean(mapping));

    els.siteSelect.replaceChildren(...state.jobSites.map((item) => option(item.id, item.name)));
    els.siteSelect.value = state.selectedSiteId;

    els.mappingTitle.value = mapping?.title || "";
    els.mappingUrl.value = mapping?.notion_database_url || "";
    els.mappingDatabaseId.value = mapping?.notion_database_id || "";
    els.mappingDataSourceId.value = mapping?.notion_data_source_id || "";
    els.mappingActive.checked = mapping?.is_active ?? true;

    const projects = visibleProjects();
    els.projectSelect.replaceChildren(
      option("", "New scope project"),
      ...projects.map((item) => option(item.id, `${item.unit_name} - ${jobCodeLabel(item.job_code_id)}`))
    );
    els.projectSelect.value = state.selectedProjectId;

    const selectedSiteCodes = state.jobCodes.filter((code) => !code.job_site_id || code.job_site_id === state.selectedSiteId);
    els.projectJobCode.replaceChildren(
      option("", "No job code selected"),
      ...selectedSiteCodes.map((code) => option(code.id, [code.code, code.name].filter(Boolean).join(" | ")))
    );

    els.projectTitle.value = project?.title || "";
    els.projectUnit.value = project?.unit_name || "";
    els.projectJobCode.value = project?.job_code_id || "";
    els.projectUrl.value = project?.notion_url || "";
    els.projectPageId.value = project?.notion_page_id || "";
    els.projectDataSourceId.value = project?.notion_data_source_id || mapping?.notion_data_source_id || "";
    els.projectActive.checked = project?.is_active ?? true;

    renderProjects();
    renderResolution(site, mapping, project);
  }

  function renderProjects() {
    const projects = visibleProjects();
    if (projects.length === 0) {
      els.projectList.innerHTML = '<div class="scope-admin-item scope-admin-muted scope-admin-small">No scope projects are linked to this property yet.</div>';
      return;
    }

    const fragment = document.createDocumentFragment();
    projects.forEach((project) => {
      const item = document.createElement("article");
      item.className = "scope-admin-item";
      const head = document.createElement("div");
      head.className = "scope-admin-item-head";
      const title = document.createElement("p");
      title.className = "scope-admin-item-title";
      title.textContent = project.unit_name;
      const edit = button("Edit", "secondary");
      edit.addEventListener("click", () => {
        state.selectedProjectId = project.id;
        renderPanel();
      });
      head.append(title, edit);
      const meta = document.createElement("p");
      meta.className = "scope-admin-muted scope-admin-small";
      meta.textContent = `${jobCodeLabel(project.job_code_id)} - ${project.sync_status || "No sync status"} - ${project.is_active ? "Active" : "Inactive"}`;
      const notion = document.createElement("p");
      notion.className = "scope-admin-muted scope-admin-small scope-admin-code";
      notion.textContent = project.notion_page_id;
      item.append(head, meta, notion);
      fragment.append(item);
    });
    els.projectList.replaceChildren(fragment);
  }

  function renderResolution(site, mapping, project) {
    const rows = [
      ["Property", site?.name || "None selected"],
      ["Notion Database", mapping ? `${mapping.title} (${mapping.is_active ? "active" : "inactive"})` : "No database mapping saved"],
      ["Matching Convention", `Notion property "${JOB_CODE_PROPERTY}" must equal the Time app job code.`],
      ["Scope Project", project ? `${project.unit_name} (${project.is_active ? "active" : "inactive"})` : "New project draft"],
      ["Project Job Code", project?.job_code_id ? jobCodeLabel(project.job_code_id) : "Choose a job code"],
    ];
    const fragment = document.createDocumentFragment();
    rows.forEach(([label, value]) => {
      const item = document.createElement("div");
      item.className = "scope-admin-item";
      const kicker = document.createElement("p");
      kicker.className = "scope-admin-kicker";
      kicker.textContent = label;
      const text = document.createElement("p");
      text.className = "scope-admin-small";
      text.textContent = value;
      item.append(kicker, text);
      fragment.append(item);
    });
    els.resolutionList.replaceChildren(fragment);
  }

  async function saveMapping(event) {
    event.preventDefault();
    clearMessage();
    const site = activeSite();
    if (!site) return;
    const existing = activeMapping();
    const payload = {
      job_site_id: site.id,
      notion_database_id: els.mappingDatabaseId.value.trim(),
      notion_database_url: els.mappingUrl.value.trim(),
      notion_data_source_id: els.mappingDataSourceId.value.trim() || null,
      title: els.mappingTitle.value.trim(),
      job_code_property_name: JOB_CODE_PROPERTY,
      is_active: els.mappingActive.checked,
      last_sync_status: "linked",
    };
    if (!payload.notion_database_id || !payload.notion_database_url || !payload.title) {
      setMessage("error", "Database title, URL, and ID are required.");
      return;
    }
    if (existing) {
      await request(`/rest/v1/scope_notion_databases?id=eq.${encode(existing.id)}&select=*`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(payload),
      });
    } else {
      await request("/rest/v1/scope_notion_databases?select=*", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(payload),
      });
    }
    setMessage("notice", "Property mapping saved.");
    await loadData();
  }

  async function saveProject(event) {
    event.preventDefault();
    clearMessage();
    const site = activeSite();
    if (!site) return;
    const mapping = activeMapping();
    const existing = activeProject();
    const payload = {
      notion_page_id: els.projectPageId.value.trim(),
      notion_url: els.projectUrl.value.trim(),
      title: els.projectTitle.value.trim(),
      property_name: site.name,
      unit_name: els.projectUnit.value.trim(),
      job_site_id: site.id,
      job_code_id: els.projectJobCode.value || null,
      scope_notion_database_id: mapping?.id || null,
      notion_data_source_id: els.projectDataSourceId.value.trim() || mapping?.notion_data_source_id || null,
      notion_title_property_name: "Name",
      notion_job_code_property_name: JOB_CODE_PROPERTY,
      sync_status: "notion-linked",
      is_active: els.projectActive.checked,
      source_synced_at: new Date().toISOString(),
    };
    if (!payload.notion_page_id || !payload.notion_url || !payload.title || !payload.unit_name) {
      setMessage("error", "Scope title, unit, Notion URL, and Notion page ID are required.");
      return;
    }

    let rows;
    if (existing) {
      rows = await request(`/rest/v1/scope_projects?id=eq.${encode(existing.id)}&select=*`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(payload),
      });
    } else {
      rows = await request("/rest/v1/scope_projects?select=*", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(payload),
      });
    }
    state.selectedProjectId = rows?.[0]?.id || state.selectedProjectId;
    setMessage("notice", "Scope project saved.");
    await loadData();
  }

  async function tick() {
    installStyles();
    try {
      await checkAdminProfile();
      installNavTab();
    } catch {
      // The main app owns sign-in errors. This integration stays quiet until an admin session exists.
    }
  }

  const observer = new MutationObserver(() => {
    installNavTab();
  });

  window.addEventListener("load", () => {
    observer.observe(document.body, { childList: true, subtree: true });
    tick();
    setInterval(tick, 4000);
  });
})();
