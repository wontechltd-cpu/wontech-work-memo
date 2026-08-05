const $=s=>document.querySelector(s), days=$('#days');
const {workDate,shiftDate,dateRangeExclusive}=window.WorkDate;
let visible=30, active, renderedWorkDate=workDate();
const shift=shiftDate;

function label(key){
  const d=new Date(key+'T12:00:00');
  const w='일월화수목금토'[d.getDay()];
  return `${key} ${w}요일`;
}

function get(k){
  try{return JSON.parse(localStorage.getItem('tasks:'+k)||'[]')}
  catch{return []}
}

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
  const target=get(to);
  const seen=new Set(target.map(x=>x.origin||x.id));
  get(from).filter(x=>x.status==='pending'&&x.text.trim()).forEach(x=>{
    const origin=x.origin||x.id;
    if(!seen.has(origin)){
      target.push({
        id:crypto.randomUUID(),
        origin,
        text:x.text,
        status:'pending'
      });
    }
  });
  put(to,target);
}

function rolloverThrough(today=workDate()){
  const dates=knownDates().filter(d=>d<=today);
  let start=localStorage.getItem('roll:lastDate')||dates[0]||today;
  if(start>today)start=today;
  for(const next of dateRangeExclusive(start,today)){
    copyPending(shift(next,-1),next);
    localStorage.setItem('roll:lastDate',next);
  }
  if(!localStorage.getItem('roll:lastDate')){
    localStorage.setItem('roll:lastDate',today);
  }
}

function render(){
  days.innerHTML='';
  const t=workDate();
  for(let i=visible-1;i>=0;i--)days.append(makeDay(shift(t,-i)));
  active=t;
  if(isChecklistOpen())renderChecklist();
}

function makeDay(k){
  const s=document.createElement('section');
  s.className='sheet';
  s.dataset.date=k;
  s.innerHTML=`
    <div class="brand">
      <img class="brand-logo" src="assets/wontech-logo.jpg" alt="WONTECH 원테크">
      <div class="date">DATE ${label(k)}</div>
    </div>
    <div class="head">
      <div>NO</div><div>업 무 내 용</div><div>진행상황</div>
    </div>
    <div class="list"></div>
    <div class="footer-actions"><button>＋ 업무 추가</button></div>`;
  const list=s.querySelector('.list');
  const arr=get(k);
  if(!arr.length)list.innerHTML='<div class="empty">등록된 업무가 없습니다.</div>';
  arr.forEach((x,i)=>list.append(row(k,x,i)));
  s.querySelector('.footer-actions button').onclick=()=>addTask(k);
  s.onclick=()=>active=k;
  return s;
}

function row(k,x,i){
  const r=document.createElement('div');
  r.className='task '+statusClass(x.status);
  r.innerHTML=`
    <div class="num">${i+1}</div>
    <input class="text" value="${esc(x.text)}" placeholder="업무 내용을 입력하세요">
    <select class="status">
      <option value="">선택</option>
      <option value="pending" ${x.status==='pending'?'selected':''}>미처리</option>
      <option value="done" ${x.status==='done'?'selected':''}>완료</option>
      <option value="check" ${x.status==='check'?'selected':''}>체크</option>
    </select>
    <button class="remove">×</button>`;

  r.querySelector('.text').oninput=e=>{
    update(k,x.id,{text:e.target.value});
    if(x.status==='check'&&isChecklistOpen())renderChecklist();
  };

  r.querySelector('.status').onchange=e=>{
    const status=e.target.value;
    const patch={status};
    if(status==='check'&&!x.checkStatus)patch.checkStatus='pending';
    update(k,x.id,patch);
    render();
    go(k);
    if(status==='check')showToast('체크리스트에 저장했습니다.');
  };

  r.querySelector('.remove').onclick=e=>{
    e.stopPropagation();
    put(k,get(k).filter(v=>v.id!==x.id));
    render();
    go(k);
  };
  return r;
}

function statusClass(status){
  if(status==='done')return 'done';
  if(status==='pending')return 'pending';
  if(status==='check')return 'check';
  return '';
}

function allChecklistItems(){
  const result=[];
  knownDates().forEach(date=>{
    get(date).forEach(task=>{
      if(task.status==='check'&&task.text.trim()){
        result.push({...task,date,checkStatus:task.checkStatus||'pending'});
      }
    });
  });
  return result.sort((a,b)=>b.date.localeCompare(a.date));
}

function renderChecklist(){
  const box=$('#checkItems');
  const items=allChecklistItems();
  box.innerHTML='';
  if(!items.length){
    box.innerHTML='<div class="check-empty">체크로 지정된 업무가 없습니다.</div>';
    return;
  }

  items.forEach(item=>{
    const r=document.createElement('div');
    r.className='check-row '+(item.checkStatus==='done'?'check-done':'check-pending');
    r.innerHTML=`
      <div class="check-date">${item.date}</div>
      <div class="check-text">${esc(item.text)}</div>
      <select class="check-status">
        <option value="pending" ${item.checkStatus==='pending'?'selected':''}>미처리</option>
        <option value="done" ${item.checkStatus==='done'?'selected':''}>완료</option>
      </select>`;
    r.querySelector('.check-status').onchange=e=>{
      update(item.date,item.id,{checkStatus:e.target.value});
      renderChecklist();
      render();
    };
    box.append(r);
  });
}

