// Published calendar reads must not wait for an administrator's auth refresh.
export async function fetchPublishedCalendar(url,key,anonToken,{signal,fetchImpl=fetch,timeoutMs=15000}={}){
 const endpoint=new URL('/rest/v1/periods',url);endpoint.search=new URLSearchParams({select:'*,offers(*)',published:'eq.true',order:'starts_on.desc'});
 for(let attempt=0;attempt<2;attempt++){
  if(signal?.aborted)throw signal.reason||new DOMException('Aborted','AbortError');
  const controller=new AbortController(),abort=()=>controller.abort(signal.reason);signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(()=>controller.abort(new DOMException('Timeout','TimeoutError')),timeoutMs);
  try{const r=await fetchImpl(endpoint,{headers:{apikey:key,Authorization:`Bearer ${anonToken}`},signal:controller.signal,cache:'no-store'});if(!r.ok){const e=new Error(`Calendar HTTP ${r.status}`);e.status=r.status;throw e;}const data=await r.json();if(!Array.isArray(data)||data.some(p=>!p||!Array.isArray(p.offers)))throw new Error('Invalid calendar response');return data;
  }catch(e){if(signal?.aborted)throw signal.reason||e;const retryable=!e.status||e.status===429||e.status>=500;if(attempt===1||!retryable)throw e;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
 }
}
