const $=s=>document.querySelector(s), days=$('#days');
const {workDate,shiftDate,dateRangeExclusive}=window.WorkDate;
let visible=30, active, renderedWorkDate=workDate();
const shift=shiftDate;
function label(key){let d=new Date(key+'T12:00:00'),w='일월화수목금토'[d.getDay()];return `${key} ${w}요일`}
function get(k){try{return JSON.parse(localStorage.getItem('tasks:'+k)||'[]')}catch{return []}}
function put(k,v){
  localStorage.setItem('tasks:'+k,JSON.stringify(v));
  const dates=new Set(JSON.parse(localStorage.getItem('taskDates')||'[]'));
  dates.add(k);
  localStorage.setItem('taskDates',JSON.stringify([...dates].sort()));
}
function knownDates(){
  const dates=new Set(JSON.parse(localStorage.getItem('taskDates')||'[]'));
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);
    if(/^tasks:\d{4}-\d{2}-\d{2}$/.test(key))dates.add(key.slice(6));
  }
  return [...dates].sort();
}
function copyPending(from,to){
  const target=get(to), seen=new Set(target.map(x=>x.origin||x.id));
  get(from).filter(x=>x.status==='pending'&&x.text.trim()).forEach(x=>{
    const origin=x.origin||x.id;
    if(!seen.has(origin))target.push({id:crypto.randomUUID(),origin,text:x.text,status:'pending'});
  });
  put(to,target);
}
function rolloverThrough(today=workDate()){
  const dates=knownDates().filter(d=>d<=today);
  // 구버전에서 넘어온 데이터에는 roll:lastDate가 없으므로,
  // 가장 오래된 기록부터 오늘까지 빠진 날짜를 순서대로 복원한다.
  let start=localStorage.getItem('roll:lastDate')||dates[0]||today;
  if(start>today)start=today;
  for(const next of dateRangeExclusive(start,today)){
    copyPending(shift(next,-1),next);
    localStorage.setItem('roll:lastDate',next);
  }
  if(!localStorage.getItem('roll:lastDate'))localStorage.setItem('roll:lastDate',today);
}
function render(){days.innerHTML='';const t=workDate();for(let i=visible-1;i>=0;i--)days.append(makeDay(shift(t,-i)));active=t}
function makeDay(k){let s=document.createElement('section');s.className='sheet';s.dataset.date=k;s.innerHTML=`<div class="brand"><img class="brand-logo" src="assets/wontech-logo.jpg" alt="WONTECH 원테크"><div class="date">DATE ${label(k)}</div></div><div class="head"><div>NO</div><div>업 무 내 용</div><div>진행상황</div></div><div class="list"></div><div class="footer-actions"><button>＋ 업무 추가</button></div>`;let list=s.querySelector('.list'),arr=get(k);if(!arr.length)list.innerHTML='<div class="empty">등록된 업무가 없습니다.</div>';arr.forEach((x,i)=>list.append(row(k,x,i)));s.querySelector('.footer-actions button').onclick=()=>addTask(k);s.onclick=()=>active=k;return s}
function row(k,x,i){let r=document.createElement('div');r.className='task '+(x.status==='done'?'done':x.status==='pending'?'pending':'');r.innerHTML=`<div class="num">${i+1}</div><input class="text" value="${esc(x.text)}" placeholder="업무 내용을 입력하세요"><select class="status"><option value="">선택</option><option value="done" ${x.status==='done'?'selected':''}>완료</option><option value="pending" ${x.status==='pending'?'selected':''}>미처리</option></select><button class="remove">×</button>`;r.querySelector('.text').oninput=e=>update(k,x.id,{text:e.target.value});r.querySelector('.status').onchange=e=>{update(k,x.id,{status:e.target.value});render();go(k)};r.querySelector('.remove').onclick=e=>{e.stopPropagation();put(k,get(k).filter(v=>v.id!==x.id));render();go(k)};return r}
function esc(v=''){return v.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;')}
function update(k,id,p){put(k,get(k).map(x=>x.id===id?{...x,...p}:x))}
function addTask(k=active||workDate()){let a=get(k);a.push({id:crypto.randomUUID(),text:'',status:''});put(k,a);render();go(k);setTimeout(()=>document.querySelector(`[data-date="${k}"] .task:last-child .text`)?.focus(),100)}
function go(k){setTimeout(()=>document.querySelector(`[data-date="${k}"]`)?.scrollIntoView({behavior:'smooth',block:'start'}),10)}
function printableHtml(k=active||workDate()){
  const sheet=document.querySelector(`[data-date="${k}"]`);
  if(!sheet)return '';
  const clone=sheet.cloneNode(true);
  clone.querySelectorAll('input.text').forEach((input,i)=>{
    const div=document.createElement('div');div.className='text';div.textContent=input.value;
    input.replaceWith(div);
  });
  clone.querySelectorAll('select.status').forEach(select=>{
    const div=document.createElement('div');div.className='status';
    div.textContent=select.value==='done'?'완료':select.value==='pending'?'미처리':'';
    select.replaceWith(div);
  });
  clone.querySelectorAll('.remove,.footer-actions').forEach(x=>x.remove());
  const logo=clone.querySelector('.brand-logo');
  if(logo)logo.src=new URL('assets/wontech-logo.jpg',location.href).href;
  return clone.outerHTML;
}
async function output(fn){
  const k=active||workDate();
  return fn('WONTECH_업무메모_'+k,printableHtml(k));
}
function refreshAtDateBoundary(){
  const now=workDate();
  if(now!==renderedWorkDate){
    renderedWorkDate=now;
    rolloverThrough(now);
    render();
    go(now);
  }
}
rolloverThrough();render();go(workDate());
setInterval(refreshAtDateBoundary,30000);
window.addEventListener('focus',refreshAtDateBoundary);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshAtDateBoundary()});
$('#today').onclick=()=>go(workDate());
$('#add').onclick=()=>addTask(workDate());
$('#older').onclick=()=>{const old=visible;visible+=30;render();go(shift(workDate(),-old))};
$('#top').onchange=e=>window.desk.top(e.target.checked);
$('#jpg').onclick=()=>output(window.desk.jpg);
$('#pdf').onclick=()=>output(window.desk.pdf);
$('#print').onclick=()=>output(window.desk.print);
