# Hybrid WAF — Tài liệu hiểu toàn bộ dự án

> Mục đích của file này: giúp bạn (người làm đồ án) hiểu 100% dự án — từ bức tranh
> tổng thể tới từng chi tiết nhỏ — để có thể tự tin trả lời bất kỳ câu hỏi nào của
> giảng viên về kiến trúc, lý do thiết kế, đánh đổi (trade-off), và kết quả đạt được.
> Đây là tài liệu **đọc để hiểu**, không phải tài liệu kỹ thuật tham chiếu khi code
> (việc đó đã có `docs/CLAUDE.md`, `docs/architecture.md`, `docs/memory.md`).

---

## 1. Dự án này giải quyết bài toán gì?

**Hybrid WAF** (Web Application Firewall lai) là một lớp "gác cổng" đứng giữa
client và một API cần bảo vệ. Mọi request đi qua WAF trước khi tới API thật.
WAF phân tích request đó, quyết định **cho qua (ALLOW)** hay **chặn (BLOCK,
403)**, dựa trên việc phát hiện 2 loại tấn công phổ biến nhất trên web:

- **SQL Injection (SQLi)** — chèn câu lệnh SQL vào input để thao túng database.
- **Cross-Site Scripting (XSS)** — chèn script độc hại để chạy trên trình duyệt nạn nhân.

Điểm đặc biệt (chữ "Hybrid" trong tên): hệ thống không chỉ dùng **một** phương
pháp phát hiện, mà kết hợp **hai** phương pháp độc lập:

1. **Rule-based Detection** — so khớp mẫu (regex) đã biết trước, giống cách các
   WAF thương mại (ModSecurity, Cloudflare...) hoạt động ở tầng cơ bản.
2. **Machine Learning Detection** — một mô hình học máy (TF-IDF + Logistic
   Regression) học từ dữ liệu để nhận diện, kể cả những biến thể không khớp
   chính xác với rule.

Một **Hybrid Decision Engine** gộp kết quả của cả hai lại thành quyết định cuối
cùng. Đây là trọng tâm học thuật của đồ án: chứng minh được sự kết hợp
rule + ML tốt hơn (hoặc ít nhất là an toàn hơn) so với chỉ dùng một trong hai.

Đây là đồ án dạng **MVP/capstone sinh viên**, phạm vi được giới hạn rõ ràng có
chủ đích (xem mục 8 — Non-goals) để có thể hoàn thành và bảo vệ được trong thời
gian ngắn, không phải một sản phẩm WAF thương mại.

---

## 2. Bức tranh tổng thể — 5 thành phần

```
┌─────────────┐        ┌───────────────────┐        ┌──────────────────┐
│ API Client  │──────▶│   Hybrid WAF        │──────▶│  Protected API    │
│ (browser/   │  HTTP  │   (backend/)        │ nếu   │  (protected-api/)  │
│  curl/...)  │        │   NestJS            │ ALLOW │  NestJS demo API   │
└─────────────┘        └─────────┬──────────┘        └──────────────────┘
                                  │
                       gọi HTTP  │  đọc/ghi
                                  ▼         ▼
                        ┌─────────────┐  ┌────────────┐
                        │ ML Service   │  │ PostgreSQL  │
                        │ (ml-service/)│  │            │
                        │ Python/      │  └────────────┘
                        │ scikit-learn │        ▲
                        └─────────────┘        │ chỉ đọc qua Admin API
                                                │
                                        ┌───────┴────────┐
                                        │  Frontend        │
                                        │  (frontend/)       │
                                        │  Next.js Dashboard │
                                        └───────────────────┘
```

**5 thành phần độc lập** (ADR-6 — quyết định kiến trúc đã duyệt: không gộp
chung thành 1 app, vì đây là các runtime khác hẳn nhau và việc tách
WAF/Protected API riêng biệt chính là thứ đồ án cần chứng minh):

| Thành phần | Công nghệ | Vai trò |
|---|---|---|
| `backend` | NestJS (TypeScript) | **Chính** — nhận mọi request, chuẩn hoá, phát hiện, quyết định, log, forward. Cũng là nơi có Admin API + JWT auth. |
| `protected-api` | NestJS (TypeScript) | API demo phía sau WAF — không có logic bảo mật gì, chỉ để chứng minh "request hợp lệ đi xuyên qua được tới đây". Không public port ra ngoài — chỉ `backend` gọi được tới nó. |
| `ml-service` | Python + FastAPI + scikit-learn | Nhận request đã chuẩn hoá, trích đặc trưng, trả về nhãn (NORMAL/SQL_INJECTION/XSS) + độ tin cậy (confidence). |
| `frontend` | Next.js (TypeScript) | Dashboard cho Admin: đăng nhập, xem thống kê, xem danh sách sự cố bị chặn. |
| PostgreSQL | — | Lưu `Admin` (tài khoản quản trị), `SecurityEvent` (sự cố bị chặn), `TrafficMetric` (số liệu tổng hợp lưu lượng). |

Chỉ **`backend`** được phép nói chuyện trực tiếp với `protected-api`,
`ml-service`, và PostgreSQL. `frontend` **chỉ** được gọi Admin API của
`backend` — không bao giờ chạm trực tiếp vào DB hay ML service.

