import React from 'react';
import {Ticket,ExternalLink} from 'lucide-react';
import {moscowDate} from './dates.mjs';
// App link supplied by the store owner.
export const CHIZHIK_APP_URL='https://redirect.appmetrica.yandex.com/serve/389863811814811314';
export default function CouponAction({offer}){if(!offer||offer.sale_date!==moscowDate())return null;return <div className="coupon-action"><a className="primary coupon-open" href={CHIZHIK_APP_URL} target="_blank" rel="noopener noreferrer"><Ticket size={20}/><span>Открыть приложение Чижик</span><ExternalLink size={17}/></a><p>Купон покажите на кассе.</p></div>;}
