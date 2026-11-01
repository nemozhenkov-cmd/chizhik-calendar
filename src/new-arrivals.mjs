export function catalogLink(raw){try{const u=new URL(raw);return u.protocol==='https:'&&u.hostname==='chizhik.club'&&!u.username&&!u.password&&!u.port&&/^\/product\/[a-zA-Z0-9_%-]+\/$/.test(u.pathname)&&!u.search&&!u.hash?u.href:'';}catch{return '';}}
export function newShareData(item){return {title:'Новинки в «Чижике»',text:`Новинка в «Чижике»: ${item.name}${item.detail?' — '+item.detail:''}. Смотри подборку новинок:`,url:'https://clck.ru/3WgQiN#new'};}
export const sortedNewItems=items=>[...(items||[])].sort((a,b)=>a.sort_order-b.sort_order||a.name.localeCompare(b.name,'ru'));