---

## 3. Luồng xử lý một request — trái tim của hệ thống

Đây là pipeline chính, nằm trong `backend/src/modules/waf/waf.service.ts`
(`WafService.handle()`), thực thi theo đúng thứ tự sau cho **mọi** request đi
vào WAF:

```
1. Request Extraction & Normalization
      (WafController nhận request thô → RequestNormalizerService chuẩn hoá
       thành NormalizedRequest: method, endpoint, queryParams, pathParams,
       body, sourceIp, headers đã lọc allow-list, timestamp)
                          │
2. Rule Detection  ║  ML Detection      ← CHẠY SONG SONG (Promise.all)
   (regex, đồng bộ)║  (gọi HTTP tới
                    ║   ml-service /predict,
                    ║   timeout 2s)
                          │
3. Hybrid Decision Engine
      (gộp 2 kết quả trên → 1 quyết định: ALLOW hoặc BLOCK)
                          │
4. Traffic Metrics ghi nhận  ← chạy NGẦM (fire-and-forget), không chặn response
      (tăng bộ đếm total/allowed/blocked/sqli/xss theo giờ)
                          │
        ┌─────────────────┴─────────────────┐
        ▼ (BLOCK)                            ▼ (ALLOW)
5a. Ghi SecurityEvent (chờ xong)      5b. Forward request thật
    rồi trả 403 cho client                sang Protected API,
                                           trả response thật về client
```

**Vì sao Rule + ML chạy song song?** Để không cộng dồn độ trễ (latency) của
2 bước tuần tự — ML service là một lệnh gọi HTTP (có thể mất vài chục tới vài
trăm ms), nếu chạy sau rule engine thì mọi request sẽ chậm hơn không cần thiết.

**Vì sao Traffic Metrics ghi "ngầm" còn SecurityEvent thì "chờ"?** Đây là một
quyết định thiết kế quan trọng (ADR-7, Phase 9A) — xem mục 7.

---

## 4. Giải thích chi tiết từng thành phần

### 4.1. Request Normalization (`backend/src/modules/request/`)

Biến request thô (Express request object) thành một object chuẩn hoá dùng
chung cho mọi bước sau:

```ts
interface NormalizedRequest {
  method: string;
  url: string;
  endpoint: string;              // path, KHÔNG có query string
  queryParams: Record<string,string>;
  pathParams: Record<string,string>;
  body: unknown;
  sourceIp: string;
  headers: Record<string,string>; // CHỈ allow-list: content-type, user-agent, accept
  timestamp: string;
}
```

Lý do phải chuẩn hoá: Rule engine và ML engine phải "nhìn thấy" cùng một dữ
liệu đầu vào — nếu mỗi bên tự parse request theo cách riêng thì kết quả không
thể so sánh/kết hợp được. Header chỉ lấy allow-list (không lấy `Authorization`,
`Cookie`) để tránh secret bị lọt vào log hay bị gửi sang ML service.

### 4.2. Rule-based Detection (`backend/src/modules/detection/rule-based/`)

Composition: `RuleDetectionEngine` chạy `SqlInjectionRuleDetector` trước, nếu
không khớp thì chạy `XssRuleDetector`. Cả hai đều quét trên "search surface" =
`endpoint + JSON(queryParams) + JSON(body)`.

**7 pattern SQL Injection:**
| Pattern | Ý nghĩa |
|---|---|
| `OR 1=1`, `AND 1=1` | Tautology dạng boolean |
| `' OR '1'='1` | Tautology dạng quote |
| `UNION (ALL) SELECT` | UNION-based injection |
| `; DROP/DELETE/INSERT/UPDATE` | Stacked query |
| `--`, `#`, `/* */` | SQL comment (dùng để cắt bỏ phần còn lại của câu lệnh) |
| `SLEEP()`, `BENCHMARK()`, `WAITFOR DELAY` | Time-based blind SQLi |
| `xp_cmdshell` | Thực thi lệnh hệ thống qua SQL Server |

**7 pattern XSS:**
| Pattern | Ý nghĩa |
|---|---|
| `<script>` | Script tag trực tiếp |
| `javascript:` | URI scheme chạy script |
| `on(error\|load\|click\|mouseover\|focus\|input)=` | Inline event handler |
| `<img onerror>` | Payload ảnh lỗi để chạy script |
| `<svg onload>` | Payload SVG |
| `<iframe>` | Nhúng iframe độc hại |
| `document.cookie` | Đánh cắp cookie |

Rule engine **luôn deterministic** (không có xác suất, không có trạng thái
"không chắc"), chạy đồng bộ, không gọi mạng — vì vậy không có khái niệm "rule
service bị down".

**Lưu ý quan trọng:** đây là tập pattern **đại diện** cho một đồ án MVP, không
phải một bộ luật đầy đủ/toàn diện như WAF thương mại — điều này được ghi nhận
minh bạch trong tài liệu dự án, không phóng đại.

### 4.3. Machine Learning Detection (`ml-service/`)

