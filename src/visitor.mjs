// A random browser identifier, not a hardware ID or a fingerprint.
const KEY='calendar-visitor-v1';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function getVisitorId(storage=undefined,randomUUID=()=>crypto.randomUUID()){
  try{
    storage=storage||globalThis.localStorage;
    const saved=storage.getItem(KEY);
    if(UUID.test(saved||''))return saved;
    const id=randomUUID();
    storage.setItem(KEY,id);
    return storage.getItem(KEY)===id?id:null;
  }catch{return null;}
}
