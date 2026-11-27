"use strict";

// ───────────── Configuración ─────────────
const SUPABASE_URL = "https://jcvqubsmlydseqvkkhib.supabase.co";
const SUPABASE_KEY = "sb_publishable_yo-ElOGjLDA3u0jrFnuu6A_biyZBDbS";
const db = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = s => document.querySelector(s);
const root = document.documentElement;

const table = {
  soporte:"entradas", materia:"kx_materias",
  clase:"kx_clases", tarea:"kx_actividades", personal:"kx_personal",
  moto:"kx_moto_estado", compras:"kx_compras_rapidas"
};
const types = {plantilla:"Plantillas", proceso:"Procesos", nota:"Aprendizajes"};
const singular = {plantilla:"Plantilla", proceso:"Proceso", nota:"Aprendizaje"};
const states = {pendiente:"Pendiente", en_proceso:"En progreso", completada:"Completada"};
const uniViews = {resumen:"Resumen", clase:"Clases", actividad:"Actividades", evaluacion:"Evaluaciones", calendario:"Calendario"};
const local = {
  get(k,f){try{return localStorage.getItem(k)||f}catch{return f}},
  set(k,v){try{localStorage.setItem(k,v)}catch{}}
};

const emptyData = () => ({soporte:[], materia:[], clase:[], tarea:[], personal:[], moto:[], compras:[]});
const S = {
  user:null, data:emptyData(), space:"soporte", view:"all", semOpen:null,
  group:"", chip:"", q:"", selected:null, variables:new Map(), steps:new Map(),
  month:new Date(), day:"", edit:null, loading:false, writing:false, errors:{}, epoch:0
};

