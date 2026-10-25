export const moscowDate=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export const parseDate=s=>new Date(`${s}T12:00:00Z`);
export const dateKey=d=>d.toISOString().slice(0,10);
export const addDays=(s,n)=>{const d=parseDate(s);d.setUTCDate(d.getUTCDate()+n);return dateKey(d);};
export const longDate=s=>parseDate(s).toLocaleDateString('ru-RU',{day:'numeric',month:'long',timeZone:'UTC'});
export function monthCells(month){const d=parseDate(month+'-01');const offset=(d.getUTCDay()+6)%7;const count=new Date(d.getUTCFullYear(),d.getUTCMonth()+1,0).getUTCDate();return Array.from({length:Math.ceil((offset+count)/7)*7},(_,i)=>addDays(dateKey(d),i-offset));}
export function rangeFor(kind,anchor){if(kind==='day')return [anchor,anchor];if(kind==='week'){const first=addDays(anchor,-((parseDate(anchor).getUTCDay()+6)%7));return [first,addDays(first,6)];}const month=anchor.slice(0,7);const last=new Date(parseDate(month+'-01'));last.setUTCMonth(last.getUTCMonth()+1);last.setUTCDate(0);return [month+'-01',dateKey(last)];}
export function validateOffer(o,p){if(!o.name?.trim())throw Error('Укажите название товара');if(!o.image_path)throw Error('Загрузите фотографию товара');if(!Number.isInteger(Number(o.discount))||o.discount<1||o.discount>99)throw Error('Скидка должна быть от 1 до 99%');if(o.sale_date<p.starts_on||o.sale_date>p.ends_on)throw Error('Дата товара должна входить в период');}
