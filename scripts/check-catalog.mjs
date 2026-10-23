import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {problems,complete}=JSON.parse(readFileSync('dist/catalog.json','utf8'));
assert.equal(complete,false);
assert.equal(new Set(problems.map(p=>p.id)).size,problems.length);
const allowed=new Set(['id','number','title','theme','source','date','relatedCount']);
for(const p of problems){
  assert.match(p.id,/^NAG-\d{6}$/);assert.equal(p.id,`NAG-${String(p.number).padStart(6,'0')}`);
  assert.match(p.source,/^https:\/\/x\.com\/naginyan135\/status\/\d+$/);
  assert.ok(p.title&&p.theme);assert.equal(new Date(p.date).toISOString().slice(0,10),p.date);
  assert.ok(Object.keys(p).every(k=>allowed.has(k)),'Do not publish images or tweet bodies');
  assert.equal(problems.filter(q=>q.source===p.source).length,p.relatedCount);
}
console.log(`Catalog verified: ${problems.length} records, ${new Set(problems.map(p=>p.source)).size} post links.`);
