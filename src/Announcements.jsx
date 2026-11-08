import React,{useEffect,useState} from 'react';
import {Bell} from 'lucide-react';
import {sb,result} from './api';
import {addDays,moscowDate} from './dates.mjs';
import {devicePushBody,pushRequest} from './push-client.mjs';

const kinds={arrival:'Поступление товара',tasting:'Дегустация',closure:'Временно закрылись',delay:'Открытие задерживается',reopen:'Снова открылись',hours:'Изменение графика',cancel:'Отмена дегустации',free:'Свободное сообщение'};
const urgent=['closure','delay','hours'];
const blank=(kind='arrival',related=null)=>({id:crypto.randomUUID(),kind,related,products:'',date:moscowDate(),from:'',to:'',reason:'',electricity:false,first:false,title:null,text:null});
const dateLabel=date=>date?new Date(date+'T12:00:00+03:00').toLocaleDateString('ru-RU',{day:'numeric',month:'long',timeZone:'Europe/Moscow'}):'';
const moscowTime=(date,time)=>date+'T'+time+':00+03:00';
async function readAnnouncements(){return result(sb.from('announcements').select('*').order('created_at',{ascending:false}).limit(50));}
async function adminRequest(action,data){
  const {data:{session}}=await sb.auth.getSession();
  if(!session)throw Error('Войдите в админку снова.');
  return pushRequest(action,data,session.access_token);
}

export function BuyerAnnouncements({home,messages}){
  const [rows,setRows]=useState([]),[error,setError]=useState(false),[now,setNow]=useState(Date.now());
  const target=location.hash.split('/')[1];
  useEffect(()=>{
    let active=true;
    async function refresh(){
      setNow(Date.now());
      try{const data=await readAnnouncements();if(active){setRows(data);setError(false);}}
      catch{if(active)setError(true);}
    }
    refresh();
    const timer=setInterval(refresh,30000);
    window.addEventListener('focus',refresh);
    return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',refresh);};
  },[]);
  useEffect(()=>{if(messages&&target)document.getElementById('message-'+target)?.scrollIntoView({block:'start'});},[messages,target,rows]);
  if(messages)return <section className="announcements"><h1>Сообщения</h1>{error&&<p>Не удалось обновить сообщения.</p>}{!error&&!rows.length&&<p>Здесь появятся объявления магазина.</p>}{rows.map(row=><article className="announcement-card" id={'message-'+row.id} key={row.id}><b>{row.title}</b><small>{new Date(row.created_at).toLocaleString('ru-RU',{timeZone:'Europe/Moscow',dateStyle:'short',timeStyle:'short'})}{row.replaced_at?' · Обновлено':''}</small><p>{row.body}</p></article>)}</section>;
  if(!home)return null;
  const active=rows.filter(row=>!row.replaced_at&&(Date.parse(row.pin_until)>now||(row.pin_until===null&&['closure','delay'].includes(row.kind))));
  const pinned=active.find(row=>urgent.includes(row.kind))||active.find(row=>row.kind==='reopen')||active[0];
  return <section className="announcements"><a className="announcement-inbox" href="#messages"><Bell size={17}/> Сообщения</a>{pinned&&<a className={`announcement-card announcement-pin ${pinned.kind}`} href={'#messages/'+pinned.id}><b>{pinned.title}</b><p>{pinned.body}</p><small>Подробнее →</small></a>}</section>;
}

