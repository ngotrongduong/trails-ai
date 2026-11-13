// Builds the published files from src/:
// - dist/trails-ai.js: the AI (src/*.js in order, with sim/rider.js in it and sim/rider.js + sim/worker.js as the
//   learning workers' code), without comments and indentation; the extension and the bookmark load it from GitHub
// - docs/index.html: the how-to page (GitHub Pages) with the bookmark and a copy button for the code
// - docs/trails-ai-extension.zip: the browser extension, ready for "Load unpacked"
// usage: node tools/build.js
const fs = require('fs');
const path = require('path');

const REPO = 'ngotrongduong/trails-ai';
const root = path.join(__dirname, '..'), SRC = path.join(root, 'src');
const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');
const slimOf = src => src.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('//')).join('\n') + '\n';
// the page's code: the parts in the order of their names, the shared rider right after the line finder
const parts = fs.readdirSync(SRC).filter(f => /^\d\d-.*\.js$/.test(f)).sort();
const worker = slimOf(read('sim/rider.js') + '\n' + read('sim/worker.js'));
let code = '';
for (const f of parts) {
  let s = read(f);
  if (f.startsWith('30-')) {
    if (!s.includes("/*@WORKER_SRC@*/''")) throw new Error('30-pool.js: no place for the worker code');
    s = s.replace("/*@WORKER_SRC@*/''", () => JSON.stringify(worker));
  }
  code += s + '\n';
  if (f.startsWith('20-')) code += read('sim/rider.js') + '\n';
}
const slim = slimOf(code);
// (a syntax error stops the build here rather than in the game)
new Function(slim);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'trails-ai.js'), slim);

