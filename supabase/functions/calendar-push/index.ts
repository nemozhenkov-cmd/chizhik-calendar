import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import webpush from 'npm:web-push@3.6.7';
import {APP_URL,allowedOrigins,validSubscription,validDeviceToken,pushPayload,deliveryOutcome} from './policy.mjs';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
function checked(r:any){if(r.error)throw new Error('Database operation failed');return r.data;}
async function config(){let row=checked(await db.from('push_config').select('*').eq('id',1).single());if(!row.public_key){const pair=webpush.generateVAPIDKeys();checked(await db.from('push_config').update({public_key:pair.publicKey,private_key:pair.privateKey}).eq('id',1).is('public_key',null));row=checked(await db.from('push_config').select('*').eq('id',1).single());}return row;}
async function hash(text:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(x=>x.toString(16).padStart(2,'0')).join('');}
async function admin(req:Request){const token=(req.headers.get('x-admin-token')||'').replace(/^Bearer /,'');const {data:{user},error}=await db.auth.getUser(token);if(error||!user)return null;const row=checked(await db.from('admins').select('user_id').eq('user_id',user.id).maybeSingle());return row?user:null;}
async function deliver(row:any,cfg:any){let status=0;try{if(!validSubscription(row))status=410;else{const details=webpush.generateRequestDetails({endpoint:row.endpoint,keys:row.keys},JSON.stringify(pushPayload(row)),{TTL:86400,urgency:'normal',vapidDetails:{subject:APP_URL,publicKey:cfg.public_key,privateKey:cfg.private_key}});const r=await fetch(details.endpoint,{method:details.method,headers:details.headers,body:details.body,redirect:'error',signal:AbortSignal.timeout(10000)});status=r.status;await r.body?.cancel();}}catch{}
const current=checked(await db.from('push_deliveries').select('attempts').eq('id',row.delivery_id).single());const state=deliveryOutcome(status,current.attempts);checked(await db.from('push_deliveries').update({state,lease_until:new Date(Date.now()+60000).toISOString(),last_error:state==='sent'?null:`push_status_${status}`}).eq('id',row.delivery_id));if(state==='expired')checked(await db.from('push_subscriptions').delete().eq('id',row.subscription_id));}
async function deliverReminder(row:any,cfg:any){
// Recheck cancellation, publication and current offer data immediately before sending.
const reminder=checked(await db.from('push_reminders').select('state,attempts').eq('id',row.reminder_id).maybeSingle());if(!reminder||reminder.state!=='sending'||reminder.attempts!==row.attempts)return;
const offer=checked(await db.from('offers').select('*,periods!inner(published)').eq('id',row.offer_id).maybeSingle());
const tomorrow=new Date(Date.now()+3*3600000+86400000).toISOString().slice(0,10);
if(!offer||!offer.periods.published||offer.sale_date!==tomorrow){checked(await db.from('push_reminders').update({state:'expired',last_error:'offer_changed'}).eq('id',row.reminder_id).eq('state','sending'));return;}
let status=0;try{if(!validSubscription(row))status=410;else{const expires=Date.parse(offer.sale_date+'T00:00:00+03:00');const ttl=Math.max(0,Math.min(19800,Math.floor((expires-Date.now())/1000)));const details=webpush.generateRequestDetails({endpoint:row.endpoint,keys:row.keys},JSON.stringify(pushPayload({...row,...offer,offer_id:offer.id})),{TTL:ttl,urgency:'normal',vapidDetails:{subject:APP_URL,publicKey:cfg.public_key,privateKey:cfg.private_key}});const r=await fetch(details.endpoint,{method:details.method,headers:details.headers,body:details.body,redirect:'error',signal:AbortSignal.timeout(10000)});status=r.status;await r.body?.cancel();}}catch{}
const state=deliveryOutcome(status,row.attempts);checked(await db.from('push_reminders').update({state,lease_until:new Date(Date.now()+60000).toISOString(),last_error:state==='sent'?null:`push_status_${status}`}).eq('id',row.reminder_id).eq('state','sending').eq('attempts',row.attempts));if(state==='expired')checked(await db.from('push_subscriptions').delete().eq('id',row.subscription_id));
}
async function worker(){const cfg=await config(),deadline=Date.now()+45000;for(let batch=0;batch<4&&Date.now()<deadline;batch++){const reminders=checked(await db.rpc('push_claim_reminders',{p_limit:12}));const broadcasts=checked(await db.rpc('push_claim',{p_limit:12}));const jobs=[...reminders,...broadcasts];if(!jobs.length)break;for(let i=0;i<jobs.length;i+=6)await Promise.all(jobs.slice(i,i+6).map((row:any)=>(row.reminder_id?deliverReminder(row,cfg):deliver(row,cfg)).catch(()=>{})));}}
async function summary(periodId:string){const count=await db.from('push_subscriptions').select('id',{count:'exact',head:true});if(count.error)throw count.error;const b=checked(await db.from('push_broadcasts').select('id,total,created_at').eq('period_id',periodId).maybeSingle());if(!b)return {subscribers:count.count||0,broadcast:null};const counts:Record<string,number>={};for(const state of ['sent','failed','expired','pending','sending']){const r=await db.from('push_deliveries').select('id',{count:'exact',head:true}).eq('broadcast_id',b.id).eq('state',state);if(r.error)throw r.error;counts[state]=r.count||0;}return {subscribers:count.count||0,broadcast:{...b,...counts}};}
Deno.serve(async req=>{
const origin=req.headers.get('origin')||'';const cors={'Access-Control-Allow-Origin':allowedOrigins.has(origin)?origin:new URL(APP_URL).origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info,x-worker-token,x-admin-token','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin','Cache-Control':'no-store','Content-Type':'application/json'};
const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers:cors});
if(req.method==='OPTIONS')return allowedOrigins.has(origin)?new Response('ok',{headers:cors}):reply(403,{error:'Forbidden'});
if(req.method!=='POST')return reply(405,{error:'Method not allowed'});
try{if(Number(req.headers.get('content-length')||0)>8192)return reply(413,{error:'Request too large'});const raw=await req.text();if(raw.length>8192)return reply(413,{error:'Request too large'});const body=JSON.parse(raw||'{}');
if(body.action==='worker'){const cfg=await config();if(req.headers.get('x-worker-token')!==cfg.worker_token)return reply(401,{error:'Unauthorized'});await worker();return reply(200,{ok:true});}
if(!allowedOrigins.has(origin))return reply(403,{error:'Forbidden'});
if(body.action==='config'){const cfg=await config();return reply(200,{publicKey:cfg.public_key});}
if(['subscribe','status','unsubscribe','reminders','reminder'].includes(body.action)){
 if(!validSubscription(body.subscription)||!validDeviceToken(body.device_token))return reply(400,{error:'Некорректная подписка устройства.'});
 const token=await hash(body.device_token),s=body.subscription;
 if(body.action==='subscribe'){const ip=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';const date=new Date().toISOString().slice(0,10);const cfg=await config();const ipHash=await hash(cfg.worker_token+date+ip);const r=await db.rpc('push_register',{p_endpoint:s.endpoint,p_keys:s.keys,p_token:token,p_ip:ipHash});if(r.error)return reply(429,{error:'Не удалось сохранить подписку. Попробуйте позже.'});if(!r.data)return reply(409,{error:'Пересоздайте подписку на этом устройстве.'});return reply(200,{subscribed:true});}
 const owned=checked(await db.from('push_subscriptions').select('id').eq('endpoint',s.endpoint).eq('token_hash',token).maybeSingle());
 if(body.action==='status')return reply(200,{subscribed:!!owned});
 if(body.action==='reminders'||body.action==='reminder'){
 if(!owned)return reply(403,{error:'Включите уведомления на этом устройстве.'});
 if(body.action==='reminders'){const rows=checked(await db.from('push_reminders').select('offer_id').eq('subscription_id',owned.id).in('state',['pending','sending']).limit(100));return reply(200,{offer_ids:rows.map((r:any)=>r.offer_id)});}
 if(typeof body.offer_id!=='string'||!/^[0-9a-f-]{36}$/i.test(body.offer_id)||typeof body.enabled!=='boolean')return reply(400,{error:'Выберите товар.'});
 if(!body.enabled){const prior=checked(await db.from('push_reminders').select('state').eq('subscription_id',owned.id).eq('offer_id',body.offer_id).maybeSingle());if(prior?.state==='sent')return reply(200,{enabled:false,already_sent:true});}
 const r=await db.rpc('push_set_reminder',{p_subscription:owned.id,p_offer:body.offer_id,p_enabled:body.enabled});
 if(r.error)return reply(400,{error:'Напоминание можно поставить только на опубликованный товар до 18:30 МСК накануне скидки. Не более 100 активных напоминаний.'});
 return reply(200,{enabled:r.data===true});
 }
 if(owned)checked(await db.from('push_subscriptions').delete().eq('id',owned.id));return reply(200,{subscribed:false});
}
if(body.action==='broadcast'||body.action==='admin-status'){
 const user=await admin(req);if(!user)return reply(403,{error:'Доступ только администратору.'});
 if(typeof body.period_id!=='string'||!/^[0-9a-f-]{36}$/i.test(body.period_id))return reply(400,{error:'Выберите период.'});
 if(body.action==='admin-status')return reply(200,await summary(body.period_id));
 const enqueue=await db.rpc('push_enqueue',{p_period:body.period_id,p_actor:user.id});if(enqueue.error)return reply(400,{error:'Сначала опубликуйте календарь с товарами.'});
 // Persist the queue before responding; the scheduled worker resumes even if this tab closes.
 EdgeRuntime.waitUntil(worker().catch(()=>{}));return reply(200,{...await summary(body.period_id),queued:true});
}
return reply(400,{error:'Unknown action'});
}catch{return reply(503,{error:'Уведомления временно недоступны. Попробуйте позже.'});}
});
