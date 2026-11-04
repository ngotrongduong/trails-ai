// Builds the two published files from src/trails-ai.js:
// - dist/trails-ai.js: the AI without comments and indentation, which the bookmark loads from GitHub
// - docs/index.html: the how-to page (GitHub Pages) with the bookmark and a copy button for the code
// usage: node tools/build.js
const fs = require('fs');
const path = require('path');

const REPO = 'ngotrongduong/trails-ai';
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src', 'trails-ai.js'), 'utf8');
const slim = src.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('//')).join('\n') + '\n';
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
<title>AI tự học Trails</title>
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
<h1>AI tự học Trails</h1>
<p class="sub">Một AI tự thử, tự ngã và rút kinh nghiệm trên bất kỳ đường đua nào trong trailsthegame.com, tập trick để lấy điểm cao nhất, rồi tự lái xe của bạn trong game. Dự án vui, mã nguồn mở trên <a href="https://github.com/${REPO}">GitHub</a>: ai cũng có thể góp bài học và cải tiến AI.</p>

<div class="card">
<h2>Cách 1 · Extension cho Edge / Chrome (nhanh nhất)</h2>
<p>Cài một lần. Sau đó mỗi khi bạn mở trailsthegame.com, AI tự bật, game không phải tải lại lần hai, và AI luôn là bản mới nhất.</p>
<ol>
<li>Tải file <a href="trails-ai-extension.zip" download><b>trails-ai-extension.zip</b></a>, bấm chuột phải vào file → <b>Extract All</b> (Giải nén tất cả). Bạn sẽ có thư mục <code>trails-ai-extension</code>. Hãy để thư mục này ở chỗ cố định, đừng xóa.</li>
<li>Gõ <code>edge://extensions</code> vào thanh địa chỉ (Chrome: <code>chrome://extensions</code>).</li>
<li>Bật <b>Developer mode</b> (Chế độ dành cho nhà phát triển).</li>
<li>Bấm <b>Load unpacked</b> (Tải tiện ích đã giải nén) và chọn thư mục <code>trails-ai-extension</code> (thư mục có file <code>manifest.json</code>).</li>
<li>Mở <b>trailsthegame.com</b>. Lần đầu trang tự tải lại một lần, rồi bảng AI hiện ở góc phải.</li>
</ol>
<p class="note">Khi có bản AI mới, bảng AI báo “Có bản AI mới”: bấm <kbd>F5</kbd> là xong, không phải cài lại. Edge có thể nhắc rằng bạn đang dùng extension ở chế độ nhà phát triển; đó là bình thường với extension tự cài. Muốn gỡ: vào lại <code>edge://extensions</code> và bấm <b>Remove</b>.</p>
</div>

<div class="card">
<h2>Cách 2 · Nút trên thanh dấu trang</h2>
<ol>
<li>Trong Edge (hoặc Chrome), bật thanh dấu trang: <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd>.</li>
<li>Giữ chuột vào nút xanh dưới đây và <b>kéo nó lên thanh dấu trang</b>:<br><br>
<a class="bm" href="${esc(bookmarklet)}" onclick="alert('Đừng bấm ở đây: hãy kéo nút này lên thanh dấu trang, rồi bấm nó khi đang ở trong game.');return false;">AI Trails</a></li>
<li>Vào <b>trailsthegame.com</b> và bấm nút <b>AI Trails</b> trên thanh dấu trang. Game tải lại một lần ngay trong trang (để AI gắn được vào xe của bạn), rồi bảng “AI tự học Trails” hiện ở góc phải.</li>
<li>Bấm <b>Ride</b>, đạp đến gần đường bạn muốn AI học.</li>
</ol>
<p class="note">Nút này luôn tải bản AI mới nhất từ GitHub, nên khi AI được cải tiến bạn không cần kéo lại nút.</p>
</div>

<div class="card">
<h2>Cách 3 · Dán vào Console</h2>
<ol>
<li>Bấm nút này để chép đoạn mã: <button id="copy">Chép mã AI</button> <span id="copied" class="ok"></span></li>
<li>Trong trang game, bấm <kbd>F12</kbd>, chọn thẻ <b>Console</b>.</li>
<li>Dán (<kbd>Ctrl</kbd> + <kbd>V</kbd>) rồi bấm <kbd>Enter</kbd>. Lần đầu trình duyệt có thể bắt gõ <code>allow pasting</code> trước khi cho dán. Game sẽ tải lại một lần ngay trong trang, rồi bảng AI hiện ra.</li>
</ol>
</div>

