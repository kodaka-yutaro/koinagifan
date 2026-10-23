import {STORAGE_KEY,LABELS,dayKey,entry,emptyState,isDue,assess,validateBackup,mergeState,afterDays} from './progress.mjs';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>n.toLocaleString('ja-JP');
const symbols=['○','↻','✓','✦'];
let catalog=[],state=emptyState(),view='all',page=1,filtered=[],activeId=null,toastTimer,catalogMeta;
const pageSize=30;
let day=dayKey();
const knownIds=new Set();
function notify(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,2600);}
function warn(message){$('saveWarning').hidden=false;$('saveWarning').textContent=message;}
function save(){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));$('saveWarning').hidden=true;return true;}
  catch{warn('このブラウザに保存できませんでした。画面上の記録は残っていますが、ページを閉じる前に「記録のバックアップ」からダウンロードしてください。');return false;}
}
function modify(id,patch){state.entries[id]={...entry(state,id),...patch,updatedAt:Date.now()};return save();}
function readStorage(){
  try{const raw=localStorage.getItem(STORAGE_KEY);if(raw) state=validateBackup(JSON.parse(raw),knownIds).state;}
  catch{warn('保存済みの記録を読み込めませんでした。現在のデータを保護するため、自動保存を止めています。バックアップを取り込むか、別のブラウザを使ってください。');throw new Error('STORAGE_READ_FAILED');}
}
let storageBlocked=false;
const originalSave=save;
save=()=>{if(storageBlocked){warn('保存済みデータを読み込めないため、自動保存を停止中です。バックアップを取り込むと再開できます。');return false;}return originalSave();};
function renderStats(){
  const counts=[0,0,0,0];let due=0;const doneToday=new Set();
  for(const p of catalog){const r=entry(state,p.id);counts[r.status]++;if(isDue(r))due++;if(r.history.some(h=>h.date===dayKey()))doneToday.add(p.id);}
  const total=catalog.length,percent=total?counts[3]/total*100:0;
  $('masterCount').textContent=fmt(counts[3]);$('totalCount').textContent=fmt(total);
  $('masterPercent').innerHTML=`${percent===100?'100':percent.toFixed(1).replace(/\.0$/,'')}<span>%</span>`;
  $('ring').style.background=`conic-gradient(var(--green) ${percent}%,#d6e1ca ${percent}%)`;
  $('remaining').textContent=counts[3]===total?'全問マスター達成！復習で定着させよう。':`あと ${fmt(total-counts[3])} 問。自分のペースで進もう。`;
  $('navTotal').textContent=fmt(total);$('navDue').textContent=fmt(due);$('dueCount').textContent=fmt(due);
  $('todayCount').textContent=doneToday.size;$('goalCount').textContent=state.goal;
  if(![...$('goal').options].some(o=>+o.value===state.goal))$('goal').add(new Option(`${state.goal}問`,state.goal));
  $('goal').value=state.goal;
  $('todayMessage').textContent=doneToday.size>=state.goal?'今日の目標、達成！':doneToday.size?`あと ${state.goal-doneToday.size} 問で達成`:'まずは一問、始めよう';
  $('goalDots').innerHTML=Array.from({length:Math.min(state.goal,20)},(_,i)=>`<i class="${i<Math.ceil(doneToday.size/state.goal*Math.min(state.goal,20))?'done':''}"></i>`).join('');
  $('sideProgress').firstElementChild.style.width=`${percent}%`;$('sideCount').textContent=`マスター ${fmt(counts[3])} / ${fmt(total)} 問`;
  $('statusSummary').innerHTML=counts.map((n,i)=>`<button data-summary="${i}" aria-label="${LABELS[i]} ${n}問で絞り込む"><span class="state-icon s${i}">${symbols[i]}</span><span>${LABELS[i]}</span><b>${fmt(n)}</b></button>`).join('');
  $('todayDate').textContent=new Intl.DateTimeFormat('ja-JP',{month:'long',day:'numeric',weekday:'short'}).format(new Date());
}
function setView(next){view=next;page=1;document.querySelectorAll('[data-view]').forEach(el=>{el.classList.toggle('active',el.dataset.view===view);el.setAttribute('aria-current',el.dataset.view===view?'page':'false');});renderList();}
function matchProblems(){
  const q=$('search').value.trim().normalize('NFKC').toLowerCase(),theme=$('theme').value,status=$('status').value;
  return catalog.filter(p=>{
    const r=entry(state,p.id);
    return (view!=='review'||isDue(r))&&(view!=='favorites'||r.favorite)&&(!theme||p.theme===theme)&&(status===''||r.status===+status)&&(!q||`${p.id} ${p.number} ${p.title} ${p.theme}`.normalize('NFKC').toLowerCase().includes(q));
  }).sort((a,b)=>{
    switch($('sort').value){case'new':return b.date.localeCompare(a.date)||a.number-b.number;case'old':return a.date.localeCompare(b.date)||a.number-b.number;case'review':return(entry(state,a.id).nextReview||'9999').localeCompare(entry(state,b.id).nextReview||'9999')||a.number-b.number;default:return a.number-b.number;}
  });
}
function renderList(){
  const themeMode=view==='themes';$('themeView').hidden=!themeMode;$('problemView').hidden=themeMode;$('randomBtn').hidden=themeMode;
  $('listTitle').firstChild.textContent=({all:'問題一覧 ',review:'今日の復習 ',favorites:'お気に入り ',themes:'テーマから探す '})[view];
  if(themeMode){renderThemes();return;}
  filtered=matchProblems();page=Math.max(1,Math.min(page,Math.ceil(filtered.length/pageSize)||1));
  $('resultCount').textContent=`${fmt(filtered.length)}問`;$('filterInfo').textContent=`${fmt(catalog.length)}問中 ${fmt(filtered.length)}問を表示`;
  const slice=filtered.slice((page-1)*pageSize,page*pageSize);
  $('problemList').innerHTML=slice.length?slice.map(p=>{
    const r=entry(state,p.id);
    return `<article class="problem-row" data-id="${p.id}"><div class="problem-info"><div class="number-tile"><small>NO.</small><strong>${String(p.number).padStart(3,'0')}</strong></div><div><h3><button class="problem-title" data-open="${p.id}">${esc(p.title)}</button></h3><div class="row-meta"><span class="tag">${esc(p.theme)}</span><span>${p.date.replaceAll('-','.')}</span>${p.relatedCount>1?'<span>複数図あり</span>':''}</div></div></div><div class="row-status"><button class="status-badge s${r.status}" data-open="${p.id}" aria-label="問題${p.number}の出来具合を記録">${symbols[r.status]} ${LABELS[r.status]}</button>${isDue(r)?'<span class="due-text">復習のタイミング</span>':''}</div><div class="row-actions"><button class="star ${r.favorite?'selected':''}" data-star="${p.id}" aria-label="問題${p.number}をお気に入り${r.favorite?'から外す':'に追加'}" aria-pressed="${r.favorite}">${r.favorite?'★':'☆'}</button><a class="source-link" href="${p.source}" target="_blank" rel="noopener noreferrer" aria-label="問題${p.number}をXで見る（新しいタブ）">Xで見る ↗</a></div></article>`;
  }).join(''):`<div class="empty"><strong>${view==='review'?'今の条件に合う復習はありません':view==='favorites'?'今の条件に合うお気に入りはありません':'問題が見つかりませんでした'}</strong><p>${view==='review'?'出来具合をチェックするだけで、次の復習日が自動で決まります。日付の入力は不要です。':view==='favorites'?'気になる問題の ☆ を押して、ここに集めよう。':'検索語や絞り込み条件を変えてみてください。'}</p><button class="btn" data-reset>すべての問題を見る →</button></div>`;
  $('pageInfo').textContent=`${page} / ${Math.max(1,Math.ceil(filtered.length/pageSize))} ページ`;
  $('prevPage').disabled=page<=1;$('nextPage').disabled=page*pageSize>=filtered.length;$('randomBtn').disabled=!filtered.length;
}
function renderThemes(){
  const groups=new Map();for(const p of catalog){if(!groups.has(p.theme))groups.set(p.theme,[]);groups.get(p.theme).push(p);}
  $('resultCount').textContent=`${groups.size}テーマ`;
  $('themeView').innerHTML='<div class="theme-grid">'+[...groups].map(([name,items],i)=>{
    const mastered=items.filter(p=>entry(state,p.id).status===3).length;
    return `<button class="theme-card" data-theme="${esc(name)}"><span class="theme-index">${String(i+1).padStart(2,'0')} ↗</span><h3>${esc(name)}</h3><p>${fmt(items.length)}問</p><div class="mini-progress"><i style="width:${mastered/items.length*100}%"></i></div><small>マスター ${mastered} / ${fmt(items.length)}</small></button>`;
  }).join('')+'</div>';
}
function refresh(){renderStats();renderList();}
function resetFilters(){for(const id of ['search','theme','status'])$(id).value='';$('sort').value='number';page=1;}
function openProblem(id){
  const p=catalog.find(p=>p.id===id);if(!p)return;activeId=id;const r=entry(state,id);
  $('detailNumber').textContent=`PROBLEM ${String(p.number).padStart(4,'0')} / ${p.id}`;
  $('detailContent').innerHTML=`<h2 class="detail-title" id="detailTitle">${esc(p.title)}</h2><div class="detail-meta"><span class="tag">${esc(p.theme)}</span><span>${p.date.replaceAll('-','.')} の投稿</span><button class="star ${r.favorite?'selected':''}" id="detailStar" aria-label="お気に入り" aria-pressed="${r.favorite}">${r.favorite?'★':'☆'}</button></div><div class="source-box"><div class="source-heading"><strong>01　元の投稿で問題に挑戦</strong><a class="btn primary" href="${p.source}" target="_blank" rel="noopener noreferrer">Xで問題を見る ↗</a></div><p>問題は別のタブで開きます。解いたら、ここに戻って出来具合を記録しよう。${p.relatedCount>1?`<br>この投稿には収録図が${p.relatedCount}件あります。元投稿で図を確認してください。`:''}</p></div><section class="detail-section"><h3>02　今の出来具合は？</h3><div class="status-options" aria-label="出来具合">${LABELS.map((s,i)=>`<button class="status-option ${r.status===i?'selected':''}" data-assess="${i}" aria-pressed="${r.status===i}">${symbols[i]} ${s}<small>${["記録を戻す","復習は1日後","復習は3日後","復習は14日後"][i]}</small></button>`).join('')}</div><p class="detail-help">「解けた」は一度解けた問題。「マスター」は自信をもって解ける問題。<br>同じ状態を押すと、今日の復習として記録できます（自分で判定）。</p><div class="auto-review-note"><strong>復習日は自動で決まります</strong><p>上の出来具合を選ぶだけで、今日から1日後・3日後・14日後に設定。<br>日付の入力は不要です。都合に合わせて変更することもできます。</p></div><div class="review-control"><label for="reviewDate">次の復習日（変更は任意）</label><input type="date" id="reviewDate" value="${r.nextReview||''}" aria-label="次の復習日"><button class="btn" id="noReview">復習日を解除</button></div></section><section class="detail-section"><label for="note" class="note-label">気づき・苦手なポイント</label><textarea id="note" maxlength="20000" placeholder="見落とした筋や、次に気をつけたいことを残そう。">${esc(r.note)}</textarea><details><summary>自分の回答をメモする</summary><label for="answer" class="note-label">回答（自分用）</label><textarea id="answer" maxlength="20000" placeholder="考えた手順や答えをメモできます。">${esc(r.answer)}</textarea></details><div class="save-status" id="noteSaved">入力内容は自動保存</div></section><div class="history"><span>学習 ${r.history.length}${r.history.length===100?'回以上':'回'}</span>${r.history.slice(-3).reverse().map(h=>`<span>${h.date.slice(5).replace('-','/')} ${LABELS[h.status]}</span>`).join('')}</div><div class="detail-bottom"><button class="text-btn" id="backToList">一覧に戻る</button><button class="btn" id="nextProblem">次の問題へ →</button></div>`;
  $('detailStar').onclick=()=>{const ok=modify(id,{favorite:!entry(state,id).favorite});refresh();openProblem(id);if(ok)notify(entry(state,id).favorite?'お気に入りに追加しました':'お気に入りを解除しました');};
  $('detailContent').querySelectorAll('[data-assess]').forEach(b=>b.onclick=()=>{
    state.entries[id]=assess(entry(state,id),+b.dataset.assess);const ok=save();refresh();openProblem(id);if(ok)notify(+b.dataset.assess?`${LABELS[+b.dataset.assess]}を記録。次の復習は${state.entries[id].nextReview.replaceAll("-","/")}に自動設定しました`:'未挑戦に戻しました');
  });
  const saveText=()=>{const ok=modify(id,{note:$('note').value,answer:$('answer').value});$('noteSaved').textContent=ok?'✓ 保存しました':'保存できません。バックアップしてください';$('noteSaved').classList.toggle('storage-error',!ok);};
  $('note').oninput=saveText;$('answer').oninput=saveText;
  $('reviewDate').onchange=()=>{const value=$('reviewDate').value;const ok=modify(id,{nextReview:value||null});refresh();if(ok)notify('復習日を更新しました');};
  $('noReview').onclick=()=>{const ok=modify(id,{nextReview:null});$('reviewDate').value='';refresh();if(ok)notify('復習日を解除しました');};
  $('backToList').onclick=()=>$('problemDialog').close();
  const pool=filtered.length?filtered:catalog;const idx=pool.findIndex(p=>p.id===id);const next=pool.find((p,i)=>i>idx&&p.id!==id);$('nextProblem').disabled=!next;
  $('nextProblem').onclick=()=>{if(next)openProblem(next.id);};
  if(!$('problemDialog').open)$('problemDialog').showModal();
}
function chooseToday(){
  const candidates=catalog.filter(p=>isDue(entry(state,p.id))).sort((a,b)=>(entry(state,a.id).nextReview||'').localeCompare(entry(state,b.id).nextReview||''));
  const p=candidates[0]||catalog.find(p=>entry(state,p.id).status===0)||catalog.find(p=>entry(state,p.id).status<3)||catalog[Math.floor(Math.random()*catalog.length)];
  if(p)openProblem(p.id);
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{resetFilters();setView(b.dataset.view);});
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
$('statusSummary').onclick=e=>{const b=e.target.closest('[data-summary]');if(b){resetFilters();$('status').value=b.dataset.summary;setView('all');$('listTitle').scrollIntoView({behavior:'smooth',block:'start'});}};
$('problemList').onclick=e=>{const open=e.target.closest('[data-open]'),star=e.target.closest('[data-star]');if(open)openProblem(open.dataset.open);if(star){const id=star.dataset.star;const ok=modify(id,{favorite:!entry(state,id).favorite});renderList();if(ok)notify(entry(state,id).favorite?'お気に入りに追加しました':'お気に入りを解除しました');}if(e.target.closest('[data-reset]')){resetFilters();setView('all');}};
$('themeView').onclick=e=>{const b=e.target.closest('[data-theme]');if(b){resetFilters();$('theme').value=b.dataset.theme;setView('all');}};
for(const id of ['search','theme','status','sort'])$(id).addEventListener(id==='search'?'input':'change',()=>{page=1;renderList();});
$('clearBtn').onclick=()=>{resetFilters();renderList();};
$('prevPage').onclick=()=>{page--;renderList();$('listTitle').scrollIntoView({block:'start'});};
$('nextPage').onclick=()=>{page++;renderList();$('listTitle').scrollIntoView({block:'start'});};
$('randomBtn').onclick=()=>{if(filtered.length)openProblem(filtered[Math.floor(Math.random()*filtered.length)].id);};
$('startBtn').onclick=chooseToday;
$('dueBtn').onclick=()=>{resetFilters();setView('review');$('listTitle').scrollIntoView({block:'start',behavior:'smooth'});};
$('goal').onchange=()=>{state.goal=+$('goal').value;save();renderStats();};
$('backupBtn').onclick=()=>$('backupDialog').showModal();$('aboutBtn').onclick=()=>$('aboutDialog').showModal();
$('exportBtn').onclick=()=>{
  const blob=new Blob([JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`koinagifan-progress-${dayKey()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('バックアップをダウンロードしました');
};
$('importFile').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try{if(file.size>15*1024*1024)throw new Error('15MB以下のバックアップを選んでください。');
    const {state:incoming,ignored}=validateBackup(JSON.parse(await file.text()),knownIds);
    const count=Object.keys(incoming.entries).length;
    if(!count)throw new Error('取り込める問題の学習記録がありませんでした。');
    state=mergeState(state,incoming);storageBlocked=false;const ok=save();refresh();
    if($('problemDialog').open&&activeId)openProblem(activeId);
    $('importMessage').textContent=`${count}問分の記録を確認し、更新日時の新しい記録を統合しました。${ignored?`未収録の${ignored}件は取り込みませんでした。`:''}${ok?'':'ブラウザへの保存には失敗しています。'}`;
  }catch(error){$('importMessage').textContent=error instanceof SyntaxError?'JSONファイルを読み取れませんでした。記録は変更していません。':error.message;}
  e.target.value='';
};
window.addEventListener('storage',e=>{
  if(e.key!==STORAGE_KEY||!e.newValue)return;
  try{const incoming=validateBackup(JSON.parse(e.newValue),knownIds).state;state=mergeState(state,incoming);state.goal=incoming.goal;refresh();if($('problemDialog').open&&activeId){const r=entry(state,activeId);$('note').value=r.note;$('answer').value=r.answer;$('reviewDate').value=r.nextReview||'';}notify('別のタブの記録を反映しました');}catch{}
});
window.addEventListener('focus',()=>{if(day!==dayKey()){day=dayKey();refresh();}});
async function init(){
  try{const response=await fetch('./catalog.json');if(!response.ok)throw new Error('catalog');const data=await response.json();catalogMeta=data;catalog=data.problems;
    if(!Array.isArray(catalog)||!catalog.length||catalog.some(p=>!/^NAG-\d{6}$/.test(p.id)||!/^https:\/\/x\.com\/naginyan135\/status\/\d+$/.test(p.source)))throw new Error('catalog');
    catalog.forEach(p=>knownIds.add(p.id));
    try{readStorage();}catch{storageBlocked=true;}
    const themes=[...new Set(catalog.map(p=>p.theme))];themes.forEach(t=>$('theme').add(new Option(t,t)));
    $('catalogInfo').textContent=`2026年10月23日時点の収集データ：${fmt(catalog.length)}問・${themes.length}テーマ・${fmt(new Set(catalog.map(p=>p.source)).size)}投稿。すべての投稿を網羅したものではありません。`;
    refresh();
  }catch{warn('問題リンクを読み込めませんでした。通信状態を確認して再読み込みしてください。学習記録は変更していません。');$('problemList').innerHTML='<div class="empty"><strong>リンク集を読み込めませんでした</strong><button class="btn" id="reload">再読み込み</button></div>';$('reload').onclick=()=>location.reload();$('startBtn').disabled=true;$('randomBtn').disabled=true;}
}
init();
