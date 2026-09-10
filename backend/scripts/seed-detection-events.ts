import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface SeedTemplate {
  source: 'RULE' | 'ML' | 'BOTH';
  attackType: 'SQL_INJECTION' | 'XSS';
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  endpoint: string;
  sourceIp: string;
  ruleReason: string;
  mlReason: string;
  confidence: number;
  daysAgo: number;
}

const templates: SeedTemplate[] = [
  // 1. BOTH: High-confidence SQLi on login
  {
    source: 'BOTH',
    attackType: 'SQL_INJECTION',
    method: 'POST',
    endpoint: '/api/login',
    sourceIp: '118.69.182.45',
    ruleReason: 'SQL Injection pattern matched: boolean-based tautology (e.g. OR 1=1)',
    mlReason: 'Predicted SQL_INJECTION with probability 0.96',
    confidence: 0.96,
    daysAgo: 0,
  },
  {
    source: 'BOTH',
    attackType: 'SQL_INJECTION',
    method: 'POST',
    endpoint: '/api/login',
    sourceIp: '14.161.20.89',
    ruleReason: 'SQL Injection pattern matched: UNION SELECT detected',
    mlReason: 'Predicted SQL_INJECTION with probability 0.98',
    confidence: 0.98,
    daysAgo: 1,
  },
  {
    source: 'BOTH',
    attackType: 'XSS',
    method: 'POST',
    endpoint: '/api/comments',
    sourceIp: '171.244.33.12',
    ruleReason: 'XSS pattern matched: <script> tag detected',
    mlReason: 'Predicted XSS with probability 0.94',
    confidence: 0.94,
    daysAgo: 2,
  },
  {
    source: 'BOTH',
    attackType: 'XSS',
    method: 'GET',
    endpoint: '/api/search',
    sourceIp: '42.113.120.5',
    ruleReason: 'XSS pattern matched: onerror/onload event handler payload',
    mlReason: 'Predicted XSS with probability 0.91',
    confidence: 0.91,
    daysAgo: 3,
  },
  {
    source: 'BOTH',
    attackType: 'SQL_INJECTION',
    method: 'GET',
    endpoint: '/api/users',
    sourceIp: '27.72.60.101',
    ruleReason: 'SQL Injection pattern matched: comment sequence (--) detected',
    mlReason: 'Predicted SQL_INJECTION with probability 0.93',
    confidence: 0.93,
    daysAgo: 4,
  },

  // 2. RULE-ONLY: Signature matched but ML gave normal/low confidence or bypassed
  {
    source: 'RULE',
    attackType: 'SQL_INJECTION',
    method: 'GET',
    endpoint: '/api/products',
    sourceIp: '113.160.224.18',
    ruleReason: 'SQL Injection pattern matched: ORDER BY injection clause',
    mlReason: 'Predicted NORMAL with probability 0.62',
    confidence: 0.62,
    daysAgo: 1,
  },
  {
    source: 'RULE',
    attackType: 'XSS',
    method: 'POST',
    endpoint: '/api/profile',
    sourceIp: '1.53.250.77',
    ruleReason: 'XSS pattern matched: javascript: pseudo-protocol in attribute',
    mlReason: 'Predicted NORMAL with probability 0.58',
    confidence: 0.58,
    daysAgo: 2,
  },
  {
    source: 'RULE',
    attackType: 'SQL_INJECTION',
    method: 'POST',
    endpoint: '/api/checkout',
    sourceIp: '123.24.180.99',
    ruleReason: 'SQL Injection pattern matched: boolean-based tautology (e.g. OR 1=1)',
    mlReason: 'Predicted NORMAL with probability 0.65',
    confidence: 0.65,
    daysAgo: 5,
  },
  {
    source: 'RULE',
    attackType: 'XSS',
    method: 'POST',
    endpoint: '/api/comments',
    sourceIp: '183.80.35.40',
    ruleReason: 'XSS pattern matched: <script> tag detected',
    mlReason: 'ML service timeout / UNAVAILABLE',
    confidence: 0.50,
    daysAgo: 6,
  },

  // 3. ML-ONLY: Obfuscated or complex payloads missed by simple Regex
  {
    source: 'ML',
    attackType: 'SQL_INJECTION',
    method: 'POST',
    endpoint: '/api/login',
    sourceIp: '222.252.12.8',
    ruleReason: 'no rule matched',
    mlReason: 'Predicted SQL_INJECTION with probability 0.88',
    confidence: 0.88,
    daysAgo: 0,
  },
  {
    source: 'ML',
    attackType: 'XSS',
    method: 'POST',
    endpoint: '/api/comments',
    sourceIp: '125.235.15.66',
    ruleReason: 'no rule matched',
    mlReason: 'Predicted XSS with probability 0.82',
    confidence: 0.82,
    daysAgo: 1,
  },
  {
    source: 'ML',
    attackType: 'SQL_INJECTION',
    method: 'GET',
    endpoint: '/api/search',
    sourceIp: '115.79.40.15',
    ruleReason: 'no rule matched',
    mlReason: 'Predicted SQL_INJECTION with probability 0.76',
    confidence: 0.76,
    daysAgo: 3,
  },
  {
    source: 'ML',
    attackType: 'XSS',
    method: 'GET',
    endpoint: '/api/users',
    sourceIp: '14.232.180.20',
    ruleReason: 'no rule matched',
    mlReason: 'Predicted XSS with probability 0.73',
    confidence: 0.73,
    daysAgo: 5,
  },
  {
    source: 'ML',
    attackType: 'SQL_INJECTION',
    method: 'POST',
    endpoint: '/api/checkout',
    sourceIp: '171.233.90.11',
    ruleReason: 'no rule matched',
    mlReason: 'Predicted SQL_INJECTION with probability 0.85',
    confidence: 0.85,
    daysAgo: 8,
  },
];

