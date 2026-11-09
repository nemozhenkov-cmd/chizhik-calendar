import React,{useEffect,useState} from 'react';
import {sb,result} from './api';

const table=()=>sb.from('new_collection_schedules');
const local=value=>value?new Date(Date.parse(value)+3*3600000).toISOString().slice(0,16):'';
const moscow=value=>value?new Date(value+':00+03:00').toISOString():null;

export default function NewCollectionSchedule({collection,hasItems}){
  const [schedule,setSchedule]=useState(null),[publish,setPublish]=useState(''),[push,setPush]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function load(){
    const row=await result(table().select('*').eq('collection_id',collection.id).maybeSingle());
    setSchedule(row);setPublish(local(row?.publish_at));setPush(local(row?.push_at));
  }
  useEffect(()=>{load().catch(e=>setError(e.message));},[]);
  async function act(event,cancel=false){
    event.preventDefault();setBusy(true);setError('');
    try{
      if(cancel){
        let operation=schedule.published_at?table().update({push_at:null}):table().delete();
        await result(operation.eq('collection_id',collection.id).is('queued_at',null).select('collection_id').single());
      }else{
        const publishAt=schedule?.published_at?schedule.publish_at:moscow(publish),pushAt=moscow(push);
        if(!publishAt||(!schedule?.published_at&&Date.parse(publishAt)<=Date.now())||(pushAt&&(pushAt<publishAt||Date.parse(pushAt)<=Date.now())))throw Error('Проверьте время публикации и отправки по Москве.');
        if(schedule){
          await result(table().update({publish_at:publishAt,push_at:pushAt,error:null}).eq('collection_id',collection.id).is('queued_at',null).select('collection_id').single());
        }else{
          const {data:{user}}=await sb.auth.getUser();
          if(!user)throw Error('Войдите в админку снова.');
          await result(table().insert({collection_id:collection.id,created_by:user.id,publish_at:publishAt,push_at:pushAt}));
        }
      }
      await load();
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }
  return <details className="admin-push"><summary>Расписание публикации и push</summary>
    {schedule?.error&&<p className="error">{schedule.error}</p>}
    {schedule?.queued_at?<p role="status">Рассылка поставлена в очередь.</p>:<form onSubmit={act}>
      <label>Публикация · МСК<input type="datetime-local" required value={publish} disabled={!!schedule?.published_at} onChange={e=>setPublish(e.target.value)}/></label>
      <label>Отправка push · МСК (необязательно)<input type="datetime-local" value={push} onChange={e=>setPush(e.target.value)}/></label>
      <button className="primary" disabled={busy||!hasItems}>{schedule?'Сохранить время':'Запланировать'}</button>
      {schedule&&(!schedule.published_at||schedule.push_at)&&<button className="secondary" type="button" disabled={busy} onClick={e=>act(e,true)}>{schedule.published_at?'Отменить отправку':'Отменить расписание'}</button>}
    </form>}
    {error&&<p role="alert" className="error">{error}</p>}
  </details>;
}