function draftText(d){
  const date=dateLabel(d.date),time=d.from&&d.to?d.from+'–'+d.to:d.to;
  switch(d.kind){
    case 'arrival':return [d.first?'Впервые в продаже':'Снова в наличии',d.products.trim()];
    case 'tasting':return ['Дегустация'+(d.products?' · '+d.products:''),[date,time].filter(Boolean).join(' · ')];
    case 'cancel':return ['Дегустация отменена',d.products||'Запланированная дегустация отменена.'];
    case 'closure':case 'delay':return [d.kind==='closure'?'Магазин временно закрыт':'Открытие задерживается',[d.electricity?'Отключили электричество.':d.reason,d.to?'Ориентир открытия — '+d.to+'.':'Сообщим, когда откроемся.'].filter(Boolean).join(' ')];
    case 'reopen':return ['Мы снова открыты!',(d.electricity?'Электричество восстановили. ':'')+(d.to?'Работаем до '+d.to+'.':'Магазин работает в обычном режиме.')];
    case 'hours':return ['Изменение графика',[date,time].filter(Boolean).join(' · ')];
    default:return ['',''];
  }
}
function pinUntil(d){
  if(d.kind==='arrival')return moscowTime(addDays(moscowDate(),2),'00:00');
  if(d.kind==='reopen')return moscowTime(addDays(moscowDate(),1),'00:00');
  if(['tasting','hours'].includes(d.kind))return d.to?moscowTime(d.date,d.to):moscowTime(addDays(d.date,1),'00:00');
  return null;
}
export function AdminAnnouncements(){
  const [d,setDraft]=useState(()=>blank()),[rows,setRows]=useState([]),[status,setStatus]=useState(null),[history,setHistory]=useState(false),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  const set=(key,value)=>setDraft(old=>({...old,[key]:value}));
  const [autoTitle,autoText]=draftText(d),title=d.title??autoTitle,text=d.text??autoText;
  async function refresh(){const [announcements,report]=await Promise.all([readAnnouncements(),adminRequest('announcement-status')]);setRows(announcements);setStatus(report);}
  useEffect(()=>{refresh().catch(e=>setError(e.message));const timer=setInterval(()=>refresh().catch(()=>{}),10000);return()=>clearInterval(timer);},[]);
  function follow(row,kind){setDraft({...blank(kind,row.id),electricity:/электричеств/i.test(row.body),products:row.kind==='tasting'?row.title.split(' · ')[1]||'':''});setHistory(false);}
  async function act(mode){
    setBusy(true);setError('');setMessage('');
    try{
      const payload={id:d.id,kind:d.kind,title,text,pinUntil:pinUntil(d),related:d.related};
      if(mode==='test'){
        const device=await devicePushBody();
        if(!device)throw Error('Сначала включите push на этом устройстве.');
        await adminRequest('announcement-test',{...device,title,text});
        setMessage('Тест принят push-сервисом.');
      }else{
        await adminRequest('announcement-publish',{...payload,push:mode==='push'});
        setConfirm(false);setDraft(blank());setHistory(true);setMessage('Объявление опубликовано.');
        await refresh();
      }
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }
  const valid=title.trim()&&title.length<=80&&text.trim()&&text.length<=280&&(!['tasting','hours'].includes(d.kind)||(d.date&&d.from&&d.to&&d.from<d.to&&Date.parse(pinUntil(d))>Date.now()));
  return <section className="announcements announcement-admin"><h2>Уведомления</h2>
    <div className="announcement-actions"><button className={!history?'primary':''} onClick={()=>setHistory(false)}>Создать</button><button className={history?'primary':''} onClick={()=>setHistory(true)}>История</button></div>
    {error&&<p className="error" role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
    {history?rows.map(row=>{
      const campaign=status?.campaigns?.find(item=>item.announcement_id===row.id);
      return <article className="announcement-card" key={row.id}><b>{row.title}</b><p>{row.body}</p>{campaign&&<small>Принято push-сервисами: {campaign.push_deliveries.filter(item=>item.state==='sent').length} из {campaign.total}</small>}
        {!row.replaced_at&&<div className="announcement-actions">
          {['closure','delay'].includes(row.kind)&&<><button onClick={()=>follow(row,'reopen')}>Сообщить об открытии</button><button onClick={()=>follow(row,'delay')}>Задержать открытие</button></>}
          {row.kind==='tasting'&&<><button onClick={()=>follow(row,'tasting')}>Перенести</button><button onClick={()=>follow(row,'cancel')}>Отменить</button></>}
        </div>}
      </article>;
    }):<><label>Повод<select value={d.kind} onChange={e=>setDraft(blank(e.target.value))}>{Object.entries(kinds).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    {['arrival','tasting','cancel'].includes(d.kind)&&<label>Товары<textarea value={d.products} onChange={e=>set('products',e.target.value)} placeholder="Введите названия товаров"/></label>}
    {d.kind==='arrival'&&<label>Тип поступления<select value={d.first?'first':'back'} onChange={e=>set('first',e.target.value==='first')}><option value="back">Снова в наличии</option><option value="first">Впервые в продаже</option></select></label>}
    {['tasting','hours'].includes(d.kind)&&<><label>Дата<input type="date" value={d.date} onChange={e=>set('date',e.target.value)}/></label><label>Начало<input type="time" value={d.from} onChange={e=>set('from',e.target.value)}/></label></>}
    {['closure','delay','reopen'].includes(d.kind)&&<label>Причина<select value={d.electricity?'power':'other'} onChange={e=>set('electricity',e.target.value==='power')}><option value="other">Другая</option><option value="power">Отключение электричества</option></select></label>}
    {['closure','delay'].includes(d.kind)&&!d.electricity&&<label>Уточнение<input value={d.reason} onChange={e=>set('reason',e.target.value)}/></label>}
    {['tasting','hours','closure','delay','reopen'].includes(d.kind)&&<label>{['closure','delay'].includes(d.kind)?'Ориентир открытия':d.kind==='reopen'?'Работаем до':'Окончание'}<input type="time" value={d.to} onChange={e=>set('to',e.target.value)}/></label>}
    <h3>Предпросмотр</h3><label>Заголовок<input maxLength={80} value={title} onChange={e=>set('title',e.target.value)}/></label><label>Текст<textarea maxLength={280} value={text} onChange={e=>set('text',e.target.value)}/></label>
    <div className="announcement-actions"><button disabled={!valid||busy} onClick={()=>act('test')}>Отправить тест</button><button disabled={!valid||busy} onClick={()=>act('publish')}>Опубликовать в приложении</button><button className="primary" disabled={!valid||busy||!status?.subscribers} onClick={()=>setConfirm(true)}>Опубликовать и отправить push</button></div>
    {confirm&&<div className="overlay"><section className="modal" role="dialog" aria-modal="true" aria-label="Подтверждение рассылки"><h2>Отправить подписчикам?</h2><div className="announcement-card"><b>{title}</b><p>{text}</p></div><p>Активных подписок: {status.subscribers}.</p><div className="announcement-actions"><button disabled={busy} onClick={()=>setConfirm(false)}>Назад</button><button className="primary" disabled={busy} onClick={()=>act('push')}>Подтвердить</button></div></section></div>}</>}
  </section>;
}