// the bookmark is a small loader, so everyone always runs the latest AI from the repo
const RAW = `https://raw.githubusercontent.com/${REPO}/main/dist/trails-ai.js`;
const bookmarklet = 'javascript:' + encodeURIComponent(`fetch('${RAW}?t='+Date.now(),{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.text()}).then(c=>(0,eval)(c)).catch(e=>alert('Không tải được AI Trails: '+e.message));void 0`);
const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const html = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI Trails</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--ink:#1b2129;--muted:#5d6874;--line:#e2e6eb;--accent:#2f6fde;--ok:#1f7a45}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#12161c;--card:#1a2028;--ink:#e8edf2;--muted:#9fb0c2;--line:#2a323c;--accent:#4d8bff;--ok:#7fd6a0}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:760px;margin:0 auto;padding:32px 16px 64px}
h1{font-size:28px;margin:0 0 4px}
.sub{color:var(--muted);margin:0 0 24px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px;margin:16px 0}
h2{font-size:19px;margin:0 0 10px}
ol,ul{padding-left:22px;margin:8px 0}li{margin:6px 0}
a{color:var(--accent)}
.bm{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px;cursor:grab}
button{font:inherit;background:var(--accent);color:#fff;border:0;border-radius:10px;padding:10px 16px;font-weight:600;cursor:pointer}
.note{color:var(--muted);font-size:14px}
.ok{color:var(--ok);font-weight:600}
kbd{border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:0 5px;font-size:14px}
table{border-collapse:collapse;width:100%;font-size:15px}td{border-top:1px solid var(--line);padding:4px 6px}td:last-child{text-align:right;white-space:nowrap}
</style>
</head>
<body>
<main>
<h1>AI Trails</h1>
<p class="sub">Một AI tự học lái một đường đua bạn chọn trong trailsthegame.com: tự thử, tự ngã, rút kinh nghiệm và tập mọi trick để lấy nhiều điểm nhất ở mỗi cú nhảy, rồi lái xe của bạn trong game. Mã nguồn mở trên <a href="https://github.com/${REPO}">GitHub</a>.</p>

<div class="card">
<h2>Cài đặt · Extension cho Edge / Chrome</h2>
<p>Cài một lần. Mỗi khi mở trailsthegame.com, AI tự bật và luôn là bản mới nhất.</p>
<ol>
<li>Tải <a href="trails-ai-extension.zip" download><b>trails-ai-extension.zip</b></a>, chuột phải → <b>Extract All</b>. Để thư mục <code>trails-ai-extension</code> ở chỗ cố định.</li>
<li>Mở <code>edge://extensions</code> (Chrome: <code>chrome://extensions</code>), bật <b>Developer mode</b>.</li>
<li>Bấm <b>Load unpacked</b>, chọn thư mục <code>trails-ai-extension</code>.</li>
<li>Mở <b>trailsthegame.com</b>. Lần đầu trang tự tải lại một lần, rồi bảng AI hiện ở góc phải.</li>
</ol>
<p class="note">Có bản AI mới thì AI tự cập nhật giữa hai lượt chạy (bộ nhớ được lưu trước, rồi AI chạy tiếp đúng đường đang học). Bảng AI cũng có nút <b>Cập nhật ngay</b>.</p>
</div>

<div class="card">
<h2>Hoặc · Nút trên thanh dấu trang</h2>
<ol>
<li>Bật thanh dấu trang: <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd>. Kéo nút này lên thanh dấu trang:<br><br>
<a class="bm" href="${esc(bookmarklet)}" onclick="alert('Hãy kéo nút này lên thanh dấu trang, rồi bấm nó khi đang ở trong game.');return false;">AI Trails</a></li>
<li>Vào <b>trailsthegame.com</b>, bấm nút <b>AI Trails</b>. Game tải lại một lần trong trang rồi bảng AI hiện ra.</li>
<li>Hoặc chép mã rồi dán vào Console (<kbd>F12</kbd>): <button id="copy">Chép mã AI</button> <span id="copied" class="ok"></span></li>
</ol>
</div>

<div class="card">
<h2>Cách dùng</h2>
<ol>
<li>Đưa xe tới <b>đầu đường</b> bạn muốn AI học, quay xe theo hướng chạy.</li>
<li>Bấm <b>▶ Bắt đầu</b>. AI nhận đường ở chỗ xe đứng, học trong mô phỏng trên máy bạn (dùng gần hết CPU) và lái xe thật của bạn từ đầu đường, lượt này đến lượt khác. Tìm được cách tốt hơn là lượt sau dùng ngay.</li>
<li>Muốn lái lấy: bấm phím lái bất kỳ, AI nhường xe nhưng vẫn học tiếp. Đưa xe về đầu đường (hoặc tới đầu một đường khác) rồi đứng yên khoảng 3 giây: AI tự lái tiếp. Đường khác thì AI lưu đường cũ, mở bộ nhớ của đường mới (hoặc bắt đầu học nó) và học tiếp ở đó.</li>
<li>Mọi đường đã học nằm trong <b>Thư viện đường</b> (mục Cài đặt ở cuối bảng): đổi tên, hoặc quên một đường.</li>
<li>Lượt lái thật nào về đích không ngã và đạt điểm cao nhất từ trước tới giờ thì AI làm thành video “come to join my ride” (nhiều nhất 30 phút một lần), mời mọi người trong chat vào chạy và xoá video cũ của AI (giữ 3 cái mới nhất). Cứ 10 phút AI cũng bấm nút mời mọi người vào chạy cùng hoặc vào xem.</li>
</ol>
</div>

<div class="card">
<h2>Trick và cách tính điểm</h2>
<p>AI tập cả 9 trick game có (trong số trick tài khoản của bạn đã mở): backflip, 360/720/1080, whip, tailwhip, barspin, table, T-bog, X-up và 360 table. Ở mỗi cú nhảy nó thử nhiều trick cùng lúc, nối trick này sau trick kia (table rồi tailwhip, barspin hai lần…), chỉ bắt đầu trick khi còn đủ thời gian bay để bắt lại xe trước khi chạm đất.</p>
<table>
<tr><td>Điểm Train của game: tiếp đất Buttery · Clean · Sketchy · Flat/Cased</td><td>160 · 140 · 100 · 50</td></tr>
<tr><td>Backflip · whip · mỗi nửa vòng xoay (360 = 200, 720 = 400, 1080 = 600)</td><td>+300 · +100 · +100</td></tr>
<tr><td>Chuỗi tiếp đất đẹp liên tiếp (Flat/Cased làm mất chuỗi)</td><td>× tới 5</td></tr>
<tr><td>Điểm kỹ năng mỗi loại trick (mỗi loại một lần mỗi cú nhảy)</td><td>whip 2 · 360 4 · backflip 6 · barspin 3 · T-bog 3 · X-up 4 · tailwhip 5 · table 5 · 360 table +10</td></tr>
<tr><td>AI tính: điểm Train + 25 × điểm kỹ năng + 15 cho mỗi vòng trick lặp thêm</td><td></td></tr>
<tr><td>Thưởng thêm khi so hai cách đi: mỗi trick đáp được · mỗi cú đáp trong combo</td><td>+30 · +15 × độ dài combo</td></tr>
<tr><td>Phạt: mỗi giây chạy · mỗi cú cased · mỗi mét lệch ra ngoài đường</td><td>−20 · −200 · −60</td></tr>
<tr><td>Lệch khỏi mép nhảy để né cú nhảy</td><td>lượt đó dừng, như bị ngã</td></tr>
</table>
<p class="note">Về đích luôn được ưu tiên trước điểm. Ở đoạn mà lượt thật ngã còn mô phỏng thì không, AI học cách đi chắc hơn: mỗi cách được thử thêm khi nhanh hơn, chậm hơn và trick muộn hơn một chút, và chỉ giữ cách vẫn qua được trong mọi trường hợp đó.</p>
</div>
</main>
<script>
const code = ${JSON.stringify(slim)};
document.getElementById('copy').onclick = async () => {
  try { await navigator.clipboard.writeText(code); document.getElementById('copied').textContent = 'Đã chép!'; }
  catch { prompt('Chép đoạn mã này:', code); }
};
</script>
</body>
</html>
`;
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs', 'index.html'), html);

// docs/trails-ai-extension.zip: the extension in one folder. Stored without compression and with a fixed date, so the
// same files always give the same zip.
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = b => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(files) {
  const out = [], dir = [];
  let at = 0;
  for (const [name, data] of files) {
    const nm = Buffer.from(name), crc = crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(10, 4); head.writeUInt16LE(0x0800, 6);
    head.writeUInt16LE(0, 8); head.writeUInt16LE(0, 10); head.writeUInt16LE(0x21, 12);
    head.writeUInt32LE(crc, 14); head.writeUInt32LE(data.length, 18); head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(nm.length, 26); head.writeUInt16LE(0, 28);
    out.push(head, nm, data);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(10, 6); cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(0, 10); cd.writeUInt16LE(0, 12); cd.writeUInt16LE(0x21, 14);
    cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nm.length, 28); cd.writeUInt32LE(at, 42);
    dir.push(cd, nm);
    at += 30 + nm.length + data.length;
  }
  const cdBuf = Buffer.concat(dir), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cdBuf.length, 12); end.writeUInt32LE(at, 16);
  return Buffer.concat([...out, cdBuf, end]);
}
const extDir = path.join(root, 'extension');
const ext = zip(fs.readdirSync(extDir).sort().map(f => [`trails-ai-extension/${f}`, fs.readFileSync(path.join(extDir, f))]));
fs.writeFileSync(path.join(root, 'docs', 'trails-ai-extension.zip'), ext);
console.log('dist', slim.length, 'page', html.length, 'bookmarklet', bookmarklet.length, 'extension', ext.length);
