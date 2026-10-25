import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const html=await fs.readFile('dist/index.html','utf8');
const assets=[...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map(m=>m[1]);
if(!assets.length)throw Error('No production assets found');
const digest=createHash('sha256');for(const p of assets)digest.update(await fs.readFile('dist/'+p.slice(2)));
const original=await fs.readFile('public/sw.js','utf8');
await fs.writeFile('dist/sw.js',original.replace("const VERSION='chizhik-calendar-v1'",`const VERSION='chizhik-calendar-${digest.digest('hex').slice(0,12)}'`).replace("const CORE=[",`const CORE=${JSON.stringify(assets)}.concat([`).replace("'./brand/mascot-loading.webp'];","'./brand/mascot-loading.webp']);"));
