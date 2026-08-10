const $=s=>document.querySelector(s), days=$('#days');
const {workDate,shiftDate,dateRangeExclusive}=window.WorkDate;
let visible=30, active, renderedWorkDate=workDate();
const shift=shiftDate;

const LOGO_KEY='wontech:companyLogo';
const QUOTE_KEY='wontech:quotes:v1';
const CONTACT_KEY='wontech:quoteContacts:v1';
let quoteView='active';

const UNIT_OPTIONS=['EA','SET','LOT','식','KG','M','본','SHEET','ROL','NA'];

function defaultLogoSrc(){
  return new URL('assets/wontech-logo.jpg',location.href).href;
}
function currentLogoSrc(){
  return localStorage.getItem(LOGO_KEY)||defaultLogoSrc();
}
function applyCurrentLogo(){
  const src=currentLogoSrc();
  document.querySelectorAll('.brand-logo').forEach(img=>{img.src=src;});
}
async function resizeLogoFile(file){
  if(!file||!file.type.startsWith('image/'))throw new Error('이미지 파일만 선택할 수 있습니다.');
  if(file.size>15*1024*1024)throw new Error('15MB 이하의 이미지 파일을 선택해 주세요.');

  const source=await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(new Error('이미지 파일을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
  const image=await new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=()=>reject(new Error('이미지를 불러오지 못했습니다.'));
    img.src=source;
  });
  const maxWidth=1200,maxHeight=360;
  const scale=Math.min(1,maxWidth/image.naturalWidth,maxHeight/image.naturalHeight);
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
  canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  const context=canvas.getContext('2d');
  context.clearRect(0,0,canvas.width,canvas.height);
  context.drawImage(image,0,0,canvas.width,canvas.height);
  return canvas.toDataURL('image/png');
}
async function changeCompanyLogo(file){
  try{
    const dataUrl=await resizeLogoFile(file);
    localStorage.setItem(LOGO_KEY,dataUrl);
    applyCurrentLogo();
    showToast('회사마크를 교체했습니다.');
  }catch(error){
    console.error(error);
    showToast(error.message||'회사마크를 교체하지 못했습니다.');
  }finally{
    $('#logoFile').value='';
  }
}

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
  const target=get(to),seen=new Set(target.map(x=>x.origin||x.id));
  get(from).filter(x=>x.status==='pending'&&x.text.trim()).forEach(x=>{
    const origin=x.origin||x.id;
    if(!seen.has(origin)){
      target.push({id:crypto.randomUUID(),origin,text:x.text,status:'pending'});
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
  if(!localStorage.getItem('roll:lastDate'))localStorage.setItem('roll:lastDate',today);
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
      <img class="brand-logo" src="${currentLogoSrc()}" alt="회사마크">
      <div class="date">DATE ${label(k)}</div>
    </div>
    <div class="head"><div>NO</div><div>업 무 내 용</div><div>진행상황</div></div>
    <div class="list"></div>
    <div class="footer-actions"><button>＋ 업무 추가</button></div>`;
  const list=s.querySelector('.list'),arr=get(k);
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
    const status=e.target.value,patch={status};
    if(status==='check'&&!x.checkStatus)patch.checkStatus='pending';
    update(k,x.id,patch);
    render();go(k);
    if(status==='check')showToast('체크리스트에 저장했습니다.');
  };
  r.querySelector('.remove').onclick=e=>{
    e.stopPropagation();
    put(k,get(k).filter(v=>v.id!==x.id));
    render();go(k);
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
  const box=$('#checkItems'),items=allChecklistItems();
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
      renderChecklist();render();
    };
    box.append(r);
  });
}
function openChecklist(){
  closeQuotes();
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
  return String(v).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
}
function update(k,id,p){
  put(k,get(k).map(x=>x.id===id?{...x,...p}:x));
}
function addTask(k=active||workDate()){
  const a=get(k);
  a.push({id:crypto.randomUUID(),text:'',status:''});
  put(k,a);render();go(k);
  setTimeout(()=>document.querySelector(`[data-date="${k}"] .task:last-child .text`)?.focus(),100);
}
function go(k){
  setTimeout(()=>document.querySelector(`[data-date="${k}"]`)?.scrollIntoView({behavior:'smooth',block:'start'}),10);
}

/* ---------------- 견적관리 ---------------- */

function readArray(key){
  try{
    const v=JSON.parse(localStorage.getItem(key)||'[]');
    return Array.isArray(v)?v:[];
  }catch{return []}
}
function getQuotes(){return readArray(QUOTE_KEY)}
function saveQuotes(v){localStorage.setItem(QUOTE_KEY,JSON.stringify(v))}
function getContacts(){return readArray(CONTACT_KEY)}
function saveContacts(v){localStorage.setItem(CONTACT_KEY,JSON.stringify(v))}
function uniqueText(values){
  return [...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
}
function quoteViewName(){
  if(quoteView==='yes')return '입찰 유 리스트';
  if(quoteView==='cxl')return 'CXL 리스트';
  if(quoteView==='contacts')return '담당자 편집';
  return '진행 견적';
}
function currentQuotes(){
  const all=getQuotes();
  if(quoteView==='yes')return all.filter(x=>x.bidStatus==='유');
  if(quoteView==='cxl')return all.filter(x=>x.bidStatus==='CXL');
  return all.filter(x=>!x.bidStatus||x.bidStatus==='무');
}
function findQuote(id){return getQuotes().find(x=>x.id===id)}
function patchQuote(id,patch){
  saveQuotes(getQuotes().map(x=>x.id===id?{...x,...patch}:x));
}
function numberValue(v){
  return Number(String(v??'').replace(/[^\d]/g,''))||0;
}
function money(v){
  const n=numberValue(v);
  return n?n.toLocaleString('ko-KR'):'';
}
function unitOptions(current){
  const values=current&&!UNIT_OPTIONS.includes(current)?[current,...UNIT_OPTIONS]:UNIT_OPTIONS;
  return values.map(v=>`<option value="${esc(v)}" ${v===current?'selected':''}>${esc(v)}</option>`).join('');
}
function contactById(id){return getContacts().find(c=>c.id===id)}
function companyOptions(current){
  const values=uniqueText(getContacts().map(c=>c.company));
  if(current&&!values.includes(current))values.unshift(current);
  return `<option value="">회사 선택</option>`+values.map(v=>`<option value="${esc(v)}" ${v===current?'selected':''}>${esc(v)}</option>`).join('');
}
function deptOptions(company,current){
  const values=uniqueText(getContacts().filter(c=>!company||c.company===company).map(c=>c.dept));
  if(current&&!values.includes(current))values.unshift(current);
  return `<option value="">부서 선택</option>`+values.map(v=>`<option value="${esc(v)}" ${v===current?'selected':''}>${esc(v)}</option>`).join('');
}
function personOptions(quote){
  const contacts=getContacts().slice().sort((a,b)=>a.person.localeCompare(b.person,'ko'));
  let html='<option value="">담당자 선택</option>';
  html+=contacts.map(c=>{
    const label=`${c.person} (${c.company} / ${c.dept})`;
    const selected=quote.contactId===c.id||(quote.person===c.person&&quote.company===c.company&&quote.dept===c.dept);
    return `<option value="${esc(c.id)}" ${selected?'selected':''}>${esc(label)}</option>`;
  }).join('');
  return html;
}
function addQuote(){
  const all=getQuotes();
  all.push({
    id:crypto.randomUUID(),title:'',unit:'EA',qty:1,quoteUnit:0,bidUnit:0,
    company:'',dept:'',person:'',contactId:'',submitDate:'',bidDate:'',bidStatus:'무',note:'',attachment:null
  });
  saveQuotes(all);
  quoteView='active';
  renderQuoteManager();
  setTimeout(()=>$('#quoteRows .quote-row:last-child .quote-title')?.focus(),50);
}
function renderQuoteManager(){
  const contactMode=quoteView==='contacts';
  $('#quoteListView').style.display=contactMode?'none':'flex';
  $('#contactView').classList.toggle('open',contactMode);

  $('#quoteActiveTab').classList.toggle('active',quoteView==='active');
  $('#quoteYesTab').classList.toggle('active',quoteView==='yes');
  $('#quoteCxlTab').classList.toggle('active',quoteView==='cxl');
  $('#quoteContactTab').classList.toggle('active',contactMode);

  if(contactMode){
    $('#quoteCount').textContent=`담당자 ${getContacts().length}명`;
    renderContacts();
    return;
  }

  const list=currentQuotes(),box=$('#quoteRows');
  box.innerHTML='';
  if(!list.length){
    box.innerHTML='<div class="check-empty">등록된 견적이 없습니다.</div>';
  }else{
    list.forEach((q,i)=>box.append(makeQuoteRow(q,i)));
  }
  $('#quoteCount').textContent=`${quoteViewName()} ${list.length}건`;
  $('#quoteAddBar').style.display=quoteView==='active'?'flex':'none';
}
function makeQuoteRow(q,index){
  const r=document.createElement('div');
  r.className='quote-row '+(q.bidStatus==='유'?'quote-yes':q.bidStatus==='CXL'?'quote-cxl':'');
  const quoteAmount=numberValue(q.qty)*numberValue(q.quoteUnit);
  const bidAmount=numberValue(q.qty)*numberValue(q.bidUnit);

  r.innerHTML=`
    <div class="q-center">${index+1}</div>
    <div><input class="quote-title" value="${esc(q.title)}" placeholder="견적 제목"></div>
    <div><select class="quote-unit q-center">${unitOptions(q.unit)}</select></div>
    <div><input class="quote-qty q-center" value="${esc(q.qty)}"></div>
    <div><input class="quote-unit-price q-money" value="${money(q.quoteUnit)}"></div>
    <div class="quote-amount q-calc">${money(quoteAmount)}</div>
    <div><input class="bid-unit-price q-money" value="${money(q.bidUnit)}"></div>
    <div class="bid-amount q-calc">${money(bidAmount)}</div>
    <div><select class="quote-company q-center">${companyOptions(q.company)}</select></div>
    <div><select class="quote-dept q-center">${deptOptions(q.company,q.dept)}</select></div>
    <div><select class="quote-person q-center">${personOptions(q)}</select></div>
    <div><input class="submit-date q-center" type="date" value="${esc(q.submitDate)}"></div>
    <div><input class="bid-date q-center" type="date" value="${esc(q.bidDate)}"></div>
    <div><select class="bid-status q-center">
      <option value="무" ${q.bidStatus==='무'||!q.bidStatus?'selected':''}>무</option>
      <option value="유" ${q.bidStatus==='유'?'selected':''}>유</option>
      <option value="CXL" ${q.bidStatus==='CXL'?'selected':''}>CXL</option>
    </select></div>
    <div><input class="quote-note q-center" value="${esc(q.note)}" placeholder="비고"></div>
    <div class="quote-attachment">
      ${q.attachment&&q.attachment.storedName
        ? `<div class="quote-attachment-name" title="${esc(q.attachment.originalName||'첨부 견적서')}">${esc(q.attachment.originalName||'첨부 견적서')}</div>
           <div class="quote-attachment-actions">
             <button class="quote-open-button" type="button">열기</button>
             <button class="quote-attach-button" type="button">교체</button>
             <button class="quote-remove-button" type="button">삭제</button>
           </div>`
        : `<div class="quote-attachment-empty">파일 놓기</div>
           <div class="quote-attachment-actions"><button class="quote-attach-button" type="button">첨부</button></div>`}
    </div>`;

  r.querySelector('.quote-title').oninput=e=>patchQuote(q.id,{title:e.target.value});
  r.querySelector('.quote-unit').onchange=e=>patchQuote(q.id,{unit:e.target.value});
  r.querySelector('.quote-qty').oninput=e=>{
    const value=e.target.value.replace(/[^\d]/g,'');
    e.target.value=value;
    patchQuote(q.id,{qty:numberValue(value)});
    recalcQuoteRow(r,q.id);
  };
  r.querySelector('.quote-unit-price').oninput=e=>{
    const raw=e.target.value.replace(/[^\d]/g,'');
    e.target.value=raw?Number(raw).toLocaleString('ko-KR'):'';
    patchQuote(q.id,{quoteUnit:numberValue(raw)});
    recalcQuoteRow(r,q.id);
  };
  r.querySelector('.bid-unit-price').oninput=e=>{
    const raw=e.target.value.replace(/[^\d]/g,'');
    e.target.value=raw?Number(raw).toLocaleString('ko-KR'):'';
    patchQuote(q.id,{bidUnit:numberValue(raw)});
    recalcQuoteRow(r,q.id);
  };
  r.querySelector('.quote-company').onchange=e=>{
    patchQuote(q.id,{company:e.target.value,dept:'',person:'',contactId:''});
    renderQuoteManager();
  };
  r.querySelector('.quote-dept').onchange=e=>{
    patchQuote(q.id,{dept:e.target.value,person:'',contactId:''});
    renderQuoteManager();
  };
  r.querySelector('.quote-person').onchange=e=>{
    const c=contactById(e.target.value);
    if(c){
      patchQuote(q.id,{contactId:c.id,company:c.company,dept:c.dept,person:c.person});
      showToast(`${c.person} 선택 → ${c.company} / ${c.dept} 자동 입력`);
    }else{
      patchQuote(q.id,{contactId:'',person:''});
    }
    renderQuoteManager();
  };
  r.querySelector('.submit-date').onchange=e=>patchQuote(q.id,{submitDate:e.target.value});
  r.querySelector('.bid-date').onchange=e=>patchQuote(q.id,{bidDate:e.target.value});
  r.querySelector('.quote-note').oninput=e=>patchQuote(q.id,{note:e.target.value});

  r.querySelector('.quote-attach-button')?.addEventListener('click',async()=>{
    try{
      const oldStoredName=q.attachment?.storedName||'';
      const result=await window.desk.attachQuoteFile(q.id,oldStoredName);
      if(!result||result.canceled)return;
      if(result.success===false){showToast(result.reason||'견적서를 첨부하지 못했습니다.');return}
      patchQuote(q.id,{attachment:{
        originalName:result.originalName,
        storedName:result.storedName,
        size:result.size||0,
        attachedAt:new Date().toISOString()
      }});
      showToast(`${result.originalName} 견적서를 보관했습니다.`);
      renderQuoteManager();
    }catch(error){console.error(error);showToast('견적서 첨부 중 오류가 발생했습니다.')}
  });

  const attachmentCell=r.querySelector('.quote-attachment');
  if(attachmentCell){
    const removeDragState=()=>attachmentCell.classList.remove('drag-over');

    attachmentCell.addEventListener('dragenter',e=>{
      e.preventDefault();
      e.stopPropagation();
      attachmentCell.classList.add('drag-over');
    });
    attachmentCell.addEventListener('dragover',e=>{
      e.preventDefault();
      e.stopPropagation();
      if(e.dataTransfer)e.dataTransfer.dropEffect='copy';
      attachmentCell.classList.add('drag-over');
    });
    attachmentCell.addEventListener('dragleave',e=>{
      e.preventDefault();
      e.stopPropagation();
      if(!attachmentCell.contains(e.relatedTarget))removeDragState();
    });
    attachmentCell.addEventListener('drop',async e=>{
      e.preventDefault();
      e.stopPropagation();
      removeDragState();

      const files=Array.from(e.dataTransfer?.files||[]);
      if(!files.length)return;

      const file=files.find(f=>/\.(xlsx|xls|xlsm)$/i.test(f.name||''));
      if(!file){
        showToast('Excel 파일(.xlsx/.xls/.xlsm)만 첨부할 수 있습니다.');
        return;
      }
      if(files.length>1)showToast('여러 파일 중 첫 번째 Excel 파일을 첨부합니다.');

      try{
        const oldStoredName=q.attachment?.storedName||'';
        const result=await window.desk.attachDroppedQuoteFile(file,q.id,oldStoredName);
        if(!result||result.canceled)return;
        if(result.success===false){
          showToast(result.reason||'견적서를 첨부하지 못했습니다.');
          return;
        }
        patchQuote(q.id,{attachment:{
          originalName:result.originalName,
          storedName:result.storedName,
          size:result.size||0,
          attachedAt:new Date().toISOString()
        }});
        showToast(`${result.originalName} 견적서를 드래그 첨부했습니다.`);
        renderQuoteManager();
      }catch(error){
        console.error(error);
        showToast('드래그한 견적서를 첨부하지 못했습니다.');
      }
    });
  }

  r.querySelector('.quote-open-button')?.addEventListener('click',async()=>{
    try{
      const result=await window.desk.openQuoteFile(q.attachment?.storedName||'');
      if(result&&result.success===false)showToast(result.reason||'첨부 견적서를 열지 못했습니다.');
    }catch(error){console.error(error);showToast('첨부 견적서를 열지 못했습니다.')}
  });

  r.querySelector('.quote-remove-button')?.addEventListener('click',async()=>{
    try{
      const result=await window.desk.removeQuoteFile(q.attachment?.storedName||'');
      if(result&&result.success===false){showToast(result.reason||'첨부 견적서를 삭제하지 못했습니다.');return}
      patchQuote(q.id,{attachment:null});
      showToast('첨부 견적서를 삭제했습니다.');
      renderQuoteManager();
    }catch(error){console.error(error);showToast('첨부 견적서를 삭제하지 못했습니다.')}
  });

  r.querySelector('.bid-status').onchange=e=>{
    const status=e.target.value;
    patchQuote(q.id,{bidStatus:status});
    const target=status==='유'?'입찰 유 리스트':status==='CXL'?'CXL 리스트':'진행 견적';
    showToast(`${q.title||'견적'} → ${target}로 이동했습니다.`);
    renderQuoteManager();
  };
  return r;
}
function recalcQuoteRow(r,id){
  const q=findQuote(id);
  if(!q)return;
  r.querySelector('.quote-amount').textContent=money(numberValue(q.qty)*numberValue(q.quoteUnit));
  r.querySelector('.bid-amount').textContent=money(numberValue(q.qty)*numberValue(q.bidUnit));
}
function renderContacts(){
  const contacts=getContacts(),box=$('#contactRows');
  box.innerHTML='';
  if(!contacts.length){
    box.innerHTML='<div class="check-empty">저장된 담당자가 없습니다.</div>';
    return;
  }
  contacts
    .slice()
    .sort((a,b)=>(a.company+a.dept+a.person).localeCompare(b.company+b.dept+b.person,'ko'))
    .forEach((c,i)=>{
      const r=document.createElement('div');
      r.className='contact-row';
      r.innerHTML=`
        <div>${i+1}</div>
        <div><input class="contact-company" value="${esc(c.company)}"></div>
        <div><input class="contact-dept" value="${esc(c.dept)}"></div>
        <div><input class="contact-person" value="${esc(c.person)}"></div>
        <div><button class="contact-save">저장</button></div>
        <div><button class="contact-delete">삭제</button></div>`;
      r.querySelector('.contact-save').onclick=()=>{
        const company=r.querySelector('.contact-company').value.trim();
        const dept=r.querySelector('.contact-dept').value.trim();
        const person=r.querySelector('.contact-person').value.trim();
        if(!company||!dept||!person){showToast('요청회사 / 부서 / 담당자를 모두 입력해 주세요.');return}
        const all=getContacts();
        const duplicate=all.some(v=>v.id!==c.id&&v.company===company&&v.dept===dept&&v.person===person);
        if(duplicate){showToast('이미 같은 담당자가 저장되어 있습니다.');return}
        saveContacts(all.map(v=>v.id===c.id?{...v,company,dept,person}:v));
        saveQuotes(getQuotes().map(q=>q.contactId===c.id?{...q,company,dept,person}:q));
        showToast(`${person} 담당자 정보를 수정했습니다.`);
        renderQuoteManager();
      };
      r.querySelector('.contact-delete').onclick=()=>{
        saveContacts(getContacts().filter(v=>v.id!==c.id));
        saveQuotes(getQuotes().map(q=>q.contactId===c.id?{...q,contactId:''}:q));
        showToast(`${c.person} 담당자를 삭제했습니다.`);
        renderQuoteManager();
      };
      box.append(r);
    });
}
function addContact(){
  const company=$('#newContactCompany').value.trim();
  const dept=$('#newContactDept').value.trim();
  const person=$('#newContactPerson').value.trim();
  if(!company||!dept||!person){showToast('요청회사 / 부서 / 담당자를 모두 입력해 주세요.');return}
  const all=getContacts();
  if(all.some(c=>c.company===company&&c.dept===dept&&c.person===person)){
    showToast('이미 같은 담당자가 저장되어 있습니다.');return;
  }
  all.push({id:crypto.randomUUID(),company,dept,person});
  saveContacts(all);
  $('#newContactCompany').value='';
  $('#newContactDept').value='';
  $('#newContactPerson').value='';
  showToast(`${person} 담당자를 저장했습니다.`);
  renderQuoteManager();
}
async function openQuotes(){
  closeChecklist();
  quoteView='active';
  $('#quoteModal').classList.add('open');
  $('#quoteModal').setAttribute('aria-hidden','false');
  try{await window.desk.quoteWindow(true)}catch{}
  renderQuoteManager();
}
async function closeQuotes(){
  if(!$('#quoteModal').classList.contains('open'))return;
  $('#quoteModal').classList.remove('open');
  $('#quoteModal').setAttribute('aria-hidden','true');
  try{await window.desk.quoteWindow(false)}catch{}
}
function isQuotesOpen(){return $('#quoteModal').classList.contains('open')}

function printableDayHtml(k=active||workDate()){
  const sheet=document.querySelector(`[data-date="${k}"]`);
  if(!sheet)return '';
  const clone=sheet.cloneNode(true);
  clone.querySelectorAll('input.text').forEach(input=>{
    const div=document.createElement('div');div.className='text';div.textContent=input.value;input.replaceWith(div);
  });
  clone.querySelectorAll('select.status').forEach(select=>{
    const div=document.createElement('div');div.className='status';
    div.textContent=select.value==='done'?'완료':select.value==='pending'?'미처리':select.value==='check'?'체크':'';
    select.replaceWith(div);
  });
  clone.querySelectorAll('.remove,.footer-actions').forEach(x=>x.remove());
  const logo=clone.querySelector('.brand-logo');if(logo)logo.src=currentLogoSrc();
  return clone.outerHTML;
}
function printableChecklistHtml(){
  const items=allChecklistItems();
  const rows=items.map((item,i)=>`
    <div class="print-check-row ${item.checkStatus==='done'?'check-done':'check-pending'}">
      <div>${i+1}</div><div>${esc(item.date)}</div><div>${esc(item.text)}</div>
      <div>${item.checkStatus==='done'?'완료':'미처리'}</div>
    </div>`).join('');
  return `
    <section class="print-checklist">
      <div class="brand">
        <img class="brand-logo" src="${currentLogoSrc()}" alt="회사마크">
        <div class="date">장기 체크리스트</div>
      </div>
      <div class="print-check-head"><div>NO</div><div>등록일</div><div>업무 내용</div><div>진행상황</div></div>
      ${rows||'<div class="check-empty">체크로 지정된 업무가 없습니다.</div>'}
    </section>`;
}
function printableQuotesHtml(){
  const list=currentQuotes();
  const rows=list.map((q,i)=>{
    const quoteAmount=numberValue(q.qty)*numberValue(q.quoteUnit);
    const bidAmount=numberValue(q.qty)*numberValue(q.bidUnit);
    const cls=q.bidStatus==='유'?'quote-print-yes':q.bidStatus==='CXL'?'quote-print-cxl':'';
    return `
      <div class="quote-print-row ${cls}">
        <div>${i+1}</div><div class="quote-print-title">${esc(q.title)}</div>
        <div>${esc(q.unit)}</div><div>${esc(q.qty)}</div>
        <div class="money">${money(q.quoteUnit)}</div><div class="money">${money(quoteAmount)}</div>
        <div class="money">${money(q.bidUnit)}</div><div class="money">${money(bidAmount)}</div>
        <div>${esc(q.company)}</div><div>${esc(q.dept)}</div><div>${esc(q.person)}</div>
        <div>${esc(q.submitDate)}</div><div>${esc(q.bidDate)}</div><div>${esc(q.bidStatus||'무')}</div>
        <div>${esc(q.note)}</div><div>${q.attachment?.storedName?'있음':'-'}</div>
      </div>`;
  }).join('');

  return `
    <section class="quote-print">
      <div class="quote-print-brand">
        <img class="brand-logo" src="${currentLogoSrc()}" alt="회사마크">
        <div>
          <strong>견적관리 - ${esc(quoteViewName())}</strong>
          <small>${new Date().toLocaleDateString('ko-KR')} 출력</small>
        </div>
      </div>
      <div class="quote-print-table">
        <div class="quote-print-row quote-print-head">
          <div>NO</div><div>견적제목</div><div>단위</div><div>수량</div>
          <div>견적단가</div><div>견적금액</div><div>입찰단가</div><div>입찰금액</div>
          <div>요청회사</div><div>부서</div><div>담당자</div>
          <div>제출일자</div><div>입찰일자</div><div>입찰유무</div><div>비고</div><div>첨부</div>
        </div>
        ${rows||'<div class="quote-print-empty">등록된 견적이 없습니다.</div>'}
      </div>
      <div class="quote-print-footer">금액 단위: 원(₩) / A4 가로</div>
    </section>`;
}
async function exportQuotesExcel(){
  if(quoteView==='contacts'){
    showToast('담당자 편집 화면은 Excel 저장 대상이 아닙니다.');
    return;
  }
  const rows=currentQuotes().map((q,i)=>({
    no:i+1,
    title:q.title||'',
    unit:q.unit||'',
    qty:numberValue(q.qty),
    quoteUnit:numberValue(q.quoteUnit),
    quoteAmount:numberValue(q.qty)*numberValue(q.quoteUnit),
    bidUnit:numberValue(q.bidUnit),
    bidAmount:numberValue(q.qty)*numberValue(q.bidUnit),
    company:q.company||'',
    dept:q.dept||'',
    person:q.person||'',
    submitDate:q.submitDate||'',
    bidDate:q.bidDate||'',
    bidStatus:q.bidStatus||'무',
    note:q.note||'',
    attachment:q.attachment?.originalName||''
  }));
  const name=`WONTECH_견적관리_${quoteViewName().replaceAll(' ','_')}`;
  try{
    const result=await window.desk.exportQuotesExcel(name,rows);
    if(result&&result.success===false)showToast(result.reason||'Excel 저장에 실패했습니다.');
    else if(result&&!result.canceled)showToast('견적관리 Excel 파일을 저장했습니다.');
  }catch(error){console.error(error);showToast('Excel 저장 중 오류가 발생했습니다.')}
}

async function outputMemo(fn){
  const checklistMode=isChecklistOpen();
  const k=active||workDate();
  const name=checklistMode?'WONTECH_체크리스트':'WONTECH_업무메모_'+k;
  const html=checklistMode?printableChecklistHtml():printableDayHtml(k);
  if(!html){showToast('출력할 내용이 없습니다.');return}
  try{
    const result=await fn(name,html,{landscape:false,kind:checklistMode?'checklist':'memo'});
    if(result&&result.success===false)showToast('출력에 실패했습니다: '+(result.reason||'설정을 확인해 주세요.'));
  }catch(error){console.error(error);showToast('출력 중 오류가 발생했습니다.')}
}
async function outputQuotes(fn){
  if(quoteView==='contacts'){showToast('담당자 편집 화면은 출력 대상이 아닙니다.');return}
  const name=`WONTECH_견적관리_${quoteViewName().replaceAll(' ','_')}`;
  const html=printableQuotesHtml();
  try{
    const result=await fn(name,html,{landscape:true,kind:'quotes'});
    if(result&&result.success===false)showToast('출력에 실패했습니다: '+(result.reason||'설정을 확인해 주세요.'));
  }catch(error){console.error(error);showToast('출력 중 오류가 발생했습니다.')}
}

function showToast(message){
  const toast=$('#toast');
  toast.textContent=message;toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer=setTimeout(()=>toast.classList.remove('show'),2500);
}
function refreshAtDateBoundary(){
  const now=workDate();
  if(now!==renderedWorkDate){
    renderedWorkDate=now;rolloverThrough(now);render();go(now);
  }
}

rolloverThrough();render();applyCurrentLogo();go(workDate());
setInterval(refreshAtDateBoundary,30000);
window.addEventListener('focus',refreshAtDateBoundary);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshAtDateBoundary()});

$('#today').onclick=()=>{closeChecklist();closeQuotes();go(workDate())};
$('#add').onclick=()=>{closeChecklist();closeQuotes();addTask(workDate())};
$('#checklist').onclick=openChecklist;
$('#quotes').onclick=openQuotes;
$('#changeLogo').onclick=()=>$('#logoFile').click();
$('#logoFile').onchange=e=>changeCompanyLogo(e.target.files?.[0]);

$('#checkJpg').onclick=e=>{e.stopPropagation();outputMemo(window.desk.jpg)};
$('#checkPdf').onclick=e=>{e.stopPropagation();outputMemo(window.desk.pdf)};
$('#checkPrint').onclick=e=>{e.stopPropagation();outputMemo(window.desk.print)};
$('#closeChecklist').onclick=closeChecklist;
$('#checkModal').onclick=e=>{if(e.target===$('#checkModal'))closeChecklist()};

$('#quoteActiveTab').onclick=()=>{quoteView='active';renderQuoteManager()};
$('#quoteYesTab').onclick=()=>{quoteView='yes';renderQuoteManager()};
$('#quoteCxlTab').onclick=()=>{quoteView='cxl';renderQuoteManager()};
$('#quoteContactTab').onclick=()=>{quoteView='contacts';renderQuoteManager()};
$('#addQuote').onclick=addQuote;
$('#addContact').onclick=addContact;
$('#quoteExcel').onclick=exportQuotesExcel;
$('#quoteJpg').onclick=()=>outputQuotes(window.desk.jpg);
$('#quotePdf').onclick=()=>outputQuotes(window.desk.pdf);
$('#quotePrint').onclick=()=>outputQuotes(window.desk.print);
$('#closeQuotes').onclick=closeQuotes;
$('#quoteModal').onclick=e=>{if(e.target===$('#quoteModal'))closeQuotes()};

document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    if(isQuotesOpen())closeQuotes();
    else if(isChecklistOpen())closeChecklist();
  }
});
$('#older').onclick=()=>{
  const old=visible;visible+=30;render();go(shift(workDate(),-old));
};
$('#top').onchange=e=>window.desk.top(e.target.checked);
$('#jpg').onclick=()=>outputMemo(window.desk.jpg);
$('#pdf').onclick=()=>outputMemo(window.desk.pdf);
$('#print').onclick=()=>outputMemo(window.desk.print);
