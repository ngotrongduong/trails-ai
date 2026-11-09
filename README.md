# AI tự học Trails

Một AI tự học cách chạy bất kỳ đường đua nào trong [Trails: The Game](https://trailsthegame.com): nó tự thử, tự ngã, rút kinh nghiệm, tập trick để lấy điểm cao nhất, rồi có thể **tự lái xe của bạn trong game thật**.

Đây là dự án cho vui, để mọi người cùng chơi, cùng góp sức và cùng học cách huấn luyện một AI.

**👉 Dùng ngay: [ngotrongduong.github.io/trails-ai](https://ngotrongduong.github.io/trails-ai/)**. Cách nhanh nhất là cài extension cho Edge/Chrome một lần, rồi AI tự bật mỗi khi bạn vào game. Hoặc kéo nút “AI Trails” lên thanh dấu trang rồi bấm nó trong game.

## AI học như thế nào

Với từng đường, AI không dùng mạng nơ-ron. Nó **dò từng đoạn đường bằng cách thử trong mô phỏng**, nhớ trạng thái của xe ở đầu mỗi đoạn, và lùi lại khi gặp chỗ không qua được (phần [bộ não chung](#bộ-não-chung-mạng-nơ-ron) bên dưới mới là mạng nơ-ron). Cách làm chi tiết nằm trong [docs/design.md](docs/design.md).

1. **Đọc đường đua.** AI đọc các chi tiết của đường (mép nhảy, mặt tiếp đất, cua nghiêng, mô pump…) từ chính dữ liệu game gửi về, rồi nối chúng thành một lộ trình chia theo từng mét.
   Từ mép nhảy, lộ trình nối được tới mặt tiếp đất xa tới 250 m (cú nhảy lớn xuống đồi dài); chi tiết khác chỉ nối được trong 40 m.
2. **Chia thành đoạn.** Mỗi cú nhảy là một đoạn, phần còn lại cứ 40 m một đoạn.
   **Không giới hạn tốc độ.** Tốc độ 18 m/s trong kế hoạch (hoặc từ 17,5 trở lên) nghĩa là không giới hạn: xe đạp khi còn có ích và không bao giờ phanh, đi nhanh bao nhiêu cũng được (40 m/s và hơn khi xuống đồi lớn). Bộ não chung cũng vậy khi nó đòi tốc độ cao nhất.
3. **Kế hoạch (plan).** Với mỗi đoạn, AI giữ vài con số: tốc độ cần giữ (có thể chia đoạn thành vài phần, mỗi phần một tốc độ), góc xe khi bay, có nhấc xe ở mép nhảy không, có pump không, dồn người về trước hay ra sau khi bánh còn trên đất, làm trick gì, ở độ cao nào. Việc lái (bẻ lái theo đường, đạp tới tốc độ, cân xe trên không) do một bộ điều khiển cố định làm.
4. **Mô phỏng nhớ được trạng thái.** Mỗi luồng CPU chạy một bản **vật lý thật của game** (đúng file WebAssembly game dùng). Toàn bộ trạng thái vật lý nằm trong bộ nhớ của file đó, nên AI lưu được xe ở bất kỳ chỗ nào và chạy tiếp từ đó, ra đúng y như chạy từ đầu (đã kiểm tra từng bit, cả khi chuyển trạng thái sang luồng khác). Nhờ vậy thử một cách đi mới ở mét 280 chỉ tốn vài mét chạy, không phải chạy lại 280 m.
5. **Dò từng đoạn.** AI đi dọc đường, giữ **6 cách đi tốt nhất** tới đầu mỗi đoạn. Từ mỗi cách, nó thử đoạn đó hàng chục kiểu: quanh kế hoạch đang có; vẽ lại hẳn (tốc độ bất kỳ 3–18 m/s, góc bay bất kỳ, có nhấc xe hay không); luôn có một lần **không giới hạn tốc độ**; trên cú nhảy thì cả một lưới tốc độ × góc bay, cách đã thành công ở cú nhảy giống của đường khác, và các trick hợp với thời gian bay. Vòng thử thứ hai lấy giá trị từ những lần tốt nhất của vòng đầu rồi thử quanh chúng. Mỗi lần thử chạy tới khi xe đã chạm đất ở đoạn sau được 0,75 s, vì cú nhảy đúng hay sai lộ ra lúc tiếp đất và lúc chạy tiếp. Sáu lần thử tốt nhất (khác tốc độ nhau, để giữ cả cách đến nhanh lẫn cách đến chậm) thành sáu cách đi tới đoạn sau.
6. **Gặp chỗ không qua được thì lùi lại.** Không lần thử nào qua được một đoạn thì AI lùi lại 1 đoạn, rồi 2, 4, 6 đoạn, và thử những đoạn đó rộng hơn: nguyên nhân ngã thường nằm ở cách xe đến chỗ đó (chậm quá, nhanh quá, cú nhảy trước tiếp đất xấu).
7. **So như game chấm.** Hai lần thử được so ở cùng một chỗ: trước hết là mục tiêu bài tập, rồi xe còn chạy hay đã ngã, rồi (còn chạy) điểm game tính tới đó, (đã ngã) lần nào đi xa hơn. Cách đi tốt nhất cả đường được chạy lại từ đầu để kiểm tra rồi mới giữ. Kế hoạch đang giữ luôn có mặt trong 6 cách đi, nên một lượt dò không bao giờ làm mất nó. Lượt dò sau rộng hơn nếu lượt trước không tìm được gì tốt hơn.

Vượt đường, tiếp đất đẹp để giữ chuỗi nhân, tập trick, pump: tất cả được học cùng lúc trong mỗi lượt dò, không còn chế độ riêng cho từng việc.

So với cách học cũ (bản 2: mỗi lần thử chạy cả đường, bảy chế độ học với nhiều luật đặt tay), đo trên cùng máy (18 luồng):

- Đường Trảng Sương 29 (cuarkplp1p, 305 m), **học từ con số 0**: về đích sau 65 giây, 3060 điểm sau 72 giây, 3700 điểm sau 84 giây. Bài học cũ cần 2367 vòng mới được 1890 điểm.
- Cùng đường, **bắt đầu từ bài học cũ** 1890 điểm: 3130 điểm sau 113 giây.
- Đường n458teqth2 (177 m): bài học cũ 590 điểm, AI mới lên 1350 điểm trong 2 phút.
- Đường gf6cqjb3rr: 360 lên 410 điểm, đường practice-996191-0: từ 36 m lên 79 m.
- Chưa qua được: grl507un6p (mét 144) và gf6cqjb3rr (mét 116). Cả hai là mép nhảy gần như dựng đứng (xe ngóc tới 80°), xe lao thẳng lên rồi rơi xuống tại chỗ. AI đã thử gần 10.000 kiểu (tốc độ 3–18 m/s, nhấc xe, dồn người về trước) mà chưa có kiểu nào qua.
- Tốc độ thử: khoảng 460 lần thử mỗi giây trên đường này. Ở đường có hàng trăm chi tiết sát đường thì vật lý của game chậm hơn khoảng 6 lần.
- Trạng thái lưu lại khớp tuyệt đối: trong các lượt đo cuối, mọi lượt chạy từ trạng thái đã lưu đều ra đúng như chạy lại từ đầu. (Trước đó có vài lần lệch: trạng thái được lưu sau bước mà bộ lái đã dùng giá trị cũ của đoạn mới. Giờ trạng thái được lưu ngay trước bước đó.)

(Phần lịch sử: cách học cũ bị kẹt vì AI tập trick khi chưa qua được đường, chọn lượt theo tổng điểm thay vì đi xa, và chỉ giữ một kế hoạch tốt nhất. Một cú cần đến chậm hơn để kịp cú sau thì bị bỏ ngay.)

Trong bảng AI chỉ cần hai nút: **Học lái** (AI tự xoay vòng: học đường đang chọn, tập một bài tập kiểu Training, luyện bộ não chung, xem bên dưới) và **AI lái**. Mọi thứ khác nằm trong mục **Chi tiết, xem lại và chia sẻ** thu gọn ở cuối bảng.

Nút nhỏ **EN** ở góc trên bảng AI chuyển mọi thứ AI hiển thị sang tiếng Anh (nút đổi thành **VI** để chuyển lại tiếng Việt). Trình duyệt nhớ lựa chọn này cho những lần sau. Những dòng đã ghi trong nhật ký thì giữ nguyên ngôn ngữ lúc ghi.

Vật lý của game cho kết quả giống hệt nhau mỗi lần chạy, nên những gì AI làm được trong mô phỏng thì ngoài game nó cũng làm được y như vậy. Đã kiểm tra: mô phỏng ngã ở mét 1096 thì AI lái thật ngã ở mét 1094.

### Vừa lái thật vừa học

Khi bấm **AI lái**, AI lái xe của bạn trong game. Bài học của đường này và bộ não chung đều chạy thử trong mô phỏng trước, cái nào đi xa hơn thì lái. Nếu **Học lái** đang bật, phần nền vẫn tiếp tục học. Mỗi giây AI xem đã có kế hoạch mới tốt hơn chưa. Nếu kế hoạch mới giữ nguyên cách chạy ở phần đường xe đã đi qua, nghĩa là chỉ đổi những đoạn phía trước, thì AI dùng nó ngay trong lượt đang chạy, vì khi đó trạng thái xe ngoài game đúng bằng trạng thái mà mô phỏng đã chấm điểm. Ngã hay hết đường, AI tự lái lại từ đầu với bài học mới nhất, cho tới khi bạn bấm **Dừng AI lái**.

**Lái tiếp cho tới khi hết đường.** Tới vạch đích AI không dừng: nó lái như một người chơi, còn thấy đường là còn đi.

- **Tự thấy mọi đường quanh mình:** cứ 2 giây AI xem lại mọi chi tiết (mép nhảy, dốc đáp, mô pump, cua...) game đã tải quanh xe (game tải dần mặt đất phía trước khi xe đi). Đường nào cũng tính: nằm ngay phía trước dù không phải điểm đầu của nó, chạy chéo hay cắt ngang đường đang đi, ở bên cạnh, hay phải quay lại mới vào được. Mỗi đường có thể chạy theo chiều của nó hoặc chạy ngược. Chỗ rẽ có thể ở cuối đường đang đi (đường mới trong vòng 60 m), hoặc ở giữa đường, cách xe hơn 30 m về phía trước (đường mới trong vòng 30 m). Với mỗi đường, AI tìm điểm dễ nhập vào nhất (xét từng 2 m dọc theo nó) và một đường cong nối sang đó, không có khúc nào gắt hơn bán kính 2,5 m. Đường không được trùng phần lớn với chỗ đã đi trong lượt này. Đường nhảy mà chạy ngược chiều thì xe sẽ gặp mặt sau của mép nhảy, nên AI thử sau cùng.
- **Thử từng hướng trong mô phỏng:** AI thử cùng lúc tối đa 3 hướng ở nền (chia nửa số luồng CPU), mỗi hướng một lượt học riêng như trên. Mỗi hướng bắt đầu từ khoảng 25 m trước chỗ rẽ, ở chỗ xe đang chạm đất, với đúng tốc độ mà kế hoạch đường đang đi nói xe sẽ có ở đó. Vì vậy AI tự học luôn nên vào cua nhanh hay chậm, có cần lấy đà để leo dốc hay vượt mép nhảy phía sau không. Tốc độ, độ gắt của khúc cua và độ dốc đều được tính bằng chính vật lý của game, không đoán.
- **Chọn hướng tốt nhất ngay tại chỗ rẽ:** tới chỗ một hướng bắt đầu, AI so số mét mô phỏng chạy được trên hướng đó với số mét còn lại nếu đi thẳng theo đường cũ. Hướng nào ngã trong vòng 20 m sau khi nhập vào thì bỏ. Rẽ ngang giữa đường thì hướng mới phải đi xa hơn ít nhất 15 m mới rẽ. Ở cuối đường, AI chọn hướng đi xa nhất (về đích được cộng thêm). Sau khi rẽ, AI vẫn học tiếp hướng đó trong lúc chạy, và lại tìm các đường đi tiếp từ đó.
- **Hết đường thì dừng an toàn:** không có hướng nào qua được thì AI tiếp đất cú cuối, chạm đất nửa giây là phanh, như người chơi thấy hết đường. AI ghi rõ lý do: không thấy đường nào, hay đã thấy N hướng nhưng hướng nào cũng ngã trong mô phỏng. AI chỉ phanh khi xe đang đi tới, và chỉ phanh hết cỡ ở chỗ bằng. Lúc xe trôi lùi thì AI thả phanh: hai lượt thật đã lật ngửa vì phanh khi trôi lùi, một lần đang dừng giữa dốc ramp, một lần phanh nhẹ lúc lùi 4 m/s. Xe đứng lại ở chỗ bằng thì AI giữ phanh 3 giây rồi lái lại từ đầu đường.
- **Mô phỏng tập cả đoạn sau đích:** khi học, một lượt chỉ tính là về đích nếu xe tiếp đất, phanh dừng hẳn ở chỗ bằng và giữ phanh thêm 1 giây mà không đổ. Trước đây mô phỏng dừng ngay ở vạch đích, nên một lượt "về đích" vẫn có thể ngã ngay sau đó ngoài game.
- **Đo trên đường cuarkplp1p (Trảng Sương 29):** cuối đường là một hố nhỏ, sau đó là bậc đất cao gần 1 m và dốc đáp của một đường nhảy khác quay mặt về phía xe. Bản trước chỉ nhập từ đúng cuối đường, không có đoạn lấy đà, nên mọi hướng đều ngã trong vòng 23 m. Khi đó xe đi thẳng chờ và ngã thật ở 304 m. Bản này thấy 3 hướng: hai đường nhảy phải chạy ngược chiều, và một đường 60 m chạy xuôi chiều, quay 29°. Mô phỏng chạy cả ba từ 25 m trước chỗ rẽ ở 30 km/h (tới 15 luồng CPU), và hướng nào cũng ngã sau 17–50 m. Vì vậy AI phanh dừng, giữ phanh hơn 30 giây không đổ, và game chấm đúng như mô phỏng: 304 m, 5860 điểm. Chưa đo được một lần rẽ thật sang đường mới: quanh điểm thử, bài học của các đường khác đều ngã trước cuối đường.
- **Không đứng kẹt mãi:** xe chạm nhẹ vào một vách đất thẳng đứng thì có thể không đổ mà cứ đứng đó đạp mãi. Giờ, 3 giây không tiến thêm được mét nào (trừ lúc đang bay) thì AI coi là kẹt, kết thúc lượt và lái lại từ đầu. Mô phỏng dùng đúng luật 3 giây đó (trước là 8 giây), nên khi học, những cách chạy đâm vào vách bị loại ngay và bị trừ điểm như ngã. Sau đích, nếu xe chúi mũi vào vách mà không đứng thăng bằng được, sau 7 giây AI cũng coi là đã dừng.
- **Chỉ dừng hẳn khi bạn bấm “Dừng AI lái”.** Một lượt lái kết thúc khi xe ngã, bị kẹt, lạc khỏi đường, hoặc không còn hướng nào đi tiếp. Sau đó AI giữ phanh 3 giây rồi lái lại từ đầu đường, với những gì vừa học thêm. Nếu lúc lái lại có gì cản (ví dụ game chưa tải xong đường), AI thử lại sau 5 giây. Bấm phím khác trong game không làm AI dừng.
- **Đo ngoài game** (Trảng Sương 29): trước khi sửa, AI qua vạch đích rồi đạp lên con dốc phía sau, không đủ lực, trôi ngược và ngã. Phía trước đích chỉ có các bục nhảy quay ngược chiều, nên đúng là hết đường. Sau khi sửa, AI đi hết đường với 3120 điểm, đúng bằng số mô phỏng tính, rồi tự phanh dừng và đứng yên.

### Đường chỗ bạn đứng (📍)

Ngoài các đường có sẵn trong danh sách, bạn có thể đạp xe tới bất kỳ đường nào, quay mặt theo hướng muốn chạy rồi bấm **📍**. AI tìm chi tiết đường gần bạn nhất (trong vòng 20 m, chạy xuôi hay ngược tùy hướng bạn đang nhìn) và thêm đường đó lên đầu danh sách. Sau đó bạn bấm **Học lái** để AI học đường này, hoặc **AI lái** để AI tự lái. Đường được lưu lại cho lần sau.

Để xe có đà khi tới chỗ bạn đứng, đường bắt đầu lùi về sau tối đa 40 m, nhưng không lùi qua mép nhảy nào. Nếu phía sau là dốc xuất phát, đường bắt đầu trên đỉnh dốc đó, đúng chỗ game cho xuất phát. Lần thử đầu đã lùi qua cả dốc xuất phát: xe bị đặt sau lưng con dốc, lần thử nào cũng kẹt sau 3 m vì phải leo ngược mặt sau của dốc.

Mỗi lượt lái thật cũng là một lần kiểm tra mô phỏng: AI so chỗ ngã thật với chỗ mô phỏng dự đoán, và so bản đồ trong mô phỏng với những chi tiết game vừa tải dọc đường. Lệch là dấu hiệu đường đã bị sửa và AI cần dò lại đường.

### Thử thách của game (🏆)

Bấm **🏆 Làm thử thách của game** thì AI tự làm các thử thách ngày, tuần và sự kiện của game, cho tới khi xong hoặc bạn bấm nút lần nữa.

- **Đọc thử thách:** AI hỏi server danh sách thử thách giống hệt lúc bạn mở trang Challenges của game (mỗi phút nhiều nhất một lần), và đọc luật của từng thử thách ngay trong file của game: đếm cái gì (cú đáp, cú đáp sạch, whip, 360, backflip, mét manual...), cần bao nhiêu, có phải trong một lượt hay cộng dồn. Sau mỗi lượt game tính, server gửi tiến độ mới và AI cập nhật theo.
- **Thứ tự:** thử thách sắp hết hạn trước, cùng hạn thì cái nhiều XP trước. Thử thách xây đường (creator) và "chơi N ngày" thì AI bỏ qua, vì cái đó bạn tự làm.
- **Chọn đoạn đường:** với mỗi thử thách, AI lấy bài học đã có của từng đường gần đó và đếm xem một lượt chạy theo bài đó làm được bao nhiêu phần của thử thách (với thử thách cộng dồn thì tính theo mỗi phút chạy). Đường làm được nhiều nhất thắng. Bằng nhau thì ưu tiên đường đã học, rồi đường nhiều cú nhảy hơn, rồi đường gần hơn. Thử thách "N cú đáp liên tiếp" thì bỏ qua đường có ít hơn N cú nhảy.
- **Học riêng cho thử thách:** AI học một bản riêng của đường đó, với điểm chấm là chính thử thách (ví dụ "20 cú đáp sạch"), giống cách nó học bài Training. Khi mô phỏng đã làm được (hoặc đã có tiến độ, với thử thách cộng dồn), AI lái thật và vẫn học tiếp ở nền.
- **Theo dõi:** AI xem tiến độ server báo. Có tiến độ thì báo bạn, xong thì sang thử thách kế. 6 phút không thêm được gì thì AI bỏ đường đó và chọn đường khác. Đường không dò được từ chỗ đứng (game chưa tải hết), hoặc học 1 phút mà chưa lượt thử nào đi được 30 m, cũng bị bỏ ngay.
- **Whip "chiều kia" (your other way):** lúc đầu game chưa biết bạn hay whip về phía nào, nên AI đoán. Sau vài cú whip, game ghi lại chiều của bạn, và AI học lại ngay để whip theo chiều ngược lại.
- **Trick chưa mở khóa:** game chỉ đếm trick trên đường thật khi tài khoản đã mở khóa trick; trick làm trong Training không được tính cho thử thách. Nếu thử thách cần trick mà chưa mở khóa, AI nhờ bạn mở bài **Training → Trick line** rồi AI tự học và làm bài đó. Game có thể hiện nút **"Unlock tricks"**: AI không bao giờ bấm nút này, bạn tự quyết định.
- **Đo trên tài khoản thử:** với một thử thách giả "đáp sạch 20 cú", AI chọn Trảng Sương 29 (bài học cũ đáp sạch 9 cú mỗi lượt), học bản riêng trong khoảng 2500 vòng tới 10/20 cú mỗi lượt trong mô phỏng, rồi tự lái thật. Bài Trick line thì AI mới làm được 4/5 trick (chưa đáp được cú 360).
- **Đo trên thử thách thật** (sau khi mở khóa trick): server tính đúng những gì AI làm.
  - "Manual 100 m in all": 0 lên xong trong vài lượt trên Bãi Sao 33, khoảng 30 m manual mỗi lượt.
  - "Land 31 whips": 0 lên 31/31 trên Rừng Sương 91, 4 đến 6 whip mỗi lượt.
  - "50 whips your other way": game ghi chiều của bạn là trái sau những cú whip đầu, AI chuyển sang whip phải, và server bắt đầu đếm (8/50 sau vài phút).

### Mượn kinh nghiệm giữa các đường

Kế hoạch của AI gắn với từng đoạn của một đường, nên tự nó không dùng được ở đường khác. Vì vậy AI ghi lại **hình dạng** của mỗi cú nhảy nó đã vượt qua: góc mép nhảy, độ cao mép, mặt đất sau mép ở 3/6/9/12/16 m (khoảng hở và chỗ tiếp đất), độ dốc đoạn lấy đà. Kèm theo đó là cách đã dùng: tốc độ, góc xe khi bay, có nhấc xe hay pump không.

- Khi bắt đầu một đường mới, với mỗi cú nhảy AI tìm cú giống nhất trong kho, cả kho trên máy bạn và kho cộng đồng [`experience/jumps.json`](experience/jumps.json). Nó thử chạy cả đường bằng cách mượn được, và chỉ giữ nếu cách đó đi xa hơn học từ con số 0.
- Khi bị kẹt ở một cú nhảy, một phần sáu số lần thử mỗi vòng dùng cách đã thành công ở những cú nhảy giống nó.

Đo lần đầu trên 4 đường mới, mỗi đường 25 vòng: có mượn thì điểm cao hơn ở 3/4 đường, nhưng chỉ một lần cải thiện là do cách mượn trực tiếp, nên chưa thể nói nó giúp nhiều. Kho hiện mới có 16 cú nhảy từ một đường. Kho càng lớn thì càng dễ tìm được cú giống.

### Học từ cách bạn lái (👀)

Khi bạn tự lái (AI không lái), AI ngồi xem: mỗi khung hình nó ghi vị trí, tốc độ, góc xe và các nút bạn bấm (đạp, phanh, pump, nhấc xe, whip). Hết một lượt (bạn dừng lại, ngã, hay rời khỏi đường), AI đặt lượt đó lên **mọi đường nó biết** (đường đang học và các đường đã có bài học) mà bạn đã lái qua ít nhất 30 m, rồi rút ra cho từng mét: tốc độ bạn **muốn** đi (đoán từ đạp và phanh, không chỉ tốc độ xe đang chạy), chỗ bạn nhấc xe trước mép nhảy, pump mạnh cỡ nào, và với mỗi cú nhảy bạn tiếp đất được: góc xe khi sắp chạm đất, trick bạn làm và lúc bạn buông nó.

- Trick của bạn vào **sổ tay trick**, để AI biết với thời gian bay đó trick nào làm được.
- Lần học đường đó (hoặc ngay lúc AI đang học nó), AI thử chạy cả đường theo cách bạn lái, và theo cách bạn qua các cú nhảy nhưng ở tốc độ của AI. Chỉ giữ nếu trong mô phỏng nó đi xa hơn hoặc điểm cao hơn cách AI đang có.
- Mỗi lượt dò, ở mỗi đoạn bạn đã lái trọn, AI thử thêm cách của bạn ở riêng đoạn đó (tối đa 3 lượt gần nhất của bạn), nên cách tốt của bạn ở một cú nhảy vẫn được dùng dù cả lượt của bạn chưa tốt bằng.

Giới hạn: AI chỉ học từ những đường nó đã biết; tốc độ "muốn đi" là đoán từ nút đạp và phanh; với cú flip, góc xe lúc chạm đất không được lấy (lúc đó xe còn đang lộn). Trên một đường AI đã lái rất tốt, đổi cả một đoạn theo cách khác thường làm hỏng các cú nhảy sau, nên cách của bạn có ích nhất ở những chỗ AI đang bị kẹt. Nút **👀 Học từ cách tôi lái** trong phần Chi tiết bật/tắt việc này (mặc định bật). Mọi thứ chỉ lưu trong trình duyệt của bạn.

### Tập bài tập kiểu Training

Trong **Học lái**, mỗi khi đường đang chọn 3 phút không tiến thêm, AI dành khoảng 3 phút tập các **bài tập kiểu Training** do nó tự tạo mới (cách tạo xem phần bộ não bên dưới). Mỗi bài được học giống như học một đường thật. Bài nào về đích thì AI sang bài tiếp theo ngay.

- **Khó dần:** về đích một bài thì các bài sau khó hơn 10 %. Hết giờ mà chưa đi được nửa bài thì dễ đi 10 %. Bài khó hơn có mép nhảy dốc và dài hơn, khoảng hở tới 12 m, step-up cao tới 1,7 m, và tới 5 cú nhảy liên tiếp. Độ khó được lưu trong trình duyệt.
- **Cái AI giữ lại:** mỗi cú nhảy vượt được vào kho kinh nghiệm, nên đường mới mượn được. Bài học của bài tập cũng thành bài cho bộ não chung bắt chước. Trình duyệt giữ 24 bài tập mới nhất (mỗi bài khoảng 20 KB).

Đo trên máy 16 luồng:

- Bài tập dễ (đợt đầu) thì AI về đích sau 3–4 giây, nên dạy được rất ít. Vì thế mới có độ khó tăng dần. Sau 90 giây, ở độ khó 60 % AI đi được 171/287 m, ở độ khó 100 % được 243/334 m.
- Học từ đầu đường thật cuarkplp1p (305 m) trong 75 giây, 3 lần mỗi kiểu: không có kinh nghiệm từ bài tập thì đi được 150, 151, 186 m. Có kinh nghiệm từ 4–7 bài tập thì đi được 319, 186, 319 m (319 m là về đích). Có bài tập thì lần nào cũng có 1–4 lần cải thiện nhờ cú nhảy mượn được, không có thì chưa lần nào. Trên 3 đường thật khác (102, 182, 250 m) thì kết quả như nhau, có và không có bài tập đều vậy.
- Bộ não chung luyện 6 phút có bài tập hay không có bài tập đều chưa khá lên. Nó học quá chậm nên đo trong vài phút không thấy được, cần đo khi luyện hàng giờ.

### Bộ não chung (mạng nơ-ron)

Kế hoạch của từng đường chỉ dùng được trên đường đó. **Bộ não** thì khác: nó là một mạng nơ-ron nhỏ, không nhớ đường nào cả mà **nhìn** rồi quyết định, nên lái được cả những đường nó chưa từng thấy.

- **Nó thấy gì** (22 con số, cứ 2 khung hình một lần): tốc độ, góc xe và góc đang xoay nhanh cỡ nào, đang bay hay chạm đất, đang lên hay xuống, cao hơn mặt đất bao nhiêu, mặt đất ở 2, 4, 6, 8, 11, 14, 18, 22, 27 và 33 m phía trước, còn bao xa tới mép nhảy kế tiếp, dốc của chỗ tiếp đất, và xe đang ở trên mép nhảy, mặt tiếp đất hay mô pump.
- **Nó quyết định gì** (4 con số): tốc độ cần giữ (2–18 m/s), có nhấc xe không, pump mạnh bao nhiêu, và góc xe khi bay (lệch tới 0,8 rad so với dốc đáp). Phần bẻ lái theo đường vẫn do bộ điều khiển cố định làm. Mạng có 22 đầu vào, 16 nơ-ron ẩn và 4 đầu ra (420 trọng số).
- **Cách luyện:** bộ não luyện trong lúc **Học lái** đang bật, mỗi khi đường đang chọn 3 phút không tiến thêm (khoảng 5 phút mỗi lượt, rồi AI quay lại đường). AI gom tới 40 đường: các đường đã học trong trình duyệt, rồi đường từ những điểm xuất phát gần đường đang chọn nhất (mọi điểm game đã tải chi tiết, trong vòng 800 m, không chỉ 15 điểm trong danh sách; hai điểm cách nhau dưới 3 m chỉ lấy một), tới 12 bài tập AI đã học xong, và ít nhất 4 bài tập mới. Mỗi đường được chấm trên 400 m đầu. Mỗi vòng AI thử 20 bộ não hơi khác nhau trên 12 đường lấy lần lượt theo thứ tự xáo trộn, nên đường nào cũng được dùng đều nhau, rồi nhích bộ não về phía những bộ đi xa hơn. Cách này gọi là chiến lược tiến hóa (evolution strategies). Cứ 5 vòng, bộ não chạy trên cả 40 đường và được giữ lại nếu nó đi giỏi hơn bộ tốt nhất trước đó.
- **Bài tập kiểu Training:** mỗi lượt luyện có tới 12 bài AI đã tập xong ở bước tập bài tập (có bài học để bắt chước) và ít nhất 4 bài tạo mới (từ dễ tới khó bằng bài AI đang tập), giống các bài Training của game: dốc xuất phát, rồi table, double, step-up, step-down, ba cú liên tiếp, mô pump và cua nghiêng, kích thước ngẫu nhiên. Chúng nằm trên con dốc Training của game (dốc 6 % từ x = 9100), và được xếp như game xếp bài Training: chi tiết sau bắt đầu ở chỗ chi tiết trước kết thúc, và dốc đáp dài vừa đủ để đỉnh cao hơn (step-up) hay thấp hơn (step-down) mép nhảy. Như vậy bộ não tập đủ kiểu cú nhảy thay vì chỉ học thuộc vài đường gần bạn, và vẫn luyện được khi quanh bạn có ít đường.
- **Đường đang chọn được để riêng:** bộ não không bao giờ luyện trên nó. Con số trên đường đó cho biết bộ não lái giỏi cỡ nào trên một đường lạ.
- **Bắt chước bài học:** trước khi tự luyện, bộ não xem các bài học đã có trên máy chạy đường của chúng và học làm giống vậy. Sau đó nó tự chạy, còn bài học chỉ cho nó nên làm gì ở những chỗ nó đến. Kết quả chỉ được giữ nếu giỏi hơn.
- **Bộ não lái:** khi bấm **AI lái**, bộ não lái nếu nó đi xa hơn bài học của đường đó trong mô phỏng, hoặc nếu đường chưa có bài học.
- **Tên đường:** mỗi đường trong danh sách có một tên riêng như “Đồi Thông 37” thay vì “điểm xuất phát cách 40 m”. Tên được tạo từ mã của điểm xuất phát, nên đường nào cũng giữ đúng tên đó trên mọi máy. Bấm **✎** cạnh danh sách để tự đặt tên khác (lưu trong trình duyệt); để trống thì dùng lại tên AI đặt.
- **Đi tiếp sang đường khác:** tới cuối đường, AI đi tiếp sang đường phía trước (xem [Vừa lái thật vừa học](#vừa-lái-thật-vừa-học)). Trước bản 3, AI chỉ nhìn 35 m phía trước một lần lúc vào đường, bộ não lái đường đi tiếp, và AI dừng ngay ở vạch đích nếu lúc đó chưa thấy đường. Khi đó khoảng 8 trên 21 đường quanh điểm thử có đường để đi tiếp. Những đường còn lại kết thúc ở chỗ chỉ có đường chạy ngược chiều.
  - **Học luôn các đường đi tiếp:** khi bắt đầu **Học lái**, AI nối luôn các đường đi tiếp đó vào sau đường đã chọn (tối đa 6 đường, 1500 m) và học cả tuyến như một đường. Bài học vì thế biết cả các đường sau, với đúng tốc độ xe tới mỗi đường, và **AI lái** đi tiếp bằng bài học chứ không bằng bộ não. Hết tuyến, bộ não lái tiếp như trên. Bài học cũ (học trên đường lẻ) vẫn giữ được: các đoạn nằm trọn trên đường cũ giữ nguyên, phần nối thêm bắt đầu từ cách bộ não lái nó. Thử trên zwu4bywywe: đường 102 m thành tuyến 255 m, AI giữ 755 vòng đã học và đi được 141 m thay vì 116 m. Bài học chưa học lại theo tuyến thì AI lái vẫn dùng đường lẻ như cũ.
- **Chỗ khó chung:** trên 62 đường (40 đường luyện, 22 đường để riêng), cả hai phiên bản bộ não đều ngã ở 36 đường, và 26 trong số đó ngã cùng một chỗ (lệch không quá 5 m), phần lớn ở chỗ tiếp đất hoặc mép nhảy. Bài học riêng của từng đường thì vượt được những chỗ đó: đường cuarkplp1p đi được 319 m bằng bài học, chỉ 102–106 m bằng bộ não.
  - **Vì sao ngã ở đó.** Ghi lại từng khoảnh khắc trên không, so bộ não với bài học ở cùng cú nhảy: tốc độ cất cánh gần như bằng nhau, nhưng bài học tiếp đất gần bằng phẳng (−0,05 đến +0,1 rad), còn bộ não chúi mũi (−0,6 đến −1,1 rad) rồi ngã. Bộ não nhắm theo dốc của miếng tiếp đất, trong khi xe thường chạm đất ở chỗ khác, nên nó học cách chúi mũi ở mọi cú nhảy. Khi đã nhắm đúng góc, phần lớn các lần ngã còn lại là do tốc độ cất cánh: bay quá xa (đường sni4rh24nj: xe bay cao 12 m rồi rơi xuống chỗ bằng) hoặc bay hụt, đập vào gờ đất phía trước.
  - **Đã thử và bỏ: nhắm theo chỗ xe sẽ chạm đất.** Trên không, bộ não tính trước xe chạm đất ở đâu (trọng lực trong game 9 m/s², xe cao hơn mặt đất 0,42 m, đo từ các lượt chạy) rồi nhắm theo dốc ở đó, với đầu ra góc bay 0,8 hoặc 0,4 rad. Trên 62 đường, ba bộ não đi 59,4–61,7 % (0,8 rad) và 60,0–60,7 % (0,4 rad), so với 58,4–63,2 % như cũ. Luyện lại từ đầu 4 phút: đường để riêng 74,4 % so với 73,6 %, đường luyện 59,0 % so với 62,3 %. Không hơn rõ ràng.
  - **Đã thử và bỏ: mượn cú nhảy đã học.** Gần mép một cú nhảy giống cú trong kho kinh nghiệm (37 trên 47 cú nhảy ở đường để riêng có cú giống), bộ não dùng tốc độ, chỗ nhấc xe và góc bay mà bài học đã dùng. Kết quả tệ hơn: 58,4 % xuống 53,9 % và 63,2 % xuống 58,0 % trên 62 đường. Tệ hơn cả trên đường mà kho có chính cú nhảy đó (u45ttcre6s: 400 m xuống 156 m). Bài học qua được nhờ cả kế hoạch ăn khớp với nhau (pump, tốc độ trước đó, cú tiếp đất trước), không nhờ riêng các con số ở một cú nhảy. Mã của hai lần thử ở nhánh `try-hard-spots`.
- **Bộ não giúp bài học ở đường mới:** khi AI bắt đầu học một đường chưa học, bộ não (nếu đã luyện) chạy đường đó trong mô phỏng. Cách nó lái được chép thành kế hoạch, từng đoạn một: tốc độ, chỗ nhấc xe trước mép nhảy, độ pump, góc xe khi bay. Có 4 cách chép tốc độ: theo tốc độ bộ não nhắm hay tốc độ xe thật sự chạy, tính trên cả đoạn hay chỉ 8 m cuối đoạn. AI chạy thử cả 4, và bài học chỉ bắt đầu từ cách tốt nhất nếu nó hơn học từ con số 0 và hơn cách mượn cú nhảy.
- **Chia sẻ:** **Lưu bộ não** / **Mở bộ não** ra file. **Chia sẻ GitHub** trong phần bộ não lưu file và mở trang tải lên thư mục [`brain/`](brain/). Khi bắt đầu luyện, AI tải bộ não cộng đồng `brain/brain.json`, chạy thử trên các đường của bạn, và chỉ dùng nếu nó giỏi hơn.

Đo lần đầu trên 12 đường luyện và 1 đường để riêng (150 m), máy 16 luồng:

- Mỗi vòng mất 12–19 giây. Sau 80 vòng (khoảng 16 phút), bộ não đi được **61%** của 400 m đầu các đường luyện. Bộ não mới tinh đi được 49%.
- Trên đường để riêng, bộ não chưa giỏi hơn: bộ não mới đi được 35 m, bộ não đã luyện đi được 27–41 m. Với 12 đường, nó mới học thuộc các đường luyện chứ chưa học được cách lái chung. Cần nhiều đường hơn và luyện lâu hơn nhiều.
- Từ 12 lên 40 đường (32 đường thật trong vòng 800 m, 8 bài tập), cùng máy: nạp 40 đường mất khoảng 20 giây, mỗi vòng 5–6 giây (12 đường một vòng). Luyện 12 phút (125 vòng) thì bộ não đi từ 63 % lên 64 % quãng đường cả 40 đường. Trên đường để riêng nó vẫn đi 106 m (bộ não mới tinh: 79 m). Nhiều đường hơn giúp bộ não không học thuộc, nhưng cách luyện này tiến rất chậm.
- **Bộ não phiên bản 2 (học nhanh hơn).** Trong 78 cú nhảy AI đã vượt ở các đường, 16 cú cần tốc độ trên 13 m/s, mức cao nhất bộ não đời đầu đòi được, và 7 cú cần nghiêng xe nhiều hơn mức nó cho phép. Bộ não đời đầu không bao giờ qua được những cú đó, và khi bắt chước bài học thì nó cũng không chép đúng được. Bộ não phiên bản 2 đòi được 2–18 m/s và nghiêng 0,8 rad. Số của bộ não đời đầu mang nghĩa khác, nên bộ não mới bắt đầu lại từ đầu, lưu ở chỗ mới (`trailsai.brain2`); bộ não cũ vẫn còn trong trình duyệt nhưng không dùng nữa.
- **Bắt chước trước, rồi mới tự luyện.** Đo từ bộ não mới tinh, trên cùng 40 đường (19 đường có bài học, phần lớn là bài tập) và 8 đường để riêng:

  | | Lúc đầu | Sau bắt chước (8 giây) | 2 phút | 4 phút | 6 phút |
  |---|---|---|---|---|---|
  | Bắt chước bài học rồi tự luyện | 49 % | 56 % | 59 % | 64 % | 64 % |
  | Chỉ tự luyện | 49 % | – | 55 % | 61 % | 61 % |

  Vì vậy mỗi lượt bộ não lấy tới 12 bài tập AI đã học xong (trước là 4) để bắt chước. Nhưng trên 8 đường để riêng, cả hai cách đều chỉ đi từ 42 % lên 43 %. Bộ não học các đường luyện nhanh hơn, còn lái đường lạ thì chưa giỏi hơn.
- **Đã thử và bỏ:** leo dốc như bài học của một đường (giữ bộ não tốt nhất, thử 20 bản sửa, nhận bản nào đi xa hơn). Cách này học đường luyện nhanh như tự luyện nhưng lái đường lạ kém đi (42 % xuống 35 % sau 6 phút). Bắt chước lâu hơn (200, 600 lượt thay vì 60) cũng không giúp. Bài học của các đường khác nhau qua những cú nhảy giống nhau theo những cách khác nhau, nên bộ não chỉ học được mức trung bình của chúng.
- **Đã thử và bỏ: cho bộ não nhìn hình dạng cú nhảy phía trước** (thêm 10 con số: có mép nhảy hay không, còn bao xa, góc và độ cao của mép, mặt đất sau mép ở 3, 6, 9, 12, 16 m, dốc đoạn chạy đà; mạng lên 32 đầu vào, 580 trọng số). Đo trên 40 đường luyện và 22 đường để riêng (16 đường thật, 6 bài tập), hai cách chia khác nhau, mỗi bản luyện 4 phút từ đầu. Đường để riêng: 69,0 % / 63,2 % với hình dạng cú nhảy, 68,4 % / 63,1 % không có. Gần như bằng nhau, nên không đáng để mọi người phải luyện lại bộ não từ đầu. Mã vẫn còn ở nhánh `try-jump-shape`.
- Bộ não đời đầu luyện hàng giờ chỉ đạt khoảng 63 %. Một bộ não mới tinh tự luyện 4 phút đã đạt mức đó.
- Bắt chước bài học giúp ít hơn mong đợi. Bộ não làm theo khá sát (tốc độ lệch khoảng 0,7 m/s, nhấc xe đúng 95/97 lần). Nhưng bài học được tìm bằng thử-sai cho đúng một đường đi, nên chỉ lệch một chút là xe ngóc đầu và ngã ở chỗ bài học đi qua được. Trong 3 lần thử, kết quả bắt chước được giữ một lần.
- Bộ não lái xe thật trong game ngã ở mét 36, đúng như mô phỏng dự đoán.

Đo cách bắt đầu bài học từ bộ não (bộ não 89 vòng) trên 10 đường gần nhau. Có thể bộ não đã luyện trên một số đường trong đó.

- Bản chép tốt hơn học từ con số 0 ở 5 đường: 143 m so với 53 m, 65 m so với 56 m, 51 m so với 16 m, 53 m so với 19 m, 27 m so với 22 m. Ở 5 đường còn lại thì bằng nhau, phần lớn vì cách nào cũng về đích.
- Bản chép có khi đi xa hơn chính bộ não (143 m so với 89 m): cách chép không giống hệt bộ não, và lần này sự khác biệt có lợi.
- Không có cách chép nào luôn tốt nhất. Chép tốc độ ở 8 m cuối đoạn giúp nhiều nhất trên các đường có cú nhảy, vì đó là tốc độ lúc rời mép nhảy.

### Điểm AI tự chấm cho mỗi lượt thử

| | Điểm |
|---|---|
| Mỗi mét đi được | +1 |
| Tốc độ 5 m trước chỗ xa nhất | +0,05 mỗi m/s (tối đa +1) |
| Mỗi cú nhảy tiếp đất sạch | +15 |
| Về đích | +150 |
| Backflip / 360 / Tailwhip / Barspin | +300 / +200 / +150 / +120 |
| Table / T-bog / X-up | +80 / +80 / +60 |
| Whip | +1 mỗi độ |
| Combo nhiều trick trong một cú nhảy | ×1,5, ×2, … |
| Manual | +10 mỗi mét |
| Ngã / kẹt / đứng lại | −25 |
| Lạc khỏi đường | −20 |

Trick chỉ được tính khi tiếp đất xong vẫn đứng vững. Thang điểm này chỉ dùng để so những lượt chưa về đích (và cho bộ não chung). Lượt về đích thì so bằng điểm của game, phần dưới đây.

### Chấm từng cú nhảy như game

Game chấm mỗi cú tiếp đất bằng một chữ: **Buttery**, **Clean**, **Sketchy**, **Flat** (rơi xuống chỗ bằng) hay **Cased** (bay hụt). Điểm thì game chỉ tính trong chế độ train. AI đọc cách tính đó từ mã của game và tính y hệt cho từng cú nhảy trong mô phỏng:

| | Điểm |
|---|---|
| Mỗi cú nhảy | 100 (Flat hay Cased: 50) |
| Tiếp đất Buttery / Clean | +60 / +40 |
| Backflip | +300 |
| Xoay 360 / 540 / 720 | +200 / +300 / +400 |
| Whip | +100 |
| Chuỗi nhân | ×1 đến ×5: tăng 1 sau mỗi cú không Flat, không Cased; Flat hay Cased đưa về ×1 |

**Cased bị trừ điểm:** game cho cú Cased 50 điểm (chỉ mất chuỗi nhân), nên khi chưa tìm được tốc độ đủ để bay tới dốc đáp, AI dễ chọn cách an toàn là đi chậm, rơi xuống mặt bằng của bục nhảy. Vì thế khi AI tự so các lượt thử, mỗi cú Cased bị trừ thêm 200, tức là thành −150 thay vì +50. Điểm game hiển thị vẫn đúng như game tính. Đo trên Trảng Sương 29: chỉ sau 2 vòng học với luật mới, cú thứ 5 đổi từ Cased thành Buttery, điểm cả đường từ 5690 lên 8100, và không còn cú Cased nào.

Vì chuỗi nhân, một cú tiếp đất xấu ở đầu đường làm mất điểm của mọi cú sau nó. Từ bản 3, mỗi lượt dò chọn ở từng đoạn những cách đi được nhiều điểm game nhất tới đó (cùng chuỗi nhân), nên tiếp đất đẹp, giữ chuỗi và trick được học ngay trong lúc vượt đường. Những cách dưới đây là của bản 2 (từng chế độ riêng), giữ lại để biết AI đã đi tới đây thế nào. Sổ tay trick và phần xem lại vẫn dùng như cũ.

- **Xem lại lượt tốt nhất:** mỗi cú nhảy có thời gian bay, độ cao, độ xa, chữ game chấm, trick, điểm và hệ số nhân, kèm lời khuyên. Ví dụ "chúc đầu 32° so với dốc đáp: giữ đầu xe ngẩng hơn", "bay hụt: cần lấy đà nhanh hơn", hoặc "bay đủ lâu cho Backflip". Tất cả có trong mục **Xem lại từng cú nhảy** (phần Chi tiết). Góc lệch lúc chạm đất phân biệt rõ các chữ: Clean lệch khoảng 3°, Sketchy khoảng 32°.
- **Tập tiếp đất đẹp hơn:** AI chọn một cú không Clean (cú Flat hay Cased được chọn nhiều hơn) rồi thử đổi góc xe khi bay, tốc độ lúc rời mép nhảy, đà ở đoạn trước, và có nhấc xe hay không. Nếu một lần thử tiếp đất đẹp hơn nhưng ngã ở đoạn sau, AI giữ lần đó và tập tiếp phần sau (tối đa 40 vòng) cho tới khi về đích.
- **Nhớ kỷ lục từng cú nhảy:** lượt được giữ là lượt nhiều điểm nhất cả đường, nên đổi cách nhảy ở một cú có thể làm cú khác tiếp đất kém đi (Buttery tụt về Clean chẳng hạn). Vì vậy AI ghi lại, cho từng cú nhảy, lần tiếp đất đẹp nhất từng có trong mọi lần thử (chữ game chấm, rồi độ lệch so với dốc đáp), kèm tốc độ, góc, pull, pump của cú đó và đoạn lấy đà trước nó. Khi cú đó đang kém hơn kỷ lục, AI hay quay lại tập nó, và mỗi vòng thử lắp lại đúng các giá trị của kỷ lục (cả hai đoạn, chỉ đoạn của cú nhảy, hoặc lệch góc một chút). Thử 24 vòng không lấy lại được thì thôi. Kỷ lục được lưu cùng bài học.
- **Tập trick có chủ đích:** khi tài khoản đã mở khóa trick, mỗi lần thử trick được ghi vào **sổ tay trick**: bay bao lâu, động tác nào, có tiếp đất được không, game tính trick gì. Trên một cú nhảy, AI xét các lần thử trên những cú có thời gian bay gần bằng (chênh dưới 0,2 s) và chọn động tác như chọn máy đánh bạc nhiều cần (UCB): mỗi động tác được tính khả năng tiếp đất được trick nhân điểm trick (chưa thành công lần nào thì lấy điểm game cho trick đó: backflip 300, 360 200, whip 100), cộng thêm phần thưởng cho động tác còn ít lần thử. Động tác trick nào thử chưa tới 3 lần ở mức thời gian bay này thì được thử trước trong vòng. Trước đây động tác được chọn theo bình phương điểm đã đạt, nên whip (trick dễ nhất) chiếm gần hết các lần thử. Cú nhảy bay càng lâu càng được chọn tập trick nhiều hơn. Một trick tiếp đất được (kể cả Sketchy) mà chưa làm tổng điểm cao hơn thì không bị bỏ: AI theo nó 40 vòng, tập tiếp đất cú đó với trick giữ nguyên và chạy tiếp phần sau. Sổ tay dùng chung cho mọi đường trong trình duyệt.
- **Sửa xa hơn về phía trước:** AI đếm số vòng tập một cú tiếp đất mà không cải thiện được. Từ vòng thứ 8, một phần ba số lần thử đổi cả các đoạn trước cú đó (tốc độ, có khi chia đoạn, góc bay và pull của các cú trước, pump), lùi càng xa khi càng hỏng nhiều: 3 đoạn, rồi tới 6 đoạn. Một cú nhảy đến mép theo cách các cú trước đưa nó tới, nên chỗ cần sửa có thể nằm ở đó. (Khi chưa về đích và bị kẹt, AI đã có cách tương tự: lùi tới 5 đoạn, rồi vẽ lại hẳn 3 đoạn trước chỗ ngã.)
- **Lái thật cũng được chấm:** sau mỗi lần AI lái thật, nhật ký ghi game đã chấm bao nhiêu Buttery, Clean, Sketchy… và bao nhiêu điểm.

Đo được:
- Trên đường Trảng Sương 29 (cuarkplp1p, 305 m), bài học cũ về đích với 990 điểm: 11/12 cú Sketchy hoặc Cased, chuỗi không quá ×2. Sau khoảng 40 vòng tập tiếp đất, AI được 1510 điểm.
- Lần AI lái thật trong game được chấm đúng như mô phỏng: 1130 điểm ở một lần, 1510 điểm ở lần sau.
- Với trick mở khóa, AI làm được backflip, nhưng trick rất khó tiếp đất: trong 284 lần thử chỉ 2 lần whip thành công. Sổ tay sẽ giúp dần khi có nhiều lần thử trên nhiều đường.
- Nhớ kỷ lục từng cú và sửa xa hơn về trước: bài học 1580 điểm của Trảng Sương 29 đã đứng yên khoảng 1880 vòng. Với hai cách mới, nó lên 1890 điểm sau 127 vòng (khoảng 6 phút): một cú từ Cased lên Sketchy, một cú từ Sketchy lên Clean.
- Chọn trick theo thời gian bay, thử trên bài Jumping (bay khoảng 1,0–1,15 s, trick bật tạm trong mô phỏng): AI thử Backflip 119 lần (đáp được 1), 360 hai chiều khoảng 200 lần (chưa đáp được lần nào), whip hai chiều khoảng 1030 lần (đáp được 78%). Với chừng đó thời gian bay chỉ whip làm được, nên AI dồn vào whip sau khi đã thử đủ các trick khác.
- Trên đường thường, game chỉ cho làm trick khi tài khoản đã mở khóa (đủ 200 cú nhảy và 5 đường). Trước đó AI chỉ tập chạy hết đường và tiếp đất đẹp, không thử trick. Các bài Training thì mỗi bài mở đúng trick của nó.

### Các bài Training của game

Mở một bài trong **Home › Training** rồi bấm **Ride**: bài đó hiện trong danh sách đường của AI ("Training: Pump & pull"…). AI dựng lại bài trong mô phỏng và học cho tới khi đạt đúng điều game yêu cầu, chấm như game chấm (AI đọc luật từ mã của game):

| Bài | Game yêu cầu | AI chấm thế nào |
|---|---|---|
| Pumping | 6 lần pump tốt trong một lượt, không đạp | Mỗi lần ấn pump được chấm như game: bắt đầu và kết thúc quanh đáy chỗ trũng, và phải tăng ít nhất 0,3 km/h |
| Pump track | 2 vòng không đạp, không dừng | Về đích (một vòng) không đạp |
| Jumping, Pump & pull | Mọi cú nhảy tiếp đất sạch trong một lượt | Từng cú theo thứ tự. Một cú nhảy bị bỏ qua (chỉ nảy lên mặt bàn) tính là hỏng. Chỗ tiếp đất đo đúng như game: qua khỏi gờ đáp, chưa quá chân dốc |
| Boost & racer | 2 lần boost (bay cao ít nhất 0,97 m) và 2 lần racer (bay thấp, tối đa 0,86 m), xen kẽ | Hai bài học riêng. Khi lái thật, AI đọc dòng "now: boost / racer" trên màn hình game để chọn đúng bài |
| Beginner line | Về đích không ngã | Về đích |
| Manual, Whip, 360, Backflip | Làm được trick đó | Trick được game tính |
| Trick line | Backflip, 360, whip (mỗi cú nhảy một trick khác nhau) và manual tới đích | Mỗi cú nhảy tính nhiều nhất một loại trick |

Luật quan trọng nhất học được khi lái thật: game chỉ tính tiếp đất **sạch** khi lực va dưới 5 và xe lệch dốc đáp không quá 12°. Riêng boost được phép đáp mạnh tới 6,5. Một cú mà mô phỏng chấm "Clean" nhưng sát giới hạn thì lái thật có thể thành Sketchy. Vì vậy AI chỉ tính một cú là đạt khi còn dư: Buttery, hoặc lực va dưới 4,5 và lệch dưới 12°. Với boost: lực va dưới 6, bay cao ít nhất 1,02 m.

Khi lái thật, độ cao và lực va đo trong game khớp mô phỏng đến hai chữ số (boost: 1,08 m và 5,62 cả hai bên).

Đã qua trong game thật: cả 6 bài Basics (Pumping, Pump track, Jumping, Pump & pull, Boost & racer, Beginner line) và 4 bài trick (Manual, Whip, 360, Backflip). Ví dụ Pump & pull: cú nhảy đầu chỉ có 3 m lấy đà, nên AI phải giữ khoảng 35 km/h từ dốc xuất phát. Lượt thật được 2 Buttery và 1 Clean.

Chưa qua: **Trick line**. Cú nhảy thứ ba là cú nhảy xuống dốc (step-down) với khoảng 2 s bay. AI chưa xoay xong 360 trước khi chạm đất nên bị ngã. Tailwhip, Barspin và No-hander còn khóa: game mở chúng khi lên cấp trick 4, 6 và 9.

### Pump và chọn tốc độ, góc cho mỗi cú nhảy

- **Pump đúng chỗ:** AI tìm các chỗ trũng trên đường như game tìm (độ cong mặt đất, không tính chỗ sát mép nhảy) và chỉ ấn pump từ ngay trước tới ngay sau đáy chỗ trũng. Trên các đường đã về đích, cứ 5 vòng AI dành một vòng thử bật/tắt pump ở từng đoạn và dời điểm bắt đầu/kết thúc pump.
- **Tốc độ và góc cho mỗi cú nhảy:** khi tập một cú tiếp đất chưa đẹp, AI thử cả một lưới: tốc độ rời mép nhảy lệch −1,2 đến +1,8 m/s và góc xe khi bay lệch −0,1, 0, +0,1 rad. Nếu đoạn lấy đà ngắn hơn 15 m, AI đổi luôn tốc độ ở đoạn trước đó (gấp 3 lần), vì đoạn ngắn không kịp tăng tốc.
- **Nhanh hơn khi bằng điểm:** giữa hai lượt cùng kết quả, lượt có tốc độ trung bình cao hơn được giữ lại. Ở bài Jumping, tốc độ trung bình lên từ 26,9 lên 37,4 km/h mà vẫn tiếp đất sạch.

## Học nhanh hơn: cùng nhau

- AI dùng gần hết các luồng CPU của máy (tối đa 16). Mở thêm tab trên cùng máy **không** nhanh hơn; các tab cùng học một đường sẽ tự trao cho nhau bài học giỏi nhất.
- **Nhiều máy mới thật sự nhanh hơn.** Bài học giỏi nhất của mỗi đường được chia sẻ trong thư mục [`lessons/`](lessons/). Khi bắt đầu học một đường, AI tự tải bài học cộng đồng, **chạy lại bằng vật lý trên máy mình** và chỉ dùng nếu nó thật sự giỏi hơn. Trong lúc học, cứ 10 phút AI lại xem có bài mới không.
- Vì AI luôn tự kiểm tra lại, một bài học sai hay điểm khai gian không làm AI của ai tệ đi.

### Học trên máy chủ GitHub (miễn phí)

Ngoài máy của bạn, các bài học trong [`lessons/`](lessons/) còn được học tiếp trên máy chủ của GitHub, kể cả khi máy bạn tắt (workflow [`cloud-learn`](.github/workflows/cloud-learn.yml)).

- **Cách làm:** mỗi ngày hai lần, GitHub chạy 4 máy cùng lúc, mỗi máy học tiếp một đường trong 40 phút, lần lượt hết các đường. Công cụ [`tools/cloud-learn.js`](tools/cloud-learn.js) mở AI trong một trình duyệt không có cửa sổ, với đúng vật lý của game. Bài nào đi xa hơn hoặc nhiều điểm hơn thì được lưu lại vào `lessons/`. AI trong game của bạn tự tải bài đó, chạy lại trên máy bạn, và chỉ dùng nếu nó thật sự giỏi hơn.
- **Luật của game:** game không có điều khoản cấm. Việc học chỉ cần 5 file công khai của game: vật lý (WebAssembly) và địa hình, khoảng 8 MB. Mỗi máy tải chúng một lần như khi trình duyệt mở trang game. Không cần tài khoản, không kết nối máy chủ của game. Các file đó chỉ nằm trong thư mục tạm của máy chủ: không bao giờ được đưa vào repo hay tải lên đâu cả.
- **Luật của GitHub:** Actions là để phát triển và kiểm thử dự án, và không được tạo tải nặng không tương xứng. Học bài cho thư mục `lessons/` của chính dự án này nằm trong phạm vi đó, nên workflow chỉ chạy ở mức vừa phải.
- **Đường nào được học:** các đường có bài học trong `lessons/`. Muốn thêm đường, bấm **Chia sẻ GitHub** như ở phần Góp sức.
- **Đo trên máy với 4 luồng** (bằng một máy chủ GitHub):
  - đường `ra436prczm` từ 690 lên 840 điểm game trong 6 phút (2 vòng dò);
  - đường dài `u45ttcre6s` (2237 m) cần 12 phút cho một vòng dò.

  Mỗi máy chủ GitHub chỉ có 4 luồng, ít hơn máy 16 luồng của bạn, nên lợi ích chính là học thêm cả khi máy bạn tắt, và học nhiều đường cùng lúc.

## Góp sức

- **Góp bài học:** bấm **Chia sẻ GitHub** trong bảng AI, kéo file vào trang vừa mở, bấm **Propose changes**. Xem [`lessons/README.md`](lessons/README.md).
- **Cải tiến AI:** sửa [`src/trails-ai.js`](src/trails-ai.js), chạy `node tools/build.js` để dựng lại `dist/` và `docs/`, rồi mở pull request. Một vài ý tưởng:
  - cách tìm kiếm thông minh hơn (CMA-ES, giữ nhiều kế hoạch song song thay vì một)
  - bộ điều khiển pump tốt hơn để giữ tốc độ qua các mô đất
  - học trên nhiều xe khác nhau
- Mọi pull request đều được kiểm tra tự động: mã đọc được, `dist/` và `docs/` đã dựng lại, file bài học đúng định dạng.

## Cấu trúc

```text
src/trails-ai.js           mã nguồn AI (có chú thích)
dist/trails-ai.js          bản gọn mà extension và nút “AI Trails” tải về (dựng từ src)
docs/index.html            trang hướng dẫn trên GitHub Pages (dựng từ src)
docs/trails-ai-extension.zip  extension đóng gói sẵn để cài (dựng từ extension/)
extension/                 extension cho Edge/Chrome: chạy AI trước khi game khởi động
lessons/<mã đường>.json    bài học cộng đồng, mỗi đường một file
experience/jumps.json      kho kinh nghiệm cú nhảy, gom từ lessons/ (workflow tự dựng)
brain/brain.json           bộ não chung của cộng đồng (mạng nơ-ron, 420 trọng số)
tools/build.js             dựng dist/ và docs/
tools/check-lessons.js     kiểm tra các file bài học và bộ não
tools/gather-experience.js gom kinh nghiệm cú nhảy vào experience/
tools/cloud-learn.js       học tiếp các bài học không cần mở game (workflow cloud-learn chạy trên GitHub)
```

## Quy tắc chơi đẹp

- Không đưa file của game (WebAssembly, bản đồ, hình ảnh) vào repo. AI dùng đúng các file game đã tải trong trình duyệt của bạn.
- Không đưa mật khẩu, token hay bất kỳ bí mật nào vào repo. Nút AI chỉ đọc từ GitHub, không bao giờ cần đăng nhập.
- Khi AI lái thật, người chơi khác thấy xe bạn chạy như thường. Hãy chơi vui, đừng dùng AI để giành bảng xếp hạng hay làm phiền người khác.
- AI chỉ gửi tới server những gì game của bạn vẫn gửi (ví dụ hỏi danh sách thử thách), và không bấm thay bạn những nút như "Unlock tricks" hay "Reset map".
- Dự án không liên quan tới nhà phát triển Trails.

## English

A fun, open project: an AI that teaches itself to ride any line in Trails: The Game by trial and error inside the game's own physics (WebAssembly, run in Web Workers), learns tricks, and can ride your real bike in the game. A small shared neural network ("the brain", trained with evolution strategies on many lines at once, after first imitating the lessons) rides lines it has never seen, and gives a new line's lesson its starting plan when that rides better; it is shared in `brain/`. Lessons (the learned plan per line) are shared in `lessons/`; every client re-verifies a shared lesson in its own simulation before using it. Open [the how-to page](https://ngotrongduong.github.io/trails-ai/) to try it. The panel speaks Vietnamese by default; press **EN** at its top to switch it to English (kept in your browser). When you ride yourself, the AI watches (👀, on by default): on every line it knows, it notes the speed you aimed for, where you pulled and pumped, your pitch in the air and your tricks, books the tricks, and tries your way in its simulation, whole and section by section, keeping it only where it rides better. The AI has no speed limit: a planned speed at the top of its range means pedal while it helps and never brake, and a route joins a takeoff to a landing up to 250 m on, for big jumps down long hills. Contributions welcome: lessons via the panel's "Share on GitHub" button, code via pull requests (run `node tools/build.js` first).

Giấy phép: MIT.
