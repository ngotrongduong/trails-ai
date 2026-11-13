# AI tự học Trails

Một AI tự học lái **một đường bạn chọn** trong [Trails: The Game](https://trailsthegame.com). Bạn đưa xe tới đầu đường, rồi AI tự chạy, tự ngã, rút kinh nghiệm sau mỗi lần và tập mọi trick để lấy nhiều điểm nhất ở mỗi cú nhảy. Nó học ngay trên máy của bạn và lái xe của bạn trong game, lượt này qua lượt khác.

**👉 Dùng ngay: [ngotrongduong.github.io/trails-ai](https://ngotrongduong.github.io/trails-ai/)**. Cài extension cho Edge/Chrome một lần: AI tự bật mỗi khi bạn vào game và luôn là bản mới nhất. Hoặc kéo nút “AI Trails” lên thanh dấu trang rồi bấm nó trong game.

## Dùng thế nào

1. Đưa xe tới **đầu đường** muốn AI học, quay xe theo hướng chạy.
2. Bấm **▶ Bắt đầu**. AI nhận đường ở chỗ xe đứng rồi vừa học vừa lái:
   - Nó học trong mô phỏng trên máy bạn, dùng mọi luồng CPU trừ 2 luồng để game chạy mượt (máy 20 luồng: 18 luồng học, khoảng 220 MB RAM mỗi luồng).
   - Nó lái xe thật từ đầu đường bằng cách tốt nhất đang có. Tìm được cách tốt hơn thì dùng ngay, kể cả giữa lượt, nếu phần đường đã qua vẫn đi y như cũ.
3. Muốn tự lái thì bấm phím lái bất kỳ. AI nhường xe nhưng vẫn học tiếp. Đưa xe về đầu đường rồi đứng yên khoảng 3 giây (và không bấm phím) là AI lái tiếp.
4. **Đổi đường:** đưa xe tới đầu một đường khác (cách đầu đường cũ từ 25 m) rồi đứng yên khoảng 3 giây. AI lưu đường cũ, mở bộ nhớ của đường mới nếu đã học (chưa học thì bắt đầu học) và học tiếp ở đó.
5. **Thư viện đường** (mục Cài đặt ở cuối bảng) có mọi đường AI đã học: điểm tốt nhất trong mô phỏng và ngoài game, đổi tên, quên một đường.

Bảng AI gọn trong một khung:
- tên đường;
- 4 con số: điểm tốt nhất trong mô phỏng, điểm tốt nhất ngoài game, số lượt dò, số lần thử mỗi giây;
- nút Bắt đầu/Dừng;
- từng cú nhảy của lượt tốt nhất (trick, chữ game chấm, điểm);
- lượt lái gần nhất và nhật ký.

Phần Cài đặt (thu gọn) có: bật/tắt AI lái xe thật, tự chia sẻ, tiếng Việt/English, thư viện đường.

**Xem AI tập** (nút 👁 trên đầu bảng): một màn hình nổi trên game phát lại cùng lúc mọi chiếc xe của lượt thử gần nhất ở đoạn đang học, mỗi xe đi theo cách của riêng nó:
- vàng: những xe được giữ lại để học đoạn sau; đỏ: ngã; tím: đi vòng né cú nhảy; xanh nhạt: các xe khác;
- nhìn ngang (độ cao phóng to tới 4 lần) hoặc nhìn từ trên xuống (đường xoay cho chạy từ trái sang phải, các mảnh đường vẽ đúng bề rộng);
- dải dưới cùng là cả con đường: phần đang học và chỗ xa nhất mà lượt tốt nhất đi tới;
- tốc độ phát 1×/2×/4× và nút phóng to.
Các luồng chỉ ghi đường đi của xe khi màn hình này đang mở, nên lúc đóng nó AI học nhanh như cũ.

## AI học thế nào

Chi tiết ở [docs/design.md](docs/design.md). Tóm tắt:

- **Đọc đường.** AI đọc các chi tiết của đường từ dữ liệu game: dốc xuất phát, mép nhảy, dốc đáp, mô pump, cua. Nó nối chúng thành một lộ trình chia từng mét. Mỗi cú nhảy là một đoạn, phần còn lại cứ 40 m một đoạn.
- **Đi đúng thiết kế của track.** Nếu người xây track đã vẽ sẵn đường trong spot của họ (các đường có tên, ví dụ “Big hits”), AI đi đúng thứ tự các cú nhảy đó. Nếu không, AI tự nối: lăn qua đất trống giữa các chi tiết, thả từ dốc xuất phát xuống dốc đáp, và **rẽ trên không** khi dốc đáp nằm lệch hướng mép nhảy (tới 115°). Ở những cú rẽ đó AI bẻ lái ngay khi đang bay. Đo trên 86 đường người xây vẽ sẵn trên bản đồ: AI đi đúng 520/535 cú nhảy (cách cũ: 109). Đường đã học bằng cách cũ sẽ được dò lại khi mở; nếu khác thì học lại từ đầu.
- **Thử từng ngã rẽ.** Ở chỗ đường rẽ nhánh (một mép nhảy có hai dốc đáp, hay một điểm xuất phát có nhiều đường vẽ sẵn), AI liệt kê tới 5 cách đi. Nó học từng cách trong mô phỏng, mỗi cách 3–10 lượt (học tiếp chừng nào còn đi xa thêm). Phần đường chung với cách trước được đi đúng như cách trước đã học, nên không phải học lại. AI lưu kết quả từng cách: đi được bao nhiêu mét, bao nhiêu điểm trình diễn. Ngã nào cụt thì thua, và AI học tiếp trên ngã đi xa nhất. Nếu hai ngã xa gần bằng nhau (chênh dưới 10 m) thì nó chọn ngã ghi nhiều điểm hơn. Bảng điều khiển có mục “Các ngã rẽ của đường” cho thấy từng ngã.
- **Mô phỏng thật.** Mỗi luồng chạy đúng file vật lý (WebAssembly) của game, nên cách đi nào chạy được trong mô phỏng thì ngoài game cũng chạy y như vậy. Trạng thái của xe được lưu ở đầu mỗi đoạn. Nhờ vậy thử một cách mới ở mét 800 chỉ tốn vài mét chạy.
- **Kế hoạch.** Mỗi đoạn có vài con số: tốc độ (có thể chia phần), góc xe khi bay, nhấc xe trước mép, pump mạnh bao nhiêu và pump kiểu nào, dồn người, đánh lái trên không, có đi manual không. Cú nhảy có thêm **chương trình trick**.

- **Pump để lấy tốc độ.** AI pump ngay từ đầu, rồi thử ba kiểu pump: qua các chỗ trũng (như phần Training của game chỉ), ở mặt dốc đi lên (bờ bên kia chỗ trũng, mặt mô, mặt mép nhảy), hoặc ở chỗ đất đổ xuống. Đo trên 6 đường: pump ở mặt dốc lên hoặc qua chỗ trũng giúp xe nhanh thêm 0,5–2 m/s, đủ để bay qua những cú nhảy dài hơn.
- **Không đi đường vòng.** Mỗi điểm trên đường biết bề rộng thật của chi tiết đường ở đó. Xe chạy lệch ra ngoài mép quá 1 m ngay cạnh mép nhảy là bị coi như né cú nhảy: lượt đó dừng ở đó, như bị ngã. Lệch ra ngoài ở chỗ khác thì bị trừ 60 điểm cho mỗi mét.
- **Dò từng đoạn.** Tới đầu mỗi đoạn AI giữ 6 cách đi tốt nhất. Nó thử đoạn đó hàng chục kiểu từ mỗi cách, rồi giữ 6 kiểu tốt nhất cho đoạn sau. Không qua được thì AI lùi lại vài đoạn và thử rộng hơn. Cách tốt nhất cả đường được chạy lại từ đầu để kiểm tra rồi mới giữ.
- **So như game chấm.** Đi hết đường được ưu tiên trước, rồi đi xa hơn, rồi nhiều điểm hơn. Mỗi cú Cased bị trừ thêm 200 điểm khi so, để AI không chọn cách an toàn là bay hụt.
- **Rút kinh nghiệm từ lượt thật.** Có đoạn lượt thật ngã (hoặc đáp Flat hay Cased) mà mô phỏng thì không. AI đánh dấu đoạn đó là “mong manh”. Ở đó mỗi cách thử được chạy thêm ba lần: nhanh hơn 0,3 m/s, chậm hơn 0,3 m/s, và trick muộn hơn 0,06 s. AI chỉ giữ cách nào qua được cả bốn lần.

## Trick

AI tập cả 9 trick của game mà tài khoản của bạn đã mở: **barspin, whip, T-bog, X-up, tailwhip, table, 360 (cả 720, 1080), backflip và manual**, cùng những tổ hợp như 360 table. AI không bao giờ tự bấm “Unlock tricks”.

- **Nhiều trick một cú nhảy:** backflip cùng 360, rồi một chuỗi trick nút lần lượt (ví dụ table → tailwhip → barspin).
- **Một trick nhiều lần:** tailwhip ×2, barspin ×3…
  - Trick sau chỉ bắt đầu khi trick trước đã bắt lại xe.
  - Một trick chỉ bắt đầu khi còn đủ thời gian bay để bắt lại xe trước lúc chạm đất. Đo trong game: tailwhip mất 0,6 s một vòng, barspin 0,37 s.
- **Manual (đi bánh sau):** trên đường bằng hoặc dốc thoải, AI có thể nhấc bánh trước và giữ thăng bằng trên bánh sau. Nó nhìn thanh thăng bằng của game: xe sắp chúi xuống thì kéo lên, xe sắp lật ngửa thì thả ra. Đo trong game: giữ được hơn 10 giây mà gần như không mất tốc độ (kéo liên tục thì 3 giây là lật). AI tự thử đoạn nào nên đi manual; không bao giờ đi manual sát mép nhảy.
- **Sổ tay trick:** mỗi lần thử trick được ghi lại: bay bao lâu, trick gì, đáp được không. AI chọn trick như chọn máy đánh bạc nhiều cần. Trick đáng nhiều điểm và hay thành công với thời gian bay đó được thử nhiều hơn. Trick còn ít lần thử vẫn được thử tiếp.

Điểm game là của game: điểm Train nhân theo chuỗi đáp đẹp liên tiếp (tới ×5), cộng điểm kỹ năng. AI vẫn hiện điểm game, nhưng nó **học theo điểm trình diễn** ở dưới.

Điểm game, mỗi cú đáp:

| | Điểm |
|---|---|
| Điểm Train của game: Buttery · Clean · Sketchy · Flat/Cased | 160 · 140 · 100 · 50 |
| Backflip · Whip · mỗi nửa vòng xoay (360 = 200, 720 = 400, 1080 = 600) | +300 · +100 · +100 |
| Chuỗi đáp đẹp liên tiếp (Flat/Cased làm mất chuỗi) | × tới 5 |
| Điểm kỹ năng của game (bảng Tricks), mỗi loại trick một lần mỗi cú: whip 2, 360 4, backflip 6, barspin 3, T-bog 3, X-up 4, tailwhip 5, table 5, 360 table +10 | × 25 |
| Manual: mỗi 5 m (mỗi manual từ 1 giây trở lên) | 1 điểm kỹ năng × 25 |

Trick giữ nút (table, T-bog, X-up) game chỉ tính một lần mỗi cú nhảy, dù giữ bao lâu. Tailwhip và barspin thì mỗi vòng được đếm riêng.

### Điểm trình diễn: AI học theo điểm này

Mỗi lượt chạy là một màn trình diễn kỹ năng. **Mỗi cú nhảy được chấm riêng**, không phụ thuộc cú trước. Cú nhảy càng nhiều trick cùng lúc thì càng được nhân điểm.

| Mỗi cú nhảy | Điểm |
|---|---|
| Cú đáp: Buttery · Clean · Sketchy · Flat · Cased | 160 · 140 · 100 · 50 · 0 |
| Mỗi trick theo độ khó, bằng 50 × điểm kỹ năng của game (mỗi vòng đều tính: 720 = hai 360, tailwhip ×3 = ba tailwhip): backflip 300 · tailwhip 250 · table 250 · 360 200 · X-up 200 · barspin 150 · T-bog 150 · whip 100 · 360 table +500 | cộng lại |
| Hệ số combo cho tổng điểm trick: thêm 0,5 cho mỗi **loại** trick sau loại đầu, thêm 0,25 cho mỗi lần lặp lại | × (1 + 0,5 × (số loại − 1) + 0,25 × số lần lặp) |

Ví dụ với cú đáp Clean:

| Cú nhảy | Cách tính | Điểm |
|---|---|---|
| Backflip | 140 + 300 | 440 |
| Backflip + 360 + tailwhip | 140 + 750 × 2 | 1.640 |
| Backflip + 720 + tailwhip ×2 + barspin | 140 + 1.350 × 3 | 4.190 |

Cả lượt chạy cộng thêm:

| Thưởng / phạt | Giá trị |
|---|---|
| Mỗi **loại** kỹ năng đã dùng trong lượt (kể cả manual) | +300 |
| Mỗi giây giữ manual (manual từ 1 giây trở lên, giữ càng lâu càng nhiều) | +60 |
| Mỗi giây chạy (về đích càng nhanh càng tốt) | −20 |
| Mỗi cú đáp cased | −200 |
| Mỗi mét chạy lệch ra ngoài đường | −60 |
| Lệch khỏi mép nhảy (né cú nhảy) | lượt đó dừng ở đó |

## Tự cập nhật và chia sẻ

- **Tự cập nhật:** cứ 20 phút extension xem có bản AI mới không. Có thì AI lưu bộ nhớ, tải lại trang giữa hai lượt, rồi tự chạy tiếp đúng đường đang học.
- **Chia sẻ lượt kỷ lục:** chỉ lượt lái thật về đích không ngã và cao điểm hơn mọi lượt trước trên đường đó mới được làm video, nhiều nhất 30 phút một lần (để được thêm điểm Creator).
  - AI cắt camera, làm video 720p trong trình sửa của game, đặt tiêu đề “come to join my ride” rồi tạo link.
  - Sau đó AI mời mọi người trong chat vào chạy, kèm link.
  - Video cũ của AI tự bị xoá, chỉ giữ 3 video mới nhất. Video bạn tự làm thì AI không đụng tới.
- **Mời mọi người:** cứ 10 phút, lúc bắt đầu một lượt, AI bấm một trong hai nút mời của chat, lần lượt: “Invite everyone to <tên đường>” (vào chạy cùng) và “Invite everyone to watch you” (vào xem).
  - Không có file nào tải về máy bạn.

## Bộ nhớ

Mọi thứ AI học nằm trong IndexedDB của trình duyệt bạn:
- mỗi đường một bộ nhớ (`trailsai.line.<mã>`);
- danh sách thư viện (`trailsai.lines`);
- sổ tay trick (`trailsai.book`).

Bài học của bản AI cũ được tự chuyển vào thư viện ở lần chạy đầu, và bản gốc vẫn được giữ nguyên. AI không học trên GitHub nữa. Nó không gửi gì lên mạng, ngoài việc chia sẻ lượt chạy như một người chơi.

## Mã nguồn

- `src/` có các phần của AI theo thứ tự:
  - `00-head`: bộ nhớ, tiện ích;
  - `10-hook`: bắt vật lý và nút bấm của game;
  - `20-line`: đọc đường;
  - `sim/rider.js`: tay lái, dùng chung cho game và mô phỏng;
  - `sim/worker.js`: mô phỏng trong mỗi luồng;
  - `30-pool`: các luồng;
  - `40-learn`: việc học và sổ tay trick;
  - `50-library`: thư viện đường;
  - `60-drive`: lái xe thật, đổi đường, tự cập nhật;
  - `70-share`: chia sẻ;
  - `80-ui`: bảng AI;
  - `85-watch`: màn hình Xem AI tập;
  - `99-tail`.
- `node tools/build.js` ghép chúng thành `dist/trails-ai.js`, trang `docs/index.html` và `docs/trails-ai-extension.zip`.
- `tools/sim-test.js` và `tools/learn-test.js` chạy mô phỏng và việc học ngoài trình duyệt (bằng node) để kiểm tra.

## Quy tắc chơi đẹp

- Không đưa file của game (WebAssembly, bản đồ, hình ảnh) vào repo. AI dùng đúng các file game đã tải trong trình duyệt của bạn.
- Không đưa mật khẩu, token hay bất kỳ bí mật nào vào repo. AI chỉ đọc từ GitHub, không bao giờ cần đăng nhập.
- Khi AI lái thật, người chơi khác thấy xe bạn chạy như thường. Hãy chơi vui, đừng dùng AI để giành bảng xếp hạng hay làm phiền người khác.
- AI không bấm thay bạn những nút như “Unlock tricks”, “Reset map” hay “Learn it” của một trick.
- Dự án không liên quan tới nhà phát triển Trails.

## English

An AI that teaches itself to ride **one line you choose** in Trails: The Game:
- It learns by trial and error inside the game's own physics (WebAssembly in Web Workers), on your own computer.
- It rides your real bike from the line's start, ride after ride, using its best plan so far.

It follows the track as it was built: a line its builder laid out in their spot jump by jump, otherwise the pieces joined over bare ground, drops and jumps that turn in the air (the AI steers in flight there). Where a line forks (a lip with two landings, two lines laid out from one start) the AI learns each way in turn in the simulation, keeps what each got, and goes on with the one that gets furthest and scores most; a way that runs into a dead end is tried once and kept as it was.

Every trick your account has unlocked is practised, as many as the air allows: several tricks in one jump, the same trick more than once (double barspins, triple tailwhips). Each line's memory goes into a library in your browser. Take the bike to another line's start and the AI saves the old line, opens the new one and carries on there.

It updates itself between rides. A new best clean finished ride (30 minutes apart at most) is shared as a video titled "come to join my ride" with an invite in the game's chat, and the AI's older videos are deleted (the newest 3 kept). Every 10 minutes it also presses the chat's invite to the line or to watch it ride. The panel speaks Vietnamese by default; switch it to English in its settings.

Giấy phép: MIT.
