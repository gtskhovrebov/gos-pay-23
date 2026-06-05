import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, onValue, get, set, update, push, remove, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBup1cnrGsuJALdJwXrIAwsNEgqwXbZc30",
  authDomain: "gos-pay-23.firebaseapp.com",
  databaseURL: "https://gos-pay-23-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "gos-pay-23",
  storageBucket: "gos-pay-23.firebasestorage.app",
  messagingSenderId: "687461014361",
  appId: "1:687461014361:web:25b3e10b54339f45f0ca48"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);
const DB_ROOT = "gosPay23";

const DEFAULT_FACTIONS = [
  { key:'pra', title:'Правительство', leader:'Glebik_Dollan', names:['MakwicK_Kotov','Ksenya_Malysheva','Erik_Smirnov','Ferz_Dollan'] },
  { key:'ufsb', title:'УФСБ', leader:'Max_Deep', names:['Harrison_Bradford','Nikolas_Jackson','Nikita_Saddes','Alexei_Lincoln'] },
  { key:'mvd', title:'МВД', leader:'', names:['Lyutsifer_Lolik','Nikolas_Jackson','MakwicK_Kotov','Nikolas_Millano','Fox_Devil'] },
  { key:'vch', title:'ВЧ', leader:'', names:['Dmitrii_Sokolow','Alexei_Lincoln','Dexter_Hatred'] },
  { key:'mz', title:'МЗ', leader:'Ksenya_Malysheva', names:['Dexter_Hatred','Nezox_Shadow','Erik_Smirnov'] },
  { key:'smi', title:'СМИ', leader:'Theo_Lusker', names:['Nezox_Shadow','Ivan_Khmeliaiev'] }
];

function seniorCuratorSet(){
  return new Set(
    state.factions
      .map(f => String(f.leader || '').trim())
      .filter(Boolean)
  );
}

function isSeniorCurator(nick){
  return seniorCuratorSet().has(String(nick || '').trim());
}

function filteredRatingNames(){
  return uniqueNames().filter(n => !isSeniorCurator(n));
}

const BASE_SALARY = 100;
const STORAGE_KEY = 'gos-pay-state-firebase-v1';
const CONFIG_KEY = 'gos-pay-config-firebase-v1';
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbwq1Sw22xggXNHDcHSUIelYxilYH9MeE5N5JH-F2xQKTf2147S5pBdzI9Ytkw2okZc1/exec';
const DEFAULT_SHEET_ID = '1LSlUC-t6_7x8vfg5mQebIwRHfDH8h0bB1Xzxq7wpv_U';
const DEFAULT_TOKEN = 'GOSPAY_23';
const $ = id => document.getElementById(id);

if(new URLSearchParams(location.search).get('reset') === '1'){
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(CONFIG_KEY);
  history.replaceState(null, '', location.pathname);
}

let state = loadState();
let config = loadConfig();
let donationTimers = {};
let realtimeStarted = false;

function loadState(){ try{return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {factions:DEFAULT_FACTIONS,donations:{},updatedAt:0};}catch{return {factions:DEFAULT_FACTIONS,donations:{},updatedAt:0};} }
function loadConfig(){ const defaults={theme:'system',riskLimit:100,sheetId:DEFAULT_SHEET_ID,apiUrl:DEFAULT_API_URL,token:DEFAULT_TOKEN}; try{return {...defaults,...(JSON.parse(localStorage.getItem(CONFIG_KEY))||{})};}catch{return defaults;} }
function saveState(){ state.updatedAt=Date.now(); localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); }
function saveConfig(){ config.apiUrl=cleanApiUrl(config.apiUrl||DEFAULT_API_URL); config.token=config.token||DEFAULT_TOKEN; localStorage.setItem(CONFIG_KEY,JSON.stringify(config)); }
function esc(s){return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
function toast(text){const t=$('toast'); if(!t)return; t.textContent=text; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2200);}
function setStatus(t){const el=$('statusLine'); if(el) el.textContent=t;}