**Dataset** (`ml-service/dataset/generate_dataset.py` → `dataset.csv`, 225
dòng, dữ liệu **tổng hợp** — không phải traffic thật):
- ~30 mẫu gốc SQLi, ~25 mẫu gốc XSS, ~45 câu benign (kể cả các câu benign
  "khó" cố ý chứa từ ngữ dễ gây nhầm — ví dụ "mã giảm giá còn hiệu lực tới
  2026 -- act fast" chứa `--` nhưng là câu bình thường).
- Mỗi dòng có `group_id` đánh dấu nó thuộc "mẫu gốc" nào (các biến thể case/
  khoảng trắng của cùng 1 payload).

**Chống rò rỉ dữ liệu (data leakage) — phần hay bị hỏi nhất:**
Nếu chia train/test ngẫu nhiên bình thường, các biến thể gần giống nhau của
cùng 1 payload gốc có thể rơi cả vào train lẫn test → model "học tủ", điểm số
ảo. Giải pháp: `GroupShuffleSplit` (scikit-learn) chia theo `group_id`, đảm
bảo toàn bộ biến thể của 1 mẫu gốc nằm **trọn vẹn một bên** (chỉ train hoặc
chỉ test), không bao giờ cả hai. Kết quả: 161 dòng train (75 nhóm), 64 dòng
test (25 nhóm) — có assertion trong code để đảm bảo không có nhóm nào bị lặp.

**Pipeline huấn luyện** (`ml-service/training/train.py`):
```
text → TfidfVectorizer(analyzer='char_wb', ngram_range=(2,5)) → LogisticRegression
```
Dùng **char-level n-gram** (không phải word-level mặc định của sklearn) vì
tokenize theo từ sẽ loại bỏ các ký tự đặc biệt (`'`, `--`, `<`, `=`) — mà
chính các ký tự này mang gần như toàn bộ tín hiệu SQLi/XSS trong các chuỗi
ngắn này.

**Kết quả huấn luyện:** 100% accuracy/precision/recall/F1 trên tập test
held-out. **Thành thật ghi nhận:** đây là dấu hiệu dataset tổng hợp dễ phân
biệt về từ vựng, KHÔNG phải bằng chứng model tổng quát hoá tốt với payload bị
obfuscate hoặc traffic thực tế mơ hồ.

**API `/predict`** (`ml-service/app/api/predict.py`):
```
Request:  { method, endpoint, queryParams, pathParams, body }
Response: { classification: "SQL_INJECTION"|"XSS"|"NORMAL", confidence: 0.94 }
```
`search_surface.py` chỉ trích **giá trị thô** của queryParams/pathParams/body
(không kèm endpoint, không bọc JSON) — vì model được train trên chuỗi thô, bọc
JSON vào sẽ đưa ký tự lạ (`{`, `"`) mà model chưa từng thấy, gây đoán sai trên
input hoàn toàn bình thường (**bug thật đã gặp và sửa ở Phase 6**).

**Khi ML service lỗi/timeout/không phản hồi đúng định dạng:** `MLDetectionEngine`
(phía backend) trả về trạng thái `UNAVAILABLE` — **không bao giờ** coi là
"NORMAL" (ADR-2). Xem mục 4.4 để biết điều này ảnh hưởng quyết định thế nào.

### 4.4. Hybrid Decision Engine (`backend/src/modules/decision/`)

Đây là "bộ não" gộp 2 kết quả — thuần logic, không I/O, không async:

```
1. Nếu Rule phát hiện (detected=true)
      → BLOCK (Rule luôn thắng, bất kể ML nói gì — kể cả khi ML down)

2. Nếu Rule im lặng VÀ ML "UNAVAILABLE"
      → ALLOW (fallback về rule engine một mình — ADR-2)

3. Nếu Rule im lặng VÀ ML nói "NORMAL"
      → ALLOW

4. Nếu Rule im lặng VÀ ML nói có tấn công VÀ confidence ≥ ngưỡng (mặc định 0.7)
      → BLOCK (dựa vào ML)

5. Nếu Rule im lặng VÀ ML nói có tấn công NHƯNG confidence < ngưỡng
      → ALLOW (nhưng lý do (reason) ghi rõ ML đã nghi ngờ gì, confidence bao
        nhiêu — để vận hành viên vẫn thấy được, không giấu thông tin)
```

**Vì sao Rule luôn thắng khi phát hiện?** Rule là deterministic và giải thích
được rõ ràng (dễ bảo vệ trước hội đồng: "vì sao request này bị chặn" luôn có
câu trả lời chính xác). ML chỉ được "lên tiếng quyết định" khi Rule im lặng.

**Ngưỡng `ML_CONFIDENCE_THRESHOLD`** đọc từ biến môi trường (mặc định `0.7`),
không hard-code — có thể chỉnh mà không cần sửa code.

### 4.5. Security Logging (`backend/src/modules/security-events/`)

Bảng `SecurityEvent` — **chỉ ghi khi BLOCK** (ADR-3), không ghi ALLOW. Lý do:
traffic hợp lệ chiếm đa số áp đảo, ghi hết sẽ phình DB vô ích và Dashboard sẽ
bị loãng bởi những dòng không có giá trị điều tra.

Các trường lưu: `attackType`, `ruleResult`/`mlResult` (JSON nguyên bản),
`confidence`, `decision`, và **`requestMeta` đã được lọc (redacted)** — chỉ có
`endpoint`/`queryParams`/`pathParams`, **không** lưu body thô hay full headers
(ADR-4) — để tránh lưu password/PII/session token lọt vào log sự cố.

`SecurityEventLogger.logBlock()` **không bao giờ throw** — nếu ghi DB lỗi, nó
tự bắt lỗi, log ra console, và vẫn để WAF trả 403 bình thường. Nguyên tắc:
**lỗi ghi log không được phép làm yếu đi quyết định bảo mật đã có** (quyết
định BLOCK đã được tính xong trước khi log, log fail không đổi được điều đó).

### 4.6. Traffic Metrics (`backend/src/modules/traffic-metrics/`, Phase 9A)

Bảng `TrafficMetric` — đếm gộp theo **khung giờ UTC** (không lưu chi tiết
từng request), tăng ở **MỌI** request (cả ALLOW lẫn BLOCK):

```
bucketStart (duy nhất mỗi giờ) | totalRequests | allowedRequests |
blockedRequests | sqlInjectionBlocks | xssBlocks
```

**Vì sao cần bảng riêng này?** Dashboard cần "Total Requests"/"Allowed
Requests" — mà bảng `SecurityEvent` (chỉ có BLOCK) không thể trả lời được câu
đó. Đây là một **điều chỉnh kiến trúc** (Phase 9A) được thêm vào *trước*
Dashboard, có ADR riêng (ADR-7).

**Cơ chế tăng số nguyên tử (atomic):** dùng 1 câu lệnh SQL
`INSERT ... ON CONFLICT (bucketStart) DO UPDATE SET x = x + 1` — không dùng
`.upsert()` của Prisma (vì đó là 2 lượt round-trip riêng biệt, không an toàn
khi nhiều request cùng lúc rơi vào cùng 1 khung giờ). Đã kiểm chứng thực tế:
30 request đồng thời → không mất request nào.

**"Fire-and-forget" — điểm thiết kế quan trọng nhất của Phase 9A:**
```ts
this.trafficMetricsRecorder.record(decision).catch(err => logger.error(...));
// KHÔNG await — code chạy tiếp ngay xuống bước trả response
```
Ghi nhận traffic metrics **không** được chờ (`await`) trước khi trả response,
vì nó chạy ở **mọi** request (kể cả ALLOW — số lượng lớn nhất). Nếu chờ, mỗi
request hợp lệ sẽ cõng thêm 1 lượt ghi DB vào đường phản hồi — làm chậm toàn
hệ thống một cách không cần thiết cho một con số thống kê có thể chấp nhận
trễ vài mili-giây. Đồng thời **luôn có `.catch()`** để lỗi ghi DB không bao
giờ trở thành "unhandled promise rejection" (crash tiềm ẩn) và không bao giờ
ảnh hưởng tới response ALLOW/BLOCK đã tính xong.

*(So sánh: `SecurityEvent` thì VẪN chờ — vì nó chỉ chạy khi BLOCK, tần suất
thấp hơn nhiều, và gắn chặt với chính bản thân quyết định BLOCK.)*

### 4.7. Admin Authentication (`backend/src/modules/auth/`, ADR-5)

- `POST /auth/login` — kiểm tra username/password (bcrypt), ký JWT (payload
  `{sub, username}`), hết hạn sau 15-30 phút (mặc định 30m, cấu hình qua env).
- Chống dò username bằng thời gian phản hồi (**timing attack**): kể cả khi
  username không tồn tại, hệ thống vẫn so sánh với 1 bcrypt hash "giả" để thời
  gian phản hồi giống hệt trường hợp sai password — tránh lộ "username này có
  tồn tại hay không" qua độ trễ.
- `JwtAuthGuard` — guard tự viết (không dùng Passport, vì chỉ có 1 rule xác
  thực duy nhất, dùng Passport sẽ là over-engineering không cần thiết).
- **Không có `/auth/logout`** — vì JWT là stateless, không có session để thu
  hồi ở server. "Đăng xuất" chỉ là xoá token ở phía client (trình duyệt).
  Đánh đổi đã ghi nhận: token bị lộ trước khi hết hạn vẫn dùng được tới lúc
  hết hạn tự nhiên — không có "khoá tay" (blacklist) vì việc đó cần thêm hạ
  tầng (Redis/session store) không đáng cho hệ thống 1 vai trò admin duy nhất.
- Tạo tài khoản admin: **không có** API đăng ký công khai (sẽ là lỗ hổng bảo
  mật) — chỉ có script `npm run seed:admin` đọc `ADMIN_USERNAME`/`ADMIN_PASSWORD`
  từ biến môi trường.

### 4.8. Admin API (`backend/src/modules/admin/`)

Tất cả các route dưới đây yêu cầu JWT hợp lệ (`Authorization: Bearer <token>`):

| Route | Trả về |
|---|---|
| `GET /admin/events` | Danh sách `SecurityEvent`, phân trang, lọc theo `attackType`/khoảng ngày |
| `GET /admin/events/:id` | Chi tiết 1 sự cố |
| `GET /admin/stats` | Tổng hợp từ `TrafficMetric`: total/allowed/blocked/sqlInjectionBlocks/xssBlocks (cộng dồn toàn thời gian) |

Lỗi DB ở bất kỳ route nào → trả `503 Service Unavailable` (không phải 500 mơ
hồ) — người dùng biết chính xác đây là lỗi hạ tầng, không phải lỗi logic.

### 4.9. Dashboard (`frontend/`)

Next.js, chỉ nói chuyện với Admin API (`backend`), **không bao giờ** gọi
thẳng `ml-service`/`protected-api`/DB. Không dùng thư viện chart nào — tự vẽ
bằng CSS đơn giản (2 thanh so sánh SQLi vs XSS) để tránh thêm dependency
không cần thiết cho một MVP.

- `/login` — form đăng nhập → nhận JWT → lưu vào `localStorage` (vì auth là
  stateless phía client, không có session server để "join" vào).
- `/dashboard` — 5 ô thống kê (Total/Allowed/Blocked Requests, SQL Injection,
  XSS), biểu đồ Attack Distribution, bảng Recent Security Events (10 gần
  nhất), nút Log out.
- Nếu API trả `401` (token hết hạn/không hợp lệ) → tự xoá token, chuyển về
  `/login`. Nếu API trả `503` (DB down) → hiện banner báo lỗi thay vì crash
  trắng trang.

### 4.10. Evaluation — Đánh giá 3 phương pháp (`ml-service/evaluation/` + `backend/scripts/evaluate-detection.ts`, Phase 11)

Đây là phần chứng minh **định lượng** cho luận điểm "Hybrid tốt hơn/an toàn
hơn" của đồ án — không dùng lại logic detection viết riêng cho mục đích đánh
giá, mà **gọi thẳng các class thật đang chạy production** (`RuleDetectionEngine`,
`MLDetectionEngine`, `HybridDecisionEngine`) để đảm bảo con số phản ánh đúng
hệ thống thật, không phải một bản mô phỏng khác đi.

**3 bước:**
1. `export_test_set.py` — lấy lại đúng 64 dòng test held-out của Phase 6 (dùng
   lại chính `GroupShuffleSplit` của `train.py`, không tạo tập test mới —
   để việc so sánh Rule/ML/Hybrid công bằng với chính con số ML đã báo cáo).
2. `evaluate-detection.ts` — chạy 64 dòng này qua cả 3 "phương pháp" thật,
   ghi lại nhãn dự đoán của từng phương pháp.
3. `compute_metrics.py` — tính Accuracy/Precision/Recall/F1 (macro + từng lớp)
   cho cả 3, bằng `sklearn.metrics` (đúng hàm mà `train.py` Phase 6 đã dùng).

**Kết quả thật:** cả 3 phương pháp đạt **100% ở mọi chỉ số** trên tập 64 dòng
held-out. **Ý nghĩa cần nói đúng khi bảo vệ:** kết quả này chứng minh *phương
pháp đánh giá hoạt động đúng* (harness thật, số liệu thật, không giả) hơn là
chứng minh 3 phương pháp không khác biệt trong thực tế — vì dataset tổng hợp
này khá dễ phân biệt về mặt từ vựng (đã ghi nhận từ Phase 6). Nếu giảng viên
hỏi "vậy Hybrid có tốt hơn không, sao điểm giống hệt nhau" — câu trả lời trung
thực là: trên **tập dữ liệu benchmark sạch này**, cả 3 đều đủ tốt; giá trị
thực sự của Hybrid nằm ở **khả năng chống chịu khi 1 trong 2 lớp thất bại**
(rule bị bypass bởi biến thể mới → còn ML bắt được nếu đã học pattern tương tự
qua confidence; ML service down → còn rule engine vẫn hoạt động như bình
thường) — điều này thể hiện rõ ở kiến trúc (ADR-2, mục 4.4), không phải ở con
số accuracy trên bộ test này.

---

## 5. Cơ sở dữ liệu (PostgreSQL, qua Prisma ORM)

```
Admin                          SecurityEvent                    TrafficMetric
──────────────                 ──────────────────────           ──────────────────
id            uuid PK          id            uuid PK            id             uuid PK
username      unique           timestamp                        bucketStart    unique (giờ UTC)
passwordHash                   sourceIp                         totalRequests
createdAt                      method                           allowedRequests
                                endpoint                         blockedRequests
                                attackType                       sqlInjectionBlocks
                                ruleResult    jsonb              xssBlocks
                                mlResult      jsonb
                                confidence    float?
                                decision
                                requestMeta   jsonb (đã lọc)
```

**Không có khoá ngoại (FK)** giữa 3 bảng — cả `SecurityEvent` lẫn
`TrafficMetric` đều "thuộc về hệ thống", không thuộc về 1 admin cụ thể nào.
Index trên `SecurityEvent(timestamp)` và `SecurityEvent(attackType)` để phục
vụ 2 kiểu truy vấn chính của Dashboard (liệt kê theo thời gian, lọc theo loại
tấn công).

---

## 6. Công nghệ sử dụng & lý do chọn

| Thành phần | Công nghệ | Vì sao |
|---|---|---|
| WAF + Protected API | NestJS + TypeScript | Module system rõ ràng, khớp với thiết kế phân lớp Controller→Service→Engine→Repository |
| ML Service | Python + scikit-learn | Nhanh để lặp trong 20 ngày; đề bài giới hạn không dùng deep learning |
| Giao tiếp WAF ↔ ML | HTTP/JSON | Đơn giản nhất giữa 2 ngôn ngữ khác nhau — không cần gRPC/message queue ở quy mô này |
| Database | PostgreSQL | Quan hệ, hỗ trợ phân trang/lọc tốt cho Dashboard |
| Admin Auth | JWT | Stateless, không cần thêm hạ tầng session cho hệ thống 1 role |
| Frontend | Next.js + Tailwind | App Router hiện đại, không cần thêm UI/chart library cho MVP |
| Containerization | Docker (docker-compose) | Chạy toàn bộ 5 service + Postgres cho môi trường dev |

---

## 7. Các quyết định kiến trúc quan trọng (ADR — Architecture Decision Record)

Đầy đủ tại `docs/architecture.md` §19. Tóm tắt 7 ADR, tất cả đã **Approved**:

| # | Quyết định | Vì sao / đánh đổi |
|---|---|---|
| ADR-1 | `backend` và `protected-api` là 2 process NestJS tách biệt | Minh hoạ đúng mô hình "WAF đứng trước API", không gộp routing chung 1 app |
| ADR-2 | ML lỗi → trạng thái `UNAVAILABLE` rõ ràng, không bao giờ coi là `NORMAL`; hệ thống fallback về rule engine | Đánh đổi: **không fail-closed** khi ML down (không block hết traffic) — vì rule engine đã đủ khả năng bắt 2 loại tấn công mục tiêu một mình |
| ADR-3 | `SecurityEvent` chỉ tạo khi BLOCK | Tránh phình DB, Dashboard tập trung vào sự cố thật |
| ADR-4 | `requestMeta` chỉ lưu bản đã lọc (endpoint/queryParams/pathParams) | Không lưu body thô/full headers — tránh lộ credential/PII trong log sự cố |
| ADR-5 | JWT stateless, hết hạn ~15-30 phút, không có logout thu hồi token | Đánh đổi: token lộ trước khi hết hạn vẫn dùng được — chấp nhận vì thời gian sống ngắn, đổi lại không cần Redis/session store |
| ADR-6 | 4 service độc lập thay vì gộp 1 app | Đây là các runtime khác hẳn nhau (2 Node khác vai trò, 1 Python, 1 frontend) |
| ADR-7 | `TrafficMetric` — bảng đếm gộp riêng, cập nhật fire-and-forget mọi request | Dashboard cần Total/Allowed Requests mà `SecurityEvent` (chỉ có BLOCK) không cung cấp được; ghi không chờ để không làm chậm response |

---

## 8. Những gì đồ án **KHÔNG** làm (Non-goals) — và vì sao

Đây là ranh giới phạm vi được xác định **từ đầu** (`docs/CLAUDE.md` §3), quan
trọng để trả lời câu "vì sao không làm X":

DDoS protection, Bot detection, Rate limiting nâng cao, CSRF protection,
Malware scanning, Command Injection, LDAP Injection, SSRF, RCE, XXE detection,
tính năng WAF gắn với Kubernetes/Cloud, mô hình deep learning phức tạp,
threat intelligence feed, tự sinh rule bằng AI, huấn luyện ML phân tán.

**Lý do chung:** đây là đồ án MVP 20 ngày, tập trung chứng minh **một** ý
tưởng cốt lõi (kết hợp rule + ML cho SQLi/XSS) thật sâu và thật chắc, thay vì
dàn trải nông nhiều tính năng. Nếu giảng viên hỏi "sao không chống luôn DDoS/
CSRF..." — câu trả lời đúng là: **có chủ đích giới hạn phạm vi** để tập trung
chất lượng, không phải thiếu sót do quên.

---

## 9. Lịch sử phát triển — 12 phase (tất cả đã hoàn thành)

| Phase | Tên | Làm gì |
|---|---|---|
| 0 | Foundation | Định nghĩa mục tiêu, phạm vi, tài liệu gốc |
| 1A | Architecture Design | Thiết kế kiến trúc, chốt 6 ADR đầu tiên |
| 1B | Repository Scaffolding | Khởi tạo khung 5 service + Docker |
| 2 | Database + Core Domain | Chọn Prisma, tạo schema `Admin`/`SecurityEvent` |
| 3 | Protected API + WAF Proxy | WAF forward request thô, xử lý lỗi 502 |
| 4 | Request Extraction + Normalization | `NormalizedRequest`, tách `WafService` khỏi logic forward |
| 5 | Rule-based SQLi/XSS | 7+7 pattern, `RuleDetectionEngine` |
| 6 | Dataset + ML | Dataset tổng hợp, train TF-IDF+LogisticRegression, `/predict` |
| 7 | Hybrid Decision Engine | Bảng quyết định 5 nhánh — **lần đầu có BLOCK/403** |
| 8 | Security Logging | Ghi `SecurityEvent` khi BLOCK, redaction |
| 9 | Admin Authentication/API | JWT login, `/admin/events` |
| 9A | Traffic Metrics Foundation | `TrafficMetric`, ADR-7, fire-and-forget |
| 10 | Dashboard | `/admin/stats`, giao diện Next.js đầy đủ |
| 11 | Evaluation | So sánh Rule-only/ML-only/Hybrid bằng harness thật |

**Nguyên tắc xuyên suốt cả quá trình:** mỗi phase = 1 mục tiêu rõ ràng → làm
→ test (build/lint/unit/e2e) → xác minh thật (chạy live, không chỉ mock) →
ghi lại vào `docs/memory.md` → dừng lại chờ duyệt trước khi sang phase kế
tiếp. Không gộp nhiều phase, không tự ý mở rộng phạm vi.

---

## 10. Những bug thật đã gặp và cách xử lý (rất đáng nói khi bảo vệ)

Kể được các bug thật + cách tìm ra + cách sửa sẽ cho thấy bạn **thực sự hiểu**
hệ thống, không chỉ học thuộc:

1. **Route precedence bug (Phase 9):** `POST /auth/login` trả về `404`. Nguyên
   nhân: NestJS/Express đăng ký route theo thứ tự import module; route
   catch-all `@All('*')` của `WafController` được đăng ký **trước**
   `AuthController` (do thứ tự import trong `AppModule`), nên nuốt mất request
   trước khi tới đúng route. **Sửa:** đổi thứ tự import (`AuthModule`/
   `AdminModule` trước `WafModule`). **Phòng tái diễn:** viết e2e test khởi
   động toàn bộ `AppModule` thật để bắt lỗi kiểu này.

2. **Train/serve mismatch (Phase 6):** input benign `id=42` bị đoán nhầm
   thành `SQL_INJECTION`. Nguyên nhân: hàm build search-surface phía Python
   bọc request vào JSON (`{...}`), trong khi dữ liệu huấn luyện là chuỗi thô
   không có ký tự JSON — model "sốc" với ký tự lạ. **Sửa:** chỉ trích giá trị
   thô, không bọc cấu trúc.

3. **DI resolution bug (Phase 9):** Guard tham chiếu tới `JwtService` không
   resolve được dù module đã import đúng chỗ. **Sửa:** phải export cả
   `JwtModule` (không chỉ export class Guard) từ `AuthModule`.

4. **Thiết kế lại giữa chừng (Phase 9A):** Bản thiết kế đầu tiên định `await`
   việc ghi `TrafficMetric` (giống `SecurityEvent`) — nhưng nhận ra điều này
   sẽ cộng thêm độ trễ DB vào **mọi** request hợp lệ. **Sửa trước khi code:**
   đổi sang fire-and-forget có `.catch()` rõ ràng.

---

## 11. Chạy & test hệ thống (tóm tắt — chi tiết đầy đủ xem hội thoại/README)

```
1. docker run postgres tạm  →  2. prisma migrate + seed admin
3. chạy ml-service (uvicorn) →  4. chạy protected-api → 5. chạy backend
6. chạy frontend → 7. đăng nhập ở /login, xem /dashboard
8. bắn vài request benign/SQLi/XSS qua WAF để có dữ liệu thật trên Dashboard
```
Test tự động: `npm test` + `npm run test:e2e` (backend), `pytest` (ml-service),
`npm run build && npm run lint` (frontend, chưa có test framework riêng).
Đánh giá 3 phương pháp: `python -m evaluation.export_test_set` →
`npm run evaluate` → `python -m evaluation.compute_metrics`.

---

## 12. Câu hỏi giảng viên có thể hỏi + gợi ý trả lời

**Q: Vì sao kết hợp Rule + ML thay vì chỉ dùng một loại?**
Rule nhanh, deterministic, dễ giải thích nhưng cứng — chỉ bắt được đúng những
gì đã viết sẵn, dễ bị bypass bằng biến thể mới. ML linh hoạt hơn, có thể bắt
được biến thể chưa từng gặp pattern y hệt, nhưng có thể sai và khó giải thích
("black box"). Kết hợp: rule là lớp chặn nhanh/chắc cho pattern đã biết, ML là
lớp bổ sung — mỗi bên bù đắp điểm yếu của bên kia.

**Q: Rule và ML bất đồng thì ai thắng? Vì sao?**
Rule luôn thắng khi nó phát hiện (kể cả ML nói ngược lại) — vì rule
deterministic/giải thích được, phù hợp làm "lớp phòng thủ chắc chắn nhất". ML
chỉ được quyết định khi rule im lặng.

**Q: ML service chết thì hệ thống có bị tê liệt/chặn hết không?**
Không. Hệ thống fallback về rule engine một mình (ADR-2), traffic vẫn được xử
lý bình thường qua rule. Đây là đánh đổi có chủ đích: không fail-closed để
tránh chặn nhầm toàn bộ traffic hợp lệ chỉ vì 1 service phụ bị down.

**Q: Ngưỡng confidence để BLOCK là bao nhiêu, sao chọn số đó?**
0.7, đọc từ biến môi trường (cấu hình được, không hard-code). Dưới ngưỡng vẫn
ALLOW nhưng log rõ model đã nghi ngờ gì — không giấu thông tin vận hành.

**Q: Tại sao dùng TF-IDF + Logistic Regression, không dùng deep learning?**
Phạm vi đồ án giới hạn rõ (non-goal: không deep learning). Với payload ngắn,
mô hình tuyến tính đơn giản trên đặc trưng n-gram ký tự đã đủ hiệu quả, nhanh,
dễ giải thích, dễ huấn luyện lại trong thời gian ngắn.

**Q: Làm sao đảm bảo đánh giá ML không bị "học tủ" (data leakage)?**
Chia train/test theo `group_id` (mẫu gốc) bằng `GroupShuffleSplit`, không
random split thường — đảm bảo các biến thể của cùng 1 payload không lọt sang
cả 2 bên.

**Q: Kết quả 100% accuracy có đáng tin không, có ý nghĩa gì?**
Có thật (chạy trên tập test chưa từng thấy khi huấn luyện), nhưng cần hiểu
đúng: dataset tổng hợp, dễ phân biệt về từ vựng — đây không phải bằng chứng
tổng quát hoá tới payload bị obfuscate hay traffic thật mơ hồ. Giá trị chính
là: chứng minh phương pháp đánh giá đúng đắn (methodology sound), và giá trị
thật của Hybrid nằm ở khả năng **chống chịu khi 1 lớp thất bại**, không nằm ở
con số accuracy trên benchmark sạch này.

**Q: Vì sao `SecurityEvent` chỉ lưu BLOCK, không lưu ALLOW?**
Traffic hợp lệ chiếm đa số áp đảo — lưu hết sẽ phình DB vô ích và làm loãng
dữ liệu điều tra sự cố thật. Nhưng Dashboard vẫn cần Total/Allowed Requests →
giải quyết bằng bảng đếm gộp riêng `TrafficMetric` (ADR-7), không phải bằng
cách lưu thêm ALLOW vào `SecurityEvent`.

**Q: `requestMeta` sao không lưu nguyên request?**
Để tránh log sự cố vô tình chứa password/session token/PII nằm trong body
hoặc header — chỉ lưu phần đủ để giải thích "vì sao bị chặn"
(endpoint/queryParams/pathParams).

**Q: Vì sao ghi `TrafficMetric` không `await` còn `SecurityEvent` thì `await`?**
`TrafficMetric` tăng ở MỌI request (số lượng lớn) — nếu chờ ghi DB sẽ làm
chậm cả hệ thống không cần thiết cho một con số thống kê. `SecurityEvent` chỉ
ghi khi BLOCK (ít hơn nhiều) và gắn liền với chính quyết định bảo mật đó nên
vẫn cần đảm bảo cố gắng ghi trước khi trả response — nhưng lỗi ghi vẫn không
được phép đổi response (log tự nuốt lỗi, không throw).

**Q: JWT vì sao không dùng session server-side?**
Hệ thống chỉ có 1 vai trò (admin), JWT stateless giúp không cần thêm hạ tầng
session/Redis. Đánh đổi: không thu hồi được token đã phát hành trước khi hết
hạn — chấp nhận vì thời gian sống ngắn (15-30 phút).

**Q: Hệ thống có hạn chế/rủi ro gì đã biết mà nhóm tự nhận ra?**
- ML có thiên hướng false-positive nhẹ trên input benign đơn giản (từng thấy
  `id=1` cho confidence 0.60 — dưới ngưỡng nên vẫn ALLOW, nhưng cho thấy model
  chưa hoàn hảo).
- JWT bị lộ trước khi hết hạn vẫn dùng được (không có blacklist).
- Dataset ML nhỏ, tổng hợp — không đại diện traffic thật.
- Không chống được các loại tấn công ngoài SQLi/XSS (theo đúng phạm vi đã
  khai báo).
- Không fail-closed khi ML down (đánh đổi có chủ đích, không phải thiếu sót).

**Q: Vì sao tách riêng `backend` và `protected-api` thay vì gộp 1 app?**
Vì bản chất bài toán là "WAF đứng *trước* một API" — gộp chung 1 app sẽ không
minh hoạ/chứng minh được kiến trúc "gác cổng" đúng nghĩa. Cũng giúp
`protected-api` không cần biết gì về bảo mật — toàn bộ trách nhiệm nằm ở WAF.

---

## 13. Tổng kết một câu

**Hybrid WAF** là một lớp gác cổng kết hợp phát hiện dựa trên luật (nhanh,
chắc chắn, dễ giải thích) và học máy (linh hoạt hơn với biến thể mới), gộp lại
bằng một bộ quyết định deterministic ưu tiên rule khi rule lên tiếng — cùng với
lớp ghi log sự cố (chỉ khi chặn), lớp thống kê lưu lượng (mọi request, không
chặn response), một Dashboard quản trị, và một bộ đánh giá định lượng so sánh
cả ba cách tiếp cận trên cùng một tập dữ liệu — mọi quyết định thiết kế đều có
lý do, có đánh đổi được ghi nhận trung thực, và có phạm vi giới hạn rõ ràng có
chủ đích.