<div class="card">
<h2>Hai nút: Học lái và AI lái</h2>
<ol>
<li>Đạp xe vài giây để AI biết bạn đang ở đâu. Danh sách đường xếp theo khoảng cách, gần nhất ở trên cùng; bấm <b>↻</b> để tìm lại. Mỗi đường có một tên riêng (như “Đồi Thông 37”), giống nhau trên mọi máy; bấm <b>✎</b> để tự đặt tên khác. Chọn một đường.</li>
<li>Bấm <b>Học lái</b> rồi cứ để đó, càng lâu càng giỏi. AI tự lo phần còn lại:
<ul>
<li>Học đường đang chọn: mỗi vòng thử vài chục cách chạy trong mô phỏng (dùng gần hết các luồng CPU) và giữ cách tốt nhất. Nó tập vượt hết đường trước, về đích được rồi mới tập trick để thêm điểm.</li>
<li>Khi đường này 3 phút không tiến thêm, AI tập một <b>bài tập kiểu Training</b> nó tự tạo mới khoảng 3 phút (mỗi cú nhảy vượt được vào kho kinh nghiệm cho đường mới mượn), rồi luyện <b>bộ não chung</b> trên các đường quanh bạn khoảng 5 phút, rồi quay lại đường.</li>
<li>Đường mới bắt đầu từ cách tốt nhất trong ba cách: học từ con số 0, mượn cú nhảy giống ở đường khác, hoặc chép cách lái của bộ não chung.</li>
</ul></li>
<li>Bấm <b>AI lái</b> để AI lái xe thật của bạn trên đường đang chọn (bạn phải đang <b>ngồi trên xe</b>, không đi bộ, không mở menu). AI chạy thử cả bài học của đường này lẫn bộ não chung trong mô phỏng, rồi để cái nào đi xa hơn lái. Đường chưa học thì bộ não chung lái.</li>
<li>Bấm lại một trong hai nút (lúc đó là <b>Dừng học</b> / <b>Dừng AI lái</b>) để dừng. Mọi thứ AI học được đều lưu trong trình duyệt.</li>
<li>Mục <b>Chi tiết, xem lại và chia sẻ</b> (thu gọn ở cuối bảng) có số liệu chi tiết, nút xem lại lượt chạy tốt nhất, lưu/mở file và chia sẻ lên GitHub.</li>
</ol>
<p class="note">AI học trong mô phỏng chạy trên máy bạn, dùng đúng bộ vật lý, đúng xe và đúng các trick mà tài khoản của bạn đang có. Lúc học nó không gửi gì lên máy chủ của game.</p>
</div>

<div class="card">
<h2>Các bài Training của game</h2>
<ol>
<li>Trong game mở <b>Home › Training</b>, chọn một bài, bấm <b>Ride</b>. Bài đó hiện trong danh sách của AI (“Training: Pump &amp; pull”…).</li>
<li>Bấm <b>Học lái</b>: AI học tới khi đạt đúng điều game yêu cầu, chấm như game chấm (pump tốt, tiếp đất sạch từng cú theo thứ tự, boost/racer, trick…). Một cú tiếp đất chỉ được tính khi còn dư so với giới hạn của game.</li>
<li>Bấm <b>AI lái</b>. Ở Boost &amp; racer, AI tự đọc game đang hỏi kiểu nào và lái đúng bài học đó.</li>
</ol>
<p class="note">Đã qua trong game thật: cả 6 bài Basics và Manual, Whip, 360, Backflip. Trick line chưa qua.</p>
</div>

