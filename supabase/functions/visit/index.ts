import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
const allowed=new Set(['https://nemozhenkov-cmd.github.io','http://localhost:5173','http://localhost:4173','http://127.0.0.1:4173']);
Deno.serve(async(req:Request)=>{
const origin=req.headers.get('origin')||'';
if(!allowed.has(origin))return new Response('Forbidden',{status:403});
const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'};
if(req.method==='OPTIONS')return new Response('ok',{headers});
if(req.method!=='POST')return new Response('Method not allowed',{status:405,headers});
try{
if(Number(req.headers.get('content-length'))>512)return new Response('Too large',{status:413,headers});
const raw=await req.text();if(raw.length>512)return new Response('Too large',{status:413,headers});
const {session_id}=JSON.parse(raw);if(typeof session_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(session_id))return new Response('Invalid session',{status:400,headers});
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
async function hash(value:string){return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)))).map(b=>b.toString(16).padStart(2,'0')).join('');}
const ip=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
const sb=createClient(Deno.env.get('SUPABASE_URL')!,secret,{auth:{persistSession:false}});
const {error}=await sb.rpc('register_visit',{p_key:await hash('visit:'+day+':'+session_id),p_ip:await hash('rate:'+day+':'+ip)});
if(error)return new Response('Unavailable',{status:503,headers});
return new Response(null,{status:204,headers});
}catch{return new Response('Invalid request',{status:400,headers});}
});
