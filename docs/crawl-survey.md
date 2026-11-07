# Khảo sát nguồn crawl

Ngày khảo sát: 07/11/2026. Mỗi trang danh sách được tải 1 lần, các request cách nhau 5 giây. `robots.txt` của cả 4 web không chặn các trang tin tức đang theo dõi; Thế giới di động yêu cầu `Crawl-delay: 5`.

Kết quả lần cào đầu bằng code mới (chỉ link web): CellphoneS `partial` 120 bài, Hoàng Hà `success` 40, FPT Shop `success` 33, Thế giới di động `success` 1.

## Tóm tắt

| Hãng | Cách lấy đề xuất | Ngày đăng | Vấn đề hiện tại |
| --- | --- | --- | --- |
| CellphoneS (Sforum) | API GraphQL đang dùng | Có trong API | Mọi trang Sforum trả trang chặn BytePlus. Bỏ các link trang, chỉ dùng API |
| Hoàng Hà | RSS WordPress theo chuyên mục | Có trong RSS | Đang cào HTML chung trong khi web có sẵn RSS |
| FPT Shop | HTML (Next.js), lọc link theo mẫu chuyên mục | Có `publishedAt` trong dữ liệu Next.js nhúng | Trang có cả link chuyên mục khác (vd. `for-gamers`) |
| Thế giới di động | HTML, khối `ul.newspromotion` | Không có trên trang danh sách, phải lấy từ trang bài | Selector chung không khớp nên chỉ lấy được 1 bài; ảnh thật nằm ở `data-original`, `src` là ảnh 1x1 |

## Chi tiết

### CellphoneS
- `sforum/khuyen-mai-soc`, `sforum/su-kien` và các link `.../feed` đều trả trang kiểm tra bot (BytePlus, khoảng 15 KB). Không vượt qua.
- API `api.sforum.vn/graphql/query` đang trả dữ liệu. Category ID (Khuyến mãi 10078, Sự kiện 27510) đang hardcode trong `GenericApiEngine`, cần chuyển vào cấu hình nguồn.

### Hoàng Hà
- WordPress, có `<link rel="alternate" type="application/rss+xml" href="https://hoanghamobile.com/tin-tuc/feed/">`.
- Mỗi chuyên mục WordPress thường có feed `.../category/<tên>/feed/`. Cần kiểm tra lại từng feed trước khi đổi cấu hình.
- Trang danh sách có 23 link bài dạng `https://hoanghamobile.com/tin-tuc/<slug>/`.

### FPT Shop
- Next.js App Router (`self.__next_f`), có 2 khối JSON-LD.
- Link bài dạng `/tin-tuc/<chuyên-mục>/<slug>-<id>`. Trang `tin-khuyen-mai` có 17 link, gồm cả link chuyên mục khác ở sidebar; cần lọc theo chuyên mục của URL đang theo dõi.
- Dữ liệu nhúng có `publishedAt` dạng ISO. Cần ghép đúng `publishedAt` với từng bài khi triển khai.

### Thế giới di động
- HTML thuần, không JSON-LD, không RSS.
- Bài khuyến mãi nằm trong `ul.newspromotion > li > a`: tiêu đề ở `h3`, ảnh ở `img[data-original]` (42 mục). Trang còn có `ul.newslist` gồm tin công nghệ chung, không phải khuyến mãi.
- Link bài dạng `/tin-tuc/<slug>-<id>`.
- Không có ngày trên trang danh sách: cần tải trang chi tiết của bài mới (crawl hai bước), tối đa vài bài mỗi lần do `Crawl-delay: 5`.

## Đính chính sau khi triển khai (07/11/2026)

- Thế giới di động: link `tin-tuc/tin-khuyen-mai/` trả 301 về `/tin-tuc` (trang tin công nghệ chung). Chuyên mục khuyến mãi thật là `tin-tuc/tin-khuyen-mai/31`. `ul.newspromotion` chỉ là khối 5 bài ở cột phải; danh sách chính là `.leftcate ul.newslist > li`, có ngày tương đối trong `.timepost`.
- Mẫu URL lưu trong DB dùng `[0-9]+` thay cho `\d+` để tránh lỗi mất dấu `\` khi sửa cấu hình.
- Ngày trong tiêu đề như "ưu đãi đến 31/12" là hạn khuyến mãi, không phải ngày đăng. Nguồn có `fetchDetail` lấy ngày từ trang chi tiết; ngày đoán từ tiêu đề nằm trong tương lai bị bỏ qua.

Cấu hình đang dùng (lưu trong `settings.crawler_sources`, bản trước khi đổi ở `backups/crawler_sources-2026-11-07.json`):

| Hãng | Cấu hình |
| --- | --- |
| CellphoneS | Không còn link trang; `api` GraphQL, category 10078 và 27510 |
| Hoàng Hà | 4 feed RSS: 3 chuyên mục và `tin-tuc/feed/` |
| FPT Shop | 4 link cũ; `extract.articleUrlPattern` 3 chuyên mục, `fetchDetail` tối đa 10 trang, cách 2 giây |
| Thế giới di động | `tin-tuc/tin-khuyen-mai/31`; `extract` selector như trên, `fetchDetail` tối đa 5 trang, cách 5 giây |

Kết quả cào thật sau khi đổi: CellphoneS `success` 120 bài; Hoàng Hà `success` 32; FPT Shop `success` 36; Thế giới di động `success` 12 bài khuyến mãi (trước đây 1).

## Việc tiếp theo

1. Thêm cấu hình trích xuất theo từng nguồn (selector khối, mẫu URL bài, thuộc tính ảnh, domain hợp lệ).
2. Thế giới di động: cấu hình `ul.newspromotion`, ưu tiên `data-original`/`data-src`, lấy ngày từ trang chi tiết.
3. CellphoneS: bỏ link trang Sforum, đưa category ID ra cấu hình.
4. Hoàng Hà: chuyển sang RSS theo chuyên mục.
5. FPT Shop: lọc link theo chuyên mục, lấy `publishedAt`.
6. Bộ mẫu kiểm tra từ các trang đã lưu.
