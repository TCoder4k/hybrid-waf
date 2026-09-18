export type AttackScenarioType = "NORMAL" | "SQL_INJECTION" | "XSS";

export interface AttackScenario {
  id: string;
  type: AttackScenarioType;
  name: string;
  description: string;
  method: "GET" | "POST";
  endpoint: string;
  payload: string;
}

export const ATTACK_SCENARIOS: AttackScenario[] = [
  {
    id: "normal-search",
    type: "NORMAL",
    name: "Request bình thường",
    description: "Request hợp lệ để kiểm tra WAF cho phép đi qua.",
    method: "GET",
    endpoint: "/api/hello",
    payload: "english",
  },
  {
    id: "sqli-basic",
    type: "SQL_INJECTION",
    name: "SQL Injection cơ bản",
    description: "Payload SQLi mẫu dùng để kiểm tra Rule/ML.",
    method: "GET",
    endpoint: "/api/hello",
    payload: "' OR 1=1 --",
  },
  {
    id: "sqli-union",
    type: "SQL_INJECTION",
    name: "SQL Injection UNION",
    description: "Kiểm tra mẫu UNION SELECT.",
    method: "GET",
    endpoint: "/api/hello",
    payload: "' UNION SELECT NULL --",
  },
  {
    id: "xss-script",
    type: "XSS",
    name: "XSS Script",
    description: "Payload XSS cơ bản.",
    method: "GET",
    endpoint: "/api/hello",
    payload: "<script>alert(1)</script>",
  },
  {
    id: "xss-event",
    type: "XSS",
    name: "XSS Event Handler",
    description: "Kiểm tra XSS thông qua event handler.",
    method: "GET",
    endpoint: "/api/hello",
    payload: "<img src=x onerror=alert(1)>",
  },
];
