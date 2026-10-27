import {parseDate} from './dates.mjs';

export const CALENDAR_SHARE_URL='https://clck.ru/3WgQiN';
export function offerShareData(offer){
  const date=parseDate(offer.sale_date).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
  const name=[offer.name,offer.detail].filter(Boolean).join(' — ');
  return {title:'Календарь скидок «Чижик»',text:`${date} скидка ${offer.discount}% на ${name}. Покажите купон из приложения «Чижик» на кассе. Подробнее в календаре:`,url:CALENDAR_SHARE_URL};
}
export async function shareOffer(offer,nav=navigator,copyFallback){
  const data=offerShareData(offer);
  if(typeof nav.share==='function'){
    try{await nav.share(data);return 'shared';}catch(error){if(error.name==='AbortError')return 'cancelled';}
  }
  const text=`${data.text}\n${data.url}`;
  try{if(!nav.clipboard?.writeText)throw Error();await nav.clipboard.writeText(text);}
  catch(error){if(!copyFallback?.(text))throw error;}
  return 'copied';
}
