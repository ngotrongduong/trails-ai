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
5. **Hai giai đoạn.** Đầu tiên học vượt hết đường: lượt nào đi xa hơn là tốt hơn. Chỉ khi đã về đích được, AI mới tập lấy điểm: xem lại từng cú nhảy rồi tập tiếp đất đẹp hơn hoặc tập trick, chấm đúng như game chấm (xem [Chấm từng cú nhảy như game](#chấm-từng-cú-nhảy-như-game)).

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
- **Tên đường:** mỗi đường trong danh sách có một tên riêng như “Đồi Thông 37” thay vì “điểm xuất phát cách 40 m”. Tên được tạo từ mã của điểm xuất phát, nên đường nào cũng giữ đúng tên đó trên mọi máy. Bấm **✎** cạnh danh sách để tự đặt tên khác (lưu trong trình duyệt); để trống thì dùng lại tên AI đặt.
- **Đi tiếp sang đường khác:** tới cuối đường, AI tìm một đường bắt đầu trong vòng 35 m phía trước xe và đi gần cùng hướng (lệch tối đa 0,8 rad). Nếu có, bộ não lái tiếp sang đường đó, chạy thẳng qua phần đất ở giữa. Nếu không có, AI dừng như trước, nên xe không bao giờ chạy ra chỗ không có đường. Đường đã đi trong lượt này thì không đi lại, và tối đa 30 đường nối nhau. Khoảng 8 trên 21 đường quanh điểm thử có đường để đi tiếp. Những đường còn lại kết thúc ở chỗ chỉ có đường chạy ngược chiều.
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

Vì chuỗi nhân, một cú tiếp đất xấu ở đầu đường làm mất điểm của mọi cú sau nó. Khi đã về đích, AI làm như sau:

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
