import React,{useEffect,useRef,useState} from 'react';
import {Forward} from 'lucide-react';
import {shareOffer} from './share.mjs';

function copyText(text){
  const field=document.createElement('textarea');
  field.value=text;field.readOnly=true;field.style.cssText='position:fixed;opacity:0;left:0;top:0';
  const focused=document.activeElement;
  document.body.append(field);field.select();
  try{return document.execCommand('copy');}finally{field.remove();focused?.focus?.();}
}
export default function ShareButton({offer}){
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const timer=useRef();
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  async function share(event){
    event.stopPropagation();if(busy)return;setBusy(true);setMessage('');
    try{const result=await shareOffer(offer,navigator,copyText);if(result==='copied')setMessage('Текст и ссылка скопированы');}
    catch{setMessage('Не удалось поделиться. Попробуйте ещё раз.');}
    finally{setBusy(false);clearTimeout(timer.current);timer.current=setTimeout(()=>setMessage(''),4500);}
  }
  return <><button type="button" className="share-button" aria-label={`Поделиться: ${offer.name}`} title="Поделиться" disabled={busy} onClick={share}><Forward size={21}/></button>{message&&<div className="share-toast" role="status">{message}</div>}</>;
}
