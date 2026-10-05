import fs from 'fs';
import zlib from 'zlib';

const html = fs.readFileSync('c:/Users/user/OneDrive/Desktop/OAMS/OAMS_UI_Design.html', 'utf8');
const manifestMatch = html.match(/<script type="__bundler\/manifest">([\s\S]*?)<\/script>/);
if (manifestMatch) {
  const manifest = JSON.parse(manifestMatch[1]);
  for (const [k, v] of Object.entries(manifest)) {
    if (v.compressed && v.data) {
      const buf = Buffer.from(v.data, 'base64');
      const unzipped = zlib.gunzipSync(buf).toString('utf8');
      fs.writeFileSync(`c:/Users/user/OneDrive/Desktop/OAMS/unpacked_${k}.html`, unzipped);
      console.log('Unpacked:', k, 'size:', unzipped.length);
    }
  }
}
