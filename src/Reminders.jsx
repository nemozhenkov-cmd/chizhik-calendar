import React,{useEffect,useRef,useState} from 'react';
import {Bell,Check} from 'lucide-react';
import {addDays,longDate} from './dates.mjs';
import {browserCapabilities,enablePush,devicePushBody,pushRequest} from './push-client.mjs';
import {reminderDue} from '../supabase/functions/calendar-push/policy.mjs';
export function useReminders(){const [ids,setIds]=useState([]),[busy,setBusy]=useState(''),[message,setMessage]=useState('');const lock=useRef(false),revision=useRef(0);
useEffect(()=>{let live=true;const rev=revision.current;(async()=>{try{const body=await devicePushBody();if(!body)return;const d=await pushRequest('reminders',body);if(live&&revision.current===rev)setIds(d.offer_ids||[]);}catch{}})();return()=>{live=false;};},[]);
function applyResult(offer,result){setIds(old=>result.enabled?[...new Set([...old,offer.id])]:old.filter(id=>id!==offer.id));setMessage(result.already_sent?'Напоминание уже отправлено.':result.enabled?'Напомним накануне в 18:30 по Москве.':'Напоминание отменено.');}
async function toggle(offer){if(lock.current)return;lock.current=true;revision.current++;setBusy(offer.id);setMessage('');try{const active=ids.includes(offer.id);const caps=browserCapabilities();if(caps.needsInstall)throw Error('На iPhone сначала добавьте приложение на экран «Домой» и откройте его оттуда.');if(!caps.supported)throw Error('Этот браузер не поддерживает уведомления. Откройте приложение в браузере с поддержкой push.');
// Reuse an already connected device: saving a reminder needs just one server request.
let body=Notification.permission==='granted'?await devicePushBody():null;
if(body){try{const result=await pushRequest('reminder',{...body,offer_id:offer.id,enabled:!active});applyResult(offer,result);return;}catch(e){if(e.status!==403||active)throw e;}}
if(active){setIds([]);setMessage('Уведомления на этом устройстве отключены.');return;}
// Permission remains in the original click gesture when this is a new device.
const connection=await enablePush();if(!connection.subscribed)throw Error('Разрешите уведомления в настройках браузера, чтобы получать напоминания.');body=await devicePushBody();if(!body)throw Error('Не удалось подключить уведомления.');const result=await pushRequest('reminder',{...body,offer_id:offer.id,enabled:true});applyResult(offer,result);
}catch(e){setMessage(e.message||'Не удалось сохранить напоминание. Повторите при подключении к интернету.');}finally{lock.current=false;setBusy('');}}
return {ids,busy,message,toggle,dismiss:()=>setMessage('')};}
export default function ReminderButton({offer,controller}){const active=controller.ids.includes(offer.id);if(!active&&Date.now()>=reminderDue(offer.sale_date))return null;return <button className={`reminder-button ${active?'reminder-active':''}`} aria-pressed={active} aria-label={`${active?'Отменить напоминание':'Напомнить'}: ${offer.name}`} disabled={!!controller.busy} onClick={()=>controller.toggle(offer)}>{active?<Check size={19}/>:<Bell size={19}/>}<span><b>{controller.busy===offer.id?'Сохраняем…':active?'Напоминание включено':'Напомнить об акции'}</b>{active&&<small>{longDate(addDays(offer.sale_date,-1))}, 18:30 МСК</small>}</span></button>;}