async function main() {
  console.log('Seeding sample SecurityEvents for Detection Analysis...');

  const now = Date.now();
  let count = 0;

  // We generate ~45 events by repeating and perturbing templates
  for (let cycle = 0; cycle < 3; cycle++) {
    for (const t of templates) {
      const daysOffset = t.daysAgo + cycle * 7;
      if (daysOffset > 30) continue;

      const eventTime = new Date(now - daysOffset * 86400000 - Math.floor(Math.random() * 3600000 * 12));

      const isRuleDetected = t.source === 'RULE' || t.source === 'BOTH';
      const isMlDetected = t.source === 'ML' || t.source === 'BOTH';

      const ruleResult = {
        classification: isRuleDetected ? t.attackType : 'NORMAL',
        detected: isRuleDetected,
        confidence: null,
        reason: isRuleDetected ? t.ruleReason : 'no rule matched',
      };

      const mlResult = isMlDetected
        ? {
            status: 'AVAILABLE',
            classification: t.attackType,
            confidence: t.confidence,
            reason: t.mlReason,
          }
        : {
            status: 'AVAILABLE',
            classification: 'NORMAL',
            confidence: 0.60,
            reason: 'Predicted NORMAL',
          };

      await prisma.securityEvent.create({
        data: {
          timestamp: eventTime,
          sourceIp: t.sourceIp,
          method: t.method,
          endpoint: t.endpoint,
          attackType: t.attackType,
          ruleResult: ruleResult,
          mlResult: mlResult,
          confidence: isMlDetected ? t.confidence : null,
          decision: 'BLOCK',
          requestMeta: {
            endpoint: t.endpoint,
            queryParams: {},
            pathParams: {},
          },
        },
      });

      count++;
    }
  }

  console.log(`Successfully seeded ${count} sample SecurityEvents for Detection Analysis!`);
}

main()
  .catch((e) => {
    console.error('Error seeding security events:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
