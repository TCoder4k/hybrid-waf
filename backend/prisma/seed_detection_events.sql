-- Sample SecurityEvents for Detection Analysis Testing
-- Covers: RULE-only, ML-only, and BOTH detections, with varied confidence scores and endpoints across recent dates.

INSERT INTO "security_events" (
  "id", "timestamp", "sourceIp", "method", "endpoint", "attackType",
  "ruleResult", "mlResult", "confidence", "decision", "requestMeta"
) VALUES
-- 1. BOTH (Both engines detected)
(
  gen_random_uuid(), NOW() - INTERVAL '1 hour', '118.69.182.45', 'POST', '/api/login', 'SQL_INJECTION',
  '{"detected": true, "classification": "SQL_INJECTION", "reason": "SQL Injection pattern matched: boolean-based tautology (e.g. OR 1=1)"}',
  '{"status": "AVAILABLE", "classification": "SQL_INJECTION", "confidence": 0.96, "reason": "Predicted SQL_INJECTION with probability 0.96"}',
  0.96, 'BLOCK', '{"endpoint": "/api/login"}'
),
(
  gen_random_uuid(), NOW() - INTERVAL '6 hours', '14.161.20.89', 'POST', '/api/login', 'SQL_INJECTION',
  '{"detected": true, "classification": "SQL_INJECTION", "reason": "SQL Injection pattern matched: UNION SELECT detected"}',
  '{"status": "AVAILABLE", "classification": "SQL_INJECTION", "confidence": 0.98, "reason": "Predicted SQL_INJECTION with probability 0.98"}',
  0.98, 'BLOCK', '{"endpoint": "/api/login"}'
),
(
  gen_random_uuid(), NOW() - INTERVAL '1 day', '171.244.33.12', 'POST', '/api/comments', 'XSS',
  '{"detected": true, "classification": "XSS", "reason": "XSS pattern matched: <script> tag detected"}',
  '{"status": "AVAILABLE", "classification": "XSS", "confidence": 0.94, "reason": "Predicted XSS with probability 0.94"}',
  0.94, 'BLOCK', '{"endpoint": "/api/comments"}'
),
(
  gen_random_uuid(), NOW() - INTERVAL '2 days', '42.113.120.5', 'GET', '/api/search', 'XSS',
  '{"detected": true, "classification": "XSS", "reason": "XSS pattern matched: onerror/onload event handler payload"}',
  '{"status": "AVAILABLE", "classification": "XSS", "confidence": 0.91, "reason": "Predicted XSS with probability 0.91"}',
  0.91, 'BLOCK', '{"endpoint": "/api/search"}'
),
(
  gen_random_uuid(), NOW() - INTERVAL '3 days', '27.72.60.101', 'GET', '/api/users', 'SQL_INJECTION',
  '{"detected": true, "classification": "SQL_INJECTION", "reason": "SQL Injection pattern matched: comment sequence (--) detected"}',
  '{"status": "AVAILABLE", "classification": "SQL_INJECTION", "confidence": 0.93, "reason": "Predicted SQL_INJECTION with probability 0.93"}',
  0.93, 'BLOCK', '{"endpoint": "/api/users"}'
),

-- 2. RULE-ONLY (Rule detected, ML classified NORMAL or low score)
(
  gen_random_uuid(), NOW() - INTERVAL '4 hours', '113.160.224.18', 'GET', '/api/products', 'SQL_INJECTION',
  '{"detected": true, "classification": "SQL_INJECTION", "reason": "SQL Injection pattern matched: ORDER BY injection clause"}',
  '{"status": "AVAILABLE", "classification": "NORMAL", "confidence": 0.62, "reason": "Predicted NORMAL"}',
  0.62, 'BLOCK', '{"endpoint": "/api/products"}'
),
(
  gen_random_uuid(), NOW() - INTERVAL '18 hours', '1.53.250.77', 'POST', '/api/profile', 'XSS',
  '{"detected": true, "classification": "XSS", "reason": "XSS pattern matched: javascript: pseudo-protocol in attribute"}',
  '{"status": "AVAILABLE", "classification": "NORMAL", "confidence": 0.58, "reason": "Predicted NORMAL"}',
  0.58, 'BLOCK', '{"endpoint": "/api/profile"}'
),
(
  gen_random_uuid(), NOW() - INTERVAL '2 days', '123.24.180.99', 'POST', '/api/checkout', 'SQL_INJECTION',
  '{"detected": true, "classification": "SQL_INJECTION", "reason": "SQL Injection pattern matched: boolean-based tautology (e.g. OR 1=1)"}',
  '{"status": "AVAILABLE", "classification": "NORMAL", "confidence": 0.65, "reason": "Predicted NORMAL"}',
  0.65, 'BLOCK', '{"endpoint": "/api/checkout"}'
),
(
  gen_random_uuid(), NOW() - INTERVAL '4 days', '183.80.35.40', 'POST', '/api/comments', 'XSS',
  '{"detected": true, "classification": "XSS", "reason": "XSS pattern matched: <script> tag detected"}',
  '{"status": "UNAVAILABLE", "classification": null, "confidence": null, "reason": "ML service unavailable"}',
  null, 'BLOCK', '{"endpoint": "/api/comments"}'
),

-- 3. ML-ONLY (ML detected with high confidence, Rule missed)
(
  gen_random_uuid(), NOW() - INTERVAL '2 hours', '222.252.12.8', 'POST', '/api/login', 'SQL_INJECTION',
  '{"detected": false, "classification": "NORMAL", "reason": "no rule matched"}',
  '{"status": "AVAILABLE", "classification": "SQL_INJECTION", "confidence": 0.88, "reason": "Predicted SQL_INJECTION with probability 0.88"}',
  0.88, 'BLOCK', '{"endpoint": "/api/login"}'
),
(
  gen_random_uuid(), NOW() - INTERVAL '12 hours', '125.235.15.66', 'POST', '/api/comments', 'XSS',
  '{"detected": false, "classification": "NORMAL", "reason": "no rule matched"}',
  '{"status": "AVAILABLE", "classification": "XSS", "confidence": 0.82, "reason": "Predicted XSS with probability 0.82"}',
  0.82, 'BLOCK', '{"endpoint": "/api/comments"}'
),
(
  gen_random_uuid(), NOW() - INTERVAL '1 day', '115.79.40.15', 'GET', '/api/search', 'SQL_INJECTION',
  '{"detected": false, "classification": "NORMAL", "reason": "no rule matched"}',
  '{"status": "AVAILABLE", "classification": "SQL_INJECTION", "confidence": 0.76, "reason": "Predicted SQL_INJECTION with probability 0.76"}',
  0.76, 'BLOCK', '{"endpoint": "/api/search"}'
),
(
  gen_random_uuid(), NOW() - INTERVAL '3 days', '14.232.180.20', 'GET', '/api/users', 'XSS',
  '{"detected": false, "classification": "NORMAL", "reason": "no rule matched"}',
  '{"status": "AVAILABLE", "classification": "XSS", "confidence": 0.73, "reason": "Predicted XSS with probability 0.73"}',
  0.73, 'BLOCK', '{"endpoint": "/api/users"}'
),
(
  gen_random_uuid(), NOW() - INTERVAL '5 days', '171.233.90.11', 'POST', '/api/checkout', 'SQL_INJECTION',
  '{"detected": false, "classification": "NORMAL", "reason": "no rule matched"}',
  '{"status": "AVAILABLE", "classification": "SQL_INJECTION", "confidence": 0.85, "reason": "Predicted SQL_INJECTION with probability 0.85"}',
  0.85, 'BLOCK', '{"endpoint": "/api/checkout"}'
);