function openChecklist(){
  renderChecklist();
  $('#checkModal').classList.add('open');
  $('#checkModal').setAttribute('aria-hidden','false');
}

function closeChecklist(){
  $('#checkModal').classList.remove('open');
  $('#checkModal').setAttribute('aria-hidden','true');
}

function isChecklistOpen(){
  return $('#checkModal').classList.contains('open');
}

function esc(v=''){
  return String(v)
    .replaceAll('&','&amp;')
    .replaceAll('"','&quot;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;');
}

function update(k,id,p){
  put(k,get(k).map(x=>x.id===id?{...x,...p}:x));
}

function addTask(k=active||workDate()){
  const a=get(k);
  a.push({id:crypto.randomUUID(),text:'',status:''});
  put(k,a);
  render();
  go(k);
  setTimeout(()=>{
    document.querySelector(`[data-date="${k}"] .task:last-child .text`)?.focus();
  },100);
}

function go(k){
  setTimeout(()=>{
    document.querySelector(`[data-date="${k}"]`)?.scrollIntoView({
      behavior:'smooth',
      block:'start'
    });
  },10);
}

function printableDayHtml(k=active||workDate()){
  const sheet=document.querySelector(`[data-date="${k}"]`);
  if(!sheet)return '';
  const clone=sheet.cloneNode(true);

  clone.querySelectorAll('input.text').forEach(input=>{
    const div=document.createElement('div');
    div.className='text';
    div.textContent=input.value;
    input.replaceWith(div);
  });

  clone.querySelectorAll('select.status').forEach(select=>{
    const div=document.createElement('div');
    div.className='status';
    div.textContent=
      select.value==='done'?'완료':
      select.value==='pending'?'미처리':
      select.value==='check'?'체크':'';
    select.replaceWith(div);
  });

  clone.querySelectorAll('.remove,.footer-actions').forEach(x=>x.remove());
  const logo=clone.querySelector('.brand-logo');
  if(logo)logo.src=new URL('assets/wontech-logo.jpg',location.href).href;
  return clone.outerHTML;
}

function printableChecklistHtml(){
  const items=allChecklistItems();
  const rows=items.map((item,i)=>`
    <div class="print-check-row ${item.checkStatus==='done'?'check-done':'check-pending'}">
      <div>${i+1}</div>
      <div>${esc(item.date)}</div>
      <div>${esc(item.text)}</div>
      <div>${item.checkStatus==='done'?'완료':'미처리'}</div>
    </div>`).join('');

  return `
    <section class="print-checklist">
      <div class="brand">
        <img class="brand-logo" src="${new URL('assets/wontech-logo.jpg',location.href).href}" alt="WONTECH 원테크">
        <div class="date">장기 체크리스트</div>
      </div>
      <div class="print-check-head"><div>NO</div><div>등록일</div><div>업무 내용</div><div>진행상황</div></div>
      ${rows||'<div class="check-empty">체크로 지정된 업무가 없습니다.</div>'}
    </section>`;
}

async function output(fn){
  const checklistMode=isChecklistOpen();
  const k=active||workDate();
  const name=checklistMode?'WONTECH_체크리스트':'WONTECH_업무메모_'+k;
  const html=checklistMode?printableChecklistHtml():printableDayHtml(k);

  if(!html){
    showToast('출력할 내용이 없습니다.');
    return;
  }

  try{
    const result=await fn(name,html);
    if(result&&result.success===false){
      showToast('인쇄에 실패했습니다: '+(result.reason||'프린터를 확인해 주세요.'));
    }
  }catch(error){
    console.error(error);
    showToast('출력 중 오류가 발생했습니다.');
  }
}

function showToast(message){
  const toast=$('#toast');
  toast.textContent=message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer=setTimeout(()=>toast.classList.remove('show'),2400);
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

rolloverThrough();
render();
go(workDate());

setInterval(refreshAtDateBoundary,30000);
window.addEventListener('focus',refreshAtDateBoundary);
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden)refreshAtDateBoundary();
});

$('#today').onclick=()=>{
  closeChecklist();
  go(workDate());
};
$('#add').onclick=()=>{
  closeChecklist();
  addTask(workDate());
};
$('#checklist').onclick=openChecklist;
$('#checkJpg').onclick=e=>{e.stopPropagation();output(window.desk.jpg);};
$('#checkPdf').onclick=e=>{e.stopPropagation();output(window.desk.pdf);};
$('#checkPrint').onclick=e=>{e.stopPropagation();output(window.desk.print);};
$('#closeChecklist').onclick=closeChecklist;
$('#checkModal').onclick=e=>{
  if(e.target===$('#checkModal'))closeChecklist();
};
document.addEventListener('keydown',e=>{
  if(e.key==='Escape')closeChecklist();
});
$('#older').onclick=()=>{
  const old=visible;
  visible+=30;
  render();
  go(shift(workDate(),-old));
};
$('#top').onchange=e=>window.desk.top(e.target.checked);
$('#jpg').onclick=()=>output(window.desk.jpg);
$('#pdf').onclick=()=>output(window.desk.pdf);
$('#print').onclick=()=>output(window.desk.print);
