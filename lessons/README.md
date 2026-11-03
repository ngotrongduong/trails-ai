# Bài học cộng đồng

Mỗi file ở đây là bài học tốt nhất mọi người đã chia sẻ cho **một đường đua**, đặt tên theo mã điểm xuất phát của đường: `lessons/<mã đường>.json`.

Khi bạn bấm **Học lái** trên một đường, AI tự tải file của đường đó (nếu có), **chạy thử nó bằng vật lý của game ngay trên máy bạn**, và chỉ dùng nếu nó thật sự giỏi hơn những gì AI của bạn đang có. Trong lúc học, cứ 10 phút AI lại xem có bài học mới hơn không. Vì vậy một file sai hay điểm khai gian không làm AI của ai tệ đi.

## Góp bài học

1. Cho AI học trên một đường cho đến khi nó chạy xa hơn bài học hiện có (hoặc đường đó chưa có bài học).
2. Bấm **Chia sẻ GitHub** trong bảng AI. AI lưu file `<mã đường>.json` vào thư mục Tải xuống và mở trang tải file lên của repo này.
3. Kéo file vào trang đó, rồi bấm nút xanh **Propose changes** (cần tài khoản GitHub). GitHub tự tạo một pull request.
4. Kiểm tra tự động xem file có đúng định dạng không. Chủ repo xem điểm rồi gộp vào.

Chỉ thay file của một đường khi bài học mới **chạy xa hơn hoặc nhiều điểm hơn** bài cũ trên cùng cài đặt (xe, trick đã mở khóa).

## Định dạng

```text
format    "trails-ai-lesson", version 1
line      đường đua: start {id, x, z, heading}, X[], Z[] (từng mét, chính xác tới cm), KIND[], pieces[] (các chi tiết của đường), kinds, length
plan      kế hoạch theo từng đoạn: v (tốc độ m/s), pt (góc xe khi bay), mv (trick), hr (độ cao bắt đầu trick), pl (nhấc xe trên mép nhảy), pu (pump)
bestRun   lượt chạy tốt nhất: fit (điểm), prog (mét), end, jumps, tricks
setup     cài đặt khi học: tricks (trick đã mở khóa), bike, tunes
gen       số vòng đã học
jumps     kinh nghiệm cú nhảy (version 1): list[] gồm mỗi cú nhảy lượt tốt nhất đã vượt qua,
          f (hình dạng: góc mép nhảy, độ cao mép, mặt đất sau mép 3/6/9/12/16 m, độ dốc đoạn lấy đà),
          v, dpt (chênh góc bay so với dốc tiếp đất), pl, pu
```

## Kho kinh nghiệm

Sau mỗi lần thư mục này thay đổi, một workflow của GitHub gom phần `jumps` của mọi bài học vào [`experience/jumps.json`](../experience/jumps.json). Khi bắt đầu học một đường mới, AI tải file đó, tìm những cú nhảy giống nhất với từng cú nhảy của đường mới, rồi mượn cách đã thành công ở đó (vẫn chạy thử trước, chỉ giữ nếu tốt hơn). Vì vậy mỗi bài học bạn góp không chỉ giúp đường của nó, mà còn giúp mọi đường có cú nhảy giống.