<div class="card">
<h2>Bên trong: bài học, mượn kinh nghiệm và bộ não chung</h2>
<ul>
<li><b>Bài học</b> của một đường là kế hoạch cho từng đoạn: tốc độ (có thể khác nhau ở từng phần khoảng 8 m của đoạn), chỗ nhấc xe trước mép nhảy, pump, góc xe khi bay. Nó chỉ dùng được trên đúng đường đó.</li>
<li><b>Khi bị kẹt</b>, AI đổi tốc độ từng phần nhỏ của đoạn, và cứ mỗi vòng thứ hai lại thử hẳn những cách khác cho mấy đoạn trước chỗ ngã: có khi cách đang dùng chỉ vừa đủ qua chỗ phía trước, nên sửa nhỏ quanh chỗ ngã không bao giờ tới được. Lượt nào đi xa hơn là tốt hơn; trick chỉ tập sau khi đã về đích.</li>
<li><b>Mượn kinh nghiệm:</b> mỗi cú nhảy AI vượt qua được ghi lại cùng hình dạng của nó (mép nhảy, khoảng hở, chỗ tiếp đất). Ở đường mới, AI tìm những cú giống nhất ở các đường đã học, trên máy bạn và của mọi người trên GitHub, và thử cách đã thành công ở đó.</li>
<li><b>Bộ não chung</b> là một mạng nơ-ron nhỏ: nhìn xe và mặt đất 2–33 m phía trước rồi tự quyết tốc độ, lúc nhấc xe, lúc pump và góc xe khi bay, nên lái được cả đường chưa từng thấy. Mỗi lượt nó luyện trên tới 40 đường: đường quanh bạn (mọi điểm xuất phát game đã tải trong vòng 800 m) và bài tập AI tự tạo (tới 12 bài đã tập xong để bắt chước, ít nhất 4 bài mới) giống các bài Training của game (table, double, step-up, step-down, ba cú liên tiếp, mô pump, cua nghiêng, đủ cỡ). Đường đang chọn được để riêng làm bài kiểm tra, bộ não không luyện trên nó. Bộ não học chậm hơn bài học của một đường, cần luyện hàng giờ.</li>
</ul>
</div>

<div class="card">
<h2>Khi AI lái thật trong game</h2>
<ol>
<li>Xe của bạn được đưa về điểm xuất phát và AI tự đạp, lái, nhảy qua từng cú nhảy. Phía trên màn hình hiện “AI đang lái · số mét đã đi”.</li>
<li><b>Vừa lái vừa học:</b> nếu đang bật Học lái trên đường này, tìm ra cách tốt hơn cho những đoạn phía trước xe là AI dùng ngay trong lượt đang chạy (trên huy hiệu hiện “học thêm N lần”).</li>
<li><b>Game chấm:</b> sau mỗi lần lái thật, nhật ký ghi game đã chấm bao nhiêu cú Buttery, Clean, Sketchy, Flat, Cased và bao nhiêu điểm (theo cách game tính trong train). Phần Chi tiết có mục <b>Xem lại từng cú nhảy</b> của lượt tốt nhất, kèm lời khuyên cho từng cú. Khi đã về đích, Học lái tập tiếp đất đẹp hơn để giữ chuỗi nhân, và tập trick theo sổ tay trick khi tài khoản đã mở khóa trick.</li>
<li><b>Đi tiếp sang đường khác:</b> tới cuối đường, nếu có một đường khác bắt đầu trong vòng 35 m phía trước và đi cùng hướng, AI lái tiếp sang đường đó bằng bộ não chung (huy hiệu hiện “đường thứ N”). Không có đường nào gần như vậy thì AI dừng ở đó, nên nó không bao giờ lái ra chỗ không có đường. Đường đã đi trong lượt này thì không đi lại.</li>
<li><b>Học luôn các đường đi tiếp:</b> Học lái nối các đường đi tiếp vào sau đường đã chọn (tối đa 6 đường) và học cả tuyến, nên AI lái đi tiếp sang chúng bằng bài học. Bài học cũ được giữ cho phần đường đã học.</li>
<li>Ngã hoặc hết đường để đi, AI tự lái lại từ đầu sau 3 giây với bài học mới nhất, cứ thế liên tục.</li>
<li>Mỗi lượt lái thật, AI so chỗ ngã thật với dự đoán của mô phỏng và kiểm tra bản đồ trong mô phỏng với những gì game vừa tải dọc đường. Nếu đường đã bị sửa, AI báo để bạn cho nó dò lại đường.</li>
<li>Muốn lấy lại tay lái: bấm <b>phím bất kỳ</b> hoặc bấm <b>Dừng AI lái</b>.</li>
</ol>
<p class="note">Ngoài game AI chạy đúng như lượt tốt nhất trong mô phỏng: nếu mô phỏng ngã ở mét 800 thì ngoài game cũng ngã ở đó. Người chơi khác đang online thấy xe bạn chạy như thường, và game có thể tính lượt chạy này vào thống kê của bạn. Đổi xe hoặc mở khóa thêm trick thì bấm <b>Học lái</b> để AI học lại với cài đặt mới. Tài khoản chưa mở khóa trick (game mở khi đủ 200 cú nhảy và 5 đường) thì AI chỉ chạy, không làm trick.</p>
</div>

