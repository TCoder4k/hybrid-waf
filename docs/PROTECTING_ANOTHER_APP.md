# Bảo vệ một website/API khác bằng Hybrid WAF

Phase P8 của initiative "Reverse-Proxy Generalization & L7 Protection" (`docs/architecture.md` §21-23, ADR-8/9/10). Tài liệu thực hành — xem `docs/architecture.md` cho thiết kế/lý do kiến trúc.

Kể từ Phase P1, Hybrid WAF không còn gắn cứng với `protected-api` (service demo đi kèm) — nó forward request ALLOW tới bất kỳ `UPSTREAM_URL` nào được cấu hình. `protected-api` vẫn được giữ nguyên trong repo làm demo/test target mặc định, không còn là yêu cầu bắt buộc về kiến trúc.

Từ 2026-09-18, admin có thể đổi upstream runtime trong Dashboard → Settings → Ứng dụng đích. Cấu hình được lưu trong bảng `waf_configurations` và có ưu tiên cao hơn biến môi trường; thay đổi có hiệu lực cho request kế tiếp mà không cần rebuild hoặc restart backend.

## 1. Bất biến bắt buộc (đọc trước khi làm gì khác)

`UPSTREAM_URL` **luôn luôn** là cấu hình phía server (biến môi trường), **không bao giờ** được suy ra từ dữ liệu do client gửi (Host header, X-Forwarded-Host, body, query string...). Đây là bất biến chống SSRF/open-proxy đã được kiểm chứng bằng test tự động (`upstream-proxy.service.spec.ts`, `waf-proxy.e2e-spec.ts`). Nếu sau này có tính năng "chọn upstream từ dashboard," nó **phải** là admin-only, không bao giờ nhận giá trị từ request.

## 2. Hai kiểu triển khai

### A. Cùng mạng Docker (khuyến nghị mặc định)

Ứng dụng thật chạy như một service anh em với WAF trong cùng `docker-compose`, **không publish port ra host** — giống hệt cách `protected-api` đã làm hôm nay. Mạng nội bộ Docker tự nó ngăn việc bypass WAF.

```yaml
# docker-compose.yml (hoặc file tương đương của bạn)
services:
  real-app:
    build: ./real-app
    # KHÔNG có `ports:` — chỉ backend (WAF) gọi được qua mạng compose nội bộ.

  backend:
    environment:
      UPSTREAM_URL: http://real-app:8080 # tên service DNS nội bộ, không phải localhost
    ports:
      - "3000:3000" # hoặc theo docker-compose.prod.yml nếu deploy thật
```

### B. Upstream ở server khác (ngoài mạng Docker)

```
UPSTREAM_URL=https://origin.example.com
```

Docker không thể ngăn ai đó gọi thẳng `origin.example.com` bỏ qua WAF — đó là trách nhiệm của server đích:

- **Firewall/security group**: chỉ cho phép traffic inbound tới origin từ (các) IP egress của WAF, chặn mọi IP khác.
- **Tuỳ chọn thêm (defense-in-depth, không bắt buộc)**: WAF gửi kèm 1 header bí mật dùng chung (ví dụ `X-WAF-Secret: <giá trị ngẫu nhiên dài>`), origin kiểm tra header này và từ chối request thiếu/sai — cần origin tự thêm middleware kiểm tra, không phải thứ Hybrid WAF tự làm.
- Upstream nên dùng `https://` — Node's `fetch` (undici) luôn verify certificate, không có cờ bỏ qua self-signed cert.

## 3. Cấu hình môi trường và runtime

Trong `backend/.env` (xem `backend/.env.example` để có giá trị mặc định đầy đủ):

```bash
UPSTREAM_URL=http://real-app:8080          # bắt buộc — mục tiêu forward
UPSTREAM_TIMEOUT_MS=10000                   # timeout chờ upstream (P2)
MAX_BODY_SIZE_BYTES=1048576                 # giới hạn kích thước body (P2)
REQUEST_HEADERS_TIMEOUT_MS=15000            # chống slowloris (P2)
REQUEST_TIMEOUT_MS=30000

RATE_LIMIT_PER_IP_RPS=20                    # rate limit theo IP (P3)
RATE_LIMIT_PER_IP_BURST=40
RATE_LIMIT_GLOBAL_RPS=200                   # rate limit toàn hệ thống
RATE_LIMIT_GLOBAL_BURST=400
RATE_LIMIT_MAX_CONCURRENCY=100              # số request xử lý đồng thời tối đa

WAF_MODE=HYBRID_BLOCK                       # xem mục 4 bên dưới — bắt đầu bằng MONITOR
ML_CONFIDENCE_THRESHOLD=0.7
```

`PROTECTED_API_URL` vẫn được đọc như alias tương thích ngược nếu `UPSTREAM_URL` chưa set — nhưng nên dùng `UPSTREAM_URL` cho mọi cấu hình mới.

Precedence khi WAF chọn upstream:

```text
runtime value saved by authenticated Admin
  ↓ nếu chưa có
UPSTREAM_URL
  ↓ nếu chưa có
PROTECTED_API_URL
  ↓ nếu chưa có
http://localhost:3001
```

