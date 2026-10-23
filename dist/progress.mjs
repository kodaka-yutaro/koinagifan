export const VERSION = 1;
export const STORAGE_KEY = 'koinagifan.progress.v1';
export const LABELS = ['未挑戦', '練習中', '解けた', 'マスター'];
export function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function afterDays(days, date = new Date()) {
  const next = new Date(date); next.setDate(next.getDate()+days); return dayKey(next);
}
export function reviewAfterDays(value, now = new Date()) {
  const days = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value.trim()) : value;
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error('1〜365の整数で入力してください。');
  return afterDays(days, now);
}
export function emptyState() { return {version:VERSION, entries:{}, goal:5}; }
export function entry(state,id) {
  return state.entries[id] || {status:0, favorite:false, note:'', answer:'', nextReview:null, history:[], updatedAt:0};
}
export function isDue(record,today=dayKey()) { return !!record.nextReview && record.nextReview<=today; }
export function assess(record,status,now=new Date()) {
  const next = {...record, status, updatedAt:now.getTime()};
  if(status===0) { next.nextReview=null; return next; }
  const days=[0,1,3,14][status];
  next.nextReview=afterDays(days,now);
  next.history=[...record.history,{date:dayKey(now),status,at:now.getTime()}].slice(-100);
  return next;
}
export function validateBackup(input,knownIds) {
  if(!input || input.version!==VERSION || !input.entries || typeof input.entries!=='object' || Array.isArray(input.entries)) throw new Error('koinagifanのバックアップJSONを選んでください。');
  const out=emptyState(); let ignored=0;
  out.goal=Number.isInteger(input.goal) && input.goal>=1 && input.goal<=100 ? input.goal : 5;
  for(const [id,r] of Object.entries(input.entries)) {
    if(!knownIds.has(id)) {ignored++;continue;}
    if(!r || !Number.isInteger(r.status) || r.status<0 || r.status>3 || typeof r.updatedAt!=='number' || !Number.isFinite(r.updatedAt) || r.updatedAt<0 || r.updatedAt>Date.now()+86400000) throw new Error('記録の形式が正しくありません。取り込みは行いませんでした。');
    if(typeof r.note!=='string' || typeof r.answer!=='string' || r.note.length>20000 || r.answer.length>20000 || typeof r.favorite!=='boolean' || !Array.isArray(r.history) || r.history.length>100) throw new Error('メモまたは履歴の形式が正しくありません。');
    const validDay=s=>typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s;
    if(r.nextReview!==null && !validDay(r.nextReview)) throw new Error('復習日の形式が正しくありません。');
    const history=r.history.map(h=>{
      if(!h || !validDay(h.date) || !Number.isInteger(h.status) || h.status<1 || h.status>3 || !Number.isFinite(h.at) || h.at<0) throw new Error('学習履歴の形式が正しくありません。');
      return {date:h.date,status:h.status,at:h.at};
    });
    out.entries[id]={status:r.status,favorite:r.favorite,note:r.note,answer:r.answer,nextReview:r.nextReview,history,updatedAt:r.updatedAt};
  }
  return {state:out,ignored};
}
export function mergeState(current,incoming) {
  const out={...current,entries:{...current.entries}};
  for(const [id,r] of Object.entries(incoming.entries)) if(!out.entries[id] || r.updatedAt>out.entries[id].updatedAt) out.entries[id]=r;
  return out;
}