<div class="card">
<h2>Học nhanh hơn: chia sẻ bài học</h2>
<ul>
<li><b>Một tab là đủ.</b> AI đã dùng gần hết các luồng CPU của máy; mở thêm tab trên cùng máy không làm nó học nhanh hơn. Nếu bạn vẫn mở nhiều tab trên cùng một đường, các tab tự trao cho nhau bài học giỏi nhất, không ghi đè lên nhau.</li>
<li><b>Nhiều máy cùng học</b> mới thật sự nhanh hơn: mỗi máy thử những cách khác nhau, rồi chia sẻ bài học giỏi nhất qua GitHub.</li>
<li><b>Bài học cộng đồng:</b> khi bắt đầu học một đường, AI tự tải bài học mọi người đã chia sẻ cho đường đó, chạy thử bằng vật lý trên máy bạn, và chỉ dùng nếu nó giỏi hơn. Trong lúc học, cứ 10 phút nó lại xem có bài mới không.</li>
<li><b>Lưu ra file</b> / <b>Mở file</b>: cất bài học vào một file, mang sang máy khác hoặc gửi cho bạn bè.</li>
<li><b>Chia sẻ GitHub</b>: AI lưu file bài học và mở trang tải lên của repo. Kéo file vào rồi bấm <b>Propose changes</b> (cần tài khoản GitHub).</li>
</ul>
</div>

<div class="card">
<h2>AI tự chấm điểm thế nào</h2>
<table>
<tr><td>Mỗi mét đi được</td><td>+1</td></tr>
<tr><td>Tốc độ 5 m trước chỗ xa nhất</td><td>+0,05 mỗi m/s (tối đa +1)</td></tr>
<tr><td>Mỗi cú nhảy tiếp đất sạch</td><td>+15</td></tr>
<tr><td>Về đích</td><td>+150</td></tr>
<tr><td>Backflip · 360 · Tailwhip · Barspin</td><td>+300 · +200 · +150 · +120</td></tr>
<tr><td>Table · T-bog · X-up</td><td>+80 · +80 · +60</td></tr>
<tr><td>Whip</td><td>+1 mỗi độ</td></tr>
<tr><td>Combo nhiều trick trong một cú nhảy</td><td>×1,5 · ×2 · …</td></tr>
<tr><td>Manual</td><td>+10 mỗi mét</td></tr>
<tr><td>Ngã · kẹt · đứng lại</td><td>−25</td></tr>
<tr><td>Lạc khỏi đường</td><td>−20</td></tr>
</table>
<p class="note">Đây là thang điểm riêng để AI tự học, không phải điểm chính thức của game.</p>
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

// docs/trails-ai-extension.zip: the browser extension in one folder, ready for "Load unpacked".
// Stored without compression and with a fixed date, so the same files always give the same zip.
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = b => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(files) {
  const parts = [], dir = [];
  let at = 0;
  for (const [name, data] of files) {
    const nm = Buffer.from(name), crc = crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(10, 4); head.writeUInt16LE(0x0800, 6);
    head.writeUInt16LE(0, 8); head.writeUInt16LE(0, 10); head.writeUInt16LE(0x21, 12);
    head.writeUInt32LE(crc, 14); head.writeUInt32LE(data.length, 18); head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(nm.length, 26); head.writeUInt16LE(0, 28);
    parts.push(head, nm, data);
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
  return Buffer.concat([...parts, cdBuf, end]);
}
const extDir = path.join(root, 'extension');
const extFiles = fs.readdirSync(extDir).sort().map(f => [`trails-ai-extension/${f}`, fs.readFileSync(path.join(extDir, f))]);
const ext = zip(extFiles);
fs.writeFileSync(path.join(root, 'docs', 'trails-ai-extension.zip'), ext);
console.log('dist', slim.length, 'page', html.length, 'bookmarklet', bookmarklet.length, 'extension', ext.length);
