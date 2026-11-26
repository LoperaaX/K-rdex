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
  user:null, data:emptyData(), space:"soporte", view:"all", semOpen:new Set(),
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
const themePref=()=>{const v=local.get("tema","auto");return v==="light"||v==="dark"?v:"auto"};
function setTheme(pref){
  if(pref!=="light"&&pref!=="dark")pref="auto";
  local.set("tema",pref);
  const t=pref==="auto"?(sysLight.matches?"light":"dark"):pref;
  root.dataset.theme=t;
  $('meta[name="theme-color"]').content=t==="dark"?"#101013":"#f6f5f2";
  document.querySelectorAll("[data-theme-opt]").forEach(b=>
    b.setAttribute("aria-pressed",b.dataset.themeOpt===pref));
}
sysLight.addEventListener?.("change",()=>{if(themePref()==="auto")setTheme("auto")});
function clearSelection(){
  S.selected=null; S.variables.clear(); $("#shell").classList.remove("reading");
}
function resetFilters(){
  clearSelection(); S.group=""; S.chip=""; S.q=""; S.day=""; $("#q").value="";
}
function switchSpace(space){
  resetFilters(); S.space=space==="uni"?"uni":space==="personal"?"personal":"soporte";
  S.view=isUni()?"resumen":"all"; root.dataset.space=S.space;
  if(S.user)local.set("kx-space-"+S.user.id,S.space);
  $("#shell").classList.remove("navopen"); render();
}
function changeView(v){
  clearSelection(); S.view=v; S.chip=""; S.q=""; S.day=""; $("#q").value="";
  $("#shell").classList.remove("navopen"); render();
}
function openRecord(k,id){
  if(!find(k,id))return;
  if(k==="materia"){S.group=id;openSemFor(id);changeView("resumen");return}
  clearSelection(); S.selected={k,id};
  $("#shell").classList.remove("navopen"); $("#shell").classList.add("reading");
  render(); $("#detail").scrollTop=0;
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
    rows=scoped("clase").sort((a,b)=>b.fecha.localeCompare(a.fecha)).map(r=>["clase",r]);
  }else{
    rows=scoped("tarea").filter(r=>S.view==="resumen"||
      (S.view==="calendario"?!!r.fecha:r.tipo===S.view))
      .sort((a,b)=>(a.fecha||"9999").localeCompare(b.fecha||"9999")).map(r=>["tarea",r]);
  }
  return rows.filter(([k,r])=>
    (!S.chip||(k==="soporte"?r.categoria:k==="clase"?r.modulo:r.estado)===S.chip)&&matches(k,r,S.q));
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
  return `<button class="nav ${on?"on":""}" data-${attr}="${esc(value)}" aria-pressed="${on}">
    <span>${esc(label)}</span><small>${esc(count)}</small></button>`;
}
function semKeyOf(id){return find("materia",id)?.semestre?.trim()||"Sin semestre"}
function openSemFor(id){if(id)S.semOpen.add(semKeyOf(id))}
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
  if(!S.semOpen.size)S.semOpen.add(groups[0][0]);
  return groups.map(([sem,items])=>{
    const open=S.semOpen.has(sem);
    return `<div class="semgrp">
      <button type="button" class="semhead" data-semtoggle="${esc(sem)}" aria-expanded="${open}">
        <svg class="chev" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
          stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
        <span class="grow">${esc(sem)}</span><small>${items.length}</small>
      </button>
      <div class="semlist" ${open?"":"hidden"}>${items.map(m=>
        navButton("group",m.id,m.nombre,S.group===m.id,S.group===m.id?"×":"")).join("")}</div>
    </div>`;
  }).join("");
}
function renderSide(){
  const nm=displayName();$("#whoName").textContent=nm;$("#whoAv").textContent=(nm.trim()[0]||"?").toUpperCase();
  document.querySelectorAll("button[data-space]").forEach(b=>
    b.setAttribute("aria-pressed",b.dataset.space===S.space));
  const views=isUni()?uniViews:isPersonal()?{all:"Todo",fijadas:"Fijadas"}:{all:"Todo",fijadas:"Fijadas",...types};
  $("#nav").innerHTML=Object.entries(views).map(([v,t])=>navButton("view",v,t,S.view===v)).join("");
  $("#groupTitle").textContent=isUni()?"Materias":isPersonal()?"Categorías":"Aplicaciones";
  $("#addSubject").hidden=!isUni();
  const groupSrc=isPersonal()?unique(S.data.personal.map(r=>r.categoria)):unique(S.data.soporte.map(r=>r.aplicacion));
  $("#groups").innerHTML=isUni()?semesterGroupsHtml():
    (groupSrc.map(x=>navButton("group",x,x,S.group===x,S.group===x?"×":"")).join("")||
    `<p class="empty">Aún no hay elementos.</p>`);
}
function rowHtml(k,r){
  const dot=k==="personal"?`<span class="catdot" style="background:${personalColor(r.categoria)}"></span>`:"";
  const meta=k==="soporte"?`${r.aplicacion} · ${singular[r.tipo]||"Entrada"}`:
    k==="personal"?(r.categoria||"Personal"):
    k==="materia"?"Materia":`${subject(r.materia_id)} · ${dateText(r.fecha)}`;
  const desc=k==="soporte"?r.descripcion||r.contenido:k==="personal"?(r.dato_clave||r.contenido):k==="clase"?r.modulo||plain(r.resumen):
    k==="materia"?r.semestre:states[r.estado];
  const selected=S.selected?.k===k&&uid(S.selected.id)===uid(r.id);
  return `<button class="row ${selected?"on":""}" data-open="${k}" data-id="${esc(r.id)}">
    <small>${dot}${esc(meta)}</small><b>${r.fijado?"◆ ":""}${esc(titleOf(r))}</b>
    <span class="snip">${esc(desc||"")}</span></button>`;
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
  sel.hidden=!chips.length;
  sel.innerHTML=option("",all,S.chip)+chips.map(([v,t])=>option(v,t,S.chip)).join("");
  const l=entries();
  $("#listCount").textContent=S.loading?"Cargando…":`${l.length} registros`;
  $("#items").innerHTML=l.map(([t,r])=>rowHtml(t,r)).join("")||
    `<p class="empty">${S.loading?"Cargando…":"No hay registros en esta vista."}</p>`;
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
function templateBox(r,linked=false){
  const vars=variableNames((r.contenido||"")+"\n"+(r.cierre||""));
  return `<section class="box">
    <p class="eyebrow">${linked?"Plantilla vinculada":"Plantilla"}</p>
    ${linked?`<h3>${esc(r.titulo)}</h3>`:""}
    ${vars.length?`<div class="fields">${vars.map(v=>`<label class="field"><span>${esc(v)}</span>
      <input data-var="${esc(v)}" value="${esc(S.variables.get(v)||"")}" autocomplete="off">
      </label>`).join("")}</div>`:""}
    <div class="doc mono" data-preview="contenido">${formatted(r.contenido)}</div>
    <div class="actions">${action("copytpl","Copiar plantilla","btn primary")}
    ${vars.length?action("clearvars","Limpiar campos"):""}</div>
    ${r.cierre?`<p class="eyebrow">Cierre de la plantilla</p>
      <div class="doc mono" data-preview="cierre">${formatted(r.cierre)}</div>
      <div>${action("copytplend","Copiar cierre de plantilla")}</div>`:""}
    </section>`;
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
  if(r.contenido)html+=`<div>${action("copy","Copiar "+(r.tipo==="proceso"?"pasos":"nota"))}</div>`;
  if(r.cierre)html+=`<div class="box"><p class="eyebrow">Cierre del ticket</p>
    <div class="doc">${esc(r.cierre)}</div><div>${action("copyend","Copiar cierre")}</div></div>`;
  return html;
}
const PERSONAL_PALETTE=["#c77b4a","#a2522a","#caa06a","#8a6a4e","#d08c5d","#6b4a33"];
function personalColor(cat){
  const key=cat||"General";
  let h=0;for(let i=0;i<key.length;i++)h=(h*31+key.charCodeAt(i))>>>0;
  return PERSONAL_PALETTE[h%PERSONAL_PALETTE.length];
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
  if(r.dato_clave)html+=`<div class="chips"><span class="pill tagpill">${esc(r.dato_clave)}</span></div>`;
  html+=`<div class="box doc">${prose(r.contenido)||"Sin notas."}</div>`;
  html+=extLink(r.enlace_url,"Abrir enlace");
  const steps=personalSteps(r),done=steps.filter(p=>p.done).length;
  if(steps.length)html+=`<div class="box"><p class="eyebrow">Lista de comprobación</p>
    <progress value="${done}" max="${steps.length}"></progress>
    <small>${done} de ${steps.length} listos</small>
    ${steps.map((p,i)=>`<label class="step"><input type="checkbox" data-pstep="${i}" ${p.done?"checked":""} ${S.writing?"disabled":""}><span>${esc(p.text)}</span></label>`).join("")}</div>`;
  if(r.contenido)html+=`<div>${action("copy","Copiar notas")}</div>`;
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
function stats(items){
  return `<div class="stats">${items.map(([v,t,n])=>
    `<button class="stat" data-view="${v}"><b>${n}</b><span>${esc(t)}</span></button>`).join("")}</div>`;
}
function scopedTasksList(tasks){
  return tasks.length?tasks.map(r=>keyBtn("tarea",r,
    `${dateText(r.fecha)} · ${r.titulo} · ${r.tipo==="evaluacion"?"Evaluación":"Actividad"} · ${states[r.estado]}`)).join(""):
    `<p class="muted">No hay actividades para mostrar.</p>`;
}
function calendar(){
  const month=new Date(S.month.getFullYear(),S.month.getMonth(),1);
  const offset=(month.getDay()+6)%7;
  const last=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
  const tasks=scoped("tarea").filter(r=>r.fecha);
  const prefix=isoDay(month).slice(0,7);
  const monthTasks=tasks.filter(r=>r.fecha.startsWith(prefix)).sort((a,b)=>a.fecha.localeCompare(b.fecha));
  const shown=S.day?monthTasks.filter(r=>r.fecha===S.day):monthTasks;
  let cells=["L","M","X","J","V","S","D"].map(v=>`<small>${v}</small>`).join("")+"<span></span>".repeat(offset);
  for(let i=1;i<=last;i++){
    const date=prefix+"-"+pad(i),n=monthTasks.filter(r=>r.fecha===date).length;
    cells+=`<button class="day ${n?"event":""} ${date===today()?"today":""} ${S.day===date?"chosen":""}" data-day="${date}"
      aria-label="${esc(dateText(date))}${date===today()?" (hoy)":""}, ${n} eventos">${i}${n?" •":""}</button>`;
  }
  return `<div class="box"><div class="headrow">${action("prevmonth","‹","icon")}
    <b class="grow">${esc(month.toLocaleDateString("es",{month:"long",year:"numeric"}))}</b>
    ${action("nextmonth","›","icon")}</div><div class="cal">${cells}</div>
    <small class="legend"><span class="sw ev"></span>Con entregas o evaluaciones<span class="sw td"></span>Hoy · Pulsa un día para filtrar.</small></div>
    <div class="box"><div class="headrow"><p class="eyebrow grow">${S.day?dateText(S.day):"Agenda del mes"}</p>
    ${S.day?action("alldays","Ver mes"):""}</div>${scopedTasksList(shown)}</div>`;
}
function uniHome(){
  const classes=scoped("clase"),tasks=scoped("tarea");
  const done=tasks.filter(r=>r.estado==="completada").length;
  const matter=S.group&&find("materia",S.group);
  const late=tasks.filter(r=>r.fecha&&r.fecha<today()&&r.estado!=="completada")
    .sort((a,b)=>a.fecha.localeCompare(b.fecha));
  return `<p class="eyebrow">${matter?esc(matter.semestre||"Materia"):"Universidad"}</p>
    <h1>${esc(matter?matter.nombre:"Mi universidad")}</h1>
    <div class="actions">${action("newclass","Nueva clase","btn primary")}
    ${action("newtask","Nueva actividad")}${action("neweval","Nueva evaluación")}
    </div>
    ${matter?`<div class="actions">${action("editsubject","Editar materia")}${action("delsubject","Borrar materia","btn danger")}</div>`:""}
    ${stats([["clase","Clases",classes.length],["actividad","Actividades",tasks.filter(r=>r.tipo==="actividad").length],
      ["evaluacion","Evaluaciones",tasks.filter(r=>r.tipo==="evaluacion").length]])}
    <div class="box"><p class="eyebrow">Progreso de actividades y evaluaciones</p>
    <progress max="${tasks.length||1}" value="${done}"></progress>
    <small>${done} de ${tasks.length} completadas${tasks.length?" · "+Math.round(100*done/tasks.length)+"%":""}</small></div>
    ${late.length?`<div class="box"><p class="eyebrow danger">Vencidas · ${late.length}</p>
    ${scopedTasksList(late)}</div>`:""}
    <div class="box"><p class="eyebrow">Próximas fechas</p>
    ${scopedTasksList(tasks.filter(r=>r.fecha&&r.fecha>=today()&&r.estado!=="completada")
      .sort((a,b)=>a.fecha.localeCompare(b.fecha)).slice(0,6))}
    ${action("calendar","Abrir calendario")}</div>
    <div class="box"><p class="eyebrow">Últimas clases</p>
    ${classes.length?classes.sort((a,b)=>b.fecha.localeCompare(a.fecha)).slice(0,5)
      .map(r=>keyBtn("clase",r,`${dateText(r.fecha)} · ${r.titulo}`)).join(""):
      `<p class="muted">Crea una materia y guarda tu primera clase.</p>`}</div>`;
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
function personalDonutHtml(){
  const total=S.data.personal.length;
  if(!total)return `<div class="box"><p class="eyebrow">Distribución personal</p>
    <p class="muted">Crea tu primera entrada para ver la distribución por categoría.</p></div>`;
  const cats=unique(S.data.personal.map(r=>r.categoria||"Sin categoría")).map(cat=>
    ({cat,count:S.data.personal.filter(r=>(r.categoria||"Sin categoría")===cat).length}));
  const rad=52,C=2*Math.PI*rad,gap=cats.length>1?8:0,usable=Math.max(C-gap*cats.length,0);
  let off=0;
  const segs=cats.map(({cat,count})=>{
    const len=Math.max((count/total)*usable,4),dash=`${len} ${C-len}`,doff=-off;
    off+=len+gap;
    return `<circle class="donutsegment" data-group="${esc(cat)}" role="button" tabindex="0"
      aria-label="Filtrar categoría ${esc(cat)}, ${count} entradas" cx="70" cy="70" r="${rad}"
      fill="none" stroke="${personalColor(cat)}" stroke-width="${S.group===cat?15:12}"
      stroke-linecap="round" stroke-dasharray="${dash}" stroke-dashoffset="${doff}"></circle>`;
  }).join("");
  const legend=cats.map(({cat,count})=>{
    const pct=Math.round(100*count/total);
    return `<button type="button" class="donutrow ${S.group===cat?"on":""}" data-group="${esc(cat)}">
      <span class="catdot" style="background:${personalColor(cat)}"></span>
      <span class="grow">${esc(cat)}</span><small>${pct}%</small><b>${count}</b></button>`;
  }).join("");
  const selected=S.group?cats.find(c=>c.cat===S.group):null;
  const centerCount=selected?.count??total;
  const centerLabel=selected?.cat??(total===1?"Entrada":"Entradas");
  const centerSub=selected?"Filtrado":`${cats.length} categorías`;
  return `<div class="box donutbox"><p class="eyebrow">Distribución personal</p>
    <div class="donutwrap"><svg viewBox="0 0 140 140" class="donutsvg" aria-label="Distribución por categorías">
      <circle cx="70" cy="70" r="${rad}" fill="none" stroke="var(--line)" stroke-width="12"></circle>${segs}</svg>
      <div class="donutcenter"><b>${centerCount}</b><span>${esc(centerLabel)}</span><small>${centerSub}</small></div>
    </div><div class="donutlegend">${legend}</div></div>`;
}
function motoWidgetHtml(){
  const m=S.data.moto[0];
  if(!m)return `<div class="box"><p class="eyebrow">Garaje moto</p>
    <p class="muted">Registra el kilometraje de tu moto para ver aquí cuánto falta para el próximo mantenimiento.</p>
    <div>${action("moto","+ Registrar kilometraje","btn primary")}</div></div>`;
  const pct=m.km_objetivo?Math.min(100,Math.round(100*(m.km_actual||0)/m.km_objetivo)):0;
  const falta=(m.km_objetivo!=null&&m.km_actual!=null)?Math.max(0,m.km_objetivo-m.km_actual):null;
  return `<div class="box"><div class="headrow"><p class="eyebrow grow">Garaje moto</p>${action("moto","Editar")}</div>
    <div class="stack"><div class="headrow"><span class="muted">Kilometraje</span>
    <b>${m.km_actual??"—"}${m.km_objetivo?` / ${m.km_objetivo} km`:""}</b></div>
    <progress value="${pct}" max="100"></progress>
    ${falta!=null?`<small class="muted">Faltan ~${falta} km para el próximo servicio.</small>`:""}
    ${m.nota?`<small class="muted">${esc(m.nota)}</small>`:""}</div></div>`;
}
function quickShopHtml(){
  const items=S.data.compras,pend=items.filter(i=>!i.hecho).length;
  return `<div class="box"><div class="headrow"><p class="eyebrow grow">Por comprar</p><span class="pill">${pend} pend.</span></div>
    <div class="qslist">${items.length?items.map(i=>
      `<button type="button" class="qsrow ${i.hecho?"done":""}" data-compra="${esc(i.id)}">
        <span class="chk" aria-hidden="true">${i.hecho?"✓":""}</span><span>${esc(i.texto)}</span></button>`).join(""):
      `<p class="muted">Sin pendientes.</p>`}</div>
    <form id="qsForm" class="headrow"><input id="qsInput" placeholder="Añadir algo para comprar…" autocomplete="off">
    <button class="btn primary">+</button></form></div>`;
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
  const r=current(),k=S.selected?.k;
  const dash=(isUni()&&["resumen","calendario"].includes(S.view)&&!r)||(isPersonal()&&!r);
  $("#shell").classList.toggle("dashboard",dash);
  const mobileMenu=`<button class="btn" data-act="menu">☰ Navegación</button>`;
  let html="";
  if(!r){
    if(isUni()){
      html+=S.view==="calendario"?`<p class="eyebrow">${S.group?esc(subject(S.group)):"Universidad"}</p><h1>Calendario</h1>${calendar()}`:uniHome();
    }else if(isPersonal()){
      const personalCount=S.data.personal.length, personalCats=unique(S.data.personal.map(r=>r.categoria||"Sin categoría")).length;
      html+=`<header class="personal-hero personal-hero-v2"><div class="personal-hero-copy"><div class="personal-hero-meta"><span class="personal-badge">ESPACIO PERSONAL</span><span class="personal-date">${new Date().toLocaleDateString("es-CO",{weekday:"long",day:"numeric",month:"long"})}</span></div><p class="personal-kicker">UN LUGAR PARA LO QUE IMPORTA</p><h1>Hola, <i>${esc(displayName())}</i>.</h1><p class="personal-intro">Ideas, proyectos, pendientes y pequeñas cosas que quiero tener presentes. Todo en un mismo lugar.</p><div class="personal-hero-stats"><div><b>${personalCount}</b><span>entradas guardadas</span></div><div><b>${personalCats}</b><span>categorías</span></div><div><b>${S.data.compras.filter(x=>!x.hecho).length}</b><span>pendientes de compra</span></div></div></div><div class="personal-hero-art" aria-hidden="true"><span class="hero-art-orbit hero-art-orbit-1"></span><span class="hero-art-orbit hero-art-orbit-2"></span><span class="hero-art-mark">K</span><span class="hero-art-caption">KÁRDEX<br>PERSONAL</span></div></header><section class="personal-widgets personal-widgets-v2"><div class="personal-section-label"><span>01 / TU UNIVERSO</span><p>Explora por categoría</p></div>${personalDonutHtml()}<div class="personal-widget-stack">${motoWidgetHtml()}${quickShopHtml()}</div></section><section class="personal-entries-head personal-entries-v2"><div class="personal-section-label"><span>02 / BIBLIOTECA PERSONAL</span><p>Lo que has ido guardando</p></div><div class="headrow"><h2>Tu colección</h2><span class="pill">${entries().length} registros</span><button class="btn primary" data-act="new">+ Crear entrada</button></div><input class="personal-search" type="search" placeholder="Buscar en tu espacio…" oninput="const q=this.value.toLowerCase();document.querySelectorAll('.personal-entry-grid .row').forEach(el=>el.hidden=!el.innerText.toLowerCase().includes(q))"></section><section class="personal-entry-grid personal-entry-grid-v2">${entries().map(([k,entry])=>rowHtml(k,entry)).join("")||`<div class="empty-card">Todavía no hay entradas. Guarda aquí algo que quieras recordar.</div>`}</section><section class="personal-shortcuts personal-shortcuts-v2"><span class="eyebrow">NAVEGACIÓN RÁPIDA</span><span>Ctrl / ⌘ K buscar · N crear · / filtrar · E editar · C copiar · P fijar</span></section>`;
    }else{
      html+=`<p class="eyebrow">Soporte técnico</p><h1>Hola, <i>${esc(displayName())}</i>.</h1>
      <p class="muted">Abre una entrada o busca por aplicación, título o contenido.</p>
      ${stats(Object.entries(types).map(([k,t])=>[k,t,S.data.soporte.filter(r=>r.tipo===k).length]))}
      <div class="box"><p class="eyebrow">Atajos</p><p class="muted">Ctrl / ⌘ K: buscar · N: nueva · /: filtrar · E: editar · C: copiar · Shift C: copiar cierre · P: fijar</p></div>`;
    }
  }else{
    const meta=k==="soporte"?[singular[r.tipo],r.aplicacion,r.categoria]:
      k==="personal"?[r.categoria]:
      [k==="clase"?"Clase":r.tipo==="evaluacion"?"Evaluación":"Actividad",subject(r.materia_id),dateText(r.fecha),r.modulo];
    html+=`<button id="back" class="btn" data-act="back">← Volver</button>
      <div class="chips">${meta.filter(Boolean).map(t=>`<span class="pill">${esc(t)}</span>`).join("")}</div>
      <h1>${esc(titleOf(r))}</h1><div class="actions">${action("edit","Editar")}
      ${(k==="soporte"||k==="personal")?action("pin",r.fijado?"Desfijar":"Fijar"):""}${action("delete","Borrar","btn danger")}</div>
      ${k==="personal"?personalDetail(r):k==="soporte"?supportDetail(r):academicDetail(k,r)}`;
  }
  $("#detail").innerHTML=`<div class="paper">${dash?`<div class="actions">${mobileMenu}</div>`:""}${loadAlert()}${html}</div>`;
  const qf=$("#qsForm");
  if(qf)qf.onsubmit=e=>{e.preventDefault();const v=$("#qsInput").value;$("#qsInput").value="";addCompra(v)};
}

/*RT-START*/
// ───────────── Notas con formato ─────────────
const RT="\x3c!--rt-->";
let rtSel=null,rtInit="";
const OK_TAGS=new Set("P DIV BR B STRONG I EM U S STRIKE H1 H2 H3 UL OL LI BLOCKQUOTE A SPAN HR".split(" "));
const DROP_TAGS=new Set("SCRIPT STYLE IFRAME OBJECT EMBED LINK META NOSCRIPT TEMPLATE SVG MATH FORM INPUT BUTTON TEXTAREA SELECT".split(" "));
const FAM=[["Instrument Serif","'Instrument Serif',Georgia,serif"],["Georgia","Georgia,serif"],["mono","ui-monospace,Consolas,monospace"],["Inter","Inter,system-ui,sans-serif"]];
const colorOk=v=>/^(#[0-9a-f]{3,8}|rgba?\([\d\s,.%\/]+\))$/i.test(v||"");
function cleanStyle(el){
  const s=el.style,o=[],f=FAM.find(([k])=>(s.fontFamily||"").includes(k));
  if(f)o.push("font-family:"+f[1]);
  if(colorOk(s.color))o.push("color:"+s.color);
  if(colorOk(s.backgroundColor))o.push("background-color:"+s.backgroundColor);
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
      for(const a of [...el.attributes])el.removeAttribute(a.name);
      if(style)el.setAttribute("style",style);
      if(el.tagName==="A"){
        if(!href){el.replaceWith(...el.childNodes);continue}
        el.setAttribute("href",href);el.setAttribute("target","_blank");el.setAttribute("rel","noopener noreferrer");
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
  ed.focus();
  if(rtSel){const s=getSelection();s.removeAllRanges();s.addRange(rtSel)}
  if(cmd==="link"){
    val=httpsUrl(prompt("Enlace (debe empezar por https://):","https://")||"");
    if(!val)return toast("Enlace no válido.");
  }
  document.execCommand("styleWithCSS",false,true);
  document.execCommand(cmd,false,val);
}
function rtField(v){
  const html=!v?"":String(v).startsWith(RT)?cleanHtml(v.slice(RT.length)):prose(v).replace(/\n/g,"<br>");
  const sel=(k,ph,opts)=>`<select data-rt="${k}" aria-label="${ph}"><option value="">${ph}</option>${
    opts.map(([a,b])=>`<option value="${esc(a)}">${esc(b)}</option>`).join("")}</select>`;
  const btn=(c,label,tip)=>`<button type="button" class="rtb" data-cmd="${c}" title="${tip}" aria-label="${tip}">${label}</button>`;
  return `<div class="stack"><span class="lbl">Notas de la clase</span><div class="rtbox">
    <div class="rtbar" role="toolbar" aria-label="Formato del texto">
    ${sel("block","Estilo",[["<p>","Texto normal"],["<h1>","Título 1"],["<h2>","Título 2"],["<h3>","Subtítulo"],["<blockquote>","Cita"]])}
    ${sel("font","Fuente",[["Inter","Sans (Inter)"],["Georgia","Serif (Georgia)"],["Instrument Serif","Elegante"],["monospace","Monoespaciada"]])}
    ${btn("bold","<b>N</b>","Negrita (Ctrl+B)")}${btn("italic","<i>K</i>","Cursiva (Ctrl+I)")}${btn("underline","<u>S</u>","Subrayado (Ctrl+U)")}${btn("strikeThrough","<s>ab</s>","Tachado")}
    ${sel("color","Color",[["#c58b2a","Dorado"],["#2f9e6e","Verde"],["#3b82f6","Azul"],["#e5484d","Rojo"],["#8b5cf6","Morado"]])}
    ${sel("hilite","Resaltar",[["rgba(250,204,21,.4)","Amarillo"],["rgba(74,222,128,.35)","Verde"],["rgba(244,114,182,.35)","Rosa"],["transparent","Quitar"]])}
    ${btn("insertUnorderedList","• Viñetas","Lista con viñetas")}${btn("insertOrderedList","1. Lista","Lista numerada")}${btn("link","Enlace","Insertar enlace")}${btn("insertHorizontalRule","—","Línea separadora")}${btn("removeFormat","Aa ✕","Quitar formato")}
    </div>
    <div id="rtEd" class="rt" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Notas de la clase">${html}</div>
    </div></div><input type="hidden" name="resumen">`;
}
document.addEventListener("selectionchange",()=>{
  const ed=$("#rtEd"),s=getSelection();
  if(ed&&s.rangeCount&&ed.contains(s.anchorNode))rtSel=s.getRangeAt(0).cloneRange();
});
document.addEventListener("mousedown",e=>{if(e.target.closest?.(".rtb"))e.preventDefault()});
document.addEventListener("change",e=>{
  const k=e.target.dataset?.rt,v=e.target.value;if(!k||!v)return;
  e.target.value="";
  rtCmd({block:"formatBlock",font:"fontName",color:"foreColor",hilite:"hiliteColor"}[k],v);
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
function edit(k,r=null,preset={}){
  if(S.writing||S.loading)return toast("Espera a que termine la operación.");
  if((k==="clase"||k==="tarea")&&!S.data.materia.length){
    toast("Primero crea la materia. Después podrás añadir clases y actividades.");return edit("materia");
  }
  S.edit={k,id:r?.id??null}; $("#formErr").textContent=""; $("#save").disabled=false;
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
  S.writing=true;$("#save").disabled=true;$("#formErr").textContent="";
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
        S.selected={k,id:uid(data.id)};$("#shell").classList.add("reading");
      }
      }
    }
    $("#editor").close();S.edit=null;render();toast("Cambios guardados.");
  }catch(err){$("#formErr").textContent=errorMessage(err)}
  finally{S.writing=false;$("#save").disabled=false}
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
  if(a==="menu")return $("#shell").classList.add("navopen");
  if(a==="navclose")return $("#shell").classList.remove("navopen");
  if(a==="settings"){fillSettings();return $("#settings").showModal()}
  if(a==="setclose")return $("#settings").close();
  if(a==="recclose")return $("#recover").close();
  if(a==="back"){clearSelection();render();return}
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
  const segment=e.target.closest(".donutsegment");
  if(segment){const cat=segment.dataset.group;S.group=S.group===cat?"":cat;S.view="all";S.selected=null;render();return}
  const b=e.target.closest("button");if(!b)return;
  const d=b.dataset;
  if(d.cmd)return rtCmd(d.cmd);
  if(d.themeOpt)return setTheme(d.themeOpt);
  if(d.act)return run(d.act);
  if(d.space)return switchSpace(d.space);
  if(d.view)return changeView(d.view);
  if(d.compra){toggleCompra(d.compra);return}
  if(d.semtoggle){
    S.semOpen.has(d.semtoggle)?S.semOpen.delete(d.semtoggle):S.semOpen.add(d.semtoggle);
    renderSide();return;
  }
  if("group" in d){
    S.group=uid(S.group)===uid(d.group)?"":d.group;openSemFor(S.group);
    if(isPersonal()){S.view="all";S.selected=null;render();return}
    changeView(isUni()?"resumen":S.view);return;
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
  const seg=e.target.closest?.(".donutsegment");
  if(seg&&(e.key==="Enter"||e.key===" ")){e.preventDefault();const cat=seg.dataset.group;S.group=S.group===cat?"":cat;S.view="all";S.selected=null;render();return}
  if(!S.user||document.querySelector("dialog[open]"))return;
  const key=e.key.toLowerCase();
  if((e.ctrlKey||e.metaKey)&&key==="k"){e.preventDefault();return run("search")}
  if(e.ctrlKey||e.metaKey||e.altKey||e.target.matches("input,textarea,select,[contenteditable]"))return;
  if(key==="escape"){
    if($("#shell").classList.contains("navopen"))run("navclose");else run("back");
    return;
  }
  if(key==="/"){e.preventDefault();if($("#q").offsetParent)$("#q").focus();else run("search");return}
  if(key==="arrowdown"||key==="arrowup"){
    if($("#shell").classList.contains("dashboard"))return;
    const l=entries();if(!l.length)return;
    const i=l.findIndex(([k,r])=>k===S.selected?.k&&uid(r.id)===uid(S.selected?.id));
    const j=i<0?(key==="arrowdown"?0:l.length-1):Math.max(0,Math.min(l.length-1,i+(key==="arrowdown"?1:-1)));
    e.preventDefault();openRecord(l[j][0],l[j][1].id);$("#items .on")?.scrollIntoView({block:"nearest"});return;
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