const esc = v => String(v ?? "").replace(/[&<>"']/g,
  c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const norm = v => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const uid = v => String(v ?? "");
const find = (k,id) => S.data[k].find(x => uid(x.id)===uid(id));
const current = () => S.selected && find(S.selected.k,S.selected.id);
const isUni = () => S.space==="uni";
const isPersonal = () => S.space==="personal";
const subject = id => find("materia",id)?.nombre || "Materia";
const unique = a => [...new Set(a.filter(Boolean))].sort((x,y)=>x.localeCompare(y,"es"));
const displayName = () => S.user?.user_metadata?.nombre || S.user?.email?.split("@")[0] || "Mi cuenta";
const pad = n => String(n).padStart(2,"0");
const isoDay = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const today = () => isoDay(new Date());
const dateText = x => x ? new Date(x.slice(0,10)+"T12:00:00").toLocaleDateString("es",
  {day:"numeric",month:"short",year:"numeric"}) : "Sin fecha";
const titleOf = r => r.titulo || r.nombre || "Sin título";
const option = (v,t,selected) =>
  `<option value="${esc(v)}" ${uid(v)===uid(selected)?"selected":""}>${esc(t)}</option>`;
const action = (a,t,cls="btn") => `<button type="button" class="${cls}" data-act="${a}">${esc(t)}</button>`;
const keyBtn = (k,r,text,cls="subrow") =>
  `<button class="${cls}" data-open="${k}" data-id="${esc(r.id)}">${esc(text)}</button>`;

function httpsUrl(value){
  if (!value) return "";
  try {const u=new URL(value);return u.protocol==="https:" ? u.href : ""} catch{return ""}
}
function extLink(url,label){
  const safe=httpsUrl(url);
  return safe ? `<a class="btn" href="${esc(safe)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>` : "";
}
function prose(text){
  // Separar texto y enlaces antes de convertirlos en HTML.
  return String(text||"").split(/(https?:\/\/[^\s<>"']+)/gi).map((t,i)=>
    i%2 ? `<a href="${esc(t)}" target="_blank" rel="noopener noreferrer">${esc(t)}</a>` : esc(t)
  ).join("");
}
function toast(msg){
  const t=$("#toast"); t.textContent=msg; t.hidden=false;
  clearTimeout(toast.timer); toast.timer=setTimeout(()=>t.hidden=true,3400);
}
function errorMessage(e){return e?.message || "No se pudo completar la operación."}
const sysLight=matchMedia("(prefers-color-scheme: light)");
const themePref=()=>{const v=local.get("tema","dark");return v==="light"||v==="auto"?v:"dark"};
function setTheme(pref){
  if(pref!=="light"&&pref!=="dark")pref="auto";
  local.set("tema",pref);
  const t=pref==="auto"?(sysLight.matches?"light":"dark"):pref;
  root.dataset.theme=t;
  $('meta[name="theme-color"]').content=t==="dark"?"#0c0c0f":"#f6f5f2";
  document.querySelectorAll("[data-theme-opt]").forEach(b=>
    b.setAttribute("aria-pressed",b.dataset.themeOpt===pref));
}
sysLight.addEventListener?.("change",()=>{if(themePref()==="auto")setTheme("auto")});
function clearSelection(){
  S.selected=null; S.variables.clear();
}
function resetFilters(){
  clearSelection(); S.group=""; S.chip=""; S.q=""; S.day=""; $("#q").value="";
}
function switchSpace(space){
  resetFilters(); S.space=space==="uni"?"uni":space==="personal"?"personal":"soporte";
  S.view=isUni()?"resumen":"all"; root.dataset.space=S.space;
  if(S.user)local.set("kx-space-"+S.user.id,S.space);
  render();
}
function changeView(v){
  clearSelection(); S.view=v; S.chip=""; S.q=""; S.day=""; $("#q").value="";
  render();
}
function openRecord(k,id){
  if(!find(k,id))return;
  if(k==="materia"){S.group=id;openSemFor(id);changeView("resumen");return}
  clearSelection(); S.selected={k,id};
  render();
  focusDetail();
}
function focusDetail(){
  const detail = $("#detail");
  detail.focus({preventScroll:true});
  const stacked = matchMedia("(max-width: 1023px)").matches;
  detail.scrollIntoView({block:stacked || $("#recordList").hidden ? "start" : "nearest"});
}
function matches(k,r,q){
  const h=norm([titleOf(r),r.contenido,r.descripcion,plain(r.resumen),r.cierre,
    r.categoria,r.aplicacion,r.modulo,r.estado,r.tipo,r.fecha,
    (k==="soporte"||k==="personal")?"":subject(r.materia_id)].filter(Boolean).join(" "));
  return norm(q).trim().split(/\s+/).every(w=>h.includes(w));
}
function scoped(k){
  return S.data[k].filter(r=>!S.group||
    (k==="soporte"?r.aplicacion===S.group:k==="personal"?r.categoria===S.group:uid(r.materia_id)===uid(S.group)));
}
function isMatterSummary(){
  return isUni()&&S.view==="resumen"&&!!S.group;
}
function classesByDate(){
  return scoped("clase").sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||""));
}
function entries(){
  let rows;
  if(isPersonal()){
    rows=scoped("personal").filter(r=>S.view==="all"||(S.view==="fijadas"&&r.fijado))
      .sort((a,b)=>Number(!!b.fijado)-Number(!!a.fijado)||
        String(b.updated_at||"").localeCompare(String(a.updated_at||"")))
      .map(r=>["personal",r]);
  }else if(!isUni()){
    rows=scoped("soporte").filter(r=>S.view==="all"||
      (S.view==="fijadas"?r.fijado:r.tipo===S.view))
      .sort((a,b)=>Number(!!b.fijado)-Number(!!a.fijado)||
        String(b.updated_at||"").localeCompare(String(a.updated_at||"")))
      .map(r=>["soporte",r]);
  }else if(S.view==="clase"){
    rows=classesByDate().map(r=>["clase",r]);
  }else{
    rows=scoped("tarea").filter(r=>S.view==="resumen"||
      (S.view==="calendario"?!!r.fecha:r.tipo===S.view))
      .sort((a,b)=>(a.fecha||"9999").localeCompare(b.fecha||"9999")).map(r=>["tarea",r]);
  }
  const matchesFilters=rows.filter(([k,r])=>
    (!S.chip||(k==="soporte"?r.categoria:k==="clase"?r.modulo:r.estado)===S.chip)&&matches(k,r,S.q));
  if(isMatterSummary()){
    for(const lesson of classesByDate()){
      if(matches("clase",lesson,S.q))matchesFilters.push(["clase",lesson]);
    }
  }
  return matchesFilters;
}

// ───────────── Sesión y lectura ─────────────
async function readAll(k){
  const rows=[];
  for(let start=0;;){
    const {data,error}=await db.from(table[k]).select("*").order("id").range(start,start+499);
    if(error)throw error;
    rows.push(...data);
    if(data.length<500)break;
    start+=data.length;
  }
  return rows;
}
async function load(){
  const epoch=++S.epoch; S.loading=true; S.errors={}; render();
  await Promise.all(Object.keys(table).map(async k=>{
    try {const rows=await readAll(k);if(epoch===S.epoch)S.data[k]=rows}
    catch(e){if(epoch===S.epoch)S.errors[k]=errorMessage(e)}
  }));
  if(epoch===S.epoch){S.loading=false;render()}
}
function session(user){
  if(!user){
    ++S.epoch; S.user=null; S.data=emptyData(); S.errors={}; S.steps.clear();
    clearSelection(); S.edit=null; S.writing=false; S.loading=false;
    for(const d of document.querySelectorAll("dialog[open]"))d.close();
    $("#shell").hidden=true; $("#auth").hidden=false; $("#boot").hidden=true;
    $("#password").value=""; $("#detail").replaceChildren(); $("#items").replaceChildren();
    $("#formFields").replaceChildren(); $("#results").replaceChildren(); return;
  }
  if(S.user?.id===user.id){S.user=user;render();return}
  S.semOpen=null;
  S.user=user; S.data=emptyData(); S.steps.clear(); S.errors={};
  $("#auth").hidden=true; $("#boot").hidden=true; $("#shell").hidden=false;
  switchSpace(local.get("kx-space-"+user.id,"soporte")); load();
}
$("#login").onsubmit=async e=>{
  e.preventDefault(); if(!db)return;
  const b=e.target.querySelector("button"); b.disabled=true; $("#loginErr").textContent="";
  try{
    const {error}=await db.auth.signInWithPassword({
      email:$("#email").value.trim(), password:$("#password").value
    });
    if(error)throw error;
  }catch(err){$("#loginErr").textContent=/invalid/i.test(errorMessage(err))?
    "Correo o contraseña incorrectos.":errorMessage(err)}
  finally{b.disabled=false}
};

// ───────────── Navegación y lista ─────────────
function navButton(attr,value,label,on,count=""){
  return `<button class="nav-item ${on?"active":""}" data-${attr}="${esc(value)}" aria-pressed="${on}">
    <span class="truncate">${esc(label)}</span><small class="text-xs opacity-75">${esc(count)}</small></button>`;
}
function semKeyOf(id){return find("materia",id)?.semestre?.trim()||"Sin semestre"}
function openSemFor(id){
  if(id)(S.semOpen??=new Set()).add(semKeyOf(id));
}
function semGroups(){
  const map=new Map();
  for(const m of S.data.materia){
    const k=m.semestre?.trim()||"Sin semestre";
    if(!map.has(k))map.set(k,[]);
    map.get(k).push(m);
  }
  const keys=[...map.keys()];
  const dated=keys.filter(k=>k!=="Sin semestre").sort((a,b)=>b.localeCompare(a,"es",{numeric:true}));
  const rest=keys.includes("Sin semestre")?["Sin semestre"]:[];
  return [...dated,...rest].map(k=>[k,map.get(k).sort((a,b)=>a.nombre.localeCompare(b.nombre,"es"))]);
}
function semesterGroupsHtml(){
  const groups=semGroups();
  if(!groups.length)return `<p class="empty">Aún no hay elementos.</p>`;
  S.semOpen??=new Set([groups[0][0]]);
  return groups.map(([sem,items],index)=>{
    const open=S.semOpen.has(sem);
    const panelId=`semester-subjects-${index}`;
    return `<div class="semgrp">
      <button type="button" class="semhead" data-semtoggle="${esc(sem)}" aria-expanded="${open}" aria-controls="${panelId}">
        <svg class="chev" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
          stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
        <span class="grow">${esc(sem)}</span><small>${items.length}</small>
      </button>
      <div id="${panelId}" class="semlist" ${open?"":"hidden"}>${items.map(m=>
        navButton("group",m.id,m.nombre,S.group===m.id,S.group===m.id?"×":"")).join("")}</div>
    </div>`;
  }).join("");
}
function renderSide(){
  const nm=displayName();$("#whoName").textContent=nm;$("#whoAv").textContent=(nm.trim()[0]||"?").toUpperCase();
  document.querySelectorAll("button[data-space]").forEach(b=>
    b.setAttribute("aria-pressed",b.dataset.space===S.space));
  const views=isUni()?uniViews:isPersonal()?{all:"Todo",fijadas:"Fijadas"}:{all:"Todo",fijadas:"Fijadas",...types};
  $("#spaceSubtitle").textContent = {soporte:"Soporte Técnico", uni:"Universidad", personal:"Uso Personal"}[S.space];
  const records = isPersonal() ? S.data.personal : S.data.soporte;
  const counts = isUni()
    ? {clase:S.data.clase.length, actividad:S.data.tarea.filter(r => r.tipo === "actividad").length,
      evaluacion:S.data.tarea.filter(r => r.tipo === "evaluacion").length}
    : {all:records.length, fijadas:records.filter(r => r.fijado).length,
      ...Object.fromEntries(Object.keys(types).map(kind => [kind, records.filter(r => r.tipo === kind).length]))};
  $("#nav").innerHTML = Object.entries(views).map(([v,t]) => navButton("view",v,t,S.view===v,counts[v])).join("");
  $("#groupTitle").textContent=isUni()?"Materias":isPersonal()?"Categorías":"Aplicaciones";
  $("#addSubject").hidden=!isUni();
  const groupSrc=isPersonal()?unique(S.data.personal.map(r=>r.categoria)):unique(S.data.soporte.map(r=>r.aplicacion));
  $("#groups").innerHTML=isUni()?semesterGroupsHtml():
    (groupSrc.map(x=>navButton("group",x,x,S.group===x,S.group===x?"×":records.filter(r => (isPersonal() ? r.categoria : r.aplicacion) === x).length)).join("")||
    `<p class="empty">Aún no hay elementos.</p>`);
}
function rowHtml(k,r,showTaskType=false){
  const meta=k==="soporte"?`${r.aplicacion} · ${singular[r.tipo]||"Entrada"}`:
    k==="personal"?(r.categoria||"Personal"):
    k==="materia"?"Materia":`${showTaskType&&k==="tarea"?(r.tipo==="evaluacion"?"Evaluación":"Actividad"):subject(r.materia_id)} · ${dateText(r.fecha)}`;
  const desc=k==="soporte"?r.descripcion||r.contenido:k==="personal"?(r.dato_clave||r.contenido):k==="clase"?r.modulo||plain(r.resumen):
    k==="materia"?r.semestre:states[r.estado];
  const selected=S.selected?.k===k&&uid(S.selected.id)===uid(r.id);
  return `<button class="entry-row ${selected?"active":""}" aria-pressed="${selected}" data-open="${k}" data-id="${esc(r.id)}">
    <small class="text-[11px] text-zinc-400 truncate">${esc(meta)}</small><b class="text-[13.5px] font-semibold text-white truncate">${r.fijado?"◆ ":""}${esc(titleOf(r))}</b>
    <span class="text-xs text-zinc-400 truncate">${esc(desc||"")}</span></button>`;
}
function relevantErrors(){
  const pers=["personal","moto","compras"];
  return Object.keys(S.errors).filter(k=>
    isPersonal()?pers.includes(k):isUni()?(k!=="soporte"&&!pers.includes(k)):k==="soporte");
}
function renderList(){
  const views=isUni()?uniViews:isPersonal()?{all:"Todo",fijadas:"Fijadas"}:{all:"Todo",fijadas:"Fijadas",...types};
  $("#listTitle").textContent=views[S.view]||"Entradas";
  $("#newBtn").textContent=!isUni()?"+ Nueva entrada":
    S.view==="calendario"||S.view==="actividad"?"+ Nueva actividad":
    S.view==="evaluacion"?"+ Nueva evaluación":"+ Nueva clase";
  const k=isPersonal()?"personal":!isUni()?"soporte":S.view==="clase"?"clase":"tarea";
  let chips=k==="personal"?[]:k==="tarea"?Object.entries(states):unique(scoped(k).filter(r=>
    k!=="soporte"||S.view==="all"||(S.view==="fijadas"?r.fijado:r.tipo===S.view)
  ).map(r=>k==="clase"?r.modulo:r.categoria)).map(v=>[v,v]);
  if(!chips.some(([v])=>v===S.chip))S.chip="";
  const sel=$("#chipSel"),all=!isUni()?"Todas las categorías":k==="clase"?"Todos los módulos":"Todos los estados";
  sel.hidden=k!=="soporte"&&!chips.length;
  sel.innerHTML=option("",all,S.chip)+chips.map(([v,t])=>option(v,t,S.chip)).join("");
  const split=isMatterSummary();
  sel.setAttribute("aria-label",split?"Estado de actividades y evaluaciones":"Filtrar");
  const l=entries();
  $("#listCount").textContent=S.loading?"Cargando…":`${l.length} ${l.length===1?"registro":"registros"}`;
  const items=$("#items");
  items.classList.toggle("matter-summary-list",split);
  items.classList.toggle("space-y-1",!split);
  if(split){
    items.innerHTML=matterListSection("matter-tasks","Actividades y evaluaciones",
      l.filter(([kind])=>kind==="tarea"),"No hay actividades ni evaluaciones para mostrar.")+
      matterListSection("matter-classes","Historial de clases",
        l.filter(([kind])=>kind==="clase"),"No hay clases para mostrar.");
    return;
  }
  items.innerHTML=l.map(([t,r])=>rowHtml(t,r)).join("")||
    `<p class="text-xs text-zinc-500 p-4">${S.loading?"Cargando…":"No hay registros en esta vista."}</p>`;
}
function matterListSection(id,title,rows,emptyMessage){
  return `<section class="matter-list-section" aria-labelledby="${id}">
    <h3 id="${id}" class="eyebrow">${title}</h3>
    <div class="matter-list-rows">${rows.map(([kind,record])=>rowHtml(kind,record,true)).join("")||
      `<p class="text-xs text-zinc-500 p-4">${S.loading?"Cargando…":emptyMessage}</p>`}</div>
  </section>`;
}
function loadAlert(){
  const errors=relevantErrors();if(!errors.length)return "";
  return `<div class="box"><b>No se pudieron leer todos los datos</b>
    <p class="err">${errors.map(k=>esc(table[k]+": "+S.errors[k])).join("<br>")}</p>
    ${action("reload","Reintentar")}</div>`;
}
function render(){
  if(!S.user)return;
  renderSide(); renderList(); renderDetail();
}

// ───────────── Plantillas y detalle de soporte ─────────────
const varRE=/\{\{\s*([^{}]+?)\s*\}\}/g;
function variableNames(t){return [...new Set([...String(t||"").matchAll(varRE)].map(x=>x[1]))]}
function formatted(t){
  return String(t||"").split(/\{\{\s*([^{}]+?)\s*\}\}/).map((s,i)=>{
    if(!(i%2))return esc(s);
    const val=S.variables.get(s);
    return val?`<mark class="filled">${esc(val)}</mark>`:`<mark class="token">{{${esc(s)}}}</mark>`;
  }).join("");
}

function templateBox(r, linked = false){
  const vars = variableNames((r.contenido || "") + "\n" + (r.cierre || ""));
  return `
    ${linked ? `<div><p class="eyebrow">Plantilla vinculada</p><h3>${esc(r.titulo)}</h3></div>` :
      r.descripcion ? `<p class="doc text-zinc-300">${esc(r.descripcion)}</p>` : ""}
    ${vars.length ? `<section class="glass-box p-5 space-y-3">
      <p class="eyebrow">Variables de la plantilla (vista previa en vivo)</p>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">${vars.map(v => `
        <label class="field"><span>${esc(v)}</span>
          <input class="glass-input" data-var="${esc(v)}" value="${esc(S.variables.get(v) || "")}" placeholder="Completar ${esc(v)}…" autocomplete="off">
        </label>`).join("")}</div>
      ${action("clearvars", "Limpiar campos")}
    </section>` : ""}
    <section class="glass-box p-5 space-y-2">
      <p class="eyebrow">Contenido</p>
      <div class="doc mono" data-preview="contenido">${formatted(r.contenido)}</div>
      ${linked ? action("copytpl", "Copiar plantilla", "btn primary") : ""}
    </section>
    ${r.cierre ? `<section class="glass-box p-5 space-y-2">
      <p class="eyebrow">Cierre del ticket</p>
      <div class="doc mono" data-preview="cierre">${formatted(r.cierre)}</div>
      ${linked ? action("copytplend", "Copiar cierre de plantilla") : ""}
    </section>` : ""}`;
}
function activeTemplate(){
  const r=current();if(S.selected?.k!=="soporte"||!r)return null;
  return r.tipo==="plantilla"?r:linkedTemplate(r);
}
function linkedTemplate(r){
  if(r.tipo!=="proceso"||!r.plantilla_ref)return null;
  const t=find("soporte",r.plantilla_ref);
  return t?.tipo==="plantilla"?t:null;
}
function stepsOf(r){
  return String(r.contenido||"").split(/\r?\n/).map(x=>
    x.replace(/^\s*(?:\d+\s*[.)-]|[-*•])\s*/,"").trim()).filter(Boolean);
}
function supportDetail(r){
  if(r.tipo==="plantilla")return templateBox(r);
  let html="";
  if(r.tipo==="proceso"){
    html+=r.descripcion?`<p class="doc">${esc(r.descripcion)}</p>`:"";
    html+=extLink(r.manual_url,"Abrir manual en Drive");
    const steps=stepsOf(r),done=S.steps.get(uid(r.id))||new Set();
    if(steps.length)html+=`<div class="box"><p class="eyebrow">Lista de comprobación · esta sesión</p>
      <progress value="${done.size}" max="${steps.length}"></progress>
      <small>${done.size} de ${steps.length} pasos</small>
      ${steps.map((v,i)=>`<label class="step"><input type="checkbox" data-step="${i}" ${done.has(i)?"checked":""}><span>${esc(v)}</span></label>`).join("")}
      ${done.size?action("resetsteps","Reiniciar pasos"):""}</div>`;
    const linked=linkedTemplate(r);
    html+=linked?templateBox(linked,true):r.plantilla_ref?
      `<p class="muted">La plantilla vinculada ya no está disponible. Puedes cambiarla en Editar.</p>`:"";
  }else{
    html+=`<div class="box doc">${prose(r.contenido)||"Sin notas."}</div>`;
  }
  if(r.cierre)html+=`<div class="box"><p class="eyebrow">Cierre del ticket</p>
    <div class="doc mono">${esc(r.cierre)}</div></div>`;
  return html;
}
function personalSteps(r){return Array.isArray(r?.pasos)?r.pasos:[]}
function mergeSteps(existing,linesText){
  const lines=String(linesText||"").split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const byText=new Map(existing.map(p=>[p.text,!!p.done]));
  return lines.map(text=>({text,done:byText.get(text)||false}));
}
async function togglePersonalStep(idx){
  const r=current();
  if(!r||S.selected?.k!=="personal"||S.writing)return;
  const pasos=personalSteps(r).map((p,i)=>i===idx?{...p,done:!p.done}:p);
  await updateCurrent({pasos});
}
function personalDetail(r){
  let html="";
  html+=`<div class="box doc">${prose(r.contenido)||"Sin notas."}</div>`;
  html+=extLink(r.enlace_url,"Abrir enlace");
  const steps=personalSteps(r),done=steps.filter(p=>p.done).length;
  if(steps.length)html+=`<div class="box"><p class="eyebrow">Lista de comprobación</p>
    <progress value="${done}" max="${steps.length}"></progress>
    <small>${done} de ${steps.length} listos</small>
    ${steps.map((p,i)=>`<label class="step"><input type="checkbox" data-pstep="${i}" ${p.done?"checked":""} ${S.writing?"disabled":""}><span>${esc(p.text)}</span></label>`).join("")}</div>`;
  return html;
}
async function copyText(text){
  if(!text)return toast("No hay texto que copiar.");
  try{await navigator.clipboard.writeText(text)}
  catch{
    const el=document.createElement("textarea"); el.value=text;document.body.append(el);
    el.select();const ok=document.execCommand("copy");el.remove();
    if(!ok)throw Error("El navegador no permitió copiar el texto.");
  }
}
async function copyTemplate(field){
  const r=activeTemplate();if(!r)return;
  const raw=r[field]||"";if(!raw)return toast("No hay texto que copiar.");
  const missing=variableNames(raw).filter(k=>!S.variables.get(k));
  await copyText(raw.replace(varRE,(m,k)=>S.variables.get(k)||m));
  toast(missing.length?"Copiado; falta completar: "+missing.join(", "):"Copiado al portapapeles.");
}

// ───────────── Universidad ─────────────
function scopedTasksList(tasks){
  return tasks.length?tasks.map(r=>keyBtn("tarea",r,
    `${dateText(r.fecha)} · ${r.titulo} · ${r.tipo==="evaluacion"?"Evaluación":"Actividad"} · ${states[r.estado]}`)).join(""):
    `<p class="muted">No hay actividades para mostrar.</p>`;
}
function calendar(full = false) {
  const y = S.month.getFullYear(), m = S.month.getMonth();
  const firstDay = new Date(y, m, 1);
  const offset = (firstDay.getDay() + 6) % 7;
  const lastDate = new Date(y, m + 1, 0).getDate();
  const prefix = `${y}-${String(m + 1).padStart(2, "0")}`;
  const monthTasks = scoped("tarea").filter(t => t.fecha?.startsWith(prefix))
    .sort((a,b) => a.fecha.localeCompare(b.fecha));
  const todayIso = today();

  let cells = ["L", "M", "X", "J", "V", "S", "D"].map(d => `<small class="text-center text-[11px] text-zinc-500 py-1">${d}</small>`).join("");
  cells += `<span></span>`.repeat(offset);

  for (let d = 1; d <= lastDate; d++) {
    const iso = `${prefix}-${String(d).padStart(2, "0")}`;
    const hasEv = monthTasks.some(t => t.fecha === iso);
    const isToday = iso === todayIso;
    const isChosen = S.day === iso;
    cells += `
      <button data-day="${iso}" aria-pressed="${isChosen}" aria-label="${esc(dateText(iso))}${isToday ? " (hoy)" : ""}${hasEv ? ", con entregas" : ""}" class="cal-day ${hasEv ? "has-event" : ""} ${isToday ? "is-today" : ""} ${isChosen ? "is-chosen" : ""}">
        <span>${d}</span>
        ${hasEv ? `<span class="text-[9px] leading-none">•</span>` : ""}
      </button>
    `;
  }

  const dayTasks = S.day ? monthTasks.filter(t => t.fecha === S.day) : monthTasks;

  return `
    <div class="glass-box p-5 space-y-3 h-full">
      <div class="flex items-center justify-between">
        <button data-act="prevmonth" aria-label="Mes anterior" class="pill-btn py-1 px-2.5 text-xs">‹</button>
        <b class="text-xs sm:text-sm font-semibold capitalize text-white">
          ${firstDay.toLocaleDateString("es", { month: "long", year: "numeric" })}
        </b>
        <button data-act="nextmonth" aria-label="Mes siguiente" class="pill-btn py-1 px-2.5 text-xs">›</button>
      </div>
      <div class="cal-grid">${cells}</div>
      <p class="text-[11px] text-zinc-400">Pulsa un día marcado para ver sus entregas.</p>
      ${S.day || full ? `
        <div class="pt-2 border-t border-white/10 space-y-1.5">
          <div class="flex items-center justify-between text-xs">
            <span class="text-zinc-300 font-medium">${S.day ? dateText(S.day) : "Agenda del mes"}</span>
            ${S.day ? `<button data-act="alldays" class="text-[11px] underline" style="color: var(--accent);">Ver mes</button>` : ""}
          </div>
          ${dayTasks.length ? dayTasks.map(t => `
            <button data-open="tarea" data-id="${esc(t.id)}" class="block w-full text-left text-xs p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white">
              ${esc(t.titulo)} · <span class="opacity-75">${states[t.estado] || "Pendiente"}</span>
            </button>
          `).join("") : `<p class="text-xs text-zinc-500">Sin entregas en este período.</p>`}
        </div>
      ` : ""}
    </div>
  `;
}

function uniHome() {
  const matter = find("materia", S.group);
  const classes = classesByDate();
  const tasks = scoped("tarea");
  const upcoming = tasks.filter(t => t.fecha && t.fecha >= today() && t.estado !== "completada")
    .sort((a,b) => a.fecha.localeCompare(b.fecha));
  const late = tasks.filter(t => t.fecha && t.fecha < today() && t.estado !== "completada")
    .sort((a,b) => a.fecha.localeCompare(b.fecha));
  const done = tasks.filter(t => t.estado === "completada").length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  return `
    <div class="max-w-4xl mx-auto space-y-5">
      <div>
        <p class="text-[11px] uppercase tracking-widest font-semibold text-zinc-400">${matter ? esc(matter.semestre || "Materia") : "UNIVERSIDAD"}</p>
        <h1 class="font-serif-editorial text-4xl sm:text-5xl text-white">${matter ? esc(matter.nombre) : "Mi universidad"}</h1>
      </div>

      <div class="flex flex-wrap gap-2">
        <button data-act="newclass" class="pill-btn pill-primary text-xs">Nueva clase</button>
        <button data-act="newtask" class="pill-btn text-xs">Nueva actividad</button>
        <button data-act="neweval" class="pill-btn text-xs">Nueva evaluación</button>
      </div>

      ${matter ? `<div class="actions">${action("editsubject", "Editar materia")}${action("delsubject", "Borrar materia", "btn danger")}</div>` : ""}

      <!-- KPIs Académicos -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <button data-view="clase" class="glass-box glass-box-interactive p-5 text-left">
          <b class="font-serif-editorial text-4xl block" style="color: var(--accent);">${classes.length}</b>
          <span class="text-xs font-medium text-zinc-300">Clases</span>
        </button>
        <button data-view="actividad" class="glass-box glass-box-interactive p-5 text-left">
          <b class="font-serif-editorial text-4xl block" style="color: var(--accent);">${tasks.filter(t => t.tipo === "actividad").length}</b>
          <span class="text-xs font-medium text-zinc-300">Actividades</span>
        </button>
        <button data-view="evaluacion" class="glass-box glass-box-interactive p-5 text-left">
          <b class="font-serif-editorial text-4xl block" style="color: var(--accent);">${tasks.filter(t => t.tipo === "evaluacion").length}</b>
          <span class="text-xs font-medium text-zinc-300">Evaluaciones</span>
        </button>
      </div>

      <!-- Barra de Progreso General -->
      <div class="glass-box p-5 space-y-2.5">
        <div class="flex items-center justify-between">
          <p class="text-[11px] uppercase tracking-wider font-semibold text-zinc-400">Progreso de actividades y evaluaciones</p>
          <span class="text-xs font-semibold" style="color: var(--accent);">${pct}%</span>
        </div>
        <div class="w-full h-2.5 rounded-full bg-white/10 overflow-hidden">
          <div class="h-full rounded-full transition-all duration-300" style="width: ${pct}%; background: var(--accent);"></div>
        </div>
        <small class="text-xs text-zinc-400 block">${done} de ${tasks.length} completadas · ${pct}%</small>
      </div>

      <!-- Bento Académico: Próximas fechas + Mini Calendario interactivo -->
      <div class="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div class="xl:col-span-7 glass-box p-5 flex flex-col justify-between space-y-4">
          <div>
            <p class="text-[11px] uppercase tracking-wider font-semibold text-zinc-400 mb-3">Próximas fechas y entregas</p>
            <div class="divide-y divide-white/10">
              ${upcoming.length ? upcoming.map(t => `
                <div class="py-3 flex items-center justify-between gap-3">
                  <button data-open="tarea" data-id="${esc(t.id)}" class="text-left min-w-0 flex-1 cursor-pointer">
                    <span class="text-xs text-zinc-400 block">${dateText(t.fecha)} · ${esc(subject(t.materia_id))}</span>
                    <b class="text-xs sm:text-sm font-semibold text-white truncate block hover:underline">${esc(t.titulo)}</b>
                  </button>
                  <button data-cycle-task="${esc(t.id)}" ${S.writing ? "disabled" : ""} title="Clic para cambiar estado" class="pill-tag shrink-0 cursor-pointer">
                    ${states[t.estado] || "Pendiente"}
                  </button>
                </div>
              `).join("") : `<p class="text-xs text-zinc-400">No hay próximas entregas.</p>`}
            </div>
          </div>
          ${late.length ? `<div><p class="eyebrow">Entregas vencidas</p>${scopedTasksList(late)}</div>` : ""}
          <button data-view="calendario" class="pill-btn w-full text-xs">Abrir calendario completo</button>
        </div>

        <div class="xl:col-span-5">
          ${calendar()}
        </div>
      </div>

      <div class="glass-box p-5 space-y-2">
        <p class="text-[11px] uppercase tracking-wider font-semibold text-zinc-400">${matter ? "Última clase" : "Últimas clases"}</p>
        ${classes.length ? classes.slice(0, matter ? 1 : 5).map(c => `
          <button data-open="clase" data-id="${esc(c.id)}" class="w-full text-left py-2.5 border-b border-white/10 last:border-0 hover:text-white text-zinc-300 text-xs sm:text-sm cursor-pointer">
            ${dateText(c.fecha)} · <strong class="text-white">${esc(c.titulo)}</strong>
          </button>
        `).join("") : `<p class="text-xs text-zinc-400">Aún no hay clases.</p>`}
      </div>
    </div>
  `;
}

function academicDetail(k,r){
  if(k==="clase"){
    const related=S.data.tarea.filter(a=>uid(a.clase_id)===uid(r.id));
    return `<div class="box"><p class="eyebrow">Resumen de clase</p>${noteView(r.resumen)}
      ${extLink(r.archivo_url,"Abrir apunte en OneDrive")}</div>
      <div class="box"><p class="eyebrow">Actividades de esta clase</p>${scopedTasksList(related)}
      <div class="actions">${action("fromclass","Añadir actividad")}${action("evalfromclass","Añadir evaluación")}</div></div>`;
  }
  const c=r.clase_id&&find("clase",r.clase_id);
  return `<div class="box"><label class="field"><span>Estado de seguimiento</span>
    <select id="quickState" ${S.writing?"disabled":""}>${Object.entries(states).map(([v,t])=>option(v,t,r.estado)).join("")}</select></label>
    ${r.estado!=="completada"?`<div>${action("done","Marcar completada","btn primary")}</div>`:""}
    ${r.peso!=null?`<p>Peso en la nota: <b>${esc(r.peso)}%</b></p>`:""}
    <div class="doc">${prose(r.descripcion)||"Sin descripción."}</div>
    ${extLink(r.archivo_url,"Abrir archivo en OneDrive")}
    ${c?keyBtn("clase",c,"Ver clase de origen: "+c.titulo):""}</div>`;
}

function chartGroups(records, field, palette){
  const counts = new Map();
  for (const record of records) {
    const group = record[field] || "";
    counts.set(group, (counts.get(group) || 0) + 1);
  }
  return [...counts.keys()].sort((a,b) => a.localeCompare(b, "es")).map((group, i) => ({
    group,
    label:group || (field === "categoria" ? "Sin categoría" : "Sin aplicación"),
    count:counts.get(group),
    color:palette[i % palette.length]
  }));
}
function chartSegments(groups, total, radius){
  const circumference = 2 * Math.PI * radius;
  const gap = groups.length > 1 ? Math.min(8, circumference / (2 * total)) : 0;
  const usable = circumference - gap * groups.length;
  let offset = 0;
  return groups.map(({group, count, color}) => {
    const length = count / total * usable;
    const segment = `<circle cx="70" cy="70" r="${radius}" fill="none" stroke="${color}"
      stroke-width="${group && S.group === group ? 15 : 12}" stroke-linecap="round"
      stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}"
      ${group ? `class="donut-seg" data-group="${esc(group)}"` : ""}></circle>`;
    offset += length + gap;
    return segment;
  }).join("");
}
function chartLegend(groups, total){
  return groups.map(({group, label, count, color}) => {
    const attrs = group ? `data-group="${esc(group)}" aria-pressed="${S.group === group}"` : "";
    const tag = group ? "button" : "div";
    return `<${tag} ${attrs} class="chart-legend w-full flex items-center justify-between ${total ? "px-3 py-2" : "px-2.5 py-1.5"} rounded-xl text-xs hover:bg-white/[0.06] transition">
      <span class="flex min-w-0 items-center gap-2">
        <span class="${total ? "w-2.5 h-2.5" : "w-2 h-2"} rounded-full shrink-0" style="background:${color}"></span>
        <span class="truncate text-zinc-200 ${total ? "font-medium" : ""}">${esc(label)}</span>
      </span>
      <span class="flex items-center gap-2">
        ${total ? `<small class="text-zinc-400">${Math.round(100 * count / total)}%</small>` : ""}
        <b class="px-2 py-0.5 rounded-full bg-black/40 ${total ? "text-white" : "text-zinc-300"}">${count}</b>
      </span>
    </${tag}>`;
  }).join("");
}
function motoWidgetHtml(moto, pct){
  if (!moto) return `<div class="glass-box p-5 space-y-3">
    <p class="eyebrow">Garaje moto</p>
    <p class="text-xs text-zinc-400">Registra el kilometraje para ver cuánto falta para el próximo mantenimiento.</p>
    ${action("moto", "+ Registrar kilometraje", "pill-btn pill-primary text-xs")}
  </div>`;
  const remaining = moto.km_objetivo == null ? null : Math.max(0, moto.km_objetivo - (moto.km_actual || 0));
  return `<div class="glass-box p-5 space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-[11px] uppercase tracking-wider font-semibold text-zinc-400">Garaje moto</p>
      <div class="flex gap-2">
        ${action("moto", "Editar", "pill-btn text-xs py-1 px-3")}
        <button type="button" data-act="bumpmoto" class="pill-btn text-xs py-1 px-3" ${S.writing ? "disabled" : ""}>+100 km</button>
      </div>
    </div>
    <div class="flex items-center justify-between text-xs">
      <span class="text-zinc-400">Kilometraje</span>
      <b class="text-white">${esc(moto.km_actual ?? "—")}${moto.km_objetivo ? " / " + esc(moto.km_objetivo) : ""} km</b>
    </div>
    <div class="w-full h-2.5 rounded-full bg-white/10 overflow-hidden" role="progressbar" aria-label="Kilometraje para el próximo servicio" aria-valuenow="${pct}">
      <div class="h-full rounded-full transition-all" style="width: ${pct}%; background: var(--accent);"></div>
    </div>
    <small class="block text-xs text-zinc-400">${remaining == null ? "" : `Faltan ~${remaining} km para el próximo servicio.`} ${esc(moto.nota)}</small>
  </div>`;
}
async function saveDashboardRecord(kind, record, values){
  if (S.writing) return;
  const epoch = S.epoch;
  S.writing = true;
  try {
    const updated = await saveRow(kind, record.id, values);
    if (epoch === S.epoch) upsertLocal(kind, updated);
  } catch (err) {
    if (epoch === S.epoch) toast(errorMessage(err));
  } finally {
    if (epoch === S.epoch) {
      S.writing = false;
      render();
    }
  }
}

function supportHome(){
  const records = S.data.soporte;
  const plantillas = records.filter(r => r.tipo === "plantilla").length;
  const procesos = records.filter(r => r.tipo === "proceso").length;
  const notas = records.filter(r => r.tipo === "nota").length;
  const fijadas = records.filter(r => r.fijado);
  const groups = chartGroups(records, "aplicacion", ["#e3c08d", "#caa06a", "#f2d6a9", "#b08852", "#8f6d3f", "#d8b47c"]);
  const total = records.length;
  const rad = 52;
  return `
    <div class="max-w-4xl mx-auto space-y-6">
      <div>
        <p class="text-[11px] uppercase tracking-widest font-semibold text-zinc-400 mb-1">SOPORTE TÉCNICO</p>
        <h1 class="font-serif-editorial text-4xl sm:text-5xl text-white">Hola, <i class="italic">${esc(displayName())}</i>.</h1>
        <p class="text-sm text-zinc-400 mt-1">Abre una entrada o busca por aplicación, título o contenido.</p>
      </div>

      <!-- KPIs de cristal interactivos -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <button data-view="plantilla" class="glass-box glass-box-interactive p-5 text-left">
          <b class="font-serif-editorial text-4xl block" style="color: var(--accent);">${plantillas}</b>
          <span class="text-xs font-medium text-zinc-300">Plantillas</span>
        </button>
        <button data-view="proceso" class="glass-box glass-box-interactive p-5 text-left">
          <b class="font-serif-editorial text-4xl block" style="color: var(--accent);">${procesos}</b>
          <span class="text-xs font-medium text-zinc-300">Procesos</span>
        </button>
        <button data-view="nota" class="glass-box glass-box-interactive p-5 text-left">
          <b class="font-serif-editorial text-4xl block" style="color: var(--accent);">${notas}</b>
          <span class="text-xs font-medium text-zinc-300">Aprendizajes</span>
        </button>
      </div>

      <!-- Bento de Soporte: Distribución por Aplicación + Respuestas Fijadas a 1 clic -->
      <div class="support-bento grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="glass-box p-5">
          <p class="text-[11px] uppercase tracking-wider font-semibold text-zinc-400 mb-2">Distribución por Aplicación</p>
          <div class="support-chart flex flex-col sm:flex-row items-center gap-4">
            <div class="relative w-36 h-36 shrink-0">
              <svg viewBox="0 0 140 140" class="w-full h-full -rotate-90">
                <circle cx="70" cy="70" r="${rad}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="12"></circle>
                ${chartSegments(groups, total, rad)}
              </svg>
              <div class="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                <b class="font-serif-editorial text-3xl text-white leading-none">${total}</b>
                <span class="text-[11px] text-zinc-400">Entradas</span>
              </div>
            </div>
            <div class="w-full space-y-1.5">
              ${chartLegend(groups)}
            </div>
          </div>
        </div>

        <div class="glass-box p-5 flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between mb-3">
              <p class="text-[11px] uppercase tracking-wider font-semibold text-zinc-400">Acceso rápido · Fijadas</p>
              <span class="pill-tag">${fijadas.length} fijadas</span>
            </div>
            <div class="space-y-2">
              ${fijadas.length ? fijadas.map(item => `
                <div class="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between gap-2">
                  <button data-open="soporte" data-id="${esc(item.id)}" class="text-left min-w-0 flex-1 cursor-pointer">
                    <span class="block text-[11px] text-zinc-400">${esc(item.aplicacion)}</span>
                    <b class="block text-xs font-semibold text-white truncate hover:underline">${esc(item.titulo)}</b>
                  </button>
                  <button data-copy-support="${esc(item.id)}" class="pill-btn text-[11px] py-1 px-2.5 shrink-0" title="Copiar respuesta">
                    Copiar
                  </button>
                </div>
              `).join("") : `<p class="text-xs text-zinc-400">Aún no hay entradas fijadas.</p>`}
            </div>
          </div>
          <p class="text-[11px] text-zinc-500 mt-3">Copia al instante sin abrir el ticket.</p>
        </div>
      </div>

      <div class="glass-box p-4">
        <p class="text-[11px] uppercase tracking-wider font-semibold text-zinc-400 mb-1">Atajos</p>
        <p class="text-xs text-zinc-400">Ctrl / ⌘ K: buscar · N: nueva · /: filtrar · C: copiar · Shift C: copiar cierre · P: fijar</p>
      </div>
    </div>
  `;
}

function personalHome(){
  const records = S.data.personal;
  const groups = chartGroups(records, "categoria", ["#c77b4a", "#a2522a", "#caa06a", "#d08c5d"]);
  const total = records.length;
  const rad = 52;
  const moto = S.data.moto[0];
  const motoPct = moto?.km_objetivo > 0 ? Math.max(0, Math.min(100, Math.round(100 * (moto.km_actual || 0) / moto.km_objetivo))) : 0;
  const pendCompras = S.data.compras.filter(c => !c.hecho).length;
  return `
    <div class="max-w-4xl mx-auto space-y-5">
      <div>
        <p class="text-[11px] uppercase tracking-widest font-semibold text-zinc-400">PERSONAL</p>
        <h1 class="font-serif-editorial text-4xl sm:text-5xl text-white">Hola, <i class="italic">${esc(displayName())}</i>.</h1>
        <p class="text-sm text-zinc-400 mt-1">Guarda enlaces y notas tuyas, organizadas por categoría, como repuestos de tu moto.</p>
      </div>

      <div class="personal-bento grid grid-cols-1 md:grid-cols-12 gap-4">
        <!-- Donut Particionado -->
        <div class="md:col-span-6 glass-box p-5">
          <p class="text-[11px] uppercase tracking-wider font-semibold text-zinc-400 mb-3">Distribución personal</p>
          <div class="relative w-36 h-36 mx-auto my-2">
            <svg viewBox="0 0 140 140" class="w-full h-full -rotate-90">
              <circle cx="70" cy="70" r="${rad}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="12"></circle>
              ${chartSegments(groups, total, rad)}
            </svg>
            <div class="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
              <b class="font-serif-editorial text-3xl text-white leading-none">${total}</b>
              <span class="text-xs text-zinc-400">Entradas</span>
              <small class="text-[11px]" style="color: var(--accent);">${groups.length} categorías</small>
            </div>
          </div>
          <div class="space-y-1.5 mt-4">
            ${chartLegend(groups, total)}
          </div>
        </div>

        <!-- Columna derecha: Garaje Moto + Por Comprar -->
        <div class="md:col-span-6 space-y-4">
          ${motoWidgetHtml(moto, motoPct)}
          <div class="glass-box p-5 space-y-3">
            <div class="flex items-center justify-between">
              <p class="text-[11px] uppercase tracking-wider font-semibold text-zinc-400">Por comprar</p>
              <span class="pill-tag">${pendCompras} pend.</span>
            </div>
            <div class="space-y-1.5">
              ${S.data.compras.map(c => `
                <button data-compra="${esc(c.id)}" aria-pressed="${!!c.hecho}" ${S.writing ? "disabled" : ""} class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-white/[0.05] text-left text-xs cursor-pointer">
                  <span class="w-4 h-4 rounded flex items-center justify-center border ${c.hecho ? "border-transparent font-bold" : "border-white/25"}" style="${c.hecho ? "background: var(--accent); color: var(--on-accent);" : ""}">
                    ${c.hecho ? "✓" : ""}
                  </span>
                  <span class="${c.hecho ? "line-through text-zinc-500" : "text-zinc-200"}">${esc(c.texto)}</span>
                </button>
              `).join("")}
            </div>
            <form id="qsForm" class="flex gap-2 pt-1">
              <input id="qsInput" type="text" aria-label="Añadir algo para comprar" autocomplete="off" placeholder="Añadir algo para comprar…" class="glass-input flex-1 text-xs" />
              <button type="submit" aria-label="Añadir compra" class="pill-btn pill-primary text-xs px-3.5">+</button>
            </form>
          </div>
        </div>
      </div>

      <div class="glass-box p-4">
        <p class="text-[11px] uppercase tracking-wider font-semibold text-zinc-400 mb-1">Atajos</p>
        <p class="text-xs text-zinc-400">Ctrl / ⌘ K: buscar · N: nueva · /: filtrar · C: copiar · P: fijar</p>
      </div>
    </div>
  `;
}

async function addCompra(texto){
  if(!texto||!texto.trim())return;
  const epoch=S.epoch;
  const {data,error}=await db.from(table.compras).insert({texto:texto.trim()}).select().single();
  if(error)return toast(errorMessage(error));
  if(epoch!==S.epoch)return;
  S.data.compras.unshift(data);renderDetail();
}
async function toggleCompra(id){
  const item=S.data.compras.find(x=>uid(x.id)===uid(id));
  if(!item||S.writing)return;
  const epoch=S.epoch;S.writing=true;
  try{
    const {data,error}=await db.from(table.compras).update({hecho:!item.hecho}).eq("id",id).select().single();
    if(error)throw error;
    if(epoch!==S.epoch)return;
    const i=S.data.compras.findIndex(x=>uid(x.id)===uid(id));
    if(i>=0)S.data.compras[i]=data;
  }catch(e){toast(errorMessage(e))}
  finally{S.writing=false;renderDetail()}
}

function renderDetail(){
  const r = current(), k = S.selected?.k;
  const readingClass = !!r && k === "clase";
  $("#recordList").hidden = readingClass;
  let html;
  if (r) {
    const meta = k === "soporte" ? [singular[r.tipo], r.aplicacion, r.categoria] :
      k === "personal" ? [r.categoria, r.dato_clave] :
      [k === "clase" ? "Clase" : r.tipo === "evaluacion" ? "Evaluación" : "Actividad",
        subject(r.materia_id), dateText(r.fecha), r.modulo];
    const pin = k === "soporte" || k === "personal";
    const copyLabel = k === "personal" ? "Copiar notas (C)" :
      r.tipo === "plantilla" ? "Copiar plantilla (C)" : "Copiar contenido (C)";
    html = `<article class="max-w-3xl mx-auto space-y-5 record-detail${readingClass ? " class-detail" : ""}">
      <div class="flex flex-wrap items-center gap-2">
        ${action("back", "← Volver", "pill-btn text-xs py-1 px-3")}
        ${meta.filter(Boolean).map(t => `<span class="pill-tag">${esc(t)}</span>`).join("")}
      </div>
      <h1 class="font-serif-editorial text-4xl sm:text-5xl text-white leading-tight">${esc(titleOf(r))}</h1>
      <div class="actions">
        ${pin ? action("pin", r.fijado ? "◆ Desfijar (P)" : "Fijar (P)", "pill-btn text-xs") : ""}
        ${pin && r.contenido ? action("copy", copyLabel, "pill-btn pill-primary text-xs") : ""}
        ${k === "soporte" && r.cierre ? action("copyend", "Copiar cierre (Shift+C)", "pill-btn text-xs") : ""}
        ${action("edit", "Editar")}${action("delete", "Borrar", "btn danger")}
      </div>
      ${k === "personal" ? personalDetail(r) : k === "soporte" ? supportDetail(r) : academicDetail(k,r)}
    </article>`;
  } else if (isUni() && S.view === "calendario") {
    html = `<div class="max-w-4xl mx-auto space-y-5">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p class="text-[11px] uppercase tracking-widest font-semibold text-zinc-400">${S.group ? esc(subject(S.group)) : "Universidad"}</p>
          <h1 class="font-serif-editorial text-4xl sm:text-5xl text-white">Calendario</h1>
        </div>
        <button type="button" data-view="resumen" class="pill-btn text-xs">← Volver a Resumen</button>
      </div>
      ${calendar(true)}
    </div>`;
  } else {
    html = isUni() ? uniHome() : isPersonal() ? personalHome() : supportHome();
  }
  $("#detail").innerHTML = loadAlert() + html;
  const form = $("#qsForm");
  if (form) form.onsubmit = async e => {
    e.preventDefault();
    if (S.writing) return;
    const input = $("#qsInput");
    const text = input.value.trim();
    if (!text) return;
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      await addCompra(text);
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      button.disabled = false;
    }
  };
}

/*RT-START*/
// ───────────── Notas con formato ─────────────
const RT="\x3c!--rt-->";
let rtSel=null,rtInit="";
const OK_TAGS=new Set("P DIV BR B STRONG I EM U S STRIKE SUB SUP H1 H2 H3 UL OL LI BLOCKQUOTE PRE CODE A SPAN HR FONT".split(" "));
const DROP_TAGS=new Set("SCRIPT STYLE IFRAME OBJECT EMBED LINK META NOSCRIPT TEMPLATE SVG MATH FORM INPUT BUTTON TEXTAREA SELECT".split(" "));
const FAM=[
  ["Inter","Inter, system-ui, sans-serif"],
  ["Arial","Arial, sans-serif"],
  ["Calibri","Calibri, Arial, sans-serif"],
  ["Verdana","Verdana, sans-serif"],
  ["Georgia","Georgia, serif"],
  ["Century","Century, Georgia, serif"],
  ["Times New Roman","'Times New Roman', Georgia, serif"],
  ["Instrument Serif","'Instrument Serif', Georgia, serif"],
  ["Consolas","Consolas, ui-monospace, monospace"],
  ["Monoespaciada","ui-monospace, Consolas, monospace"]
];
const RT_SIZES=[10,13,16,18,24,32,48];
const RT_SIZE_NAMES=["x-small","small","medium","large","x-large","xx-large","xxx-large"];
const RT_ALIGN={left:"justifyLeft",center:"justifyCenter",right:"justifyRight",justify:"justifyFull"};
const colorOk=v=>/^(#[0-9a-f]{3,8}|rgba?\([\d\s,.%\/]+\))$/i.test(v||"");
function noteFont(value){
  const first=String(value||"").split(",")[0].trim().replace(/^['"]|['"]$/g,"").toLowerCase();
  if(["mono","monospace","ui-monospace"].includes(first))return FAM.at(-1)[1];
  return FAM.find(([name])=>name.toLowerCase()===first)?.[1];
}
function noteFontSize(value,legacy){
  const keyword=value==="xx-small"?0:RT_SIZE_NAMES.indexOf(value);
  const px=RT_SIZES[keyword] ?? (/^[1-7]$/.test(legacy||"") ? RT_SIZES[Number(legacy)-1] : null);
  if(px!==null)return `${px}px`;
  const numeric=/^(\d+(?:\.\d+)?)(px|pt)$/.exec(value);
  if(!numeric)return "";
  const size=Number(numeric[1])*(numeric[2]==="pt"?4/3:1);
  return size>=8&&size<=96 ? value : "";
}
function cleanStyle(el){
  const s=el.style,o=[],legacyFont=el.tagName==="FONT";
  const font=noteFont(s.fontFamily||(legacyFont&&el.getAttribute("face")));
  const size=noteFontSize(s.fontSize,legacyFont&&el.getAttribute("size"));
  const color=s.color||(legacyFont&&el.getAttribute("color"));
  if(font)o.push("font-family:"+font);
  if(size)o.push("font-size:"+size);
  if(colorOk(color))o.push("color:"+color);
  if(colorOk(s.backgroundColor))o.push("background-color:"+s.backgroundColor);
  const align=s.textAlign||el.getAttribute("align");
  if(["left","center","right","justify","start","end"].includes(align))o.push("text-align:"+align);
  if(["sub","super"].includes(s.verticalAlign))o.push("vertical-align:"+s.verticalAlign);
  let hasIndent=false;
  for(const property of ["margin-left","margin-right","margin-inline-start","margin-inline-end"]){
    const indent=s.getPropertyValue(property);
    if(/^\d{1,3}px$/.test(indent)&&parseInt(indent,10)<=320){
      o.push(property+":"+indent);
      hasIndent=true;
    }
  }
  if(el.tagName==="BLOCKQUOTE"&&hasIndent&&(s.borderLeftStyle==="none"||s.borderLeftWidth==="0px")){
    o.push("border:0","padding:0");
  }
  if(/^(bold|[6-9]00)$/.test(s.fontWeight))o.push("font-weight:700");
  if(s.fontStyle==="italic")o.push("font-style:italic");
  const td=s.textDecorationLine||s.textDecoration||"",u=td.includes("underline"),l=td.includes("line-through");
  if(u||l)o.push("text-decoration:"+[u&&"underline",l&&"line-through"].filter(Boolean).join(" "));
  return o.join(";");
}
function cleanHtml(html){
  const doc=new DOMParser().parseFromString("<body>"+html+"</body>","text/html");
  (function walk(node){
    for(const el of [...node.children]){
      if(DROP_TAGS.has(el.tagName)){el.remove();continue}
      walk(el);
      if(!OK_TAGS.has(el.tagName)){el.replaceWith(...el.childNodes);continue}
      const style=cleanStyle(el),href=el.tagName==="A"?httpsUrl(el.getAttribute("href")):"";
      let target=el;
      if(el.tagName==="FONT"){
        target=doc.createElement("span");
        target.append(...el.childNodes);
        el.replaceWith(target);
      }else{
        for(const a of [...el.attributes])el.removeAttribute(a.name);
      }
      if(style)target.setAttribute("style",style);
      if(target.tagName==="A"){
        if(!href){target.replaceWith(...target.childNodes);continue}
        target.setAttribute("href",href);target.setAttribute("target","_blank");target.setAttribute("rel","noopener noreferrer");
      }
    }
  })(doc.body);
  return doc.body.innerHTML;
}
const plain=s=>!s?"":String(s).startsWith(RT)?
  new DOMParser().parseFromString(cleanHtml(s.slice(RT.length)),"text/html").body.textContent.replace(/\s+/g," ").trim():s;
function noteView(s){
  if(!s)return `<div class="doc">Sin resumen.</div>`;
  return String(s).startsWith(RT)?`<div class="rt">${cleanHtml(s.slice(RT.length))}</div>`:`<div class="doc">${prose(s)}</div>`;
}
function rtValue(){
  const ed=$("#rtEd");if(!ed)return "";
  const h=cleanHtml(ed.innerHTML),body=new DOMParser().parseFromString(h,"text/html").body;
  return (body.textContent.trim()||body.querySelector("hr"))?RT+h:"";
}
function rtCmd(cmd,val){
  const ed=$("#rtEd");if(!ed)return;
  ed.focus({preventScroll:true});
  if(rtSel&&ed.contains(rtSel.commonAncestorContainer)){
    const selection=getSelection();
    selection.removeAllRanges();
    selection.addRange(rtSel);
  }
  if(cmd==="link"){
    const url=prompt("Enlace HTTPS","https://");
    if(url===null)return;
    val=httpsUrl(url);
    if(!val)return toast("Enlace no válido.");
    cmd="createLink";
  }
  document.execCommand("styleWithCSS",false,true);
  document.execCommand(cmd,false,val);
  rememberNoteSelection();
}
function rtField(v){
  const html=!v?"":String(v).startsWith(RT)?cleanHtml(v.slice(RT.length)):prose(v).replace(/\n/g,"<br>");
  const sel=(k,ph,opts)=>`<select data-rt="${k}" aria-label="${ph}"><option value="">${ph}</option>${
    opts.map(([a,b])=>`<option value="${esc(a)}">${esc(b)}</option>`).join("")}</select>`;
  const btn=(c,label,tip)=>`<button type="button" class="rtb" data-cmd="${c}" title="${tip}" aria-label="${tip}">${label}</button>`;
  const group=(name,controls)=>`<div class="rtgroup" role="group" aria-label="${name}">${controls}</div>`;
  return `<div class="stack"><span class="lbl">Notas de la clase</span><div class="rtbox">
    <div class="rtbar" role="group" aria-label="Formato del texto">
      ${group("Historial",btn("undo","↶","Deshacer") + btn("redo","↷","Rehacer"))}
      ${group("Tipografía",
        sel("block","Estilo",[["<p>","Texto normal"],["<h1>","Título 1"],["<h2>","Título 2"],["<h3>","Subtítulo"],["<blockquote>","Cita"],["<pre>","Código"]]) +
        sel("font","Fuente",FAM.map(([name,stack])=>[stack,name])) +
        sel("size","Tamaño",RT_SIZES.map((size,index)=>[index+1,`${size} px`])))}
      ${group("Énfasis",
        btn("bold","<b>N</b>","Negrita (Ctrl+B)") + btn("italic","<i>K</i>","Cursiva (Ctrl+I)") +
        btn("underline","<u>S</u>","Subrayado (Ctrl+U)") + btn("strikeThrough","<s>ab</s>","Tachado") +
        btn("subscript","x<sub>2</sub>","Subíndice") + btn("superscript","x<sup>2</sup>","Superíndice"))}
      ${group("Color",
        sel("color","Color",[["#c58b2a","Dorado"],["#2f9e6e","Verde"],["#3b82f6","Azul"],["#e5484d","Rojo"],["#8b5cf6","Morado"],["#db6d29","Naranja"],["#e35ca3","Rosa"],["#8b8b97","Gris"]]) +
        sel("hilite","Resaltar",[["rgba(250,204,21,.4)","Amarillo"],["rgba(74,222,128,.35)","Verde"],["rgba(96,165,250,.35)","Azul"],["rgba(244,114,182,.35)","Rosa"],["transparent","Quitar resaltado"]]))}
      ${group("Párrafo",
        sel("align","Alinear",[["left","Izquierda"],["center","Centrar"],["right","Derecha"],["justify","Justificar"]]) +
        btn("insertUnorderedList","• Viñetas","Lista con viñetas") + btn("insertOrderedList","1. Lista","Lista numerada") +
        btn("outdent","⇤","Reducir sangría") + btn("indent","⇥","Aumentar sangría"))}
      ${group("Insertar y limpiar",
        btn("link","Enlace","Insertar enlace") + btn("insertHorizontalRule","—","Línea separadora") +
        btn("removeFormat","Aa ✕","Quitar formato"))}
    </div>
    <div id="rtEd" class="rt" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Notas de la clase">${html}</div>
    </div></div><input type="hidden" name="resumen">`;
}
function rememberNoteSelection(){
  const ed=$("#rtEd"),s=getSelection();
  if(ed&&s.rangeCount&&ed.contains(s.anchorNode)&&ed.contains(s.focusNode))rtSel=s.getRangeAt(0).cloneRange();
}
document.addEventListener("selectionchange",rememberNoteSelection);
document.addEventListener("mousedown",e=>{
  if(!e.target.closest?.(".rtbar"))return;
  rememberNoteSelection();
  if(e.target.closest(".rtb"))e.preventDefault();
});
document.addEventListener("change",e=>{
  const k=e.target.dataset?.rt,v=e.target.value;if(!k||!v)return;
  e.target.value="";
  if(k==="align")rtCmd(RT_ALIGN[v]);
  else rtCmd({block:"formatBlock",font:"fontName",size:"fontSize",color:"foreColor",hilite:"hiliteColor"}[k],v);
});
document.addEventListener("paste",e=>{
  if(!e.target.closest?.("#rtEd"))return;
  e.preventDefault();
  const h=e.clipboardData.getData("text/html"),tx=e.clipboardData.getData("text/plain");
  document.execCommand("insertHTML",false,h?cleanHtml(h):esc(tx).replace(/\n/g,"<br>"));
});
const discardOk=()=>!(S.edit?.k==="clase"&&rtValue()!==rtInit)||confirm("Tienes cambios sin guardar en las notas. ¿Descartarlos?");
/*RT-END*/

// ───────────── Editor ─────────────
const field=(name,label,value="",type="text",attrs="")=>
  `<label class="field"><span>${esc(label)}</span><input name="${name}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
const area=(name,label,value="",attrs="")=>
  `<label class="field"><span>${esc(label)}</span><textarea name="${name}" ${attrs}>${esc(value)}</textarea></label>`;
const selectField=(name,label,options)=>
  `<label class="field"><span>${esc(label)}</span><select name="${name}">${options}</select></label>`;
const form=$("#editForm");
const editorSaveButtons=[$("#saveTop"),$("#save")];
function edit(k,r=null,preset={}){
  if(S.writing||S.loading)return toast("Espera a que termine la operación.");
  if((k==="clase"||k==="tarea")&&!S.data.materia.length){
    toast("Primero crea la materia. Después podrás añadir clases y actividades.");return edit("materia");
  }
  S.edit={k,id:r?.id??null}; $("#formErr").textContent="";
  editorSaveButtons.forEach(button=>button.disabled=false);
  let html="",title="";
  if(k==="name"){
    title="Tu nombre";html=field("nombre","Cómo quieres que te salude",displayName(),"text",'required maxlength="60"');
  }else if(k==="materia"){
    title=r?"Editar materia":"Nueva materia";
    html=field("nombre","Nombre de la materia",r?.nombre,"text",'required maxlength="100" placeholder="Cálculo 2"')+
      field("semestre","Semestre o periodo",r?.semestre,"text",'maxlength="80" placeholder="2026-2"');
  }else if(k==="soporte"){
    title=r?"Editar entrada":"Nueva entrada";
    const typ=r?.tipo||(Object.hasOwn(types,S.view)?S.view:"plantilla");
    html=selectField("tipo","Tipo de entrada",Object.keys(types).map(v=>option(v,singular[v],typ)).join(""))+
      `<div class="grid2">${field("aplicacion","Aplicación",r?.aplicacion??S.group,"text",'required maxlength="80" list="applist"')}
      ${field("categoria","Categoría · opcional",r?.categoria,"text",'maxlength="80" list="catlist"')}</div>
      <datalist id="applist">${unique(S.data.soporte.map(a=>a.aplicacion)).map(v=>option(v,v)).join("")}</datalist>
      <datalist id="catlist">${unique(S.data.soporte.map(a=>a.categoria)).map(v=>option(v,v)).join("")}</datalist>`+
      field("titulo","Título",r?.titulo,"text",'required maxlength="200"')+
      `<div id="procFields" class="stack">${area("descripcion","Cuándo usar este proceso",r?.descripcion)}
      ${field("manual_url","Manual de Google Drive · enlace HTTPS",r?.manual_url,"url")}
      ${selectField("plantilla_ref","Plantilla vinculada",option("","Ninguna",r?.plantilla_ref)+
        S.data.soporte.filter(x=>x.tipo==="plantilla"&&uid(x.id)!==uid(r?.id)).map(x=>
          option(x.id,x.aplicacion+" · "+x.titulo,r?.plantilla_ref)).join(""))}</div>`+
      area("contenido","Contenido",r?.contenido,'rows="7"')+
      `<small id="supportHint"></small>`+area("cierre","Cierre del ticket · opcional",r?.cierre,'maxlength="500"');
  }else if(k==="personal"){
    title=r?"Editar entrada":"Nueva entrada personal";
    html=`<div class="grid2">${field("categoria","Categoría · opcional",r?.categoria??S.group,"text",'maxlength="80" list="persCatList"')}
      ${field("titulo","Título",r?.titulo,"text",'required maxlength="200"')}</div>
      <datalist id="persCatList">${unique(S.data.personal.map(a=>a.categoria)).map(v=>option(v,v)).join("")}</datalist>`+
      field("dato_clave","Dato clave · opcional",r?.dato_clave,"text",'maxlength="80" placeholder="$95.000 COP, o 2.450 / 3.000 km"')+
      area("contenido","Notas",r?.contenido,'rows="6"')+
      area("pasos","Lista de pasos · opcional, uno por línea",personalSteps(r).map(p=>p.text).join("\n"))+
      field("enlace_url","Enlace · opcional",r?.enlace_url,"url");
  }else if(k==="moto"){
    title="Garaje moto";
    html=`<div class="grid2">${field("km_actual","Kilometraje actual",r?.km_actual,"number",'min="0" step="1"')}
      ${field("km_objetivo","Próximo mantenimiento (km)",r?.km_objetivo,"number",'min="0" step="1"')}</div>`+
      field("nota","Nota · opcional",r?.nota,"text",'maxlength="140" placeholder="Revisar cadena"');
  }else{
    const mid=r?.materia_id||preset.materia_id||S.group||S.data.materia[0].id;
    const subj=selectField("materia_id","Materia",S.data.materia.map(m=>option(m.id,
      m.nombre+(m.semestre?" · "+m.semestre:""),mid)).join(""));
    const name=field("titulo","Título",r?.titulo,"text",'required maxlength="200"');
    if(k==="clase"){
      title=r?"Editar clase":"Nueva clase";
      html=subj+name+`<div class="grid2">${field("fecha","Fecha de clase",r?.fecha||today(),"date","required")}
        ${field("modulo","Módulo o tema",r?.modulo,"text",'list="modlist" maxlength="120" placeholder="Sumas de Riemann"')}</div>
        <datalist id="modlist"></datalist>`+
        rtField(r?.resumen)+
        field("archivo_url","Apunte en OneDrive · enlace HTTPS",r?.archivo_url,"url");
    }else{
      const typ=r?.tipo||preset.tipo||"actividad";
      title=r?"Editar registro":typ==="evaluacion"?"Nueva evaluación":"Nueva actividad";
      html=subj+selectField("tipo","Tipo",option("actividad","Actividad",typ)+option("evaluacion","Evaluación",typ))+
        name+selectField("clase_id","Clase de origen · opcional","")+
        `<div class="grid2">${field("fecha","Fecha de entrega o evaluación",r?.fecha,"date")}
        ${selectField("estado","Estado",Object.entries(states).map(([v,t])=>option(v,t,r?.estado||"pendiente")).join(""))}</div>
        <div id="pesoField">${field("peso","Peso en la nota (%) · opcional",r?.peso,"number",'min="0" max="100" step="0.01"')}</div>`+
        area("descripcion","Instrucciones o notas",r?.descripcion)+
        field("archivo_url","Archivo en OneDrive · enlace HTTPS",r?.archivo_url,"url");
    }
  }
  $("#editorTitle").textContent=title; $("#formFields").innerHTML=html;
  $("#editor").classList.toggle("wide",k==="clase");
  syncFields(r?.clase_id||preset.clase_id||"");
  $("#editor").showModal();
  rtSel=null;
  if(k==="clase"){document.execCommand("defaultParagraphSeparator",false,"p");rtInit=rtValue()}
  (form.querySelector('[name="titulo"],[name="nombre"]')||form.querySelector("input"))?.focus();
}
function syncFields(chosen){
  const k=S.edit?.k,el=form.elements;
  if(k==="soporte"){
    const proc=el.tipo.value==="proceso";
    $("#procFields").hidden=!proc;
    $("#procFields").querySelectorAll("input,textarea,select").forEach(f=>f.disabled=!proc);
    $("#supportHint").textContent=proc?"Escribe un paso por línea.":el.tipo.value==="plantilla"?
      "Usa {{usuario}}, {{ticket}} u otros campos tanto en el texto como en el cierre.":"Una nota admite texto libre y enlaces.";
  }else if(k==="clase"){
    $("#modlist").innerHTML=unique(S.data.clase.filter(c=>c.materia_id===el.materia_id.value)
      .map(c=>c.modulo)).map(x=>option(x,x)).join("");
  }else if(k==="tarea"){
    const chosenId=chosen??el.clase_id.value;
    el.clase_id.innerHTML=option("","Sin vincular",chosenId)+S.data.clase
      .filter(c=>c.materia_id===el.materia_id.value).sort((a,b)=>b.fecha.localeCompare(a.fecha))
      .map(c=>option(c.id,dateText(c.fecha)+" · "+c.titulo,chosenId)).join("");
    const evalType=el.tipo.value==="evaluacion";
    $("#pesoField").hidden=!evalType;el.peso.disabled=!evalType;
  }
}
form.addEventListener("change",e=>{if(["materia_id","tipo"].includes(e.target.name))syncFields()});
function values(){
  if(S.edit?.k==="clase")form.elements.resumen.value=rtValue();
  const d=Object.fromEntries([...new FormData(form)].map(([k,v])=>[k,String(v).trim()]));
  for(const k of ["manual_url","archivo_url","enlace_url"]){
    if(d[k]&&!httpsUrl(d[k]))throw Error("El enlace debe ser una dirección HTTPS válida.");
  }
  for(const k of ["nombre","titulo","aplicacion"]){
    if(k in d && !d[k])throw Error("Completa los campos obligatorios sin dejar solo espacios.");
  }
  const k=S.edit.k;
  if(k==="name")return {nombre:d.nombre};
  if(k==="materia")return {nombre:d.nombre,semestre:d.semestre||null};
  if(k==="soporte")return {...d,categoria:d.categoria||null,cierre:d.cierre||null,
    manual_url:d.manual_url||null,descripcion:d.descripcion||null,plantilla_ref:d.plantilla_ref||null};
  if(k==="personal"){
    const orig=S.edit.id?find("personal",S.edit.id):null;
    return {categoria:d.categoria||null,titulo:d.titulo,contenido:d.contenido||null,
      enlace_url:d.enlace_url||null,dato_clave:d.dato_clave||null,
      pasos:mergeSteps(orig?personalSteps(orig):[],d.pasos)};
  }
  if(k==="moto")return {km_actual:d.km_actual?Number(d.km_actual):null,
    km_objetivo:d.km_objetivo?Number(d.km_objetivo):null,nota:d.nota||null};
  if(k==="clase")return {...d,modulo:d.modulo||null,archivo_url:d.archivo_url||null};
  return {...d,clase_id:d.clase_id||null,fecha:d.fecha||null,
    peso:d.peso?Number(d.peso):null,archivo_url:d.archivo_url||null};
}
function upsertLocal(k,r){
  const i=S.data[k].findIndex(x=>uid(x.id)===uid(r.id));
  if(i<0)S.data[k].unshift(r);else S.data[k][i]=r;
}
async function saveRow(k,id,v){
  let q=id!=null?db.from(table[k]).update(v).eq("id",id):db.from(table[k]).insert(v);
  const {data,error}=await q.select().single();if(error)throw error;
  return data;
}
form.onsubmit=async e=>{
  e.preventDefault();if(S.writing||!S.edit)return;
  const {k,id}=S.edit,epoch=S.epoch;
  S.writing=true;$("#formErr").textContent="";
  editorSaveButtons.forEach(button=>button.disabled=true);
  try{
    const v=values();
    if(k==="name"){
      const {data,error}=await db.auth.updateUser({data:v});if(error)throw error;
      if(epoch!==S.epoch)return;S.user=data.user;
    }else{
      const data=await saveRow(k,id,v);if(epoch!==S.epoch)return;
      upsertLocal(k,data);
      if(k==="moto"){
        /* solo refresca el widget; sin selección ni reinicio de filtros */
      }else{
      resetFilters();
      if(k==="materia"){S.group=uid(data.id);openSemFor(S.group);S.view="resumen"}
      else{
        if(k==="soporte"){S.view=data.tipo;S.steps.delete(uid(data.id))}
        else if(k==="personal"){S.view="all"}
        else{S.view=k==="clase"?"clase":data.tipo;S.group=data.materia_id}
        S.selected={k,id:uid(data.id)};
      }
      }
    }
    $("#editor").close();S.edit=null;render();
    if(k!=="name"&&k!=="moto"&&S.selected)focusDetail();
    toast("Cambios guardados.");
  }catch(err){$("#formErr").textContent=errorMessage(err)}
  finally{
    S.writing=false;
    editorSaveButtons.forEach(button=>button.disabled=false);
  }
};
async function updateCurrent(v){
  const r=current(),k=S.selected?.k,epoch=S.epoch;
  if(!r||S.writing)return;
  S.writing=true;
  try{
    const row=await saveRow(k,r.id,v);if(epoch!==S.epoch)return;
    upsertLocal(k,row);toast("Actualizado.");
  }finally{S.writing=false;render()}
}
async function removeCurrent(){
  const r=current(),k=S.selected?.k;
  if(!r||S.writing)return;
  if(k==="clase"&&S.data.tarea.some(a=>a.clase_id===r.id))
    return toast("Desvincula primero las actividades de esta clase desde su editor.");
  if(!confirm(`¿Borrar «${titleOf(r)}»? Esta acción no se puede deshacer.`))return;
  const epoch=S.epoch;S.writing=true;
  try{
    const {error}=await db.from(table[k]).delete().eq("id",r.id).select("id").single();
    if(error)throw error;if(epoch!==S.epoch)return;
    S.data[k]=S.data[k].filter(x=>uid(x.id)!==uid(r.id));clearSelection();render();toast("Registro borrado.");
  }finally{S.writing=false}
}

// ───────────── Búsqueda y acciones ─────────────
function palette(){
  if($("#editor").open)return;
  $("#paletteSpaceName").textContent = {soporte:"Soporte",uni:"Universidad",personal:"Personal"}[S.space];
  $("#pq").value="";renderResults();$("#palette").showModal();$("#pq").focus();
}
function renderResults(){
  const q=$("#pq").value,keys=isPersonal()?["personal"]:isUni()?["materia","clase","tarea"]:["soporte"];
  const results=keys.flatMap(k=>S.data[k].filter(r=>matches(k,r,q)).map(r=>[k,r])).slice(0,60);
  $("#results").innerHTML=results.map(([k,r])=>rowHtml(k,r)).join("")||`<p class="empty">Sin resultados.</p>`;
}
function newEntry(){
  if(isPersonal())return edit("personal");
  if(!isUni())return edit("soporte");
  if(S.view==="actividad"||S.view==="evaluacion")return edit("tarea",null,{tipo:S.view});
  if(S.view==="calendario")return edit("tarea");
  return edit("clase");
}
function exportData(){
  if(S.loading||Object.keys(S.errors).length)return toast("Carga todos los datos antes de exportar.");
  const data={version:3,fecha:today(),entradas:S.data.soporte,kx_materias:S.data.materia,
    kx_clases:S.data.clase,kx_actividades:S.data.tarea,kx_personal:S.data.personal};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));
  const a=document.createElement("a");a.href=url;a.download=`kardex-${today()}.json`;
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  if(S.user)local.set("kx-backup-"+S.user.id,new Date().toISOString());
  toast("Copia exportada. Incluye ambos espacios, no los archivos externos.");
}
function backupInfo(){
  const iso=S.user?local.get("kx-backup-"+S.user.id,""):"";
  if(!iso||isNaN(new Date(iso)))return {txt:"Aún no has exportado un respaldo · se recomienda uno por semana",stale:true};
  const days=Math.max(0,Math.floor((Date.now()-new Date(iso))/864e5)),when=dateText(isoDay(new Date(iso)));
  return days>7?{txt:`Último respaldo: ${when} · hace ${days} días, conviene exportar uno nuevo`,stale:true}:
    {txt:`Último respaldo: ${when} · se recomienda uno por semana`,stale:false};
}
function fillSettings(){
  const n=displayName(),b=backupInfo();
  $("#setName").textContent=n;$("#setAv").textContent=(n.trim()[0]||"?").toUpperCase();
  $("#setUser").textContent=S.user?.email||"";
  $("#bkText").textContent=b.txt;$("#bkDot").classList.toggle("stale",b.stale);
}
async function importData(file){
  if(S.writing||S.loading)return toast("Espera a que termine la operación.");
  let d;
  try{d=JSON.parse(await file.text())}catch{throw Error("El archivo no es un JSON válido.")}
  if(d?.version===2)d={version:3,entradas:d.soporte,kx_materias:d.materia,kx_clases:d.clase,kx_actividades:d.tarea};
  if(d?.version!==3)throw Error("Formato no reconocido. Usa un archivo exportado desde Kárdex.");
  const order=["kx_materias","kx_clases","kx_actividades","entradas","kx_personal"];
  const total=order.reduce((n,t)=>n+(Array.isArray(d[t])?d[t].length:0),0);
  if(!total)throw Error("El archivo no contiene registros.");
  if(!confirm(`Se importarán ${total} registros. Los que tengan el mismo id se sobrescribirán. ¿Continuar?`))return;
  const epoch=S.epoch;S.writing=true;
  try{
    for(const t of order){
      const rows=(Array.isArray(d[t])?d[t]:[]).map(({user_id,...r})=>r);
      for(let i=0;i<rows.length;i+=200){
        const {error}=await db.from(t).upsert(rows.slice(i,i+200),{onConflict:"id"});
        if(error)throw Error(t+": "+error.message);
      }
    }
  }finally{S.writing=false}
  if(epoch===S.epoch){await load();toast("Importación completada.")}
}
async function act(a){
  const r=current();
  if(a==="settings"){fillSettings();return $("#settings").showModal()}
  if(a==="setclose")return $("#settings").close();
  if(a==="recclose")return $("#recover").close();
  if(a==="back"){
    const readingClass=$("#recordList").hidden;
    const classId=readingClass ? uid(r?.id) : "";
    clearSelection();
    render();
    if(readingClass){
      const classRow=[...document.querySelectorAll('#items [data-open="clase"]')]
        .find(row=>row.dataset.id===classId);
      const target=classRow||$("#q");
      target.focus({preventScroll:true});
      target.scrollIntoView({block:"nearest"});
    }else{
      $("#listTitle").scrollIntoView({block:"nearest"});
    }
    return;
  }
  if(a==="cancel"){if(!S.writing&&discardOk())$("#editor").close();return}
  if(a==="palclose")return $("#palette").close();
  if(a==="theme")return setTheme(root.dataset.theme==="dark"?"light":"dark");
  if(a==="export"){$("#settings").close();return exportData()}
  if(a==="search")return palette();
  if(a==="logout"){$("#settings").close();
    if(S.writing)return toast("Espera a que termine el guardado.");
    const {error}=await db.auth.signOut();if(error)throw error;return;
  }
  if(a==="reload"){if(!S.loading)await load();return}
  if(a==="name"){$("#settings").close();return edit("name")}
  if(a==="subject")return edit("materia");
  if(a==="editsubject")return edit("materia",find("materia",S.group));
  if(a==="moto")return edit("moto",S.data.moto[0]||null);
  if(a==="bumpmoto"){
    const moto = S.data.moto[0];
    if (moto) return saveDashboardRecord("moto", moto, {km_actual:Number(moto.km_actual || 0) + 100});
    return;
  }
  if(a==="new")return newEntry();
  if(a==="newclass")return edit("clase");
  if(a==="newtask"||a==="neweval")return edit("tarea",null,{tipo:a==="neweval"?"evaluacion":"actividad"});
  if(a==="calendar")return changeView("calendario");
  if(a==="prevmonth"||a==="nextmonth"){
    S.month=new Date(S.month.getFullYear(),S.month.getMonth()+(a==="nextmonth"?1:-1),1);
    S.day="";return renderDetail();
  }
  if(a==="alldays"){S.day="";return renderDetail()}
  if(a==="import"){$("#settings").close();return $("#importFile").click()}
  if(a==="delsubject"){
    const m=find("materia",S.group);if(!m||S.writing)return;
    const c=S.data.clase.filter(x=>uid(x.materia_id)===uid(m.id)).length,
      t=S.data.tarea.filter(x=>uid(x.materia_id)===uid(m.id)).length;
    if(!confirm(`¿Borrar «${m.nombre}» junto con ${c} clases y ${t} actividades? Esta acción no se puede deshacer.`))return;
    const epoch=S.epoch;S.writing=true;
    try{
      const {error}=await db.from(table.materia).delete().eq("id",m.id).select("id").single();
      if(error)throw error;
      if(epoch!==S.epoch)return;
      S.data.materia=S.data.materia.filter(x=>uid(x.id)!==uid(m.id));
      S.data.clase=S.data.clase.filter(x=>uid(x.materia_id)!==uid(m.id));
      S.data.tarea=S.data.tarea.filter(x=>uid(x.materia_id)!==uid(m.id));
      S.group="";changeView("resumen");toast("Materia borrada.");
    }finally{S.writing=false}
    return;
  }
  if(!r)return;
  if(a==="done")return updateCurrent({estado:"completada"});
  if(a==="edit")return edit(S.selected.k,r);
  if(a==="delete")return removeCurrent();
  if(a==="pin"&&(S.selected.k==="soporte"||S.selected.k==="personal"))return updateCurrent({fijado:!r.fijado});
  if(a==="fromclass"||a==="evalfromclass")return edit("tarea",null,{
    materia_id:r.materia_id,clase_id:r.id,tipo:a==="fromclass"?"actividad":"evaluacion"
  });
  if(a==="resetsteps"){S.steps.delete(uid(r.id));return renderDetail()}
  if(a==="clearvars"){S.variables.clear();return renderDetail()}
  if(a==="copytpl"||a==="copytplend")return copyTemplate(a==="copytpl"?"contenido":"cierre");
  if(a==="copy"||a==="copyend"){
    if(r.tipo==="plantilla")return copyTemplate(a==="copy"?"contenido":"cierre");
    const text=a==="copyend"?r.cierre:r.contenido||plain(r.resumen)||r.descripcion;
    if(!text)return toast("No hay texto que copiar.");
    await copyText(text);toast("Copiado al portapapeles.");
  }
}
function run(a){Promise.resolve(act(a)).catch(e=>toast(errorMessage(e)))}

