(()=>{'use strict';
const runtime=window.KARVEN_RUNTIME||{};
const API=(runtime.apiUrl||'https://karven-backend-production.up.railway.app').replace(/\/$/,'');
const ADMIN=runtime.adminUrl||'https://karven-admin-8kzjxw.v2.appdeploy.ai/';
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const state={access:localStorage.getItem('karven_access')||'',refresh:localStorage.getItem('karven_refresh')||'',me:null,workspace:null,view:'dashboard'};
const publicView=$('#publicView'),authView=$('#authView'),appView=$('#appView'),content=$('#content'),modal=$('#modal'),modalBody=$('#modalBody'),toast=$('#toast');

function notify(msg,error=false){toast.textContent=msg;toast.className='toast show'+(error?' error':'');setTimeout(()=>toast.className='toast',2800)}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function money(cents,currency='USD'){try{return new Intl.NumberFormat(undefined,{style:'currency',currency}).format(Number(cents||0)/100)}catch{return (Number(cents||0)/100).toFixed(2)+' '+currency}}
function date(v){if(!v)return '—';const d=new Date(v);return Number.isNaN(d.valueOf())?'—':d.toLocaleDateString()}
function showOnly(el){[publicView,authView,appView].forEach(x=>x.classList.toggle('hidden',x!==el))}
function storeSession(session){state.access=session.accessToken;state.refresh=session.refreshToken;localStorage.setItem('karven_access',state.access);localStorage.setItem('karven_refresh',state.refresh)}
function clearSession(){state.access='';state.refresh='';state.me=null;state.workspace=null;localStorage.removeItem('karven_access');localStorage.removeItem('karven_refresh')}

async function raw(path,opts={}){
  const headers={...(opts.body?{'content-type':'application/json'}:{}),...(opts.headers||{})};
  if(state.access&&!opts.noAuth)headers.authorization='Bearer '+state.access;
  return fetch(API+path,{...opts,headers,body:opts.body&&typeof opts.body!=='string'?JSON.stringify(opts.body):opts.body});
}
async function refreshSession(){
  if(!state.refresh)return false;
  try{const r=await raw('/api/v1/auth/refresh',{method:'POST',body:{refreshToken:state.refresh},noAuth:true});if(!r.ok)return false;storeSession(await r.json());return true}catch{return false}
}
async function api(path,opts={}){
  let r=await raw(path,opts);
  if(r.status===401&&!opts.noAuth&&await refreshSession())r=await raw(path,opts);
  const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{data={raw:text}}
  if(!r.ok){const e=new Error(data.error||'Request failed');e.status=r.status;e.data=data;throw e}
  return data;
}
async function bootstrap(){
  if(!state.access){showOnly(publicView);return}
  try{
    state.me=await api('/api/v1/me');
    const workspaces=state.me.workspaces||[];
    const saved=localStorage.getItem('karven_workspace');
    state.workspace=workspaces.find(w=>w.id===saved)||workspaces[0]||null;
    if(state.workspace)localStorage.setItem('karven_workspace',state.workspace.id);
    hydrateShell();showOnly(appView);navigate('dashboard');
  }catch{clearSession();showOnly(publicView)}
}
function hydrateShell(){
  $('#workspaceName').textContent=state.workspace?.name||'No workspace';
  $('#workspaceRole').textContent=state.workspace?.role||'';
  $('#userName').textContent=state.me?.user?.fullName||state.me?.user?.full_name||state.me?.user?.email||'User';
  $('#userEmail').textContent=state.me?.user?.email||'';
  $('#userInitial').textContent=($('#userName').textContent.trim()[0]||'K').toUpperCase();
  $('#adminLink').href=ADMIN;
}
function openAuth(mode='login'){showOnly(authView);toggleAuth(mode)}
function toggleAuth(mode){$('#loginFormWrap').classList.toggle('hidden',mode!=='login');$('#registerFormWrap').classList.toggle('hidden',mode!=='register')}
$$('[data-auth]').forEach(b=>b.addEventListener('click',()=>openAuth(b.dataset.auth)));
$$('[data-switch]').forEach(b=>b.addEventListener('click',()=>toggleAuth(b.dataset.switch)));
$('#backHome').onclick=()=>showOnly(publicView);

$('#loginForm').addEventListener('submit',async e=>{
  e.preventDefault();const f=new FormData(e.currentTarget);const btn=$('button[type=submit]',e.currentTarget);btn.disabled=true;
  try{const d=await api('/api/v1/auth/login',{method:'POST',body:{email:f.get('email'),password:f.get('password')},noAuth:true});storeSession(d.session);notify('Signed in');await bootstrap()}
  catch(err){notify(err.data?.error==='invalid_credentials'?'Invalid email or password':'Could not sign in',true)}
  finally{btn.disabled=false}
});
$('#registerForm').addEventListener('submit',async e=>{
  e.preventDefault();const f=new FormData(e.currentTarget);const btn=$('button[type=submit]',e.currentTarget);btn.disabled=true;
  try{
    const d=await api('/api/v1/auth/register',{method:'POST',body:{fullName:f.get('fullName'),email:f.get('email'),workspaceName:f.get('workspaceName'),password:f.get('password')},noAuth:true});
    storeSession(d.session);state.workspace=d.workspace;localStorage.setItem('karven_workspace',d.workspace.id);notify('Workspace created');await bootstrap();
  }catch(err){notify(err.data?.error==='email_in_use'?'This email is already registered':'Could not create workspace',true)}
  finally{btn.disabled=false}
});
$('#logoutBtn').onclick=async()=>{try{if(state.refresh)await api('/api/v1/auth/logout',{method:'POST',body:{refreshToken:state.refresh},noAuth:true})}catch{}clearSession();showOnly(publicView)};
$('#mobileMenu').onclick=()=>$('.sidebar').classList.toggle('open');
$('#modalClose').onclick=()=>modal.classList.add('hidden');
modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.add('hidden')});
function openModal(html){modalBody.innerHTML=html;modal.classList.remove('hidden')}
$('#sideNav').addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b){navigate(b.dataset.view);$('.sidebar').classList.remove('open')}});

