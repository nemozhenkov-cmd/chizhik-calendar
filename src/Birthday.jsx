import React,{useRef,useState} from 'react';
import './birthday.css';

export const birthdayPreviews={
  eve:'13 декабря · Чижик с шариками',
  day:'14 декабря · праздничная главная',
  banner:'14 декабря · баннер при входе'
};
const seenKey='chizhik-birthday-2026-seen';
export function birthdayForDate(date){
  if(date==='2026-12-13')return 'eve';
  if(date==='2026-12-14')return 'day';
  return null;
}
export function birthdayPreviewMode(){
  const mode=new URLSearchParams(location.search).get('birthday');
  return Object.hasOwn(birthdayPreviews,mode)?mode:null;
}
export function BirthdayPreviewLinks(){
  return <div className="birthday-preview-links">
    {Object.entries(birthdayPreviews).map(([mode,label])=><a key={mode} className="secondary"
      href={`?admin=1&preview=1&birthday=${mode}#today`} target="_blank" rel="noopener">{label} ↗</a>)}
  </div>;
}
export function BirthdayScene({day}){
  const artwork=day?'birthday-day':'birthday-eve';
  const message=day?'Сегодня праздник! Видова 163В':'Завтра у Видова 163В день рождения!';
  return <section className="birthday-scene">
    <img src={`./brand/${artwork}.webp`} alt={message} width="886" height={day?460:480}/>
  </section>;
}
export function BirthdayBanner({preview}){
  const dialog=useRef(null);
  const [show,setShow]=useState(()=>{
    if(preview)return preview==='banner';
    try{return !localStorage.getItem(seenKey);}catch{return true;}
  });
  function close(){
    if(!preview){try{localStorage.setItem(seenKey,'1');}catch{}}
    setShow(false);
  }
  React.useEffect(()=>{
    if(show&&!dialog.current.open)dialog.current.showModal();
  },[show]);
  if(!show)return null;
  return <dialog className="birthday-banner" ref={dialog} aria-label="Чижику на Видова 163В один год!" onCancel={event=>{event.preventDefault();close();}}>
    <button type="button" className="birthday-close" aria-label="Закрыть баннер" onClick={close}>×</button>
    <img className="birthday-poster-art" src="./brand/birthday-poster.webp"
      alt="Чижику на Видова 163В один год! Спасибо, что заглядываете к нам" width="616" height="953"/>
    <span className="birthday-confetti" aria-hidden="true">{[8,24,48,63,80,92].map((x,i)=><i key={x} style={{left:x+'%','--delay':i*.07+'s'}}/>)}</span>
    <button type="button" className="primary birthday-cta" onClick={close}>К скидкам →</button>
  </dialog>;
}
