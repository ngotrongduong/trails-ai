# AI tự học Trails

Một AI tự học cách chạy bất kỳ đường đua nào trong [Trails: The Game](https://trailsthegame.com): nó tự thử, tự ngã, rút kinh nghiệm, tập trick để lấy điểm cao nhất, rồi có thể **tự lái xe của bạn trong game thật**.

Đây là dự án cho vui, để mọi người cùng chơi, cùng góp sức và cùng học cách huấn luyện một AI.

**👉 Dùng ngay: [ngotrongduong.github.io/trails-ai](https://ngotrongduong.github.io/trails-ai/)**. Cách nhanh nhất là cài extension cho Edge/Chrome một lần, rồi AI tự bật mỗi khi bạn vào game. Hoặc kéo nút “AI Trails” lên thanh dấu trang rồi bấm nó trong game.

## AI học như thế nào

Với từng đường, AI không dùng mạng nơ-ron. Nó học bằng **thử và sai có chọn lọc**, kiểu tiến hóa (phần [bộ não chung](#bộ-não-chung-mạng-nơ-ron) bên dưới mới là mạng nơ-ron):

1. **Đọc đường đua.** AI đọc các chi tiết của đường (mép nhảy, mặt tiếp đất, cua nghiêng, mô pump…) từ chính dữ liệu game gửi về, rồi nối chúng thành một lộ trình chia theo từng mét.
2. **Chia thành đoạn.** Mỗi cú nhảy là một đoạn, phần còn lại cứ 40 m một đoạn.
3. **Kế hoạch (plan).** Với mỗi đoạn, AI giữ vài con số: tốc độ cần giữ, góc xe khi bay, có nhấc xe ở mép nhảy không, có pump không, làm trick gì, ở độ cao nào. Một đoạn có thể được chia thành các phần khoảng 8 m, mỗi phần một tốc độ riêng, để xe chậm lại qua một mô đất rồi tăng tốc cho cú nhảy ngay sau. Việc lái (bẻ lái theo đường, đạp tới tốc độ, cân xe trên không) do một bộ điều khiển cố định làm.
4. **Thử trong mô phỏng.** Mỗi luồng CPU chạy một bản **vật lý thật của game** (đúng file WebAssembly game dùng). Mỗi vòng AI tạo vài chục bản sao của kế hoạch, mỗi bản đổi một chút quanh chỗ hay ngã, chạy thử tất cả, và giữ bản tốt nhất.
5. **Hai giai đoạn.** Đầu tiên học vượt hết đường: lượt nào đi xa hơn là tốt hơn, điểm chỉ dùng để so những lượt đi xa bằng nhau. Chỉ khi đã về đích được, AI mới tập trick trên các cú nhảy để thêm điểm.

Khi bị kẹt, AI dùng thêm ba cách:

- **Tốc độ theo từng phần của đoạn.** Kẹt càng lâu, AI càng hay chia đoạn thành phần nhỏ và đổi tốc độ từng phần.
- **Đến nhanh hơn là gần hơn.** Hai lượt ngã cùng một chỗ thì lượt lao tới chỗ đó nhanh hơn được tính hơn một chút (tối đa 1 m). Nhờ vậy ở một dốc nhảy chưa leo nổi, AI vẫn biết hướng nào là đúng.
- **Tìm đường khác.** Kẹt hơn 100 vòng, cứ mỗi vòng thứ hai AI vẽ lại hẳn bốn đoạn trước chỗ ngã, theo đuổi cách tốt nhất trong 60 vòng, và đổi sang cách đó ngay khi nó đi xa hơn. Có khi cách đang dùng chỉ vừa đủ qua chỗ phía trước, nên sửa nhỏ quanh chỗ ngã không bao giờ tới được.

Hai lỗi đã sửa:

- Trước đây AI xen kẽ tập trick ngay khi còn đang kẹt. Bộ đếm "đang kẹt" chỉ chạy ở những vòng tập vượt đường, nên kẹt quá 30 vòng là AI tập trick mãi và không bao giờ thử lại cú nhảy đang kẹt nữa (có máy chạy hơn 100.000 vòng vẫn đứng yên). Sửa xong, đường bị kẹt ở 106 m lên được 124 m trong khoảng một phút.
- AI chọn lượt tốt nhất theo tổng điểm, nên một lượt có trick ở cú nhảy đầu được coi là hơn những lượt đi xa hơn mà không có trick.

Trên đường đó, AI còn kẹt ở 124 m qua hàng nghìn vòng. Lý do: cú nhảy ở mét 95 bay quá ngắn, xe rơi xuống khoảng trống rồi đâm vào mặt dốc đáp, nên không còn tốc độ cho dốc nhảy step-up ở mét 124. Với ba cách trên, AI tìm ra cách bay qua khoảng trống và **về đích cả đường (272 m) trong chưa đầy 1 phút**.

Trong bảng AI chỉ cần hai nút: **Học lái** (AI tự xoay vòng: học đường đang chọn, tập một bài tập kiểu Training, luyện bộ não chung, xem bên dưới) và **AI lái**. Mọi thứ khác nằm trong mục **Chi tiết, xem lại và chia sẻ** thu gọn ở cuối bảng.

Vật lý của game cho kết quả giống hệt nhau mỗi lần chạy, nên những gì AI làm được trong mô phỏng thì ngoài game nó cũng làm được y như vậy. Đã kiểm tra: mô phỏng ngã ở mét 1096 thì AI lái thật ngã ở mét 1094.

### Vừa lái thật vừa học

Khi bấm **AI lái**, AI lái xe của bạn trong game. Bài học của đường này và bộ não chung đều chạy thử trong mô phỏng trước, cái nào đi xa hơn thì lái. Nếu **Học lái** đang bật, phần nền vẫn tiếp tục học. Mỗi giây AI xem đã có kế hoạch mới tốt hơn chưa. Nếu kế hoạch mới giữ nguyên cách chạy ở phần đường xe đã đi qua, nghĩa là chỉ đổi những đoạn phía trước, thì AI dùng nó ngay trong lượt đang chạy, vì khi đó trạng thái xe ngoài game đúng bằng trạng thái mà mô phỏng đã chấm điểm. Ngã xong, AI tự lái lại từ đầu với bài học mới nhất.

Mỗi lượt lái thật cũng là một lần kiểm tra mô phỏng: AI so chỗ ngã thật với chỗ mô phỏng dự đoán, và so bản đồ trong mô phỏng với những chi tiết game vừa tải dọc đường. Lệch là dấu hiệu đường đã bị sửa và AI cần dò lại đường.

### Mượn kinh nghiệm giữa các đường

Kế hoạch của AI gắn với từng đoạn của một đường, nên tự nó không dùng được ở đường khác. Vì vậy AI ghi lại **hình dạng** của mỗi cú nhảy nó đã vượt qua: góc mép nhảy, độ cao mép, mặt đất sau mép ở 3/6/9/12/16 m (khoảng hở và chỗ tiếp đất), độ dốc đoạn lấy đà. Kèm theo đó là cách đã dùng: tốc độ, góc xe khi bay, có nhấc xe hay pump không.

- Khi bắt đầu một đường mới, với mỗi cú nhảy AI tìm cú giống nhất trong kho, cả kho trên máy bạn và kho cộng đồng [`experience/jumps.json`](experience/jumps.json). Nó thử chạy cả đường bằng cách mượn được, và chỉ giữ nếu cách đó đi xa hơn học từ con số 0.
- Khi bị kẹt ở một cú nhảy, một phần sáu số lần thử mỗi vòng dùng cách đã thành công ở những cú nhảy giống nó.

Đo lần đầu trên 4 đường mới, mỗi đường 25 vòng: có mượn thì điểm cao hơn ở 3/4 đường, nhưng chỉ một lần cải thiện là do cách mượn trực tiếp, nên chưa thể nói nó giúp nhiều. Kho hiện mới có 16 cú nhảy từ một đường. Kho càng lớn thì càng dễ tìm được cú giống.

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

Trick chỉ được tính khi tiếp đất xong vẫn đứng vững. Đây là thang điểm để AI tự học, không phải điểm chính thức của game.

## Học nhanh hơn: cùng nhau

- AI dùng gần hết các luồng CPU của máy (tối đa 16). Mở thêm tab trên cùng máy **không** nhanh hơn; các tab cùng học một đường sẽ tự trao cho nhau bài học giỏi nhất.
- **Nhiều máy mới thật sự nhanh hơn.** Bài học giỏi nhất của mỗi đường được chia sẻ trong thư mục [`lessons/`](lessons/). Khi bắt đầu học một đường, AI tự tải bài học cộng đồng, **chạy lại bằng vật lý trên máy mình** và chỉ dùng nếu nó thật sự giỏi hơn. Trong lúc học, cứ 10 phút AI lại xem có bài mới không.
- Vì AI luôn tự kiểm tra lại, một bài học sai hay điểm khai gian không làm AI của ai tệ đi.

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
```

## Quy tắc chơi đẹp

- Không đưa file của game (WebAssembly, bản đồ, hình ảnh) vào repo. AI dùng đúng các file game đã tải trong trình duyệt của bạn.
- Không đưa mật khẩu, token hay bất kỳ bí mật nào vào repo. Nút AI chỉ đọc từ GitHub, không bao giờ cần đăng nhập.
- Khi AI lái thật, người chơi khác thấy xe bạn chạy như thường. Hãy chơi vui, đừng dùng AI để giành bảng xếp hạng hay làm phiền người khác.
- Dự án không liên quan tới nhà phát triển Trails.

## English

A fun, open project: an AI that teaches itself to ride any line in Trails: The Game by trial and error inside the game's own physics (WebAssembly, run in Web Workers), learns tricks, and can ride your real bike in the game. A small shared neural network ("the brain", trained with evolution strategies on many lines at once, after first imitating the lessons) rides lines it has never seen, and gives a new line's lesson its starting plan when that rides better; it is shared in `brain/`. Lessons (the learned plan per line) are shared in `lessons/`; every client re-verifies a shared lesson in its own simulation before using it. Open [the how-to page](https://ngotrongduong.github.io/trails-ai/) to try it. Contributions welcome: lessons via the in-game "Chia sẻ GitHub" button, code via pull requests (run `node tools/build.js` first).

Giấy phép: MIT.
