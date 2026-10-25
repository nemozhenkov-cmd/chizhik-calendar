// These checks do not create a subscription or send a real notification.
import assert from 'node:assert/strict';
import {SUPABASE_URL,SUPABASE_KEY,EDGE_ANON_JWT} from '../src/config.js';
const headers={apikey:SUPABASE_KEY,Authorization:`Bearer ${EDGE_ANON_JWT}`,'Content-Type':'application/json',Origin:'https://nemozhenkov-cmd.github.io'};
async function post(body,extra={}){const r=await fetch(SUPABASE_URL+'/functions/v1/calendar-push',{method:'POST',headers:{...headers,...extra},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});return {status:r.status,data:await r.json()};}
const cfg=await post({action:'config'});assert.equal(cfg.status,200);assert.match(cfg.data.publicKey,/^[A-Za-z0-9_-]{87}$/);assert.deepEqual(Object.keys(cfg.data),['publicKey']);
for(const action of ['broadcast','admin-status']){const r=await post({action,period_id:'00000000-0000-4000-8000-000000000000'});assert.equal(r.status,403);}
assert.equal((await post({action:'worker'})).status,401);
assert.equal((await post({action:'subscribe',subscription:{endpoint:'https://127.0.0.1/'},device_token:'x'})).status,400);
assert.equal((await post({action:'config'},{Origin:'https://evil.invalid'})).status,403);
for(const table of ['push_config','push_subscriptions','push_broadcasts','push_deliveries']){const r=await fetch(SUPABASE_URL+'/rest/v1/'+table+'?select=*',{headers});assert.ok([401,403].includes(r.status),`${table} must be private`);}
console.log('PASS: public VAPID key only; anonymous broadcasts/worker/private table reads rejected; invalid subscriptions and foreign origins rejected. No real notification sent.');
