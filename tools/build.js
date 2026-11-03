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
<h2>Cách 1 · Nút trên thanh dấu trang (dễ nhất)</h2>
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
<h2>Cách 2 · Dán vào Console</h2>
<ol>
<li>Bấm nút này để chép đoạn mã: <button id="copy">Chép mã AI</button> <span id="copied" class="ok"></span></li>
<li>Trong trang game, bấm <kbd>F12</kbd>, chọn thẻ <b>Console</b>.</li>
<li>Dán (<kbd>Ctrl</kbd> + <kbd>V</kbd>) rồi bấm <kbd>Enter</kbd>. Lần đầu trình duyệt có thể bắt gõ <code>allow pasting</code> trước khi cho dán. Game sẽ tải lại một lần ngay trong trang, rồi bảng AI hiện ra.</li>
</ol>
</div>

<div class="card">
<h2>Cho AI học</h2>
<ol>
<li>Đạp xe vài giây để AI biết bạn đang ở đâu, rồi bấm <b>Tìm lại đường gần tôi</b>.</li>
<li>Chọn một điểm xuất phát trong danh sách, bấm <b>Bắt đầu học</b>. Lần đầu nạp vật lý mất khoảng 10–40 giây.</li>
<li>AI học theo vòng: mỗi vòng nó thử vài chục cách chạy khác nhau trong mô phỏng (dùng gần hết các luồng CPU của máy) và giữ cách tốt nhất. Đầu tiên nó học cách vượt hết đường (tốc độ cho từng đoạn, góc xe khi bay), sau đó tập trick trên những cú nhảy đã qua được. Cứ để AI chạy 15–30 phút hoặc lâu hơn.</li>
<li>Bấm <b>Xem AI chạy</b> để xem lại lượt chạy tốt nhất ở dạng mặt cắt của đường, có tên trick và điểm.</li>
<li>Bấm <b>Tạm dừng</b> bất cứ lúc nào. AI nhớ những gì đã học trên từng đường (lưu trong trình duyệt), lần sau bấm <b>Học tiếp</b>.</li>
</ol>
<p class="note">AI học trong mô phỏng chạy trên máy bạn, dùng đúng bộ vật lý, đúng xe và đúng các trick mà tài khoản của bạn đang có. Lúc học nó không gửi gì lên máy chủ của game.</p>
</div>

<div class="card">
<h2>Để AI lái thật trong game</h2>
<ol>
<li>Cho AI học trên một đường trước. Khi ô <b>Lượt chạy tốt nhất</b> báo “về đích” là AI đã vượt hết đường trong mô phỏng.</li>
<li>Bạn phải đang <b>ngồi trên xe</b> (đang Ride, không đi bộ, không mở menu).</li>
<li>Bấm <b>Để AI lái</b>. Xe của bạn được đưa về điểm xuất phát và AI tự đạp, lái, nhảy qua từng cú nhảy. Phía trên màn hình hiện “AI đang lái · số mét đã đi”.</li>
<li>Muốn lấy lại tay lái: bấm <b>phím bất kỳ</b> hoặc bấm <b>Dừng AI lái</b>. AI cũng tự dừng khi ngã, khi về đích hoặc khi lạc khỏi đường.</li>
</ol>
<p class="note">Ngoài game AI chạy đúng như lượt tốt nhất trong mô phỏng: nếu mô phỏng ngã ở mét 800 thì ngoài game cũng ngã ở đó. Người chơi khác đang online thấy xe bạn chạy như thường, và game có thể tính lượt chạy này vào thống kê của bạn. Đổi xe hoặc mở khóa thêm trick thì bấm <b>Học tiếp</b> để AI học lại với cài đặt mới. Tài khoản chưa mở khóa trick (game mở khi đủ 200 cú nhảy và 5 đường) thì AI chỉ chạy, không làm trick.</p>
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
console.log('dist', slim.length, 'page', html.length, 'bookmarklet', bookmarklet.length);
