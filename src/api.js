import {createClient} from '@supabase/supabase-js';
import {SUPABASE_URL,SUPABASE_KEY,EDGE_ANON_JWT} from './config';
import {fetchPublishedCalendar} from './calendar-client.mjs';
export const sb=createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{storageKey:'chizhik-calendar-auth'}});
export const imageUrl=path=>path?.startsWith('brand/')?`./${path}`:path?`${SUPABASE_URL}/storage/v1/object/public/products/${encodeURIComponent(path).replaceAll('%2F','/')}`:'';
export async function result(q){const {data,error}=await q;if(error)throw error;return data;}
export async function withTimeout(p,ms=10000){let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Нет ответа от сервера. Проверьте подключение и повторите.')),ms);})]);}finally{clearTimeout(timer);}}
export async function publicCalendar(signal){return fetchPublishedCalendar(SUPABASE_URL,SUPABASE_KEY,EDGE_ANON_JWT,{signal});}
export async function uploadImage(file){if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Выберите JPG, PNG или WebP');if(file.size>15*1024*1024)throw Error('Фото должно быть меньше 15 МБ');const bitmap=await createImageBitmap(file);const canvas=document.createElement('canvas');const factor=Math.min(1,1000/Math.max(bitmap.width,bitmap.height));canvas.width=Math.round(bitmap.width*factor);canvas.height=Math.round(bitmap.height*factor);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.9));if(!blob)throw Error('Не удалось обработать фото');const path=`${crypto.randomUUID()}.webp`;await result(sb.storage.from('products').upload(path,blob,{contentType:'image/webp',upsert:false}));return path;}