const titles={dashboard:'Home',companies:'Companies',contacts:'People',opportunities:'Opportunities',tasks:'Tasks',team:'Team',settings:'Settings'};
async function navigate(view){
  state.view=view;$$('#sideNav [data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$('#pageTitle').textContent=titles[view]||view;$('#breadcrumb').textContent=titles[view]||view;content.innerHTML='<div class="loading">Loading KARVEN…</div>';
  try{await ({dashboard:renderDashboard,companies:renderCompanies,contacts:renderContacts,opportunities:renderOpportunities,tasks:renderTasks,team:renderTeam,settings:renderSettings}[view]||renderDashboard)()}catch(err){content.innerHTML='<div class="card empty">Could not load this view.</div>';notify(err.message,true)}
}
const wid=()=>state.workspace?.id;
async function renderDashboard(){
  if(!wid()){content.innerHTML='<div class="card empty">Create or join a workspace to continue.</div>';return}
  const [companies,contacts,ops,tasks,activity]=await Promise.all([
    api(`/api/v1/workspaces/${wid()}/companies?limit=5`),api(`/api/v1/workspaces/${wid()}/contacts?limit=5`),api(`/api/v1/workspaces/${wid()}/opportunities?limit=100`),api(`/api/v1/workspaces/${wid()}/tasks?limit=100`),api(`/api/v1/workspaces/${wid()}/activities?limit=8`)
  ]);
  const openOps=ops.items.filter(x=>x.status==='open'),pipeline=openOps.reduce((s,x)=>s+Number(x.amount_cents||0),0),todo=tasks.items.filter(x=>!['done','cancelled'].includes(x.status)).length;
  content.innerHTML=`
    <div class="stats">
      <div class="stat-card"><small>Companies</small><strong>${companies.items.length}</strong><span>Recent customer accounts</span></div>
      <div class="stat-card"><small>People</small><strong>${contacts.items.length}</strong><span>Recent contacts</span></div>
      <div class="stat-card"><small>Open pipeline</small><strong>${money(pipeline,openOps[0]?.currency||'USD')}</strong><span>${openOps.length} active opportunities</span></div>
      <div class="stat-card"><small>Open tasks</small><strong>${todo}</strong><span>Work still in motion</span></div>
    </div>
    <div class="section-title">Workspace pulse</div>
    <div class="split">
      <div class="card"><div class="card-head"><h3>Recent opportunities</h3><button class="small-btn" data-go="opportunities">View all</button></div>${tableOps(ops.items.slice(0,6))}</div>
      <div class="card"><div class="card-head"><h3>Recent activity</h3><small>Latest</small></div>${activityList(activity.items)}</div>
    </div>`;
  $$('[data-go]').forEach(b=>b.onclick=()=>navigate(b.dataset.go));
}
function tableOps(items){return items.length?`<div class="table-wrap"><table><thead><tr><th>Opportunity</th><th>Value</th><th>Status</th><th>Probability</th></tr></thead><tbody>${items.map(x=>`<tr><td><b>${esc(x.title)}</b></td><td>${money(x.amount_cents,x.currency)}</td><td><span class="badge ${esc(x.status)}">${esc(x.status)}</span></td><td>${Number(x.probability||0)}%</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No opportunities yet.</div>'}
function activityList(items){return items.length?`<div class="activity-list">${items.map(x=>`<div class="activity-item"><div><b>${esc(x.type||x.action||'Activity')}</b><small>${esc(x.summary||x.entity_type||'Workspace update')}</small></div><small>${date(x.created_at)}</small></div>`).join('')}</div>`:'<div class="empty">No activity yet.</div>'}

async function renderCompanies(q=''){
  const d=await api(`/api/v1/workspaces/${wid()}/companies?limit=500&q=${encodeURIComponent(q)}`);
  content.innerHTML=`<div class="page-actions"><p>Customer accounts in ${esc(state.workspace.name)}.</p><div class="toolbar"><input id="companySearch" class="search" placeholder="Search companies" value="${esc(q)}"><button id="addCompany" class="small-btn dark">+ Company</button></div></div>
  <div class="card">${d.items.length?`<div class="table-wrap"><table><thead><tr><th>Name</th><th>Domain</th><th>Email</th><th>Phone</th><th>Updated</th></tr></thead><tbody>${d.items.map(x=>`<tr><td><b>${esc(x.name)}</b></td><td>${esc(x.domain||'—')}</td><td>${esc(x.email||'—')}</td><td>${esc(x.phone||'—')}</td><td>${date(x.updated_at)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No companies yet. Add your first customer account.</div>'}</div>`;
  let t;$('#companySearch').oninput=e=>{clearTimeout(t);t=setTimeout(()=>renderCompanies(e.target.value),300)};$('#addCompany').onclick=companyModal;
}
function companyModal(){openModal(`<h2>New company</h2><form id="entityForm" class="form-grid"><label class="full-row">Company name<input name="name" required></label><label>Domain<input name="domain"></label><label>Email<input name="email" type="email"></label><label>Phone<input name="phone"></label><label>Website<input name="website"></label><div class="form-actions"><button type="button" class="small-btn" data-cancel>Cancel</button><button class="small-btn dark">Create company</button></div></form>`);$('[data-cancel]').onclick=()=>modal.classList.add('hidden');$('#entityForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await api(`/api/v1/workspaces/${wid()}/companies`,{method:'POST',body:{name:f.get('name'),domain:f.get('domain')||'',email:f.get('email')||null,phone:f.get('phone')||'',website:f.get('website')||'',metadata:{}}});modal.classList.add('hidden');notify('Company created');renderCompanies()}catch(err){notify('Could not create company',true)}}}

async function renderContacts(q=''){
  const d=await api(`/api/v1/workspaces/${wid()}/contacts?limit=500&q=${encodeURIComponent(q)}`);
  content.innerHTML=`<div class="page-actions"><p>People connected to your customer relationships.</p><div class="toolbar"><input id="contactSearch" class="search" placeholder="Search people" value="${esc(q)}"><button id="addContact" class="small-btn dark">+ Person</button></div></div>
  <div class="card">${d.items.length?`<div class="table-wrap"><table><thead><tr><th>Name</th><th>Company</th><th>Role</th><th>Email</th><th>Phone</th></tr></thead><tbody>${d.items.map(x=>`<tr><td><b>${esc([x.first_name,x.last_name].filter(Boolean).join(' ')||'Unnamed')}</b></td><td>${esc(x.company_name||'—')}</td><td>${esc(x.job_title||'—')}</td><td>${esc(x.email||'—')}</td><td>${esc(x.phone||'—')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No people yet.</div>'}</div>`;
  let t;$('#contactSearch').oninput=e=>{clearTimeout(t);t=setTimeout(()=>renderContacts(e.target.value),300)};$('#addContact').onclick=contactModal;
}
function contactModal(){openModal(`<h2>New person</h2><form id="entityForm" class="form-grid"><label>First name<input name="firstName"></label><label>Last name<input name="lastName"></label><label>Email<input name="email" type="email"></label><label>Phone<input name="phone"></label><label class="full-row">Job title<input name="jobTitle"></label><div class="form-actions"><button type="button" class="small-btn" data-cancel>Cancel</button><button class="small-btn dark">Create person</button></div></form>`);$('[data-cancel]').onclick=()=>modal.classList.add('hidden');$('#entityForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await api(`/api/v1/workspaces/${wid()}/contacts`,{method:'POST',body:{firstName:f.get('firstName')||'',lastName:f.get('lastName')||'',email:f.get('email')||null,phone:f.get('phone')||'',jobTitle:f.get('jobTitle')||'',metadata:{}}});modal.classList.add('hidden');notify('Person created');renderContacts()}catch{notify('Could not create person',true)}}}

async function renderOpportunities(){
  const d=await api(`/api/v1/workspaces/${wid()}/opportunities?limit=500`);
  content.innerHTML=`<div class="page-actions"><p>Track active revenue and deal progress.</p><button id="addOpportunity" class="small-btn dark">+ Opportunity</button></div><div class="card">${tableOps(d.items)}</div>`;$('#addOpportunity').onclick=opportunityModal;
}
function opportunityModal(){openModal(`<h2>New opportunity</h2><form id="entityForm" class="form-grid"><label class="full-row">Title<input name="title" required></label><label>Value<input name="amount" type="number" min="0" step="0.01" value="0"></label><label>Currency<select name="currency"><option>USD</option><option>EUR</option><option>SAR</option><option>AED</option><option>YER</option></select></label><label>Probability<input name="probability" type="number" min="0" max="100" value="0"></label><label>Status<select name="status"><option>open</option><option>won</option><option>lost</option><option>archived</option></select></label><div class="form-actions"><button type="button" class="small-btn" data-cancel>Cancel</button><button class="small-btn dark">Create opportunity</button></div></form>`);$('[data-cancel]').onclick=()=>modal.classList.add('hidden');$('#entityForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await api(`/api/v1/workspaces/${wid()}/opportunities`,{method:'POST',body:{title:f.get('title'),amountCents:Math.round(Number(f.get('amount')||0)*100),currency:f.get('currency'),probability:Number(f.get('probability')||0),status:f.get('status'),metadata:{}}});modal.classList.add('hidden');notify('Opportunity created');renderOpportunities()}catch{notify('Could not create opportunity',true)}}}

async function renderTasks(){
  const d=await api(`/api/v1/workspaces/${wid()}/tasks?limit=500`);
  content.innerHTML=`<div class="page-actions"><p>Follow-ups and execution across the workspace.</p><button id="addTask" class="small-btn dark">+ Task</button></div><div class="card">${d.items.length?`<div class="table-wrap"><table><thead><tr><th>Task</th><th>Status</th><th>Priority</th><th>Due</th></tr></thead><tbody>${d.items.map(x=>`<tr><td><b>${esc(x.title)}</b><small style="display:block;color:#999;margin-top:3px">${esc(x.description||'')}</small></td><td><span class="badge ${esc(x.status)}">${esc(x.status.replace('_',' '))}</span></td><td><span class="badge ${esc(x.priority)}">${esc(x.priority)}</span></td><td>${date(x.due_at)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No tasks yet.</div>'}</div>`;$('#addTask').onclick=taskModal;
}
function taskModal(){openModal(`<h2>New task</h2><form id="entityForm" class="form-grid"><label class="full-row">Title<input name="title" required></label><label class="full-row">Description<textarea name="description"></textarea></label><label>Status<select name="status"><option>todo</option><option>in_progress</option><option>done</option><option>cancelled</option></select></label><label>Priority<select name="priority"><option>normal</option><option>high</option><option>urgent</option><option>low</option></select></label><label class="full-row">Due date<input name="dueAt" type="datetime-local"></label><div class="form-actions"><button type="button" class="small-btn" data-cancel>Cancel</button><button class="small-btn dark">Create task</button></div></form>`);$('[data-cancel]').onclick=()=>modal.classList.add('hidden');$('#entityForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget),due=f.get('dueAt');try{await api(`/api/v1/workspaces/${wid()}/tasks`,{method:'POST',body:{title:f.get('title'),description:f.get('description')||'',status:f.get('status'),priority:f.get('priority'),dueAt:due?new Date(due).toISOString():null}});modal.classList.add('hidden');notify('Task created');renderTasks()}catch{notify('Could not create task',true)}}}

async function renderTeam(){
  const d=await api(`/api/v1/workspaces/${wid()}/members`);
  const canInvite=['owner','admin'].includes(state.workspace.role);
  content.innerHTML=`<div class="page-actions"><p>People with access to this workspace.</p>${canInvite?'<button id="inviteMember" class="small-btn dark">+ Invite member</button>':''}</div><div class="card">${d.items.length?`<div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th></tr></thead><tbody>${d.items.map(x=>`<tr><td><b>${esc(x.full_name||'—')}</b></td><td>${esc(x.email)}</td><td><span class="badge">${esc(x.role)}</span></td><td>${date(x.created_at)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No team members.</div>'}</div>`;
  if(canInvite)$('#inviteMember').onclick=inviteModal;
}
function inviteModal(){openModal(`<h2>Invite team member</h2><form id="entityForm" class="form-grid"><label class="full-row">Email<input name="email" type="email" required></label><label class="full-row">Role<select name="role"><option>member</option><option>manager</option><option>admin</option><option>viewer</option></select></label><div class="form-actions"><button type="button" class="small-btn" data-cancel>Cancel</button><button class="small-btn dark">Send invite</button></div></form>`);$('[data-cancel]').onclick=()=>modal.classList.add('hidden');$('#entityForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await api(`/api/v1/workspaces/${wid()}/invites`,{method:'POST',body:{email:f.get('email'),role:f.get('role')}});modal.classList.add('hidden');notify('Invitation created')}catch(err){notify(err.status===403?'Your role cannot invite members':'Could not create invitation',true)}}}

async function renderSettings(){
  const [settings,billing,health]=await Promise.all([api(`/api/v1/workspaces/${wid()}/settings`),api(`/api/v1/workspaces/${wid()}/billing`),fetch(API+'/health').then(r=>r.json()).catch(()=>({ok:false}))]);
  content.innerHTML=`<div class="settings-grid">
    <section class="settings-block"><h3>Workspace</h3><div class="kv"><span>Name</span><b>${esc(state.workspace.name)}</b></div><div class="kv"><span>Role</span><b>${esc(state.workspace.role)}</b></div><div class="kv"><span>Workspace ID</span><code>${esc(state.workspace.id)}</code></div></section>
    <section class="settings-block"><h3>Infrastructure</h3><div class="kv"><span>Backend</span><b class="public-status">${health.ok?'Healthy':'Unavailable'}</b></div><div class="kv"><span>Database</span><b>${esc(health.database||'unknown')}</b></div><div class="kv"><span>Redis</span><b>${esc(health.redis||'unknown')}</b></div></section>
    <section class="settings-block"><h3>Billing</h3><div class="kv"><span>Plan</span><b>${esc(billing.subscription?.plan_name||'No active plan')}</b></div><div class="kv"><span>Invoices</span><b>${billing.invoices?.length||0}</b></div><div class="kv"><span>Payments</span><b>${billing.payments?.length||0}</b></div></section>
    <section class="settings-block"><h3>Configuration</h3>${settings.items.length?settings.items.map(x=>`<div class="kv"><span>${esc(x.key)}</span><code>${esc(JSON.stringify(x.value))}</code></div>`).join(''):'<div class="empty">No custom workspace settings.</div>'}</section>
  </div>`;
}
bootstrap();
})();