import React from 'react';
import './seasonal-decor.css';

export function seasonForDate(date){
  const month=Number(date.slice(5,7));
  if(month>=9&&month<=11)return 'autumn';
  if(month===12||month===1||month===2)return 'winter';
  return null;
}

const leaves=['maple','oak','birch'];
const snowflakes=['❄','❅','❆','·'];
const positions=[3,96,7,92,2,97,5,94,1,98,8,91];

export function SeasonalWeather({season}){
  if(!season)return null;
  const winter=season==='winter';
  return <div className="season-weather" aria-hidden="true">
    {positions.slice(0,winter?12:8).map((position,index)=><span
      key={index}
      className={`season-particle ${winter?'season-flake':leaves[index%leaves.length]}`}
      style={{
        '--particle-x':position+'%',
        '--particle-size':(8+(index*7)%13)+'px',
        '--particle-duration':(10+(index*3)%9)+'s',
        '--particle-delay':(-index*1.41)+'s',
        '--particle-sway':(index%2?-1:1)*(5+index%5*4)+'px'
      }}
    ><i>{winter?snowflakes[index%snowflakes.length]:null}</i></span>)}
  </div>;
}

export function SeasonalMascot({season}){
  return <span className={`season-mascot-image season-mascot-${season}`} aria-hidden="true">
    <span className="season-mascot-art"/>
    {season==='winter'&&<i className="season-pompom-flake">❅</i>}
  </span>;
}