function jsonp(url){return new Promise((resolve,reject)=>{const cb='gosPayCb_'+Date.now()+'_'+Math.floor(Math.random()*100000);const script=document.createElement('script');window[cb]=(data)=>{delete window[cb];script.remove();resolve(data);};script.onerror=()=>{delete window[cb];script.remove();reject(new Error('JSONP load failed'));};script.src=url+(url.includes('?')?'&':'?')+'callback='+encodeURIComponent(cb)+'&_='+Date.now();document.body.appendChild(script);});}
function cleanApiUrl(value){const raw=String(value||'').trim(); if(!raw)return ''; try{const u=new URL(raw);u.search='';u.hash='';return u.toString();}catch{return raw.split('?')[0].split('#')[0];}}
function getApiUrl(){return cleanApiUrl(($('apiUrl')?.value||config.apiUrl||DEFAULT_API_URL).trim());}
function getSheetId(){return ($('sheetId')?.value||config.sheetId||DEFAULT_SHEET_ID).trim();}
function getToken(){return String(config.token||DEFAULT_TOKEN).trim();}
function buildGetUrl(action,extra={}){const params=new URLSearchParams({action,sheetId:getSheetId(),token:getToken(),...extra});return `${getApiUrl()}?${params.toString()}`;}
function pathRef(path){return ref(db,`${DB_ROOT}/${path}`);}
function safeKey(s){return String(s||'').replace(/[.#$/\[\]]/g,'_');}
function donationsRef(){return pathRef('donations');}
function donationRef(nick){return pathRef(`donations/${safeKey(nick)}`);}
function factionsRef(){return pathRef('factions');}
function logsRef(){return pathRef('logs');}
function metaRef(name){return pathRef(`meta/${name}`);}
function firebaseDonationsToState(raw){const out={};Object.values(raw||{}).forEach(item=>{if(item&&item.nick){out[item.nick]={stk:Number(item.stk)||0,leader:Number(item.leader)||0,management:Number(item.management)||0};}});return out;}

function allFactionNames(){const arr=[];state.factions.forEach(f=>[f.leader,...f.names].filter(Boolean).forEach(n=>arr.push(n.trim())));return arr;}
function uniqueNames(){return [...new Set(allFactionNames())].sort((a,b)=>a.localeCompare(b));}
function getDon(n){return state.donations[n]||{stk:0,leader:0,management:0};}
function sumDon(n){const d=getDon(n);return (+d.stk||0)+(+d.leader||0)+(+d.management||0);}
function setDon(n,k,v){const value=Number(v)||0;const oldValue=Number(getDon(n)[k])||0;state.donations[n]={...getDon(n),[k]:value};cleanDonations(false);saveState();renderTotals();saveDonationCellDebounced(n,k,value,oldValue);}
function saveDonationCellDebounced(nick,field,value,oldValue){const key=nick+'::'+field;clearTimeout(donationTimers[key]);donationTimers[key]=setTimeout(()=>saveDonationCell(nick,field,value,oldValue),250);}
function cleanDonations(removeRemote=false){const allowed=new Set(uniqueNames());Object.keys(state.donations).forEach(n=>{if(!allowed.has(n)){delete state.donations[n];if(removeRemote)remove(donationRef(n)).catch(console.error);}});}
function factionClass(f){return f.key||keyByTitle(f.title);}
function keyByTitle(t){return {'Правительство':'pra','УФСБ':'ufsb','МВД':'mvd','ВЧ':'vch','МЗ':'mz','СМИ':'smi'}[t]||'pra';}
function applyTheme(){const theme=config.theme||'system';document.documentElement.classList.toggle('light',theme==='light'||(theme==='system'&&matchMedia('(prefers-color-scheme: light)').matches));}
function renderConfig(){if($('apiUrl'))$('apiUrl').value=config.apiUrl||'';if($('sheetId'))$('sheetId').value=config.sheetId||DEFAULT_SHEET_ID;if($('riskLimit'))$('riskLimit').value=config.riskLimit??100;if($('themeSelect'))$('themeSelect').value=config.theme||'system';applyTheme();}
function render(){cleanDonations(false);renderConfig();renderCurators();renderRewards();renderTotals();}
function renderCurators(){const grid=$('curatorGrid');if(!grid)return;grid.innerHTML='';state.factions.forEach(f=>{const box=document.createElement('div');box.className='faction';box.innerHTML=`<div class="faction-title ${factionClass(f)}">${esc(f.title)}</div>${f.leader?`<div class="lead">${esc(f.leader)}</div>`:''}<div class="names"></div>`;const names=box.querySelector('.names');f.names.forEach(n=>{const div=document.createElement('div');div.className='name';div.textContent=n;names.appendChild(div);});grid.appendChild(box);});}
function renderRewards(){const root=$('rewardGrid');if(!root)return;root.innerHTML='';state.factions.forEach(f=>{const cls=factionClass(f);const card=document.createElement('div');card.className='don-card';card.innerHTML=`<div class="don-head"><div class="title faction-title ${cls}">${esc(f.title)}</div><div class="faction-title ${cls}">СТК</div><div class="faction-title ${cls}">Лидер</div><div class="faction-title ${cls}">Руководство</div></div>`;[f.leader,...f.names].filter(Boolean).forEach(n=>{const d=getDon(n);const row=document.createElement('div');row.className='don-row';row.innerHTML=`<div class="nick">${esc(n)}</div><input inputmode="numeric" value="${d.stk||''}" data-n="${esc(n)}" data-k="stk"><input inputmode="numeric" value="${d.leader||''}" data-n="${esc(n)}" data-k="leader"><input inputmode="numeric" value="${d.management||''}" data-n="${esc(n)}" data-k="management">`;card.appendChild(row);});root.appendChild(card);});root.querySelectorAll('input').forEach(i=>i.addEventListener('input',e=>setDon(e.target.dataset.n,e.target.dataset.k,e.target.value)));}
function isEditingRewardInput(){const active=document.activeElement;return !!(active&&active.tagName==='INPUT'&&active.closest('#rewardGrid'));}
function updateRewardInputsFromState(){const root=$('rewardGrid');if(!root)return;const active=document.activeElement;root.querySelectorAll('input[data-n][data-k]').forEach(input=>{if(input===active)return;const n=input.dataset.n,k=input.dataset.k;const raw=Number(getDon(n)[k])||0;const value=raw?String(raw):'';if(input.value!==value)input.value=value;});}
function applyRemoteDonations(raw){state.donations=firebaseDonationsToState(raw);cleanDonations(false);saveState();if(isEditingRewardInput())updateRewardInputsFromState();else renderRewards();renderTotals();}
function renderTotals(){renderSalary();renderTop();renderRisk();}
function renderSalary(){const list=$('salaryList');if(!list)return;list.innerHTML='<div class="salary-head"><div>#</div><div>Никнейм</div><div>Донат</div><div>Итог</div></div>';uniqueNames().forEach((n,idx)=>{const donate=sumDon(n),total=BASE_SALARY+donate;const row=document.createElement('div');row.className='salary-row';row.innerHTML=`<div class="num">${idx+1}</div><div class="nick">${esc(n)}</div><div class="amount">${donate}</div><div class="copyline">${esc(n)} ${total}</div>`;list.appendChild(row);});}
function placeEmoji(i){return i===0?'🥇':i===1?'🥈':i===2?'🥉':'🏅';}
function placeLabel(i){return `${i+1} место`;}
function renderTop(){const root=$('topList');if(!root)return;const rows=filteredRatingNames().map(n=>({n,total:sumDon(n)})).sort((a,b)=>b.total-a.total||a.n.localeCompare(b.n)).slice(0,10);root.innerHTML=rows.length?rows.map((r,i)=>`<div class="rank rank-${i<3?'top':'default'}"><b><span class="list-icon medal">${placeEmoji(i)}</span><span class="rank-place">${placeLabel(i)}</span><span class="rank-name">${esc(r.n)}</span></b><span class="badge">${r.total}</span></div>`).join(''):'<div class="rank"><b><span class="list-icon medal">🏆</span>Нет данных</b><span class="badge">0</span></div>';}
function renderRisk(){const root=$('riskList');if(!root)return;const limit=Number(config.riskLimit)||100;const rows=filteredRatingNames().map(n=>({n,total:sumDon(n)})).filter(r=>r.total<limit).sort((a,b)=>a.total-b.total||a.n.localeCompare(b.n));root.innerHTML=rows.length?rows.map(r=>`<div class="risk risk-alert"><b><span class="list-icon">⚠️</span>${esc(r.n)}</b><span class="badge">${r.total} / ${limit}</span></div>`).join(''):'<div class="risk risk-ok"><b><span class="list-icon">✅</span>Никого нет в зоне риска</b><span class="badge">OK</span></div>';}
function curatorsText(){return state.factions.map(f=>`${f.title}\n${[f.leader,...f.names].filter(Boolean).join('\n')}`).join('\n\n');}
function rewardsText(){return state.factions.map(f=>{const lines=[f.title];[f.leader,...f.names].filter(Boolean).forEach(n=>{const d=getDon(n);lines.push(`${n} | СТК: ${d.stk||0} | Лидер: ${d.leader||0} | Руководство: ${d.management||0}`)});return lines.join('\n');}).join('\n\n');}
function salaryText(){return uniqueNames().map(n=>`${n} ${BASE_SALARY+sumDon(n)}`).join('\n');}
function topRows(){return filteredRatingNames().map(n=>({n,total:sumDon(n)})).sort((a,b)=>b.total-a.total||a.n.localeCompare(b.n)).slice(0,10);}
function topText(){const rows=topRows();return rows.length?['🏆 ТОП КУРАТОРОВ',...rows.map((r,i)=>`${placeEmoji(i)} ${i+1} место — ${r.n}: ${r.total}`)].join('\n'):'🏆 ТОП КУРАТОРОВ\nНет данных';}
function riskText(){const limit=Number(config.riskLimit)||100;const rows=filteredRatingNames().map(n=>({n,total:sumDon(n)})).filter(r=>r.total<limit).sort((a,b)=>a.total-b.total||a.n.localeCompare(b.n));return rows.length?['⚠️ В ЗОНЕ РИСКА',...rows.map(r=>`⚠️ ${r.n}: ${r.total} / ${limit}`)].join('\n'):'⚠️ В ЗОНЕ РИСКА\n✅ Никого нет в зоне риска';}
async function copyText(text){await navigator.clipboard.writeText(text);toast('Текст скопирован');}
async function checkAccess(){try{await set(metaRef('lastAccessCheck'),{time:serverTimestamp(),source:'GOS Pay'});toast('Firebase доступ разрешён');setStatus('Firebase подключён');}catch(e){console.error(e);toast('Ошибка доступа Firebase');setStatus('Ошибка Firebase');}}
async function syncCurators(){config.apiUrl=getApiUrl();config.sheetId=getSheetId();saveConfig();if(!config.apiUrl){toast('Нужен Apps Script URL');return false;}try{const d=await jsonp(buildGetUrl('curators'));if(d.allowed===false){toast('Доступ Apps Script запрещён');return false;}if(d.factions&&d.factions.length){state.factions=d.factions;cleanDonations(true);saveState();await set(factionsRef(),d.factions);await set(metaRef('lastCuratorsSync'),serverTimestamp());renderCurators();renderRewards();renderTotals();toast('Список кураторов обновлён');return true;}toast('Кураторы не найдены');return false;}catch(e){console.error(e);toast('Ошибка синхронизации кураторов');return false;}}
async function loadFirebaseInitialData(){try{const [factionsSnap,donationsSnap]=await Promise.all([get(factionsRef()),get(donationsRef())]);const f=factionsSnap.val(),d=donationsSnap.val();if(Array.isArray(f)&&f.length)state.factions=f;if(d)state.donations=firebaseDonationsToState(d);cleanDonations(false);saveState();render();setStatus('Firebase данные загружены');}catch(e){console.error(e);setStatus('Не удалось загрузить Firebase');}}
function startRealtime(){if(realtimeStarted)return;realtimeStarted=true;onValue(donationsRef(),snapshot=>{applyRemoteDonations(snapshot.val()||{});setStatus('Выплаты обновлены онлайн');},error=>{console.error(error);setStatus('Ошибка чтения выплат Firebase');});onValue(factionsRef(),snapshot=>{const f=snapshot.val();if(Array.isArray(f)&&f.length){state.factions=f;cleanDonations(false);saveState();renderCurators();if(!isEditingRewardInput())renderRewards();renderTotals();setStatus('Список кураторов обновлён онлайн');}},error=>{console.error(error);setStatus('Ошибка чтения кураторов Firebase');});}
async function saveDonationCell(nick,field,value,oldValue=0){try{await update(donationRef(nick),{nick,[field]:Number(value)||0,updatedAt:serverTimestamp()});await push(logsRef(),{time:serverTimestamp(),user:'GOS Pay',nick,field,oldValue:Number(oldValue)||0,newValue:Number(value)||0});setStatus('Сохранено онлайн '+new Date().toLocaleTimeString());}catch(e){console.error(e);setStatus('Ошибка сохранения Firebase');toast('Ошибка сохранения');}}
async function resetDonations(){state.donations={};saveState();renderTotals();renderRewards();try{await remove(donationsRef());await push(logsRef(),{time:serverTimestamp(),user:'GOS Pay',nick:'ALL',field:'reset',oldValue:'',newValue:'Все выплаты очищены'});toast('Выплаты сброшены');setStatus('Выплаты сброшены онлайн');}catch(e){console.error(e);toast('Ошибка сброса выплат');}}
function parseFactions(rows){const headers=[];rows.forEach((row,r)=>row.forEach((cell,c)=>{const title=normalizeTitle(cell);if(title)headers.push({title,r,c});}));const factions=[];headers.forEach(h=>{const same=headers.filter(x=>x.r===h.r&&x.c>h.c).sort((a,b)=>a.c-b.c)[0];const endC=same?same.c-1:h.c+3;const vals=[];for(let rr=h.r+1;rr<Math.min(rows.length,h.r+9);rr++){for(let cc=h.c;cc<=endC;cc++){const v=String(rows[rr]?.[cc]||'').trim();if(/^[\wА-Яа-яЁё]+_[\wА-Яа-яЁё]+$/.test(v)&&!vals.includes(v))vals.push(v);}}if(vals.length)factions.push({key:keyByTitle(h.title),title:h.title,leader:'',names:vals});});return factions;}
function normalizeTitle(v){const s=String(v||'').trim().toLowerCase();if(!s)return '';if(s.includes('прав')||s.includes('пра-во'))return 'Правительство';if(s.includes('уфсб'))return 'УФСБ';if(s.includes('мвд'))return 'МВД';if(s==='вч')return 'ВЧ';if(s==='мз')return 'МЗ';if(s.includes('сми'))return 'СМИ';return '';}
async function importPublicSheet(sheetId){return null;}
function loadHtml2Canvas(){if(window.html2canvas)return Promise.resolve(window.html2canvas);return new Promise((resolve,reject)=>{const existing=document.querySelector('script[data-html2canvas]');if(existing){existing.addEventListener('load',()=>resolve(window.html2canvas));existing.addEventListener('error',reject);return;}const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';script.async=true;script.defer=true;script.setAttribute('data-html2canvas','1');script.onload=()=>window.html2canvas?resolve(window.html2canvas):reject(new Error('html2canvas not available'));script.onerror=()=>reject(new Error('html2canvas load failed'));document.head.appendChild(script);});}
function buildExportNode(sectionId){const section=$(sectionId);const exportArea=section.querySelector('.export-area')||section;const title=section.querySelector('h2')?.textContent?.trim()||'export';const wrapper=document.createElement('div');wrapper.className='png-export-stage';wrapper.style.width=Math.min(Math.max(exportArea.scrollWidth+48,360),1180)+'px';wrapper.innerHTML=`<div class="png-title">${esc(title)}</div>`;const clone=exportArea.cloneNode(true);clone.querySelectorAll('input').forEach(input=>{const box=document.createElement('div');box.className='png-value '+(input.dataset.k?`png-${input.dataset.k}`:'');box.textContent=input.value||'0';input.replaceWith(box);});wrapper.appendChild(clone);return{wrapper,title};}
async function savePngBlob(blob,title){const filename=`${title.replace(/[\\/:*?"<>|]+/g,'-')}.png`;let copied=false,shared=false;try{if(navigator.clipboard&&window.ClipboardItem&&window.isSecureContext){await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);copied=true;}}catch{}try{const file=new File([blob],filename,{type:'image/png'});if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:filename});shared=true;}}catch{}const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2500);toast(copied?'PNG скопирован и сохранён':shared?'PNG отправлен и сохранён':'PNG сохранён файлом');}
async function exportPNG(sectionId){const{wrapper,title}=buildExportNode(sectionId);document.body.appendChild(wrapper);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));try{const html2canvas=await loadHtml2Canvas();const bg=getComputedStyle(document.documentElement).getPropertyValue('--export-bg').trim()||'#ffffff';const canvas=await html2canvas(wrapper,{backgroundColor:bg,scale:Math.min(3,Math.max(2,window.devicePixelRatio||2)),useCORS:true,allowTaint:true,logging:false,windowWidth:wrapper.scrollWidth,windowHeight:wrapper.scrollHeight});const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png',1));if(!blob)throw new Error('empty blob');await savePngBlob(blob,title);}catch(e){try{await fallbackSvgExport(wrapper,title);}catch{toast('PNG не создался. Открой сайт через HTTPS или Live Server.');}}finally{wrapper.remove();}}
async function fallbackSvgExport(wrapper,title){const rect=wrapper.getBoundingClientRect();const scale=Math.min(3,Math.max(2,window.devicePixelRatio||2));const css=[...document.styleSheets].map(sheet=>{try{return[...sheet.cssRules].map(rule=>rule.cssText).join('\n')}catch{return''}}).join('\n');const cloned=wrapper.cloneNode(true);cloned.style.position='static';cloned.style.transform='none';cloned.setAttribute('xmlns','http://www.w3.org/1999/xhtml');const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(rect.width*scale)}" height="${Math.ceil(rect.height*scale)}" viewBox="0 0 ${Math.ceil(rect.width)} ${Math.ceil(rect.height)}"><foreignObject x="0" y="0" width="100%" height="100%"><style>${css}</style>${new XMLSerializer().serializeToString(cloned)}</foreignObject></svg>`;const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));const img=new Image();img.decoding='sync';await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});const canvas=document.createElement('canvas');canvas.width=Math.ceil(rect.width*scale);canvas.height=Math.ceil(rect.height*scale);const ctx=canvas.getContext('2d');ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--export-bg').trim()||'#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png',1));if(!blob)throw new Error('empty blob');await savePngBlob(blob,title);}
function bindEvents(){if($('settingsBtn'))$('settingsBtn').onclick=()=>$('settingsPanel').classList.toggle('hidden');if($('closeSettings'))$('closeSettings').onclick=()=>$('settingsPanel').classList.add('hidden');if($('themeBtn'))$('themeBtn').onclick=()=>{config.theme=config.theme==='dark'?'light':config.theme==='light'?'system':'dark';saveConfig();renderConfig();};if($('themeSelect'))$('themeSelect').onchange=e=>{config.theme=e.target.value;saveConfig();applyTheme();};if($('saveConfig'))$('saveConfig').onclick=()=>{config.apiUrl=$('apiUrl').value.trim();config.sheetId=$('sheetId').value.trim();config.riskLimit=Number($('riskLimit').value)||100;config.theme=$('themeSelect').value;saveConfig();render();toast('Настройки сохранены');};if($('authBtn'))$('authBtn').onclick=checkAccess;if($('importBtn'))$('importBtn').onclick=syncCurators;if($('syncBtn'))$('syncBtn').onclick=async()=>{await loadFirebaseInitialData();await syncCurators();};if($('resetBtn'))$('resetBtn').onclick=()=>$('confirmModal').classList.remove('hidden');if($('cancelReset'))$('cancelReset').onclick=()=>$('confirmModal').classList.add('hidden');if($('confirmReset'))$('confirmReset').onclick=async()=>{$('confirmModal').classList.add('hidden');await resetDonations();};if($('copyCurators'))$('copyCurators').onclick=()=>copyText(curatorsText());if($('copyRewards'))$('copyRewards').onclick=()=>copyText(rewardsText());if($('copySalary'))$('copySalary').onclick=()=>copyText(salaryText());if($('copyTop'))$('copyTop').onclick=()=>copyText(topText());if($('copyRisk'))$('copyRisk').onclick=()=>copyText(riskText());document.querySelectorAll('[data-png]').forEach(b=>b.onclick=()=>exportPNG(b.dataset.png));document.querySelectorAll('.bottom-nav button').forEach(b=>b.onclick=()=>$(b.dataset.jump).scrollIntoView({behavior:'smooth',block:'start'}));window.matchMedia('(prefers-color-scheme: light)').addEventListener?.('change',applyTheme);}

bindEvents();
render();
startRealtime();
setTimeout(async()=>{await loadFirebaseInitialData();const f=await get(factionsRef());if(!f.exists())await syncCurators();},500);
