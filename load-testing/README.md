# Load testing (k6)

Đo khả năng chịu tải của Hybrid WAF dưới tải đồng thời — không cần cài k6, chạy qua Docker image chính thức.

## File

- `k6-load-test.js` — bài test chính: traffic hỗn hợp (70% benign, 30% SQLi/XSS thật), ramp dần tới `MAX_VUS`, kiểm tra block rate và latency dưới tải.
- `smoke-check.js` — kiểm tra nhanh (1 VU, 8 request cố định) rằng từng loại payload trả đúng status trước khi chạy bài test đầy đủ. Chạy cái này trước mỗi lần đổi script.
- `capacity-step.js` — một bước tải cố định (VUS, DURATION) để dựng đường cong năng lực (VUs → p95 latency, error rate) bằng cách chạy lặp lại ở nhiều mức VUS khác nhau, rẻ hơn một lần ramp dài — xem "Đo năng lực (capacity)" bên dưới.
- `rate-limit-test.js` — bài test **riêng biệt**, đo rate limiter (Phase P3): 1 VU bắn liên tục vượt quá `RATE_LIMIT_PER_IP_BURST`, kiểm tra WAF trả `429` kèm header `Retry-After` sau khi hết burst. **Không dùng chung metric với capacity test** — 429 ở đây là kết quả ĐÚNG (rate limiter hoạt động), không phải lỗi hệ thống.

## Chạy

```bash
# Sanity check trước (10-15s)
docker run --rm -v "$(pwd)/load-testing:/scripts" grafana/k6 run /scripts/smoke-check.js

# Bài test đầy đủ (~70s, mặc định nhắm vào production, tối đa 10 VU đồng thời)
docker run --rm -v "$(pwd)/load-testing:/scripts" \
  -e BASE_URL=https://hybrid-waf.duckdns.org \
  -e MAX_VUS=10 \
  grafana/k6 run /scripts/k6-load-test.js
```

Trên Git Bash (Windows), nếu Docker báo không tìm thấy file trong container, thêm `MSYS_NO_PATHCONV=1` trước lệnh `docker run` (Git Bash tự "sửa" đường dẫn `/scripts/...` thành đường dẫn Windows, làm sai path bên trong container).

Test local thay vì production:
```bash
-e BASE_URL=http://localhost:3000
```

## Tăng tải

Tăng dần `MAX_VUS` (ví dụ 20, 50) — **không nhảy thẳng lên số lớn khi nhắm vào production**, VPS đang chạy bản demo thật 24/7. Tăng từng bước, xem `http_req_duration`/`http_req_failed` ở lần trước còn khoẻ mới tăng tiếp.

## Đo năng lực (capacity)

Chạy `capacity-step.js` lặp lại ở nhiều mức `VUS` để dựng bảng VUs → p95 latency → throughput → error rate:

```bash
for vus in 20 50 100 200 400 800; do
  docker run --rm -v "$(pwd)/load-testing:/scripts" \
    -e BASE_URL=http://localhost:3000 -e VUS=$vus -e DURATION=15s \
    grafana/k6 run /scripts/capacity-step.js
done
```

**Rate limiter phải tắt hoặc nới rất cao khi đo capacity thuần** (nếu không, ở VUS lớn phần lớn request sẽ bị 429 thay vì phản ánh sức chịu tải thật của pipeline detection) — set `RATE_LIMIT_PER_IP_RPS`/`RATE_LIMIT_GLOBAL_RPS` rất cao (hoặc dùng nhiều IP nguồn khác nhau) khi chạy test này.

## Đo rate limiter

```bash
docker run --rm -v "$(pwd)/load-testing:/scripts" \
  -e BASE_URL=http://localhost:3000 \
  grafana/k6 run /scripts/rate-limit-test.js
```

Ngược lại với test capacity — bài này **muốn** thấy `429`, dùng cấu hình `RATE_LIMIT_PER_IP_RPS`/`RATE_LIMIT_PER_IP_BURST` mặc định hoặc thấp để dễ kích hoạt giới hạn.

## Đọc kết quả

- `waf_attack_block_rate` — % payload tấn công thật sự bị chặn (403). Kỳ vọng ~100% kể cả dưới tải, chứng minh detection không bị race condition khi nhiều request đồng thời.
- `waf_benign_block_rate` — % request bình thường bị chặn nhầm (false positive). Kỳ vọng ~0%.
- `latency_attack_ms` / `latency_benign_ms` — độ trễ tách riêng theo loại, so sánh chi phí thêm của nhánh BLOCK (phải `await` ghi `SecurityEvent`) so với nhánh ALLOW.
- `http_req_duration` (p95) — độ trễ tổng thể toàn bộ pipeline (normalize → rule+ML song song → decision → log/forward) dưới tải.

## Lưu ý

Test nhắm vào production sẽ **ghi thật** các dòng `SecurityEvent` (đúng nghĩa — WAF thật sự xử lý và chặn) vào DB production. Nếu không muốn traffic test lẫn vào dữ liệu demo trước buổi bảo vệ, cân nhắc lọc/loại các dòng có `sourceIp` trùng với IP máy chạy test trước khi trình bày, hoặc chạy lại nhắm vào `BASE_URL=http://localhost:3000` (docker-compose dev) để có số liệu sạch không ảnh hưởng dữ liệu thật.
