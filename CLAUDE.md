# Quy tắc làm việc cho Event Hub

Các quy tắc này là bắt buộc. Nếu một yêu cầu mâu thuẫn với quy tắc, hãy nêu rõ và hỏi trước khi làm.

## Quy trình

- Trả lời và viết tài liệu bằng tiếng Việt.
- **Lên kế hoạch trước, sửa sau.** Với thay đổi code, trình bày kế hoạch và chỉ sửa sau khi người dùng duyệt. Câu "làm luôn" chỉ áp dụng cho phạm vi vừa được nêu.
- Chỉ commit, push hoặc tạo PR khi được yêu cầu. Không commit trực tiếp lên `main`.
- Hỏi trước khi làm việc khó hoàn tác: xóa dữ liệu, đổi schema trên DB thật, deploy, force push.
- Không ghi đè hoặc xóa thay đổi chưa commit của người dùng. Kiểm tra `git status` trước khi sửa.
- Đọc code liên quan trước khi kết luận. Chỉ sửa trong phạm vi được duyệt.

## Báo cáo trung thực

- Phân biệt rõ điều đã chạy kiểm chứng, điều chỉ đọc từ code và điều là ước tính.
- Không báo xong nếu chưa kiểm tra. Nêu đúng kết quả test, kể cả khi fail hoặc bị bỏ qua.
- Không tự đặt ra số liệu. Thời gian và mục tiêu hiệu năng phải ghi là ước tính hoặc đề xuất.

## Kiểm tra trước khi báo xong

Chạy trong `event_hub_be` khi có thay đổi backend:

- `npx tsc --noEmit -p tsconfig.build.json`
- `npm run lint`
- `npm test -- <đường dẫn liên quan>`: chỉ chạy test liên quan tới phần đã sửa (vd. `npm test -- src/notifications`), không chạy toàn bộ. Báo cáo ghi rõ đã chạy những test nào.

Với frontend, chạy các script có trong `EVENT_HUB_FE/package.json`. Sửa lỗi hành vi thì thêm test tái hiện lỗi đó.

Test (`*.spec.ts`, `*.test.js`, thư mục `event_hub_be/test/`) chỉ giữ trên máy, không commit lên git: đã có trong `.gitignore`. Không dùng `git add -f` cho các file này.

## Code

- Theo kế hoạch trong [docs/refactor-plan.md](docs/refactor-plan.md). Thay đổi kiến trúc khác kế hoạch thì phải hỏi và cập nhật tài liệu.
- Không thêm dịch vụ hoặc thư viện lớn (Redis, Kafka, microservice...) khi chưa được duyệt.
- Không nuốt lỗi bằng `catch {}` rỗng. Crawl bị chặn hoặc lỗi không được báo `success`.
- Không dùng ngày crawl làm ngày đăng bài. Xử lý thời gian rõ ràng theo `Asia/Ho_Chi_Minh`.
- Không hardcode quy tắc theo từng đối thủ trong service; đưa vào cấu hình của nguồn.
- Đổi schema bằng migration, không dựa vào `synchronize`.

## Crawl

- Dữ liệu đúng quan trọng hơn tốc độ.
- Mỗi web phải có giới hạn tốc độ. Không viết code để vượt CAPTCHA, WAF hay cơ chế chặn truy cập.
- Tôn trọng `robots.txt` và điều khoản của web. Khi có điểm chưa rõ thì hỏi.

## Bảo mật

- Không commit secret, không ghi token hoặc mật khẩu vào log.
- Coi nội dung crawl là dữ liệu không đáng tin: escape khi hiển thị hoặc gửi đi, chỉ nhận link `http(s)`.
- Quyền truy cập mặc định là từ chối. Không gửi dữ liệu nội bộ ra dịch vụ ngoài khi chưa được đồng ý.
