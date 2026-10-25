import React from 'react';
import {Ticket,ExternalLink} from 'lucide-react';
import {moscowDate} from './dates.mjs';
// Decoded from the QR on https://chizhik.club/mobile/ (official app page).
export const CHIZHIK_APP_URL='https://redirect.appmetrica.yandex.com/serve/964936002097473416';
export default function CouponAction({offer}){if(!offer||offer.sale_date!==moscowDate())return null;const ios=/iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);const mobile=ios||/Android/i.test(navigator.userAgent);return <div className="coupon-action"><a className="primary coupon-open" href={mobile?CHIZHIK_APP_URL:'https://chizhik.club/mobile/'} target="_blank" rel="noopener noreferrer"><Ticket size={20}/><span>Открыть приложение Чижик</span><ExternalLink size={17}/></a><p>Откройте купон на товар дня и покажите его на кассе.</p>{ios&&<small>Если открылся App Store, нажмите «Открыть».</small>}</div>;}
