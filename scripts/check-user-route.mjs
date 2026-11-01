import fs from 'node:fs';
const path = 'app/naijadrive/page.tsx';
const exists = fs.existsSync(path);
console.log(`User route file ${exists ? 'exists' : 'missing'}: ${path}`);