Settings UI dùng `PUT /admin/upstream` với `{ "url": "..." }`. Backend validate URL, kiểm tra kết nối, rồi mới lưu atomically. Nếu validation hoặc kết nối thất bại, upstream đang hoạt động không thay đổi. `GET /admin/upstream` trả URL active, source (`RUNTIME` hoặc `ENVIRONMENT`), trạng thái HTTP/latency lần kiểm tra và thời điểm cập nhật.

## 4. Giám sát trước khi chặn thật (WAF_MODE)

Mô hình ML hiện tại được huấn luyện trên dữ liệu tổng hợp riêng của project này — traffic thật của website mới sẽ khác. **Đừng bật chặn hoàn toàn ngay ngày đầu.** Quy trình khuyến nghị, theo đúng 3 mức đã cài (`docs/architecture.md` §23):

1. **`WAF_MODE=MONITOR`** — không chặn gì cả, cả Rule lẫn ML đều được đánh giá và ghi log (`DecisionResult.shadow` cho biết "nếu enforce thì đã chặn cái này"). Theo dõi log/SecurityEvent vài ngày, xem có false positive không.
2. **`WAF_MODE=RULE_BLOCK_ML_MONITOR`** — Rule engine (deterministic, ít rủi ro false-positive hơn) bắt đầu chặn thật; ML vẫn chỉ quan sát, chưa chặn. Theo dõi tiếp.
3. **`WAF_MODE=HYBRID_BLOCK`** — chặn đầy đủ (mặc định), khi đã đủ tin tưởng cả hai tầng.

Không cần restart để đổi `WAF_MODE` nếu dùng biến môi trường qua Docker — chỉ cần `docker compose up -d` lại service `backend` sau khi sửa `.env`.

Nếu muốn huấn luyện lại model ML cho traffic thật của site mới: xuất CSV từ trang Sự kiện bảo mật (đã có sẵn), gán nhãn, chạy lại pipeline có sẵn ở `ml-service/training/train.py`, thay `model/*.joblib`, khởi động lại `ml-service`. Không cần code mới.

## 5. Kiểm tra sau khi trỏ upstream mới

```bash
# 1. Request bình thường phải tới đúng app mới
curl -i http://localhost:3000/some/real/route

# 2. SQLi/XSS vẫn phải bị chặn (regression — không đổi bởi việc đổi upstream)
curl -i "http://localhost:3000/some/route?id=' OR '1'='1"   # → 403

# 3. Rate limit hoạt động
for i in $(seq 1 50); do curl -s -o /dev/null -w "%{http_code} " http://localhost:3000/some/route; done
# → một số request cuối phải là 429 kèm header Retry-After

# 4. GET /admin/system-status phải báo upstream "up" với latency hợp lý
```

Hoặc dùng `load-testing/rate-limit-test.js` / `load-testing/k6-load-test.js` (đổi `BASE_URL`).

## 6. Rollback

- **Đổi lại upstream**: sửa `UPSTREAM_URL` về giá trị cũ trong `.env`, `docker compose up -d backend` — không cần migration, không cần rebuild image (chỉ là biến môi trường).
- **Tắt rate limiting tạm thời** (ví dụ nghi ngờ limit quá chặt chặn nhầm traffic thật): đặt `RATE_LIMIT_PER_IP_RPS`/`RATE_LIMIT_GLOBAL_RPS` rất cao, không có cờ bật/tắt riêng — xem đây là "nới giới hạn," không phải tắt hẳn cơ chế.
- **Quay lại giám sát thay vì chặn**: đặt `WAF_MODE=MONITOR` ngay lập tức nếu nghi ngờ đang chặn nhầm traffic thật trên diện rộng — không mất dữ liệu, `SecurityEvent`/`TrafficMetric` vẫn được ghi bình thường ở mọi mode.
- Không có migration schema nào cần rollback ở các phase P1-P6 (chỉ 1 migration nhỏ, `add_rate_limit_blocks`, cộng thêm 1 cột `Int @default(0)` — an toàn, không phá dữ liệu cũ nếu cần `prisma migrate resolve --rolled-back` trong trường hợp hi hữu).

## 7. Giới hạn cần nói rõ (đừng overclaim)

- Hybrid WAF chặn được tấn công tầng ứng dụng (SQLi, XSS đã huấn luyện) và lạm dụng tầng L7 (flood, rate limit) — **không** chặn được DDoS khối lượng lớn tầng L3/L4 (SYN flood, UDP reflection...). Việc đó cần hạ tầng ở trước WAF (CDN, firewall mạng, chống DDoS từ nhà cung cấp hosting).
- Rate limiter hiện tại **chỉ đúng khi chạy 1 instance backend** (in-memory, không phải Redis) — nếu scale ngang nhiều instance, cần triển khai lại theo ADR-9 (Redis, fail-open).
- Không có tính năng chỉnh cấu hình rate-limit/WAF_MODE từ dashboard — chỉ đọc (xem `/settings`), sửa qua biến môi trường.
