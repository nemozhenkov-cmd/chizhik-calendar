import fs from 'node:fs/promises';
// Keep the repository-hosted static build in docs/ for GitHub Pages.
await fs.mkdir('docs',{recursive:true});
for(const entry of await fs.readdir('docs')){if(!['assets','brand','index.html','sw.js','icon.svg','icon-192.png','icon-512.png','badge-96.png','apple-touch-icon.png','manifest.webmanifest','.nojekyll'].includes(entry))throw Error('Unexpected file in docs: '+entry);}
// Remove only generated bundle files so old asset hashes do not accumulate.
for(const file of await fs.readdir('docs/assets').catch(()=>[])){if(!/^index-[A-Za-z0-9_-]+\.(js|css)$/.test(file))throw Error('Unexpected generated asset: '+file);await fs.unlink('docs/assets/'+file);}
for(const entry of await fs.readdir('dist'))if(entry!=='assets')await fs.cp('dist/'+entry,'docs/'+entry,{recursive:true});
const html=await fs.readFile('dist/index.html','utf8');
await fs.mkdir('docs/assets',{recursive:true});
for(const match of html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+)"/g))await fs.copyFile('dist/'+match[1],'docs/'+match[1]);
await fs.writeFile('docs/.nojekyll','');
