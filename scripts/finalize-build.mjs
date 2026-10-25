import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const assets=(await fs.readdir('dist/assets')).map(p=>'./assets/'+p);
const digest=createHash('sha256');for(const p of assets)digest.update(await fs.readFile('dist/'+p.slice(2)));
const original=await fs.readFile('dist/sw.js','utf8');
await fs.writeFile('dist/sw.js',original.replace("const VERSION='chizhik-calendar-v1'",`const VERSION='chizhik-calendar-${digest.digest('hex').slice(0,12)}'`).replace("const CORE=[",`const CORE=${JSON.stringify(assets)}.concat([`).replace("'./brand/mascot-loading.webp'];","'./brand/mascot-loading.webp']);"));
