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
function Bird({day=false}){
  return <span className={`birthday-bird ${day?'birthday-bird-day':''}`} aria-hidden="true"/>;
}
export function BirthdayScene({day}){
  const bird=useRef(null);
  function celebrate(){
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    bird.current.getAnimations().forEach(animation=>animation.cancel());
    bird.current.animate([{transform:'none'},{transform:'translateY(-4px) rotate(4deg)',offset:.34},{transform:'none'}],{duration:680,easing:'ease-in-out'});
  }
  return <section className={`birthday-scene ${day?'birthday-today':''}`}>
    {day?<p className="birthday-bubble">Сегодня праздник! <span>Видова 163В</span></p>:
      <p className="birthday-bubble">Завтра у Видова 163В день рождения!</p>}
    {day?<button ref={bird} className="birthday-mascot-button" type="button" aria-label="Праздничный Чижик" onClick={celebrate}><Bird day/></button>:<Bird/>}
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
  return <dialog className="birthday-banner" ref={dialog} aria-labelledby="birthday-banner-title" onCancel={event=>{event.preventDefault();close();}}>
    <button type="button" className="birthday-close" aria-label="Закрыть баннер" onClick={close}>×</button>
    <h2 id="birthday-banner-title">Чижику на<br/>Видова 163В</h2>
    <div className="birthday-poster"><strong><b>1</b> год!</strong><Bird day/></div>
    <span className="birthday-confetti" aria-hidden="true">{[8,24,48,63,80,92].map((x,i)=><i key={x} style={{left:x+'%','--delay':i*.07+'s'}}/>)}</span>
    <p>Спасибо, что заглядываете к нам</p>
    <button type="button" className="primary birthday-cta" onClick={close}>К скидкам →</button>
  </dialog>;
}
