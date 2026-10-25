import fs from 'node:fs/promises';
// Keep the repository-hosted static build in docs/ for GitHub Pages.
await fs.mkdir('docs',{recursive:true});
for(const entry of await fs.readdir('docs')){if(!['assets','brand','index.html','sw.js','icon.svg','icon-192.png','icon-512.png','apple-touch-icon.png','manifest.webmanifest','.nojekyll'].includes(entry))throw Error('Unexpected file in docs: '+entry);}
await fs.cp('dist','docs',{recursive:true});
await fs.writeFile('docs/.nojekyll','');
