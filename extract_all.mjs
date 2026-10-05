import fs from 'fs';

const files = {
  today: 'unpacked_89c407fc-5944-4e38-ba21-38efef012fc8.html',
  calendar: 'unpacked_cea7bd1c-b7d8-4734-98b1-82b82d3000ac.html',
  todo: 'unpacked_a957e0bf-9e91-43e2-8b3e-4dbc3ee10e88.html',
};

for (const [name, path] of Object.entries(files)) {
  const c = fs.readFileSync(path, 'utf8');
  const m = c.match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/);
  if (m) {
    const t = JSON.parse(m[1]);
    fs.writeFileSync(`template_${name}.html`, typeof t === 'string' ? t : JSON.stringify(t, null, 2));
    console.log(`Saved template_${name}.html length:`, (typeof t === 'string' ? t : JSON.stringify(t)).length);
  }
}