document.addEventListener("click",e=>{
  const b=e.target.closest("button, .donut-seg[data-group]");if(!b)return;
  const d=b.dataset;
  if(d.cmd)return rtCmd(d.cmd);
  if(d.themeOpt)return setTheme(d.themeOpt);
  if(d.act)return run(d.act);
  if(d.space)return switchSpace(d.space);
  if(d.view)return changeView(d.view);
  if(d.compra){toggleCompra(d.compra);return}
  if(d.copySupport){
    const record = find("soporte", d.copySupport);
    if (!record?.contenido) return toast("No hay texto que copiar.");
    copyText(record.contenido).then(() => toast("Copiado al portapapeles."))
      .catch(err => toast(errorMessage(err)));
    return;
  }
  if(d.cycleTask){
    const task = find("tarea", d.cycleTask);
    if (!task) return;
    const order = Object.keys(states);
    const estado = order[(order.indexOf(task.estado) + 1) % order.length];
    b.disabled = true;
    saveDashboardRecord("tarea", task, {estado}).finally(() => {b.disabled = false});
    return;
  }
  if(d.semtoggle){
    const open=S.semOpen.has(d.semtoggle);
    if(open)S.semOpen.delete(d.semtoggle);
    else S.semOpen.add(d.semtoggle);
    b.setAttribute("aria-expanded",String(!open));
    document.getElementById(b.getAttribute("aria-controls")).hidden=open;
    return;
  }
  if("group" in d){
    S.group=uid(S.group)===uid(d.group)?"":d.group;openSemFor(S.group);changeView(isUni()?"resumen":S.view);return;
  }
  if("chip" in d){S.chip=d.chip;renderList();return}
  if(d.day){S.day=S.day===d.day?"":d.day;renderDetail();return}
  if(d.open){
    if($("#palette").open){
      $("#palette").close();resetFilters();
      S.view=(d.open==="soporte"||d.open==="personal")?"all":d.open==="clase"?"clase":
        d.open==="materia"?"resumen":find("tarea",d.id)?.tipo||"actividad";
    }
    openRecord(d.open,d.id);
  }
});
$("#q").oninput=e=>{S.q=e.target.value;renderList()};
$("#chipSel").onchange=e=>{S.chip=e.target.value;renderList()};
$("#pq").oninput=renderResults;
$("#importFile").onchange=e=>{
  const f=e.target.files[0];e.target.value="";
  if(f)importData(f).catch(err=>toast(errorMessage(err)));
};
$("#pq").onkeydown=e=>{
  if(e.key==="ArrowDown"){e.preventDefault();$("#results button")?.focus()}
  if(e.key==="Enter"){e.preventDefault();$("#results button")?.click()}
};
$("#results").onkeydown=e=>{
  if(e.key==="ArrowDown"||e.key==="ArrowUp"){
    e.preventDefault();(e.key==="ArrowDown"?e.target.nextElementSibling:e.target.previousElementSibling)?.focus();
  }
};
$("#detail").addEventListener("input",e=>{
  if(!e.target.hasAttribute("data-var"))return;
  S.variables.set(e.target.dataset.var,e.target.value);
  const r=activeTemplate();if(!r)return;
  document.querySelectorAll("[data-preview]").forEach(el=>el.innerHTML=formatted(r[el.dataset.preview]));
});
$("#detail").addEventListener("change",e=>{
  const r=current();if(!r)return;
  if(e.target.id==="quickState"){
    e.target.disabled=true;updateCurrent({estado:e.target.value}).catch(err=>toast(errorMessage(err)));return;
  }
  if(e.target.hasAttribute("data-step")){
    const id=uid(r.id),i=Number(e.target.dataset.step),set=S.steps.get(id)||new Set();
    e.target.checked?set.add(i):set.delete(i);S.steps.set(id,set);renderDetail();
    document.querySelector(`[data-step="${i}"]`)?.focus();
  }
  if(e.target.hasAttribute("data-pstep")){
    e.target.disabled=true;
    togglePersonalStep(Number(e.target.dataset.pstep)).catch(err=>toast(errorMessage(err)));
  }
});
$("#editor").addEventListener("cancel",e=>{if(S.writing||!discardOk())e.preventDefault()});
form.onkeydown=e=>{
  if((e.ctrlKey||e.metaKey)&&e.key==="Enter"){e.preventDefault();form.requestSubmit()}
};
document.addEventListener("keydown",e=>{
  if(!S.user||document.querySelector("dialog[open]"))return;
  const key=e.key.toLowerCase();
  if((e.ctrlKey||e.metaKey)&&key==="k"){e.preventDefault();return run("search")}
  if(e.ctrlKey||e.metaKey||e.altKey||e.target.matches("input,textarea,select,[contenteditable]"))return;
  if(key==="escape"){
    if(S.selected)run("back");
    return;
  }
  if(key==="/"){e.preventDefault();if($("#q").offsetParent)$("#q").focus();else run("search");return}
  if(key==="arrowdown"||key==="arrowup"){
    if($("#recordList").hidden)return;
    const l=entries();if(!l.length)return;
    const i=l.findIndex(([k,r])=>k===S.selected?.k&&uid(r.id)===uid(S.selected?.id));
    const j=i<0?(key==="arrowdown"?0:l.length-1):Math.max(0,Math.min(l.length-1,i+(key==="arrowdown"?1:-1)));
    e.preventDefault();openRecord(l[j][0],l[j][1].id);$("#items .active")?.scrollIntoView({block:"nearest"});return;
  }
  const a={n:"new",e:"edit",p:"pin",delete:"delete",c:e.shiftKey?"copyend":"copy"}[key];
  if(a){e.preventDefault();run(a)}
});

// ───────────── Recuperar contraseña ─────────────
$("#forgot").onclick=async e=>{
  e.preventDefault();if(!db)return;
  const email=$("#email").value.trim(),box=$("#loginErr");box.textContent="";
  if(!email){box.textContent="Escribe tu correo arriba y vuelve a pulsar el enlace.";return}
  const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
  if(error){box.textContent=errorMessage(error);return}
  toast("Si el correo existe, recibirás un enlace para crear una contraseña nueva.");
};
$("#recForm").onsubmit=async e=>{
  e.preventDefault();$("#recErr").textContent="";
  const {error}=await db.auth.updateUser({password:$("#recPass").value});
  if(error){$("#recErr").textContent=errorMessage(error);return}
  $("#recPass").value="";$("#recover").close();toast("Contraseña actualizada.");
};

// ───────────── Inicio ─────────────
setTheme(themePref());
if(db){
  db.auth.onAuthStateChange((ev,s)=>{setTimeout(()=>{session(s?.user||null);if(ev==="PASSWORD_RECOVERY")$("#recover").showModal()},0)});
}else{
  $("#boot").textContent="No se pudo cargar Supabase. Revisa tu conexión y recarga la página.";
}
