import fs from 'fs';

const c = fs.readFileSync('unpacked_21206243-ea81-4da7-bcf8-e0589f572352.html', 'utf8');
const templateMatch = c.match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/);
if (templateMatch) {
  const t = JSON.parse(templateMatch[1]);
  fs.writeFileSync('template_request.html', typeof t === 'string' ? t : JSON.stringify(t, null, 2));
  console.log('Wrote template_request.html length:', (typeof t === 'string' ? t : JSON.stringify(t)).length);
} else {
  console.log('No template found');
}
