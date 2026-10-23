import test from 'node:test';
import assert from 'node:assert/strict';
import {dayKey,assess,entry,emptyState,isDue,validateBackup,mergeState} from '../dist/progress.mjs';
test('self assessment schedules review across month boundaries and keeps notes',()=>{
  const date=new Date(2026,0,30,23,30);const r={...entry(emptyState(),'NAG-000001'),note:'合駒に注意'};
  const solved=assess(r,2,date);assert.equal(solved.nextReview,'2026-02-02');assert.equal(solved.note,r.note);
  assert.equal(solved.history[0].date,'2026-01-30');assert.equal(isDue(solved,'2026-02-01'),false);assert.equal(isDue(solved,'2026-02-02'),true);
  const reset=assess(solved,0,date);assert.equal(reset.nextReview,null);assert.equal(reset.history.length,1);
});
test('backup roundtrip preserves all user records and imports only known IDs',()=>{
  const state=emptyState();state.entries['NAG-000001']={...assess(entry(state,'NAG-000001'),3,new Date(2026,0,1)),note:'<script>text only</script>',favorite:true,answer:'７一銀'};
  state.entries.unknown={status:9};const {state:parsed,ignored}=validateBackup(JSON.parse(JSON.stringify(state)),new Set(['NAG-000001']));
  assert.equal(ignored,1);assert.deepEqual(parsed.entries['NAG-000001'],state.entries['NAG-000001']);
});
test('malformed import is rejected without changing existing state',()=>{
  const input={version:1,entries:{'NAG-000001':{...entry(emptyState(),'NAG-000001'),status:5}}};
  const before=JSON.stringify(input);assert.throws(()=>validateBackup(input,new Set(['NAG-000001'])));assert.equal(JSON.stringify(input),before);
  input.entries['NAG-000001'].status=1;input.entries['NAG-000001'].nextReview='2026-02-31';assert.throws(()=>validateBackup(input,new Set(['NAG-000001'])));
  assert.throws(()=>validateBackup({version:99,entries:{}},new Set()));
});
test('merge protects newer edits and combines independent records',()=>{
  const a=emptyState(),b=emptyState();a.entries.A={...entry(a,'A'),updatedAt:100,note:'new'};b.entries.A={...entry(b,'A'),updatedAt:50,note:'old'};b.entries.B={...entry(b,'B'),updatedAt:60};
  const merged=mergeState(a,b);assert.equal(merged.entries.A.note,'new');assert.ok(merged.entries.B);assert.equal(a.entries.B,undefined);
});
test('repeated ratings retain a bounded history and local calendar day',()=>{
  let r=entry(emptyState(),'A');for(let i=0;i<105;i++)r=assess(r,1,new Date(2026,0,1,0,5));
  assert.equal(r.history.length,100);assert.equal(dayKey(new Date(2026,0,1,0,5)),'2026-01-01');
});
