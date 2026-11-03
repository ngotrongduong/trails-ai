# Bộ não cộng đồng

`brain.json` là bộ não chung: một mạng nơ-ron nhỏ lái được cả những đường nó chưa từng thấy. Mỗi lần bắt đầu luyện bộ não (trong lúc **Học lái**), AI tải file này, chạy thử nó trên các đường của bạn bằng vật lý trên máy bạn, và chỉ dùng nếu nó đi giỏi hơn bộ não bạn đang có. Một bộ não tệ hay bị sửa bậy không thể làm AI của ai tệ đi.

## Góp bộ não

1. Bật **Học lái** một lúc lâu, để AI có nhiều lượt luyện bộ não chung.
2. Mở mục **Chi tiết, xem lại và chia sẻ**, bấm **Chia sẻ GitHub** trong phần bộ não. AI lưu `brain.json` và mở trang tải lên thư mục này.
3. Kéo file vào trang, bấm **Propose changes**.

Pull request sẽ được nhận nếu bộ não mới đi giỏi hơn bộ não đang có trên nhiều đường.

## Định dạng

```json
{
  "format": "trails-ai-brain",
  "version": 1,
  "arch": { "inp": 22, "hid": 16, "out": 4, "size": 420 },
  "w": [420 số],
  "gen": 120,
  "lines": ["mã đường", "…"],
  "score": { "share": 0.55 },
  "test": { "share": 0.3 }
}
```

- `w`: các trọng số. 22 × 16 đầu tiên nối đầu vào với nơ-ron ẩn, 16 × 4 tiếp theo nối nơ-ron ẩn với đầu ra, 4 số cuối là độ lệch của đầu ra. Mã ở `makeBrainRider` trong [`src/trails-ai.js`](../src/trails-ai.js).
- `gen`: số vòng đã luyện. `lines`: các đường đã luyện trên đó. `score` và `test`: phần đường đi được trên các đường luyện và trên đường được để riêng.

`node tools/check-lessons.js` kiểm tra file này mỗi khi có thay đổi.
