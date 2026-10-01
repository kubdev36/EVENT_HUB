# Hướng dẫn sử dụng RSS-Bridge cho Event Hub (Cào Facebook Fanpage)

RSS-Bridge là dịch vụ cầu nối mã nguồn mở chuyển đổi nội dung Fanpage Facebook, TikTok, YouTube thành chuẩn RSS / JSON để Event Hub đọc dữ liệu tự động.

---

## 1. Khởi chạy RSS-Bridge

Trong thư mục gốc dự án:
```bash
docker compose up -d rss-bridge
```
Dịch vụ sẽ chạy tại địa chỉ: **`http://localhost:3100`**

---

## 2. Cách lấy Cookie Facebook (Vượt tường đăng nhập)

Facebook yêu cầu đăng nhập để xem đầy đủ bài viết trên Fanpage. Bạn nên dùng 1 **tài khoản Facebook phụ (Clone)**:

1. Mở trình duyệt (Chrome/Edge/Brave), đăng nhập tài khoản Facebook phụ.
2. Bấm phím **F12** (hoặc chuột phải chọn **Inspect/Kiểm tra**).
3. Chuyển sang tab **Application** (Ứng dụng) > menu bên trái chọn **Cookies** > bấm vào `https://www.facebook.com`.
4. Tìm 2 giá trị sau:
   - `c_user`: Dãy số ID người dùng (VD: `10001234567890`)
   - `xs`: Chuỗi mã token phiên đăng nhập (VD: `25:abc123xyz...`)
5. Mở file `rss-bridge/config.ini.php`, bỏ dấu chấm phẩy `;` ở trước và điền giá trị vào:
   ```ini
   [FacebookBridge]
   c_user = "10001234567890"
   xs = "25:abc123xyz..."
   ```
6. Khởi động lại container:
   ```bash
   docker compose restart rss-bridge
   ```

---

## 3. Cú pháp URL RSS Fanpage đối thủ

Sau khi RSS-Bridge chạy, bạn có thể tạo link RSS cho bất kỳ Fanpage nào theo cú pháp:

- **Format Atom XML (Khuyên dùng cho Event Hub):**
  ```text
  http://localhost:3100/?action=display&bridge=FacebookBridge&context=User&u={FANPAGE_SLUG}&format=Atom
  ```
- **Ví dụ cụ thể:**
  - Fanpage CellphoneS: `http://localhost:3100/?action=display&bridge=FacebookBridge&context=User&u=CellphoneSVietnam&format=Atom`
  - Fanpage FPT Shop: `http://localhost:3100/?action=display&bridge=FacebookBridge&context=User&u=FptShopOnline&format=Atom`
  - Fanpage Hoàng Hà Mobile: `http://localhost:3100/?action=display&bridge=FacebookBridge&context=User&u=hoanghamobilecom&format=Atom`

---

## 4. Tích hợp vào Event Hub

1. Mở giao diện Event Hub trên trình duyệt.
2. Vào **Cài đặt** > Tab **Cấu hình Crawler**.
3. Bấm **Chỉnh sửa** (hoặc Thêm đối thủ) > Bấm **"Thêm đường dẫn"** > Dán link RSS của RSS-Bridge vào danh sách URL theo dõi.
4. Bấm **"Cào ngay"** để kiểm tra kết quả ngay lập tức.
