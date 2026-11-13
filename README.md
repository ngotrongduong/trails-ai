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
- **Mô phỏng thật.** Mỗi luồng chạy đúng file vật lý (WebAssembly) của game, nên cách đi nào chạy được trong mô phỏng thì ngoài game cũng chạy y như vậy. Trạng thái của xe được lưu ở đầu mỗi đoạn. Nhờ vậy thử một cách mới ở mét 800 chỉ tốn vài mét chạy.
- **Kế hoạch.** Mỗi đoạn có vài con số: tốc độ (có thể chia phần), góc xe khi bay, nhấc xe trước mép, pump mạnh bao nhiêu và pump kiểu nào, dồn người, đánh lái trên không. Cú nhảy có thêm **chương trình trick**.

- **Pump để lấy tốc độ.** AI pump ngay từ đầu, rồi thử ba kiểu pump: qua các chỗ trũng (như phần Training của game chỉ), ở mặt dốc đi lên (bờ bên kia chỗ trũng, mặt mô, mặt mép nhảy), hoặc ở chỗ đất đổ xuống. Đo trên 6 đường: pump ở mặt dốc lên hoặc qua chỗ trũng giúp xe nhanh thêm 0,5–2 m/s, đủ để bay qua những cú nhảy dài hơn.
- **Không đi đường vòng.** Mỗi điểm trên đường biết bề rộng thật của chi tiết đường ở đó. Xe chạy lệch ra ngoài mép quá 1 m ngay cạnh mép nhảy là bị coi như né cú nhảy: lượt đó dừng ở đó, như bị ngã. Lệch ra ngoài ở chỗ khác thì bị trừ 60 điểm cho mỗi mét.
- **Dò từng đoạn.** Tới đầu mỗi đoạn AI giữ 6 cách đi tốt nhất. Nó thử đoạn đó hàng chục kiểu từ mỗi cách, rồi giữ 6 kiểu tốt nhất cho đoạn sau. Không qua được thì AI lùi lại vài đoạn và thử rộng hơn. Cách tốt nhất cả đường được chạy lại từ đầu để kiểm tra rồi mới giữ.
- **So như game chấm.** Đi hết đường được ưu tiên trước, rồi đi xa hơn, rồi nhiều điểm hơn. Mỗi cú Cased bị trừ thêm 200 điểm khi so, để AI không chọn cách an toàn là bay hụt.
- **Rút kinh nghiệm từ lượt thật.** Có đoạn lượt thật ngã (hoặc đáp Flat hay Cased) mà mô phỏng thì không. AI đánh dấu đoạn đó là “mong manh”. Ở đó mỗi cách thử được chạy thêm ba lần: nhanh hơn 0,3 m/s, chậm hơn 0,3 m/s, và trick muộn hơn 0,06 s. AI chỉ giữ cách nào qua được cả bốn lần.

## Trick

AI tập mọi trick mà tài khoản của bạn đã mở: **backflip, 360/720/1080, whip, tailwhip, barspin, table, T-bog, X-up, 360 table**. AI không bao giờ tự bấm “Unlock tricks”.

- **Nhiều trick một cú nhảy:** backflip cùng 360, rồi một chuỗi trick nút lần lượt (ví dụ table → tailwhip → barspin).
- **Một trick nhiều lần:** tailwhip ×2, barspin ×3…
  - Trick sau chỉ bắt đầu khi trick trước đã bắt lại xe.
  - Một trick chỉ bắt đầu khi còn đủ thời gian bay để bắt lại xe trước lúc chạm đất. Đo trong game: tailwhip mất 0,6 s một vòng, barspin 0,37 s.
- **Sổ tay trick:** mỗi lần thử trick được ghi lại: bay bao lâu, trick gì, đáp được không. AI chọn trick như chọn máy đánh bạc nhiều cần. Trick đáng nhiều điểm và hay thành công với thời gian bay đó được thử nhiều hơn. Trick còn ít lần thử vẫn được thử tiếp.

Điểm AI tính cho mỗi cú đáp:

| | Điểm |
|---|---|
| Điểm Train của game: Buttery · Clean · Sketchy · Flat/Cased | 160 · 140 · 100 · 50 |
| Backflip · Whip · mỗi nửa vòng xoay (360 = 200, 720 = 400, 1080 = 600) | +300 · +100 · +100 |
| Chuỗi đáp đẹp liên tiếp (Flat/Cased làm mất chuỗi) | × tới 5 |
| Điểm kỹ năng của game, mỗi loại trick một lần mỗi cú: whip 2, 360 4, backflip 6, barspin 3, T-bog 3, X-up 4, tailwhip 5, table 5, 360 table +10 | × 25 |
| Mỗi vòng trick lặp thêm (barspin ×2, tailwhip ×3…) | +15 |

Khi so hai cách đi, AI còn tính thêm những khoản thưởng/phạt riêng của nó (không cộng vào điểm game):

| Thưởng / phạt | Giá trị |
|---|---|
| Mỗi trick đáp được (720 tính 2, barspin ×2 tính 2) | +30 |
| Combo: mỗi cú đáp đẹp liên tiếp × độ dài combo lúc đó (cú thứ 5 liên tiếp +75) | +15 × combo |
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

Every trick your account has unlocked is practised, as many as the air allows: several tricks in one jump, the same trick more than once (double barspins, triple tailwhips). Each line's memory goes into a library in your browser. Take the bike to another line's start and the AI saves the old line, opens the new one and carries on there.

It updates itself between rides. A new best clean finished ride (30 minutes apart at most) is shared as a video titled "come to join my ride" with an invite in the game's chat, and the AI's older videos are deleted (the newest 3 kept). Every 10 minutes it also presses the chat's invite to the line or to watch it ride. The panel speaks Vietnamese by default; switch it to English in its settings.

Giấy phép: MIT.
