import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isValidTicker, isValidReportId, validateDeleteReportParams } from '../lib/security.ts';

test('Security Remediation & Fail-Safe Defense Test Suite', async (t) => {

  await t.test('1. TLS Certificate Verification Security', async (st) => {
    await st.test('NODE_TLS_REJECT_UNAUTHORIZED is not disabled (not set to "0")', () => {
      assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED, '0', 'NODE_TLS_REJECT_UNAUTHORIZED must not be 0');
    });

    await st.test('lib/bist-service.ts does not contain assignments to NODE_TLS_REJECT_UNAUTHORIZED', () => {
      const bistFile = fs.readFileSync(path.join(process.cwd(), 'lib/bist-service.ts'), 'utf8');
      assert.ok(!bistFile.includes("process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'"), 'bist-service.ts must not disable TLS');
      assert.ok(!bistFile.includes('process.env.NODE_TLS_REJECT_UNAUTHORIZED="0"'), 'bist-service.ts must not disable TLS');
    });

    await st.test('lib/isyatirim-service.ts does not contain assignments to NODE_TLS_REJECT_UNAUTHORIZED', () => {
      const isFile = fs.readFileSync(path.join(process.cwd(), 'lib/isyatirim-service.ts'), 'utf8');
      assert.ok(!isFile.includes("process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'"), 'isyatirim-service.ts must not disable TLS');
      assert.ok(!isFile.includes('process.env.NODE_TLS_REJECT_UNAUTHORIZED="0"'), 'isyatirim-service.ts must not disable TLS');
    });

    await st.test('src/lib mirrors do not contain assignments to NODE_TLS_REJECT_UNAUTHORIZED', () => {
      const srcBist = fs.readFileSync(path.join(process.cwd(), 'src/lib/bist-service.ts'), 'utf8');
      const srcIs = fs.readFileSync(path.join(process.cwd(), 'src/lib/isyatirim-service.ts'), 'utf8');
      assert.ok(!srcBist.includes("process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'"));
      assert.ok(!srcIs.includes("process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'"));
    });
  });

  await t.test('2. Ticker Validation & Wildcard Injection Prevention', async (st) => {
    await st.test('isValidTicker accepts standard BIST tickers', () => {
      assert.equal(isValidTicker('THYAO'), true);
      assert.equal(isValidTicker('AGESA'), true);
      assert.equal(isValidTicker('EREGL'), true);
      assert.equal(isValidTicker('ISCTR'), true);
      assert.equal(isValidTicker('BIMAS'), true);
    });

    await st.test('isValidTicker strictly rejects SQL and search wildcards', () => {
      assert.equal(isValidTicker('%'), false, 'Wildcard % must be rejected');
      assert.equal(isValidTicker('_'), false, 'Wildcard _ must be rejected');
      assert.equal(isValidTicker('THY%'), false, 'Prefix wildcard must be rejected');
      assert.equal(isValidTicker('%EREGL'), false, 'Suffix wildcard must be rejected');
      assert.equal(isValidTicker('*'), false, 'Asterisk must be rejected');
    });

    await st.test('isValidTicker rejects SQL injection and script payloads', () => {
      assert.equal(isValidTicker("' OR '1'='1"), false);
      assert.equal(isValidTicker("THYAO; DROP TABLE valuation_reports;"), false);
      assert.equal(isValidTicker("<script>alert(1)</script>"), false);
      assert.equal(isValidTicker("../etc/passwd"), false);
    });

    await st.test('isValidTicker rejects invalid lengths and empty values', () => {
      assert.equal(isValidTicker(''), false);
      assert.equal(isValidTicker('   '), false);
      assert.equal(isValidTicker('A'), false, 'Too short');
      assert.equal(isValidTicker('VERYLONGTICKERNAME'), false, 'Too long');
      assert.equal(isValidTicker(null), false);
      assert.equal(isValidTicker(undefined), false);
    });
  });

  await t.test('3. Report ID Validation & Safe Identifier Enforcement', async (st) => {
    await st.test('isValidReportId accepts valid alphanumeric, dash, and underscore IDs', () => {
      assert.equal(isValidReportId('1728723940123'), true);
      assert.equal(isValidReportId('rep-12345'), true);
      assert.equal(isValidReportId('uuid_550e8400-e29b-41d4-a716-446655440000'), true);
    });

    await st.test('isValidReportId strictly rejects wildcards, spaces, and injections', () => {
      assert.equal(isValidReportId('%'), false);
      assert.equal(isValidReportId('_'), false);
      assert.equal(isValidReportId('*'), false);
      assert.equal(isValidReportId("123' OR '1'='1"), false);
      assert.equal(isValidReportId('id with spaces'), false);
      assert.equal(isValidReportId(''), false);
      assert.equal(isValidReportId(null), false);
    });
  });

  await t.test('4. validateDeleteReportParams Endpoint Fail-Safe Defense', async (st) => {
    await st.test('rejects wildcard ticker % and prevents database mutation', () => {
      const res = validateDeleteReportParams(null, '%');
      assert.equal(res.isValid, false);
      assert.equal(res.cleanTicker, null);
      assert.match(res.error, /geçersiz/i);
    });

    await st.test('rejects wildcard id % and prevents database mutation', () => {
      const res = validateDeleteReportParams('%', null);
      assert.equal(res.isValid, false);
      assert.equal(res.cleanId, null);
      assert.match(res.error, /geçersiz/i);
    });

    await st.test('rejects missing parameters (both null or empty)', () => {
      const res = validateDeleteReportParams(null, null);
      assert.equal(res.isValid, false);
      assert.match(res.error, /belirtilmedi/i);
    });

    await st.test('rejects SQL injection in id or ticker', () => {
      const res1 = validateDeleteReportParams("'; DROP TABLE valuation_reports; --", null);
      assert.equal(res1.isValid, false);
      const res2 = validateDeleteReportParams(null, "' OR 1=1 --");
      assert.equal(res2.isValid, false);
    });

    await st.test('approves valid exact ID and Ticker', () => {
      const res = validateDeleteReportParams('1728723940123', 'THYAO');
      assert.equal(res.isValid, true);
      assert.equal(res.cleanId, '1728723940123');
      assert.equal(res.cleanTicker, 'THYAO');
      assert.equal(res.error, undefined);
    });

    await st.test('approves valid exact ID alone', () => {
      const res = validateDeleteReportParams('rep_99182', null);
      assert.equal(res.isValid, true);
      assert.equal(res.cleanId, 'rep_99182');
      assert.equal(res.cleanTicker, null);
    });

    await st.test('approves valid exact Ticker alone', () => {
      const res = validateDeleteReportParams(null, 'agesa');
      assert.equal(res.isValid, true);
      assert.equal(res.cleanId, null);
      assert.equal(res.cleanTicker, 'AGESA'); // Normalized to uppercase
    });
  });

  await t.test('5. Source Code Verification for Deletion Safety', async (st) => {
    await st.test('app/api/reports/route.ts uses .eq() instead of .ilike()', () => {
      const routeCode = fs.readFileSync(path.join(process.cwd(), 'app/api/reports/route.ts'), 'utf8');
      assert.ok(!routeCode.includes('.ilike('), 'app/api/reports/route.ts must not use .ilike()');
      assert.ok(routeCode.includes('.eq('), 'app/api/reports/route.ts must use exact matching .eq()');
    });

    await st.test('src/app/api/reports/route.ts uses .eq() instead of .ilike()', () => {
      const routeCode = fs.readFileSync(path.join(process.cwd(), 'src/app/api/reports/route.ts'), 'utf8');
      assert.ok(!routeCode.includes('.ilike('), 'src/app/api/reports/route.ts must not use .ilike()');
      assert.ok(routeCode.includes('.eq('), 'src/app/api/reports/route.ts must use exact matching .eq()');
    });
  });
});
