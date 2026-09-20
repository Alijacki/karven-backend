
(function () {
  "use strict";

  var runtime = window.KARVEN_RUNTIME || {};
  var API = String(runtime.apiUrl || "https://karven-backend-production.up.railway.app").replace(/\/$/, "");
  var ADMIN = runtime.adminUrl || "https://karven-admin-8kzjxw.v2.appdeploy.ai/";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var state = {
    access: localStorage.getItem("karven_access") || "",
    refresh: localStorage.getItem("karven_refresh") || "",
    me: null,
    workspace: null,
    view: "home",
    cache: {}
  };

  var siteView = $("#siteView");
  var authView = $("#authView");
  var appView = $("#appView");
  var publicContent = $("#publicContent");
  var appContent = $("#appContent");
  var modal = $("#modal");
  var modalBody = $("#modalBody");
  var toast = $("#toast");

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
    });
  }

  function json(v) {
    try { return JSON.stringify(v == null ? {} : v); } catch (_) { return "{}"; }
  }

  function notify(message, type) {
    toast.textContent = message;
    toast.className = "toast show " + (type || "");
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(function () { toast.className = "toast"; }, 2800);
  }

  function money(cents, currency) {
    try {
      return new Intl.NumberFormat(undefined, {style:"currency", currency:currency || "USD"}).format(Number(cents || 0) / 100);
    } catch (_) {
      return (Number(cents || 0) / 100).toFixed(2) + " " + (currency || "USD");
    }
  }

  function date(v) {
    if (!v) return "—";
    var d = new Date(v);
    return Number.isNaN(d.valueOf()) ? "—" : d.toLocaleDateString();
  }

  function dateTime(v) {
    if (!v) return "—";
    var d = new Date(v);
    return Number.isNaN(d.valueOf()) ? "—" : d.toLocaleString();
  }

  function showOnly(el) {
    [siteView, authView, appView].forEach(function (x) {
      x.classList.toggle("hidden", x !== el);
    });
  }

  function setSession(session) {
    state.access = session.accessToken;
    state.refresh = session.refreshToken;
    localStorage.setItem("karven_access", state.access);
    localStorage.setItem("karven_refresh", state.refresh);
  }

  function clearSession() {
    state.access = "";
    state.refresh = "";
    state.me = null;
    state.workspace = null;
    state.cache = {};
    localStorage.removeItem("karven_access");
    localStorage.removeItem("karven_refresh");
    localStorage.removeItem("karven_workspace");
  }

  async function raw(path, opts) {
    opts = opts || {};
    var headers = Object.assign({}, opts.body ? {"content-type":"application/json"} : {}, opts.headers || {});
    if (state.access && !opts.noAuth) headers.authorization = "Bearer " + state.access;
    return fetch(API + path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body && typeof opts.body !== "string" ? JSON.stringify(opts.body) : opts.body
    });
  }

  async function refreshSession() {
    if (!state.refresh) return false;
    try {
      var r = await raw("/api/v1/auth/refresh", {method:"POST", body:{refreshToken:state.refresh}, noAuth:true});
      if (!r.ok) return false;
      setSession(await r.json());
      return true;
    } catch (_) {
      return false;
    }
  }

  async function api(path, opts) {
    opts = opts || {};
    var r = await raw(path, opts);
    if (r.status === 401 && !opts.noAuth && await refreshSession()) r = await raw(path, opts);
    var text = await r.text();
    var data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_) { data = {raw:text}; }
    if (!r.ok) {
      var e = new Error(data.error || ("HTTP " + r.status));
      e.status = r.status;
      e.data = data;
      throw e;
    }
    return data;
  }

  function wid() { return state.workspace && state.workspace.id; }
  function roleAtLeast(role) {
    var levels = {viewer:1, member:2, manager:3, admin:4, owner:5};
    return (levels[state.workspace && state.workspace.role] || 0) >= (levels[role] || 0);
  }

  function openModal(html, wide) {
    modalBody.innerHTML = html;
    $(".modal-card").classList.toggle("wide", !!wide);
    modal.classList.remove("hidden");
  }

  function closeModal() {
    modal.classList.add("hidden");
    modalBody.innerHTML = "";
    $(".modal-card").classList.remove("wide");
  }

  $("#modalClose").addEventListener("click", closeModal);
  modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });

  function loading() {
    appContent.innerHTML = '<div class="loading-state">Loading KARVEN…</div>';
  }

  function empty(title, body, actionLabel, action) {
    return '<div class="empty-state"><b>' + esc(title) + '</b><p>' + esc(body) + '</p>' +
      (actionLabel ? '<button class="button button-light button-compact" data-empty-action="' + esc(action || "") + '">' + esc(actionLabel) + '</button>' : "") +
      '</div>';
  }

  function badge(v) {
    var s = String(v || "unknown");
    return '<span class="badge ' + esc(s) + '">' + esc(s.replace(/_/g, " ")) + '</span>';
  }

  function publicFrame() {
    return '<div class="product-frame"><div class="frame-bar"><span class="frame-dot"></span><span class="frame-dot"></span><span class="frame-dot"></span><span class="frame-title">KARVEN / Revenue workspace</span></div>' +
      '<div class="frame-shell"><aside class="frame-sidebar"><div class="frame-logo">KARVEN</div><div class="frame-nav"><span></span><span></span><span></span><span></span><span></span></div></aside>' +
      '<div class="frame-main"><div class="frame-head"></div><div class="frame-stats"><div class="frame-stat"><small>OPEN PIPELINE</small><b>$184K</b></div><div class="frame-stat"><small>COMPANIES</small><b>128</b></div><div class="frame-stat"><small>TASKS</small><b>24</b></div></div>' +
      '<div class="frame-table"><div class="frame-row"><span class="frame-line dark"></span><span class="frame-line"></span><span class="frame-line"></span></div><div class="frame-row"><span class="frame-line dark"></span><span class="frame-line"></span><span class="frame-line"></span></div><div class="frame-row"><span class="frame-line dark"></span><span class="frame-line"></span><span class="frame-line"></span></div><div class="frame-row"><span class="frame-line dark"></span><span class="frame-line"></span><span class="frame-line"></span></div></div></div></div></div>';
  }

  var publicPages = {
    "/": function () {
      return '<div class="public-page">' +
        '<section class="hero-section"><div class="hero-copy"><span class="eyebrow">CUSTOMER OPERATIONS, WITHOUT THE NOISE</span><h1>Know the customer. Move the work. Keep the team aligned.</h1><p>KARVEN is a focused workspace for companies, people, opportunities, tasks and the operational context around every relationship.</p><div class="hero-actions"><button class="button button-dark" data-auth="register">Start with KARVEN</button><button class="button button-light" data-auth="login">Sign in</button></div><div class="hero-meta"><span>Native KARVEN backend</span><span>Role-based workspaces</span><span>Audit-ready operations</span></div></div>' + publicFrame() + '</section>' +
        '<div class="logo-strip">BUILT FOR FOCUSED SALES · CUSTOMER SUCCESS · OPERATIONS · SERVICE TEAMS</div>' +
        '<section class="home-section"><div class="section-heading"><div><span class="eyebrow">ONE WORKSPACE</span><h2>Customer context and execution belong together.</h2></div><p>Instead of scattering relationship data across tabs and tools, KARVEN keeps the customer record close to the opportunity, task, note, activity and team member responsible for what happens next.</p></div><div class="feature-grid">' +
        '<article class="feature-card"><span class="feature-index">01 / RELATIONSHIPS</span><h3>Companies & people</h3><p>Keep customer accounts and individual contacts searchable, editable and connected to your workspace.</p></article>' +
        '<article class="feature-card"><span class="feature-index">02 / REVENUE</span><h3>Pipeline & opportunities</h3><p>Track deal value, probability, status and expected close dates with clear pipeline structure.</p></article>' +
        '<article class="feature-card"><span class="feature-index">03 / EXECUTION</span><h3>Tasks & activity</h3><p>Turn follow-ups into accountable work and preserve an audit-friendly history of important actions.</p></article></div></section>' +
        '<section class="dark-band"><div class="home-section"><div class="section-heading"><div><span class="eyebrow">HOW KARVEN WORKS</span><h2>From first contact to the next action.</h2></div><p>Every module is designed around a simple operating rhythm: capture context, decide what matters, assign work, and keep the record current.</p></div><div class="workflow-grid"><div class="workflow-step"><span>STEP 01</span><h3>Capture</h3><p>Add the company and the people you are working with.</p></div><div class="workflow-step"><span>STEP 02</span><h3>Qualify</h3><p>Create opportunities and place them in a pipeline that matches your process.</p></div><div class="workflow-step"><span>STEP 03</span><h3>Execute</h3><p>Create tasks, notes and ownership around the next action.</p></div><div class="workflow-step"><span>STEP 04</span><h3>Review</h3><p>Use activity, billing and audit views to understand what changed.</p></div></div></div></section>' +
        '<section class="home-section"><div class="cta-card"><div><h2>Less CRM noise. More clarity.</h2><p>Create a KARVEN workspace and start with the customer data you actually need.</p></div><button class="button button-dark" data-auth="register">Create workspace</button></div></section></div>';
    },
    "/product": function () {
      return '<div class="public-page"><section class="page-hero"><span class="eyebrow">PRODUCT</span><h1>A complete operating layer around customer relationships.</h1><p>KARVEN combines the core CRM record with pipeline, tasks, notes, files, roles, webhooks, billing visibility and audit history in one native platform.</p></section>' +
        '<section class="marketing-section product-modules">' +
        productModule("Customer records","Keep account and contact context clean.",[["Companies","Name, domain, contact details and ownership"],["People","Role, company, email, phone and owner"],["Search","Fast filtering inside the workspace"]]) +
        productModule("Revenue pipeline","Move opportunities through a process your team understands.",[["Pipelines","Custom stages with probability"],["Opportunities","Value, currency, status and close date"],["Workspace overview","Pipeline totals and current workload"]]) +
        productModule("Execution & operations","Keep the work close to the customer record.",[["Tasks","Priority, due date and status"],["Notes","Long-form context linked to work"],["Activity","A chronological view of key events"],["Files","Workspace file registry and storage-ready flow"]]) +
        productModule("Platform controls","Operate a serious workspace, not a loose spreadsheet.",[["Roles","Viewer through owner access levels"],["Audit","Administrative action history"],["Webhooks","Event delivery for integrations"],["Billing","Subscription, invoice and payment visibility"]]) +
        '</section><section class="home-section"><div class="cta-card"><div><h2>See it as one system.</h2><p>Sign in to the native KARVEN workspace.</p></div><button class="button button-dark" data-auth="login">Open KARVEN</button></div></section></div>';
    },
    "/customers": function () {
      return '<div class="public-page"><section class="page-hero"><span class="eyebrow">CUSTOMERS</span><h1>Designed for teams that need customer context and execution together.</h1><p>KARVEN is structured for different operating models without pretending every team sells or serves customers the same way.</p></section><section class="marketing-section"><div class="usecase-grid">' +
        useCase("SALES TEAMS","Pipeline clarity","Track accounts, people, opportunities, probabilities and next actions without turning the CRM into a maze.") +
        useCase("CUSTOMER SUCCESS","Relationship continuity","Keep notes, tasks and activity close to the customer record so context survives handoffs.") +
        useCase("SERVICE TEAMS","Operational follow-through","Use tasks, ownership and history to keep customer-facing commitments visible.") +
        useCase("AGENCIES","Account visibility","Separate customer companies, contacts and active commercial work across a shared team workspace.") +
        useCase("STARTUPS","A CRM that can start small","Begin with core records and add pipeline, roles, webhooks and billing visibility when the operation grows.") +
        useCase("OPERATIONS","Accountable workflows","Use role-based access, settings and audit history to make process ownership explicit.") +
        '</div></section></div>';
    },
    "/pricing": function () {
      return '<div class="public-page"><section class="page-hero"><span class="eyebrow">PRICING</span><h1>Plans come directly from KARVEN.</h1><p>The pricing below is loaded from the native KARVEN billing model, so the public site and platform stay aligned.</p></section><section class="marketing-section"><div id="pricingGrid" class="pricing-grid"><div class="loading-state">Loading plans…</div></div></section></div>';
    },
    "/company": function () {
      return '<div class="public-page"><section class="page-hero"><span class="eyebrow">COMPANY</span><h1>KARVEN is being built as a focused, owned platform.</h1><p>The product is moving away from inherited runtime dependencies toward native KARVEN source, infrastructure and product decisions.</p></section><section class="marketing-section"><div class="team-grid">' +
        '<article class="team-card founder-card"><div class="team-avatar">AO</div><h3>AKRAM A. OBEID</h3><strong>Founder & CEO</strong><p>Product direction, platform ownership and the operating vision behind KARVEN.</p></article>' +
        '<article class="team-card"><div class="team-avatar">EM</div><h3>Engineering Manager</h3><strong>KARVEN Engineering</strong><p>Engineering quality, delivery discipline and scalable platform execution.</p></article>' +
        '<article class="team-card"><div class="team-avatar">FE</div><h3>Frontend Developer</h3><strong>KARVEN Engineering</strong><p>Native product experience across marketing, workspace and responsive interaction.</p></article>' +
        '<article class="team-card"><div class="team-avatar">PD</div><h3>Product Designer</h3><strong>KARVEN Product</strong><p>Interaction clarity, interface systems and a calm visual language across the product.</p></article>' +
        '</div></section></div>';
    },
    "/security": function () {
      return '<div class="public-page"><section class="page-hero"><span class="eyebrow">SECURITY</span><h1>Security is part of the application architecture.</h1><p>KARVEN uses authenticated sessions, workspace roles, audited writes, controlled platform administration and isolated infrastructure services.</p></section><section class="marketing-section"><div class="security-grid">' +
        securityCard("Authentication","Password hashing, access tokens, rotating refresh tokens and session revocation are handled by the native backend.") +
        securityCard("Workspace RBAC","Viewer, member, manager, admin and owner levels control access to workspace operations.") +
        securityCard("Audit trail","Administrative and CRM writes can be recorded in the workspace audit history.") +
        securityCard("Data services","PostgreSQL and Redis run as dedicated platform services behind the application layer.") +
        securityCard("Webhook signing","Outbound webhook deliveries can be signed so receivers can validate authenticity.") +
        securityCard("Health & readiness","Dedicated health and readiness endpoints verify application, database and cache state.") +
        '</div></section></div>';
    },
    "/privacy": function () { return legalPage("Privacy Policy", privacySections()); },
    "/terms": function () { return legalPage("Terms of Service", termsSections()); },
    "/contact": function () {
      return '<div class="public-page"><section class="page-hero"><span class="eyebrow">CONTACT</span><h1>Talk to the KARVEN team.</h1><p>For account, billing or platform administration, KARVEN Control is the operational entry point while dedicated support channels are being configured.</p></section><section class="marketing-section"><div class="contact-panel"><article class="contact-card"><span class="case-tag">PLATFORM</span><h3>KARVEN Control</h3><p>Open the administration workspace for platform management and operational controls.</p><a class="button button-dark button-compact" href="' + esc(ADMIN) + '" target="_blank" rel="noopener">Open KARVEN Control ↗</a></article><article class="contact-card"><span class="case-tag">ACCOUNT</span><h3>Existing workspace</h3><p>Sign in to manage your CRM workspace, team, billing visibility and settings.</p><button class="button button-light button-compact" data-auth="login">Sign in</button></article></div></section></div>';
    }
  };

  function productModule(title, desc, items) {
    return '<article class="product-module"><div><span class="eyebrow">KARVEN MODULE</span><h3>' + esc(title) + '</h3><p>' + esc(desc) + '</p></div><div class="module-list">' +
      items.map(function (x) { return '<div><b>' + esc(x[0]) + '</b><small>' + esc(x[1]) + '</small></div>'; }).join("") + '</div></article>';
  }

  function useCase(tag, title, body) {
    return '<article class="usecase-card"><span class="case-tag">' + esc(tag) + '</span><h3>' + esc(title) + '</h3><p>' + esc(body) + '</p></article>';
  }

  function securityCard(title, body) {
    return '<article class="security-card"><span class="case-tag">SECURITY</span><h3>' + esc(title) + '</h3><p>' + esc(body) + '</p></article>';
  }

  function legalPage(title, sections) {
    return '<div class="public-page"><article class="legal"><span class="eyebrow">KARVEN LEGAL</span><h1>' + esc(title) + '</h1><p class="updated">Last updated: September 20, 2026</p>' +
      sections.map(function (s) { return '<section><h2>' + esc(s[0]) + '</h2><p>' + esc(s[1]) + '</p></section>'; }).join("") + '</article></div>';
  }

  function privacySections() {
    return [
      ["Information used by KARVEN","KARVEN processes account information, workspace data and operational records needed to provide the service. Workspace content may include customer companies, contacts, tasks, notes, files and activity created by authorized users."],
      ["Authentication and security","Session and security data may be processed to authenticate users, protect accounts, enforce roles and investigate service reliability or abuse."],
      ["Workspace ownership","Organizations using KARVEN are responsible for the customer and business information they choose to place in their workspace and for providing any required notices to their own users or customers."],
      ["Service providers","Infrastructure and supporting providers may process limited information when required to host, secure, deliver or operate KARVEN."],
      ["Retention and deletion","Operational data is retained as needed to provide the service, satisfy legitimate security or legal requirements and support account administration. Retention controls may evolve as the platform expands."],
      ["Contact","Privacy requests should be submitted through the official KARVEN account or administration channel associated with the workspace."]
    ];
  }

  function termsSections() {
    return [
      ["Using KARVEN","You may use KARVEN only for lawful business purposes and only with information you are authorized to process."],
      ["Accounts and access","You are responsible for protecting credentials, assigning appropriate workspace roles and maintaining accurate account information."],
      ["Customer data","You retain responsibility for the data you enter into KARVEN. You must have the rights and permissions necessary to store and process that data."],
      ["Service availability","KARVEN is designed for reliable operation, but maintenance, infrastructure incidents and feature changes may occasionally affect availability."],
      ["Acceptable use","You may not use the service to distribute malware, bypass security controls, interfere with platform operation or conduct unlawful activity."],
      ["Changes","These terms may be updated as KARVEN adds capabilities, providers or commercial plans. Material changes should be reflected in the published terms."]
    ];
  }

  async function renderPublic(path, push) {
    path = path || "/";
    if (!publicPages[path]) path = "/";
    showOnly(siteView);
    $$(".site-nav a").forEach(function (a) { a.classList.toggle("active", a.getAttribute("href") === path); });
    publicContent.innerHTML = publicPages[path]();
    if (push && location.pathname !== path) history.pushState({path:path}, "", path);
    bindPublicActions();
    if (path === "/pricing") await renderPricing();
    window.scrollTo({top:0, behavior:"instant"});
  }

  function bindPublicActions() {
    $$("[data-auth]", publicContent).forEach(function (b) { b.onclick = function () { openAuth(b.dataset.auth); }; });
  }

  async function renderPricing() {
    var grid = $("#pricingGrid");
    if (!grid) return;
    try {
      var d = await api("/api/v1/plans", {noAuth:true});
      if (!d.items || !d.items.length) {
        grid.innerHTML = '<article class="price-card featured"><span class="case-tag">KARVEN</span><h3>Plans are being configured</h3><div class="price-number">—</div><span class="price-cycle">Pricing will appear here from KARVEN Control.</span><ul class="price-features"><li>Native CRM workspace</li><li>Role-based team access</li><li>Customer operations core</li></ul><button class="button button-dark" data-auth="register">Create workspace</button></article>';
        bindPublicActions();
        return;
      }
      grid.innerHTML = d.items.map(function (p, i) {
        var features = p.features && typeof p.features === "object" ? Object.keys(p.features).filter(function (k) { return p.features[k]; }) : [];
        return '<article class="price-card ' + (i === 1 ? "featured" : "") + '"><span class="case-tag">' + esc(p.code || "PLAN") + '</span><h3>' + esc(p.name) + '</h3><div class="price-number">' + money(p.price_cents, p.currency) + '</div><span class="price-cycle">' + esc(p.interval === "one_time" ? "one time" : "per " + p.interval) + '</span><ul class="price-features">' +
          (features.length ? features.map(function (f) { return '<li>' + esc(f.replace(/_/g, " ")) + '</li>'; }).join("") : '<li>Core KARVEN workspace</li>') +
          '</ul><button class="button button-dark" data-auth="register">Get started</button></article>';
      }).join("");
      bindPublicActions();
    } catch (_) {
      grid.innerHTML = empty("Pricing is temporarily unavailable","The KARVEN billing API could not be reached.");
    }
  }

  async function checkPublicStatus() {
    var el = $("#publicApiStatus");
    if (!el) return;
    try {
      var r = await fetch(API + "/health");
      var d = await r.json();
      if (r.ok && d.ok) { el.textContent = "All systems operational"; el.classList.add("ok"); }
      else el.textContent = "System status unavailable";
    } catch (_) {
      el.textContent = "System status unavailable";
    }
  }

  function openAuth(mode) {
    showOnly(authView);
    switchAuth(mode || "login");
  }

  function switchAuth(mode) {
    ["login","register","forgot","reset"].forEach(function (x) {
      var p = $("#" + x + "Panel");
      if (p) p.classList.toggle("hidden", x !== mode);
    });
  }

  async function bootstrapSession() {
    if (!state.access) return false;
    try {
      state.me = await api("/api/v1/me");
      var workspaces = state.me.workspaces || [];
      var saved = localStorage.getItem("karven_workspace");
      state.workspace = workspaces.find(function (w) { return w.id === saved; }) || workspaces[0] || null;
      if (state.workspace) localStorage.setItem("karven_workspace", state.workspace.id);
      hydrateAppChrome();
      return true;
    } catch (_) {
      clearSession();
      return false;
    }
  }

  function hydrateAppChrome() {
    var user = state.me && state.me.user || {};
    $("#workspaceName").textContent = state.workspace ? state.workspace.name : "No workspace";
    $("#workspaceRole").textContent = state.workspace ? state.workspace.role : "";
    $("#workspaceMark").textContent = ((state.workspace && state.workspace.name || "K").trim()[0] || "K").toUpperCase();
    var full = user.fullName || user.full_name || user.email || "KARVEN User";
    $("#userName").textContent = full;
    $("#userEmail").textContent = user.email || "";
    $("#userInitial").textContent = (full.trim()[0] || "K").toUpperCase();
    $("#controlLink").href = ADMIN;
  }

  async function enterApp(view) {
    if (!state.me && !await bootstrapSession()) { openAuth("login"); return; }
    showOnly(appView);
    await navigate(view || "home");
  }

  var titles = {
    home:"Home", companies:"Companies", people:"People", opportunities:"Opportunities", tasks:"Tasks",
    pipelines:"Pipelines", notes:"Notes", activity:"Activity", files:"Files", team:"Team", billing:"Billing",
    settings:"Settings", integrations:"Webhooks", audit:"Audit log"
  };

  async function navigate(view) {
    view = titles[view] ? view : "home";
    state.view = view;
    $$("#appNav [data-view]").forEach(function (b) { b.classList.toggle("active", b.dataset.view === view); });
    $("#pageTitle").textContent = titles[view];
    $("#breadcrumb").textContent = titles[view];
    loading();
    var renderers = {
      home:renderHome, companies:renderCompanies, people:renderPeople, opportunities:renderOpportunities,
      tasks:renderTasks, pipelines:renderPipelines, notes:renderNotes, activity:renderActivity, files:renderFiles,
      team:renderTeam, billing:renderBilling, settings:renderSettings, integrations:renderWebhooks, audit:renderAudit
    };
    try { await renderers[view](); }
    catch (e) {
      if (e.status === 403) appContent.innerHTML = empty("Access restricted","Your workspace role does not allow this view.");
      else {
        appContent.innerHTML = empty("Could not load " + titles[view],"KARVEN returned an error while loading this view.");
        notify(e.message || "Request failed","error");
      }
    }
  }

  async function renderHome() {
    if (!wid()) {
      appContent.innerHTML = empty("No workspace","Create a workspace to start using KARVEN.","Create workspace","workspace");
      bindEmptyActions();
      return;
    }
    var results = await Promise.all([
      api("/api/v1/workspaces/" + wid() + "/companies?limit=500"),
      api("/api/v1/workspaces/" + wid() + "/contacts?limit=500"),
      api("/api/v1/workspaces/" + wid() + "/opportunities?limit=500"),
      api("/api/v1/workspaces/" + wid() + "/tasks?limit=500"),
      api("/api/v1/workspaces/" + wid() + "/activities?limit=8")
    ]);
    var companies = results[0].items || [];
    var people = results[1].items || [];
    var ops = results[2].items || [];
    var tasks = results[3].items || [];
    var activities = results[4].items || [];
    var openOps = ops.filter(function (x) { return x.status === "open"; });
    var pipeline = openOps.reduce(function (sum, x) { return sum + Number(x.amount_cents || 0); }, 0);
    var openTasks = tasks.filter(function (x) { return x.status !== "done" && x.status !== "cancelled"; });

    appContent.innerHTML =
      '<div class="stats-grid">' +
      stat("Companies",companies.length,"Customer accounts") +
      stat("People",people.length,"Known contacts") +
      stat("Open pipeline",money(pipeline,openOps[0] && openOps[0].currency || "USD"),openOps.length + " opportunities") +
      stat("Open tasks",openTasks.length,"Work still in motion") +
      '</div><div class="dashboard-grid"><section class="card"><div class="card-header"><h3>Recent opportunities</h3><button class="icon-button" data-go="opportunities">View all</button></div>' +
      opportunitiesTable(ops.slice(0,7),false) +
      '</section><section class="card"><div class="card-header"><h3>Recent activity</h3><small>Latest</small></div>' +
      activityList(activities) + '</section></div>';
    $$("[data-go]",appContent).forEach(function (b) { b.onclick = function () { navigate(b.dataset.go); }; });
  }

  function stat(label,value,foot) {
    return '<article class="stat-card"><span class="stat-label">' + esc(label) + '</span><strong class="stat-value">' + esc(value) + '</strong><span class="stat-foot">' + esc(foot) + '</span></article>';
  }

  function activityList(items) {
    if (!items || !items.length) return empty("No activity yet","Workspace activity will appear here as your team works.");
    return '<div class="activity-list">' + items.map(function (x) {
      return '<div class="activity-item"><div><b>' + esc(x.type || x.action || "Activity") + '</b><p>' + esc(x.summary || x.entity_type || "Workspace update") + '</p></div><small>' + esc(dateTime(x.created_at)) + '</small></div>';
    }).join("") + '</div>';
  }

  async function renderCompanies(query) {
    query = query || "";
    var d = await api("/api/v1/workspaces/" + wid() + "/companies?limit=500&q=" + encodeURIComponent(query));
    var items = d.items || [];
    appContent.innerHTML = pageTop("Customer accounts in " + state.workspace.name,
      '<input id="companySearch" class="search-input" placeholder="Search companies" value="' + esc(query) + '"><button id="newCompany" class="button button-dark button-compact">＋ Company</button>') +
      '<section class="card">' + (items.length ? companiesTable(items) : empty("No companies yet","Create the first customer account in this workspace.","Add company","company")) + '</section>';
    var timer;
    $("#companySearch").oninput = function (e) { clearTimeout(timer); timer = setTimeout(function () { renderCompanies(e.target.value); },250); };
    $("#newCompany").onclick = function () { companyForm(); };
    bindEmptyActions();
    $$("[data-edit-company]",appContent).forEach(function (b) { b.onclick = function () { companyForm(items.find(function (x) { return x.id === b.dataset.editCompany; })); }; });
    $$("[data-delete-company]",appContent).forEach(function (b) { b.onclick = function () { confirmDelete("company",b.dataset.deleteCompany,function () { return api("/api/v1/workspaces/" + wid() + "/companies/" + b.dataset.deleteCompany,{method:"DELETE"}); },function(){renderCompanies(query);}); }; });
  }

  function companiesTable(items) {
    return '<div class="table-scroll"><table class="data-table"><thead><tr><th>Company</th><th>Domain</th><th>Email</th><th>Phone</th><th>Updated</th><th></th></tr></thead><tbody>' +
      items.map(function (x) {
        return '<tr><td><span class="table-title">' + esc(x.name) + '</span><span class="table-sub">' + esc(x.website || "No website") + '</span></td><td>' + esc(x.domain || "—") + '</td><td>' + esc(x.email || "—") + '</td><td>' + esc(x.phone || "—") + '</td><td>' + esc(date(x.updated_at)) + '</td><td><div class="row-actions"><button class="icon-button" data-edit-company="' + esc(x.id) + '">Edit</button><button class="icon-button danger" data-delete-company="' + esc(x.id) + '">Delete</button></div></td></tr>';
      }).join("") + '</tbody></table></div>';
  }

  function companyForm(item) {
    item = item || {};
    openModal('<h2>' + (item.id ? "Edit company" : "New company") + '</h2><p class="modal-intro">Keep the customer account record clean and useful.</p><form id="entityForm" class="form-grid">' +
      field("Company name","name",item.name,true,"full-row") + field("Domain","domain",item.domain) + field("Email","email",item.email,false,"","email") +
      field("Phone","phone",item.phone) + field("Website","website",item.website) +
      '<div class="form-actions"><button type="button" class="button button-light button-compact" data-cancel>Cancel</button><button class="button button-dark button-compact">' + (item.id ? "Save changes" : "Create company") + '</button></div></form>');
    $("[data-cancel]").onclick = closeModal;
    $("#entityForm").onsubmit = async function (e) {
      e.preventDefault(); var f = new FormData(e.currentTarget);
      var body = {name:f.get("name"),domain:f.get("domain") || "",email:f.get("email") || null,phone:f.get("phone") || "",website:f.get("website") || "",metadata:item.metadata || {}};
      try {
        await api("/api/v1/workspaces/" + wid() + "/companies" + (item.id ? "/" + item.id : ""),{method:item.id ? "PATCH" : "POST",body:body});
        closeModal(); notify(item.id ? "Company updated" : "Company created","success"); renderCompanies();
      } catch (err) { notify("Could not save company","error"); }
    };
  }

  async function renderPeople(query) {
    query = query || "";
    var d = await api("/api/v1/workspaces/" + wid() + "/contacts?limit=500&q=" + encodeURIComponent(query));
    var items = d.items || [];
    appContent.innerHTML = pageTop("People connected to your customer relationships.",
      '<input id="peopleSearch" class="search-input" placeholder="Search people" value="' + esc(query) + '"><button id="newPerson" class="button button-dark button-compact">＋ Person</button>') +
      '<section class="card">' + (items.length ? peopleTable(items) : empty("No people yet","Add the first contact to this workspace.","Add person","person")) + '</section>';
    var timer;
    $("#peopleSearch").oninput = function (e) { clearTimeout(timer); timer=setTimeout(function(){renderPeople(e.target.value);},250); };
    $("#newPerson").onclick=function(){personForm();}; bindEmptyActions();
    $$("[data-edit-person]",appContent).forEach(function(b){b.onclick=function(){personForm(items.find(function(x){return x.id===b.dataset.editPerson;}));};});
    $$("[data-delete-person]",appContent).forEach(function(b){b.onclick=function(){confirmDelete("person",b.dataset.deletePerson,function(){return api("/api/v1/workspaces/"+wid()+"/contacts/"+b.dataset.deletePerson,{method:"DELETE"});},function(){renderPeople(query);});};});
  }

  function peopleTable(items) {
    return '<div class="table-scroll"><table class="data-table"><thead><tr><th>Person</th><th>Company</th><th>Role</th><th>Email</th><th>Phone</th><th></th></tr></thead><tbody>' +
      items.map(function(x){var name=[x.first_name,x.last_name].filter(Boolean).join(" ") || "Unnamed";return '<tr><td><span class="table-title">'+esc(name)+'</span></td><td>'+esc(x.company_name||"—")+'</td><td>'+esc(x.job_title||"—")+'</td><td>'+esc(x.email||"—")+'</td><td>'+esc(x.phone||"—")+'</td><td><div class="row-actions"><button class="icon-button" data-edit-person="'+esc(x.id)+'">Edit</button><button class="icon-button danger" data-delete-person="'+esc(x.id)+'">Delete</button></div></td></tr>';}).join("") +
      '</tbody></table></div>';
  }

  async function personForm(item) {
    item=item||{};
    var companies=(await api("/api/v1/workspaces/"+wid()+"/companies?limit=500")).items||[];
    openModal('<h2>'+(item.id?"Edit person":"New person")+'</h2><form id="entityForm" class="form-grid">'+
      field("First name","firstName",item.first_name)+field("Last name","lastName",item.last_name)+
      '<label>Company<select name="companyId"><option value="">No company</option>'+companies.map(function(c){return '<option value="'+esc(c.id)+'" '+(c.id===item.company_id?"selected":"")+'>'+esc(c.name)+'</option>';}).join("")+'</select></label>'+
      field("Job title","jobTitle",item.job_title)+field("Email","email",item.email,false,"","email")+field("Phone","phone",item.phone)+
      '<div class="form-actions"><button type="button" class="button button-light button-compact" data-cancel>Cancel</button><button class="button button-dark button-compact">'+(item.id?"Save changes":"Create person")+'</button></div></form>');
    $("[data-cancel]").onclick=closeModal;
    $("#entityForm").onsubmit=async function(e){e.preventDefault();var f=new FormData(e.currentTarget);var body={companyId:f.get("companyId")||null,firstName:f.get("firstName")||"",lastName:f.get("lastName")||"",email:f.get("email")||null,phone:f.get("phone")||"",jobTitle:f.get("jobTitle")||"",metadata:item.metadata||{}};try{await api("/api/v1/workspaces/"+wid()+"/contacts"+(item.id?"/"+item.id:""),{method:item.id?"PATCH":"POST",body:body});closeModal();notify(item.id?"Person updated":"Person created","success");renderPeople();}catch(_){notify("Could not save person","error");}};
  }

  async function renderOpportunities() {
    var d=await api("/api/v1/workspaces/"+wid()+"/opportunities?limit=500"),items=d.items||[];
    appContent.innerHTML=pageTop("Track active revenue and deal progress.",'<button id="newOpportunity" class="button button-dark button-compact">＋ Opportunity</button>')+'<section class="card">'+(items.length?opportunitiesTable(items,true):empty("No opportunities yet","Create the first commercial opportunity.","Add opportunity","opportunity"))+'</section>';
    $("#newOpportunity").onclick=function(){opportunityForm();};bindEmptyActions();
    $$("[data-edit-opportunity]",appContent).forEach(function(b){b.onclick=function(){opportunityForm(items.find(function(x){return x.id===b.dataset.editOpportunity;}));};});
  }

  function opportunitiesTable(items,actions) {
    if(!items.length)return empty("No opportunities yet","Pipeline work will appear here.");
    return '<div class="table-scroll"><table class="data-table"><thead><tr><th>Opportunity</th><th>Value</th><th>Status</th><th>Probability</th><th>Close date</th>'+(actions?'<th></th>':'')+'</tr></thead><tbody>'+
      items.map(function(x){return '<tr><td><span class="table-title">'+esc(x.title)+'</span></td><td>'+esc(money(x.amount_cents,x.currency))+'</td><td>'+badge(x.status)+'</td><td>'+esc(Number(x.probability||0)+"%")+'</td><td>'+esc(date(x.expected_close_date))+'</td>'+(actions?'<td><div class="row-actions"><button class="icon-button" data-edit-opportunity="'+esc(x.id)+'">Edit</button></div></td>':'')+'</tr>';}).join("")+
      '</tbody></table></div>';
  }

  async function opportunityForm(item) {
    item=item||{};
    var data=await Promise.all([api("/api/v1/workspaces/"+wid()+"/pipelines"),api("/api/v1/workspaces/"+wid()+"/companies?limit=500"),api("/api/v1/workspaces/"+wid()+"/contacts?limit=500")]);
    var pipelines=data[0].items||[],companies=data[1].items||[],people=data[2].items||[];
    var stages=[];pipelines.forEach(function(p){(p.stages||[]).forEach(function(s){stages.push({id:s.id,name:p.name+" / "+s.name,pipeline_id:p.id});});});
    openModal('<h2>'+(item.id?"Edit opportunity":"New opportunity")+'</h2><form id="entityForm" class="form-grid">'+field("Title","title",item.title,true,"full-row")+
      field("Value","amount",item.amount_cents!=null?Number(item.amount_cents)/100:0,false,"","number")+
      '<label>Currency<select name="currency">'+["USD","EUR","SAR","AED","YER"].map(function(c){return '<option '+((item.currency||"USD")===c?"selected":"")+'>'+c+'</option>';}).join("")+'</select></label>'+
      '<label>Pipeline<select name="pipelineId"><option value="">No pipeline</option>'+pipelines.map(function(p){return '<option value="'+esc(p.id)+'" '+(p.id===item.pipeline_id?"selected":"")+'>'+esc(p.name)+'</option>';}).join("")+'</select></label>'+
      '<label>Stage<select name="stageId"><option value="">No stage</option>'+stages.map(function(s){return '<option value="'+esc(s.id)+'" '+(s.id===item.stage_id?"selected":"")+'>'+esc(s.name)+'</option>';}).join("")+'</select></label>'+
      '<label>Company<select name="companyId"><option value="">No company</option>'+companies.map(function(c){return '<option value="'+esc(c.id)+'" '+(c.id===item.company_id?"selected":"")+'>'+esc(c.name)+'</option>';}).join("")+'</select></label>'+
      '<label>Contact<select name="contactId"><option value="">No contact</option>'+people.map(function(p){var n=[p.first_name,p.last_name].filter(Boolean).join(" ")||p.email||"Contact";return '<option value="'+esc(p.id)+'" '+(p.id===item.contact_id?"selected":"")+'>'+esc(n)+'</option>';}).join("")+'</select></label>'+
      field("Probability %","probability",item.probability||0,false,"","number")+field("Expected close","expectedCloseDate",item.expected_close_date?String(item.expected_close_date).slice(0,10):"",false,"","date")+
      '<label>Status<select name="status">'+["open","won","lost","archived"].map(function(s){return '<option '+((item.status||"open")===s?"selected":"")+'>'+s+'</option>';}).join("")+'</select></label>'+
      '<div class="form-actions"><button type="button" class="button button-light button-compact" data-cancel>Cancel</button><button class="button button-dark button-compact">'+(item.id?"Save changes":"Create opportunity")+'</button></div></form>',true);
    $("[data-cancel]").onclick=closeModal;
    $("#entityForm").onsubmit=async function(e){e.preventDefault();var f=new FormData(e.currentTarget);var stage=f.get("stageId")||null;var selectedStage=stages.find(function(s){return s.id===stage;});var body={title:f.get("title"),amountCents:Math.round(Number(f.get("amount")||0)*100),currency:f.get("currency"),pipelineId:f.get("pipelineId")||selectedStage&&selectedStage.pipeline_id||null,stageId:stage,companyId:f.get("companyId")||null,contactId:f.get("contactId")||null,probability:Number(f.get("probability")||0),expectedCloseDate:f.get("expectedCloseDate")||null,status:f.get("status"),metadata:item.metadata||{}};try{await api("/api/v1/workspaces/"+wid()+"/opportunities"+(item.id?"/"+item.id:""),{method:item.id?"PATCH":"POST",body:body});closeModal();notify(item.id?"Opportunity updated":"Opportunity created","success");renderOpportunities();}catch(_){notify("Could not save opportunity","error");}};
  }

  async function renderTasks() {
    var d=await api("/api/v1/workspaces/"+wid()+"/tasks?limit=500"),items=d.items||[];
    appContent.innerHTML=pageTop("Follow-ups and accountable work across the workspace.",'<button id="newTask" class="button button-dark button-compact">＋ Task</button>')+'<section class="card">'+(items.length?tasksTable(items):empty("No tasks yet","Create the first follow-up or workspace task.","Add task","task"))+'</section>';
    $("#newTask").onclick=function(){taskForm();};bindEmptyActions();
    $$("[data-edit-task]",appContent).forEach(function(b){b.onclick=function(){taskForm(items.find(function(x){return x.id===b.dataset.editTask;}));};});
  }

  function tasksTable(items) {
    return '<div class="table-scroll"><table class="data-table"><thead><tr><th>Task</th><th>Status</th><th>Priority</th><th>Due</th><th></th></tr></thead><tbody>'+
      items.map(function(x){return '<tr><td><span class="table-title">'+esc(x.title)+'</span><span class="table-sub">'+esc(x.description||"")+'</span></td><td>'+badge(x.status)+'</td><td>'+badge(x.priority)+'</td><td>'+esc(dateTime(x.due_at))+'</td><td><div class="row-actions"><button class="icon-button" data-edit-task="'+esc(x.id)+'">Edit</button></div></td></tr>';}).join("")+'</tbody></table></div>';
  }

  function taskForm(item) {
    item=item||{};
    var localDue="";if(item.due_at){var d=new Date(item.due_at);if(!Number.isNaN(d.valueOf()))localDue=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
    openModal('<h2>'+(item.id?"Edit task":"New task")+'</h2><form id="entityForm" class="form-grid">'+field("Title","title",item.title,true,"full-row")+
      '<label class="full-row">Description<textarea name="description">'+esc(item.description||"")+'</textarea></label>'+
      '<label>Status<select name="status">'+["todo","in_progress","done","cancelled"].map(function(s){return '<option '+((item.status||"todo")===s?"selected":"")+'>'+s+'</option>';}).join("")+'</select></label>'+
      '<label>Priority<select name="priority">'+["low","normal","high","urgent"].map(function(s){return '<option '+((item.priority||"normal")===s?"selected":"")+'>'+s+'</option>';}).join("")+'</select></label>'+
      field("Due date","dueAt",localDue,false,"full-row","datetime-local")+
      '<div class="form-actions"><button type="button" class="button button-light button-compact" data-cancel>Cancel</button><button class="button button-dark button-compact">'+(item.id?"Save changes":"Create task")+'</button></div></form>');
    $("[data-cancel]").onclick=closeModal;
    $("#entityForm").onsubmit=async function(e){e.preventDefault();var f=new FormData(e.currentTarget),due=f.get("dueAt");var body={title:f.get("title"),description:f.get("description")||"",status:f.get("status"),priority:f.get("priority"),dueAt:due?new Date(due).toISOString():null};try{await api("/api/v1/workspaces/"+wid()+"/tasks"+(item.id?"/"+item.id:""),{method:item.id?"PATCH":"POST",body:body});closeModal();notify(item.id?"Task updated":"Task created","success");renderTasks();}catch(_){notify("Could not save task","error");}};
  }

  async function renderPipelines() {
    var d=await api("/api/v1/workspaces/"+wid()+"/pipelines"),items=d.items||[];
    appContent.innerHTML=pageTop("Define how opportunities move through your commercial process.",roleAtLeast("manager")?'<button id="newPipeline" class="button button-dark button-compact">＋ Pipeline</button>':"")+
      (items.length?'<div class="pipeline-grid">'+items.map(function(p){return '<article class="pipeline-card"><div class="pipeline-title"><h3>'+esc(p.name)+'</h3>'+(p.is_default?badge("active"):"")+'</div><div class="stage-list">'+(p.stages||[]).map(function(s){return '<div class="stage-row"><span>'+esc(s.name)+'</span><span>'+esc(s.probability+"%")+'</span></div>';}).join("")+'</div></article>';}).join("")+'</div>':empty("No pipelines yet","Managers can create a pipeline with custom stages."));
    if($("#newPipeline"))$("#newPipeline").onclick=pipelineForm;
  }

  function pipelineForm() {
    openModal('<h2>New pipeline</h2><p class="modal-intro">Create stages as comma-separated names. KARVEN assigns a progressive probability that you can refine in the API later.</p><form id="entityForm" class="form-grid">'+field("Pipeline name","name","",true,"full-row")+field("Stages","stages","Lead, Qualified, Proposal, Negotiation, Won",true,"full-row")+'<label class="check-row full-row"><input type="checkbox" name="isDefault">Make this the default pipeline</label><div class="form-actions"><button type="button" class="button button-light button-compact" data-cancel>Cancel</button><button class="button button-dark button-compact">Create pipeline</button></div></form>');
    $("[data-cancel]").onclick=closeModal;
    $("#entityForm").onsubmit=async function(e){e.preventDefault();var f=new FormData(e.currentTarget);var names=String(f.get("stages")||"").split(",").map(function(x){return x.trim();}).filter(Boolean);var stages=names.map(function(n,i){return {name:n,position:i,probability:n.toLowerCase()==="won"?100:Math.min(90,Math.round(i*100/Math.max(names.length,1)))};});try{await api("/api/v1/workspaces/"+wid()+"/pipelines",{method:"POST",body:{name:f.get("name"),isDefault:f.get("isDefault")==="on",stages:stages}});closeModal();notify("Pipeline created","success");renderPipelines();}catch(_){notify("Could not create pipeline","error");}};
  }

  async function renderNotes() {
    var d=await api("/api/v1/workspaces/"+wid()+"/notes?limit=100"),items=d.items||[];
    appContent.innerHTML=pageTop("Long-form context shared across the workspace.","")+'<div class="note-grid"><section class="card note-compose"><div class="card-header"><h3>New note</h3></div><div class="card-body"><form id="noteForm"><textarea name="body" placeholder="Write context your team should not lose…" required></textarea><div class="page-actions"><button class="button button-dark button-compact">Save note</button></div></form></div></section><section class="card"><div class="card-header"><h3>Recent notes</h3><small>'+items.length+'</small></div>'+(items.length?items.map(function(n){return '<article class="note-card"><p>'+esc(n.body)+'</p><small>'+esc(dateTime(n.created_at))+'</small></article>';}).join(""):empty("No notes yet","Create a note to preserve customer or operational context."))+'</section></div>';
    $("#noteForm").onsubmit=async function(e){e.preventDefault();var f=new FormData(e.currentTarget);try{await api("/api/v1/workspaces/"+wid()+"/notes",{method:"POST",body:{body:f.get("body"),linkedType:null,linkedId:null}});notify("Note saved","success");renderNotes();}catch(_){notify("Could not save note","error");}};
  }

  async function renderActivity() {
    var d=await api("/api/v1/workspaces/"+wid()+"/activities?limit=500"),items=d.items||[];
    appContent.innerHTML=pageTop("Chronological operational history for the workspace.","")+'<section class="card"><div class="card-header"><h3>Activity</h3><small>'+items.length+' events</small></div>'+activityList(items)+'</section>';
  }

  async function renderFiles() {
    var d=await api("/api/v1/workspaces/"+wid()+"/files"),items=d.items||[];
    appContent.innerHTML=pageTop("Workspace file registry and storage status.",'<button id="uploadFile" class="button button-dark button-compact">＋ Upload file</button>')+'<section class="card">'+(items.length?'<div class="table-scroll"><table class="data-table"><thead><tr><th>File</th><th>Type</th><th>Size</th><th>Status</th><th>Created</th></tr></thead><tbody>'+items.map(function(x){return '<tr><td><span class="table-title">'+esc(x.name)+'</span></td><td>'+esc(x.mime_type||"—")+'</td><td>'+esc(formatBytes(x.size_bytes))+'</td><td>'+badge(x.status)+'</td><td>'+esc(dateTime(x.created_at))+'</td></tr>';}).join("")+'</tbody></table></div>':empty("No files yet","Files will appear here after upload."))+'</section>';
    $("#uploadFile").onclick=fileUploadModal;
  }

  function formatBytes(n){n=Number(n||0);if(n<1024)return n+" B";if(n<1048576)return (n/1024).toFixed(1)+" KB";if(n<1073741824)return (n/1048576).toFixed(1)+" MB";return (n/1073741824).toFixed(1)+" GB";}

  function fileUploadModal() {
    openModal('<h2>Upload file</h2><p class="modal-intro">KARVEN will request a secure upload URL from the configured storage provider.</p><form id="fileForm" class="stack-form"><label>File<input name="file" type="file" required></label><button class="button button-dark button-full">Upload</button></form>');
    $("#fileForm").onsubmit=async function(e){e.preventDefault();var file=e.currentTarget.elements.file.files[0];if(!file)return;try{var p=await api("/api/v1/workspaces/"+wid()+"/files/presign",{method:"POST",body:{name:file.name,mimeType:file.type||"application/octet-stream",sizeBytes:file.size}});var up=await fetch(p.uploadUrl,{method:"PUT",headers:{"content-type":file.type||"application/octet-stream"},body:file});if(!up.ok)throw new Error("upload_failed");await api("/api/v1/workspaces/"+wid()+"/files/"+p.file.id+"/complete",{method:"POST",body:{}});closeModal();notify("File uploaded","success");renderFiles();}catch(err){notify(err.status===503?"Storage is not configured yet":"File upload failed","error");}};
  }

  async function renderTeam() {
    var d=await api("/api/v1/workspaces/"+wid()+"/members"),items=d.items||[],canInvite=roleAtLeast("admin");
    appContent.innerHTML=pageTop("People with access to this workspace.",canInvite?'<button id="inviteMember" class="button button-dark button-compact">＋ Invite member</button>':"")+'<section class="card">'+(items.length?'<div class="table-scroll"><table class="data-table"><thead><tr><th>Member</th><th>Email</th><th>Role</th><th>Joined</th><th></th></tr></thead><tbody>'+items.map(function(x){return '<tr><td><span class="table-title">'+esc(x.full_name||"—")+'</span></td><td>'+esc(x.email)+'</td><td>'+badge(x.role)+'</td><td>'+esc(date(x.created_at))+'</td><td>'+(state.workspace.role==="owner"&&x.role!=="owner"?'<button class="icon-button" data-role-user="'+esc(x.id)+'">Change role</button>':"")+'</td></tr>';}).join("")+'</tbody></table></div>':empty("No team members","Workspace members will appear here."))+'</section>';
    if($("#inviteMember"))$("#inviteMember").onclick=inviteForm;
    $$("[data-role-user]",appContent).forEach(function(b){b.onclick=function(){var m=items.find(function(x){return x.id===b.dataset.roleUser;});roleForm(m);};});
  }

  function inviteForm() {
    openModal('<h2>Invite team member</h2><form id="entityForm" class="form-grid">'+field("Email","email","",true,"full-row","email")+'<label class="full-row">Role<select name="role"><option>member</option><option>manager</option><option>admin</option><option>viewer</option></select></label><div class="form-actions"><button type="button" class="button button-light button-compact" data-cancel>Cancel</button><button class="button button-dark button-compact">Create invite</button></div></form>');
    $("[data-cancel]").onclick=closeModal;
    $("#entityForm").onsubmit=async function(e){e.preventDefault();var f=new FormData(e.currentTarget);try{await api("/api/v1/workspaces/"+wid()+"/invites",{method:"POST",body:{email:f.get("email"),role:f.get("role")}});closeModal();notify("Invitation created","success");}catch(_){notify("Could not create invitation","error");}};
  }

  function roleForm(member) {
    openModal('<h2>Change role</h2><p class="modal-intro">'+esc(member.email)+'</p><form id="entityForm" class="stack-form"><label>Role<select name="role">'+["viewer","member","manager","admin"].map(function(r){return '<option '+(member.role===r?"selected":"")+'>'+r+'</option>';}).join("")+'</select></label><button class="button button-dark button-full">Update role</button></form>');
    $("#entityForm").onsubmit=async function(e){e.preventDefault();var f=new FormData(e.currentTarget);try{await api("/api/v1/workspaces/"+wid()+"/members/"+member.id,{method:"PATCH",body:{role:f.get("role")}});closeModal();notify("Role updated","success");renderTeam();}catch(_){notify("Could not update role","error");}};
  }

  async function renderBilling() {
    var d=await api("/api/v1/workspaces/"+wid()+"/billing"),sub=d.subscription,invoices=d.invoices||[],payments=d.payments||[];
    appContent.innerHTML=pageTop("Subscription, invoice and payment visibility.","")+'<div class="settings-grid"><section class="settings-card"><h3>Current subscription</h3>'+(sub?'<div class="kv-row"><span>Plan</span><b>'+esc(sub.plan_name||sub.plan_code||"Plan")+'</b></div><div class="kv-row"><span>Status</span><span>'+badge(sub.status)+'</span></div><div class="kv-row"><span>Period end</span><b>'+esc(date(sub.current_period_end))+'</b></div>':empty("No active subscription","A subscription has not been assigned to this workspace."))+'</section><section class="settings-card"><h3>Payments</h3><div class="kv-row"><span>Recorded</span><b>'+payments.length+'</b></div><div class="kv-row"><span>Invoices</span><b>'+invoices.length+'</b></div></section></div><div class="dashboard-grid"><section class="card"><div class="card-header"><h3>Invoices</h3></div>'+billingItems(invoices,"invoice")+'</section><section class="card"><div class="card-header"><h3>Payments</h3></div>'+billingItems(payments,"payment")+'</section></div>';
  }

  function billingItems(items,type) {
    if(!items.length)return empty("No "+type+" records","Billing records will appear here.");
    return '<div class="card-body billing-list">'+items.slice(0,30).map(function(x){var amount=x.amount_cents!=null?money(x.amount_cents,x.currency):"—";return '<div class="billing-item"><div><b>'+esc(x.number||x.provider_reference||type)+'</b><small>'+esc(dateTime(x.created_at))+'</small></div><div><b>'+esc(amount)+'</b><small>'+esc(x.status||"")+'</small></div></div>';}).join("")+'</div>';
  }

  async function renderSettings() {
    var data=await Promise.all([api("/api/v1/workspaces/"+wid()+"/settings"),fetch(API+"/health").then(function(r){return r.json();}).catch(function(){return {ok:false};})]);
    var items=data[0].items||[],health=data[1]||{};
    appContent.innerHTML=pageTop("Workspace configuration and platform state.",roleAtLeast("manager")?'<button id="newSetting" class="button button-dark button-compact">＋ Setting</button>':"")+'<div class="settings-grid"><section class="settings-card"><h3>Workspace</h3><div class="kv-row"><span>Name</span><b>'+esc(state.workspace.name)+'</b></div><div class="kv-row"><span>Role</span><span>'+badge(state.workspace.role)+'</span></div><div class="kv-row"><span>Workspace ID</span><code>'+esc(state.workspace.id)+'</code></div></section><section class="settings-card"><h3>Infrastructure</h3><div class="kv-row"><span>Backend</span><b>'+esc(health.ok?"Healthy":"Unavailable")+'</b></div><div class="kv-row"><span>Database</span><b>'+esc(health.database||"unknown")+'</b></div><div class="kv-row"><span>Redis</span><b>'+esc(health.redis||"unknown")+'</b></div></section><section class="settings-card"><h3>Workspace settings</h3>'+(items.length?items.map(function(x){return '<div class="kv-row"><span>'+esc(x.key)+'</span><code>'+esc(json(x.value))+'</code></div>';}).join(""):empty("No custom settings","Managers can create key/value workspace settings."))+'</section><section class="settings-card"><h3>KARVEN Control</h3><p class="modal-intro">Platform-level plans, payments and system administration live in KARVEN Control.</p><a class="button button-light button-compact" href="'+esc(ADMIN)+'" target="_blank" rel="noopener">Open Control ↗</a></section></div>';
    if($("#newSetting"))$("#newSetting").onclick=settingForm;
  }

  function settingForm() {
    openModal('<h2>Workspace setting</h2><form id="entityForm" class="form-grid">'+field("Key","key","",true,"full-row")+field("Value","value","",true,"full-row")+'<div class="form-actions"><button type="button" class="button button-light button-compact" data-cancel>Cancel</button><button class="button button-dark button-compact">Save setting</button></div></form>');
    $("[data-cancel]").onclick=closeModal;
    $("#entityForm").onsubmit=async function(e){e.preventDefault();var f=new FormData(e.currentTarget),rawValue=f.get("value"),value;try{value=JSON.parse(rawValue);}catch(_){value=rawValue;}try{await api("/api/v1/workspaces/"+wid()+"/settings/"+encodeURIComponent(f.get("key")),{method:"PUT",body:{value:value}});closeModal();notify("Setting saved","success");renderSettings();}catch(_){notify("Could not save setting","error");}};
  }

  async function renderWebhooks() {
    var d=await api("/api/v1/workspaces/"+wid()+"/webhooks"),items=d.items||[];
    appContent.innerHTML=pageTop("Outbound event delivery for integrations.",roleAtLeast("manager")?'<button id="newWebhook" class="button button-dark button-compact">＋ Webhook</button>':"")+'<section class="card">'+(items.length?'<div class="table-scroll"><table class="data-table"><thead><tr><th>Endpoint</th><th>Events</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>'+items.map(function(x){return '<tr><td><span class="table-title">'+esc(x.url)+'</span></td><td class="webhook-events">'+esc((x.events||[]).join(", "))+'</td><td>'+badge(x.active?"active":"paused")+'</td><td>'+esc(date(x.created_at))+'</td><td><div class="row-actions"><button class="icon-button" data-edit-webhook="'+esc(x.id)+'">Edit</button><button class="icon-button danger" data-delete-webhook="'+esc(x.id)+'">Delete</button></div></td></tr>';}).join("")+'</tbody></table></div>':empty("No webhooks","Managers can create an integration endpoint."))+'</section>';
    if($("#newWebhook"))$("#newWebhook").onclick=function(){webhookForm();};
    $$("[data-edit-webhook]",appContent).forEach(function(b){b.onclick=function(){webhookForm(items.find(function(x){return x.id===b.dataset.editWebhook;}));};});
    $$("[data-delete-webhook]",appContent).forEach(function(b){b.onclick=function(){confirmDelete("webhook",b.dataset.deleteWebhook,function(){return api("/api/v1/workspaces/"+wid()+"/webhooks/"+b.dataset.deleteWebhook,{method:"DELETE"});},renderWebhooks);};});
  }

  function webhookForm(item) {
    item=item||{};
    openModal('<h2>'+(item.id?"Edit webhook":"New webhook")+'</h2><form id="entityForm" class="form-grid">'+field("Endpoint URL","url",item.url,true,"full-row","url")+field("Events (comma separated)","events",(item.events||["company.created","contact.created","opportunity.updated"]).join(", "),true,"full-row")+'<label class="check-row full-row"><input type="checkbox" name="active" '+(item.id&&!item.active?"":"checked")+'>Webhook active</label><div class="form-actions"><button type="button" class="button button-light button-compact" data-cancel>Cancel</button><button class="button button-dark button-compact">'+(item.id?"Save changes":"Create webhook")+'</button></div></form>');
    $("[data-cancel]").onclick=closeModal;
    $("#entityForm").onsubmit=async function(e){e.preventDefault();var f=new FormData(e.currentTarget);var body={url:f.get("url"),events:String(f.get("events")||"").split(",").map(function(x){return x.trim();}).filter(Boolean),active:f.get("active")==="on"};try{var r=await api("/api/v1/workspaces/"+wid()+"/webhooks"+(item.id?"/"+item.id:""),{method:item.id?"PATCH":"POST",body:body});closeModal();if(r.secret)openModal('<h2>Webhook created</h2><p class="modal-intro">Copy this signing secret now. It is returned only at creation time.</p><div class="settings-card"><code>'+esc(r.secret)+'</code></div>');else notify("Webhook updated","success");renderWebhooks();}catch(_){notify("Could not save webhook","error");}};
  }

  async function renderAudit() {
    var d=await api("/api/v1/workspaces/"+wid()+"/audit"),items=d.items||[];
    appContent.innerHTML=pageTop("Administrative and operational actions in this workspace.","")+'<section class="card">'+(items.length?'<div class="table-scroll"><table class="data-table"><thead><tr><th>Action</th><th>Entity</th><th>User</th><th>When</th></tr></thead><tbody>'+items.map(function(x){return '<tr><td><span class="table-title">'+esc(x.action)+'</span></td><td>'+esc((x.entity_type||"")+" "+(x.entity_id||""))+'</td><td>'+esc(x.user_id||"system")+'</td><td>'+esc(dateTime(x.created_at))+'</td></tr>';}).join("")+'</tbody></table></div>':empty("No audit events","Administrative events will appear here."))+'</section>';
  }

  function pageTop(desc,actions) {
    return '<div class="page-top"><p>'+esc(desc)+'</p><div class="page-actions">'+(actions||"")+'</div></div>';
  }

  function field(label,name,value,required,cls,type) {
    return '<label class="'+(cls||"")+'">'+esc(label)+'<input name="'+esc(name)+'" type="'+esc(type||"text")+'" value="'+esc(value==null?"":value)+'" '+(required?"required":"")+'></label>';
  }

  function bindEmptyActions() {
    $$("[data-empty-action]",appContent).forEach(function(b){
      b.onclick=function(){
        var a=b.dataset.emptyAction;
        if(a==="company")companyForm();
        else if(a==="person")personForm();
        else if(a==="opportunity")opportunityForm();
        else if(a==="task")taskForm();
        else if(a==="workspace")workspaceModal();
      };
    });
  }

  function confirmDelete(type,id,run,after) {
    openModal('<h2>Delete '+esc(type)+'?</h2><p class="modal-intro">This action cannot be undone from the KARVEN interface.</p><div class="form-actions"><button class="button button-light button-compact" data-cancel>Cancel</button><button class="button button-danger button-compact" id="confirmDelete">Delete</button></div>');
    $("[data-cancel]").onclick=closeModal;
    $("#confirmDelete").onclick=async function(){try{await run();closeModal();notify(type+" deleted","success");if(after)after();}catch(_){notify("Could not delete "+type,"error");}};
  }

  function workspaceModal() {
    var workspaces=state.me&&state.me.workspaces||[];
    openModal('<h2>Workspaces</h2><div class="workspace-menu">'+workspaces.map(function(w){return '<button class="workspace-option" data-workspace="'+esc(w.id)+'"><span><b>'+esc(w.name)+'</b><small>'+esc(w.slug||"")+'</small></span>'+badge(w.role)+'</button>';}).join("")+'</div><div class="card-body"><button id="createWorkspace" class="button button-light button-full">＋ Create workspace</button></div>');
    $$("[data-workspace]",modalBody).forEach(function(b){b.onclick=function(){state.workspace=workspaces.find(function(w){return w.id===b.dataset.workspace;});localStorage.setItem("karven_workspace",state.workspace.id);hydrateAppChrome();closeModal();navigate("home");};});
    $("#createWorkspace").onclick=createWorkspaceForm;
  }

  function createWorkspaceForm() {
    openModal('<h2>Create workspace</h2><form id="entityForm" class="stack-form">'+field("Workspace name","name","",true)+'<button class="button button-dark button-full">Create workspace</button></form>');
    $("#entityForm").onsubmit=async function(e){e.preventDefault();var f=new FormData(e.currentTarget);try{var w=await api("/api/v1/workspaces",{method:"POST",body:{name:f.get("name")}});state.me.workspaces.push({id:w.id,name:w.name,slug:w.slug,status:w.status,role:"owner"});state.workspace=state.me.workspaces[state.me.workspaces.length-1];localStorage.setItem("karven_workspace",state.workspace.id);hydrateAppChrome();closeModal();notify("Workspace created","success");navigate("home");}catch(_){notify("Could not create workspace","error");}};
  }

  function quickCreate() {
    openModal('<h2>Quick create</h2><div class="quick-grid"><button class="quick-action" data-quick="company"><b>Company</b><small>New customer account</small></button><button class="quick-action" data-quick="person"><b>Person</b><small>New contact</small></button><button class="quick-action" data-quick="opportunity"><b>Opportunity</b><small>New deal</small></button><button class="quick-action" data-quick="task"><b>Task</b><small>New follow-up</small></button></div>');
    $$("[data-quick]",modalBody).forEach(function(b){b.onclick=function(){var q=b.dataset.quick;if(q==="company")companyForm();if(q==="person")personForm();if(q==="opportunity")opportunityForm();if(q==="task")taskForm();};});
  }

  $("#loginForm").addEventListener("submit",async function(e){
    e.preventDefault();var f=new FormData(e.currentTarget),btn=$('button[type="submit"]',e.currentTarget);btn.disabled=true;
    try{var d=await api("/api/v1/auth/login",{method:"POST",body:{email:f.get("email"),password:f.get("password")},noAuth:true});setSession(d.session);await bootstrapSession();notify("Signed in","success");enterApp("home");}catch(err){notify(err.data&&err.data.error==="invalid_credentials"?"Invalid email or password":"Could not sign in","error");}finally{btn.disabled=false;}
  });

  $("#registerForm").addEventListener("submit",async function(e){
    e.preventDefault();var f=new FormData(e.currentTarget),btn=$('button[type="submit"]',e.currentTarget);btn.disabled=true;
    try{var d=await api("/api/v1/auth/register",{method:"POST",body:{fullName:f.get("fullName"),email:f.get("email"),workspaceName:f.get("workspaceName"),password:f.get("password")},noAuth:true});setSession(d.session);state.workspace=d.workspace;localStorage.setItem("karven_workspace",d.workspace.id);await bootstrapSession();notify("Workspace created","success");enterApp("home");}catch(err){notify(err.data&&err.data.error==="email_in_use"?"This email is already registered":"Could not create account","error");}finally{btn.disabled=false;}
  });

  $("#forgotForm").addEventListener("submit",async function(e){
    e.preventDefault();var f=new FormData(e.currentTarget);try{await api("/api/v1/auth/forgot-password",{method:"POST",body:{email:f.get("email")},noAuth:true});notify("If the account exists, a reset link has been sent","success");switchAuth("login");}catch(_){notify("Could not request reset","error");}
  });

  $("#resetForm").addEventListener("submit",async function(e){
    e.preventDefault();var f=new FormData(e.currentTarget),token=new URLSearchParams(location.search).get("token")||"";try{await api("/api/v1/auth/reset-password",{method:"POST",body:{token:token,password:f.get("password")},noAuth:true});notify("Password reset complete","success");history.replaceState({},"","/");openAuth("login");}catch(_){notify("Reset link is invalid or expired","error");}
  });

  $("#authBack").onclick=function(){renderPublic("/",true);};
  $$("[data-auth-switch]").forEach(function(b){b.onclick=function(){switchAuth(b.dataset.authSwitch);};});
  $("#workspaceSwitcher").onclick=workspaceModal;
  $("#quickCreateButton").onclick=quickCreate;
  $("#mobileSidebarButton").onclick=function(){$("#sidebar").classList.add("open");};
  $("#sidebarClose").onclick=function(){$("#sidebar").classList.remove("open");};
  $("#signOutButton").onclick=async function(){try{if(state.refresh)await api("/api/v1/auth/logout",{method:"POST",body:{refreshToken:state.refresh},noAuth:true});}catch(_){}clearSession();renderPublic("/",true);};

  $("#appNav").addEventListener("click",function(e){var b=e.target.closest("[data-view]");if(!b)return;$("#sidebar").classList.remove("open");navigate(b.dataset.view);});
  $("#siteMenuButton").onclick=function(){$(".site-nav").classList.toggle("open");};

  document.addEventListener("click",function(e){
    var link=e.target.closest("[data-public-link]");
    if(link){e.preventDefault();$(".site-nav").classList.remove("open");renderPublic(link.getAttribute("href"),true);}
    var auth=e.target.closest("[data-auth]");
    if(auth&&!publicContent.contains(auth)){openAuth(auth.dataset.auth);}
  });

  window.addEventListener("popstate",function(){renderPublic(location.pathname,false);});

  async function start() {
    checkPublicStatus();
    var params=new URLSearchParams(location.search);
    if(location.pathname==="/reset-password"&&params.get("token")){openAuth("reset");return;}
    if(state.access&&await bootstrapSession()){enterApp("home");return;}
    renderPublic(location.pathname,false);
  }

  start();
})();
