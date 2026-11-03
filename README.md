# AI tự học Trails

Một AI tự học cách chạy bất kỳ đường đua nào trong [Trails: The Game](https://trailsthegame.com): nó tự thử, tự ngã, rút kinh nghiệm, tập trick để lấy điểm cao nhất, rồi có thể **tự lái xe của bạn trong game thật**.

Đây là dự án cho vui, để mọi người cùng chơi, cùng góp sức và cùng học cách huấn luyện một AI.

**👉 Dùng ngay: [ngotrongduong.github.io/trails-ai](https://ngotrongduong.github.io/trails-ai/)** (kéo nút “AI Trails” lên thanh dấu trang, rồi bấm nó trong game).

## AI học như thế nào

Không có mạng nơ-ron nào ở đây. AI học bằng **thử và sai có chọn lọc**, kiểu tiến hóa:

1. **Đọc đường đua.** AI đọc các chi tiết của đường (mép nhảy, mặt tiếp đất, cua nghiêng, mô pump…) từ chính dữ liệu game gửi về, rồi nối chúng thành một lộ trình chia theo từng mét.
2. **Chia thành đoạn.** Mỗi cú nhảy là một đoạn, phần còn lại cứ 40 m một đoạn.
3. **Kế hoạch (plan).** Với mỗi đoạn, AI giữ vài con số: tốc độ cần giữ, góc xe khi bay, có nhấc xe ở mép nhảy không, có pump không, làm trick gì, ở độ cao nào. Việc lái (bẻ lái theo đường, đạp tới tốc độ, cân xe trên không) do một bộ điều khiển cố định làm.
4. **Thử trong mô phỏng.** Mỗi luồng CPU chạy một bản **vật lý thật của game** (đúng file WebAssembly game dùng). Mỗi vòng AI tạo vài chục bản sao của kế hoạch, mỗi bản đổi một chút quanh chỗ hay ngã, chạy thử tất cả, và giữ bản tốt nhất.
5. **Hai giai đoạn.** Đầu tiên học vượt hết đường; khi đã qua được các cú nhảy, AI xen kẽ tập trick trên chúng.

Vật lý của game cho kết quả giống hệt nhau mỗi lần chạy, nên những gì AI làm được trong mô phỏng thì ngoài game nó cũng làm được y như vậy. Đã kiểm tra: mô phỏng ngã ở mét 1096 thì AI lái thật ngã ở mét 1094.

### Vừa lái thật vừa học

Khi bấm **Để AI lái**, AI lái xe của bạn trong game, còn phần nền vẫn tiếp tục học. Mỗi giây AI xem đã có kế hoạch mới tốt hơn chưa. Nếu kế hoạch mới giữ nguyên cách chạy ở phần đường xe đã đi qua, nghĩa là chỉ đổi những đoạn phía trước, thì AI dùng nó ngay trong lượt đang chạy, vì khi đó trạng thái xe ngoài game đúng bằng trạng thái mà mô phỏng đã chấm điểm. Ngã xong, AI tự lái lại từ đầu với bài học mới nhất.

Mỗi lượt lái thật cũng là một lần kiểm tra mô phỏng: AI so chỗ ngã thật với chỗ mô phỏng dự đoán, và so bản đồ trong mô phỏng với những chi tiết game vừa tải dọc đường. Lệch là dấu hiệu đường đã bị sửa và AI cần dò lại đường.

### Điểm AI tự chấm cho mỗi lượt thử

| | Điểm |
|---|---|
| Mỗi mét đi được | +1 |
| Mỗi cú nhảy tiếp đất sạch | +15 |
| Về đích | +150 |
| Backflip / 360 / Tailwhip / Barspin | +300 / +200 / +150 / +120 |
| Table / T-bog / X-up | +80 / +80 / +60 |
| Whip | +1 mỗi độ |
| Combo nhiều trick trong một cú nhảy | ×1,5, ×2, … |
| Manual | +10 mỗi mét |
| Ngã / kẹt / đứng lại | −25 |
| Lạc khỏi đường | −20 |

Trick chỉ được tính khi tiếp đất xong vẫn đứng vững. Đây là thang điểm để AI tự học, không phải điểm chính thức của game.

## Học nhanh hơn: cùng nhau

- AI dùng gần hết các luồng CPU của máy (tối đa 16). Mở thêm tab trên cùng máy **không** nhanh hơn; các tab cùng học một đường sẽ tự trao cho nhau bài học giỏi nhất.
- **Nhiều máy mới thật sự nhanh hơn.** Bài học giỏi nhất của mỗi đường được chia sẻ trong thư mục [`lessons/`](lessons/). Khi bắt đầu học một đường, AI tự tải bài học cộng đồng, **chạy lại bằng vật lý trên máy mình** và chỉ dùng nếu nó thật sự giỏi hơn. Trong lúc học, cứ 10 phút AI lại xem có bài mới không.
- Vì AI luôn tự kiểm tra lại, một bài học sai hay điểm khai gian không làm AI của ai tệ đi.

## Góp sức

- **Góp bài học:** bấm **Chia sẻ GitHub** trong bảng AI, kéo file vào trang vừa mở, bấm **Propose changes**. Xem [`lessons/README.md`](lessons/README.md).
- **Cải tiến AI:** sửa [`src/trails-ai.js`](src/trails-ai.js), chạy `node tools/build.js` để dựng lại `dist/` và `docs/`, rồi mở pull request. Một vài ý tưởng:
  - cách tìm kiếm thông minh hơn (CMA-ES, giữ nhiều kế hoạch song song thay vì một)
  - chia đoạn mịn hơn quanh các cú nhảy khó
  - bộ điều khiển pump tốt hơn để giữ tốc độ qua các mô đất
  - học trên nhiều xe khác nhau
- Mọi pull request đều được kiểm tra tự động: mã đọc được, `dist/` và `docs/` đã dựng lại, file bài học đúng định dạng.

## Cấu trúc

```text
src/trails-ai.js        mã nguồn AI (có chú thích)
dist/trails-ai.js       bản gọn mà nút “AI Trails” tải về (dựng từ src)
docs/index.html         trang hướng dẫn trên GitHub Pages (dựng từ src)
lessons/<mã đường>.json bài học cộng đồng, mỗi đường một file
tools/build.js          dựng dist/ và docs/
tools/check-lessons.js  kiểm tra các file bài học
```

## Quy tắc chơi đẹp

- Không đưa file của game (WebAssembly, bản đồ, hình ảnh) vào repo. AI dùng đúng các file game đã tải trong trình duyệt của bạn.
- Không đưa mật khẩu, token hay bất kỳ bí mật nào vào repo. Nút AI chỉ đọc từ GitHub, không bao giờ cần đăng nhập.
- Khi AI lái thật, người chơi khác thấy xe bạn chạy như thường. Hãy chơi vui, đừng dùng AI để giành bảng xếp hạng hay làm phiền người khác.
- Dự án không liên quan tới nhà phát triển Trails.

## English

A fun, open project: an AI that teaches itself to ride any line in Trails: The Game by trial and error inside the game's own physics (WebAssembly, run in Web Workers), learns tricks, and can ride your real bike in the game. Lessons (the learned plan per line) are shared in `lessons/`; every client re-verifies a shared lesson in its own simulation before using it. Open [the how-to page](https://ngotrongduong.github.io/trails-ai/) to try it. Contributions welcome: lessons via the in-game "Chia sẻ GitHub" button, code via pull requests (run `node tools/build.js` first).

Giấy phép: MIT.
