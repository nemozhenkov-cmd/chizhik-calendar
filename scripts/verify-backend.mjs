// Read-only/denied-write smoke checks against the configured new project.
import assert from 'node:assert/strict';
import {SUPABASE_URL,SUPABASE_KEY,EDGE_ANON_JWT} from '../src/config.js';
const headers={apikey:SUPABASE_KEY,Authorization:`Bearer ${EDGE_ANON_JWT}`,'Content-Type':'application/json'};
async function request(path,options={}){const r=await fetch(SUPABASE_URL+path,{...options,headers:{...headers,...options.headers}});return {status:r.status,body:await r.text()};}
const calendar=await request('/rest/v1/periods?select=*,offers(*)');assert.equal(calendar.status,200);assert.ok(Array.isArray(JSON.parse(calendar.body)));
for(const table of ['admins','visits']){const r=await request(`/rest/v1/${table}?select=*`);assert.ok([401,403].includes(r.status),`${table} must be private`);}
const denied=await request('/rest/v1/periods',{method:'POST',body:JSON.stringify({title:'DENIED SECURITY TEST',starts_on:'2099-01-01',ends_on:'2099-01-02'})});assert.ok([401,403].includes(denied.status),'anonymous write must fail');
const rpc=await request('/rest/v1/rpc/publish_period',{method:'POST',body:JSON.stringify({p_id:'00000000-0000-4000-8000-000000000000',p_publish:true})});assert.ok([401,403].includes(rpc.status));
const origin=await request('/functions/v1/visit',{method:'POST',headers:{Origin:'https://untrusted.invalid'},body:'{}'});assert.equal(origin.status,403);
const bad=await request('/functions/v1/visit',{method:'POST',headers:{Origin:'https://nemozhenkov-cmd.github.io'},body:'{"session_id":"invalid"}'});assert.equal(bad.status,400);
console.log('PASS: public calendar reads; anonymous admin/stats reads, writes and publishing denied; foreign origins and invalid visits rejected.');
