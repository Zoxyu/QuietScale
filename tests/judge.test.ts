/**
 * tests/judge.test.ts —— 价格判断单元测试（node --test 直跑）
 *
 * 覆盖：五档判断与边界、样本量不足、数据过期、批发免责、"有机"免责关键词、
 * 禁止文案黑名单扫描（宰客/买贵了/不新鲜/不要买）。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeObservedPrice } from '../services/judge.ts';
import type { PriceRecord } from '../types/models.ts';

/** 测试用今日日期键（注入，避免依赖设备日期） */
const TODAY = '2026-08-18';

/** 构造参考价记录：默认上海菜市场叶菜，数据日期 3 天前，样本 22 条 */
function makeRecord(overrides: Partial<PriceRecord>): PriceRecord {
  return {
    id: 't-001',
    cityCode: '310000',
    cityName: '上海',
    channel: 'market',
    category: '叶菜',
    productName: '油麦菜',
    specification: '散装称重',
    unit: '元/斤',
    low: 3,
    median: 4.2,
    high: 6,
    p25: 3.5,
    p75: 4.8,
    p90: 5.4,
    sampleCount: 22,
    dataDate: '2026-08-15',
    sourceName: '测试来源',
    sourceUrl: '',
    dataLevel: 'official_retail',
    confidence: 'high',
    note: '',
    ...overrides
  };
}

/** 便捷调用 */
function judge(priceYuan: number, record: PriceRecord | null) {
  return judgeObservedPrice({ priceYuan, unit: '元/斤', record, today: TODAY });
}

test('五档判断：区间内各档位', () => {
  const record = makeRecord({});
  assert.equal(judge(3.0, record).level, 'low-price');
  assert.equal(judge(4.2, record).level, 'fair');
  assert.equal(judge(5.2, record).level, 'slightly-high');
  assert.equal(judge(6.5, record).level, 'too-high');
});

test('边界：恰等于 p25 → 偏低；恰等于 p75 → 合理；恰等于 p90 → 略高', () => {
  const record = makeRecord({});
  assert.equal(judge(3.5, record).level, 'low-price');
  assert.equal(judge(4.8, record).level, 'fair');
  assert.equal(judge(5.4, record).level, 'slightly-high');
});

test('边界：高于 p90 → 偏高', () => {
  const record = makeRecord({});
  assert.equal(judge(5.41, record).level, 'too-high');
});

test('sampleCount = 7（低于 8）→ 数据不足', () => {
  const record = makeRecord({ sampleCount: 7 });
  const res = judge(4.2, record);
  assert.equal(res.level, 'insufficient-data');
  assert.equal(res.confidence, 'low');
});

test('dataDate 超过 14 天 → 数据不足', () => {
  const record = makeRecord({ dataDate: '2026-08-01' }); // 距今 17 天
  const res = judge(4.2, record);
  assert.equal(res.level, 'insufficient-data');
});

test('record 为 null → 数据不足', () => {
  const res = judge(4.2, null);
  assert.equal(res.level, 'insufficient-data');
});

test('批发来源：免责声明含「批发环节参考」', () => {
  const record = makeRecord({ channel: 'wholesale', dataLevel: 'wholesale', sampleCount: 40 });
  const res = judge(4.2, record);
  assert.ok(res.disclaimer.includes('批发环节参考'));
});

test('略高/偏高文案含「有机」免责关键词', () => {
  const record = makeRecord({});
  const slightlyHigh = judge(5.2, record);
  assert.ok(slightlyHigh.basis.includes('有机'));
  const tooHigh = judge(6.5, record);
  assert.ok(tooHigh.basis.includes('有机'));
  // 低价与合理档不强制带该免责
  const fair = judge(4.2, record);
  assert.equal(fair.level, 'fair');
});

test('禁止文案黑名单：任何档位输出不得含「宰客/买贵了/不新鲜/不要买」', () => {
  const blacklist = ['宰客', '买贵了', '不新鲜', '不要买'];
  const record = makeRecord({});
  const wholesaleRecord = makeRecord({ channel: 'wholesale', dataLevel: 'wholesale', sampleCount: 40 });
  const staleRecord = makeRecord({ dataDate: '2026-07-01' });
  const lowSampleRecord = makeRecord({ sampleCount: 5 });
  const prices = [2.5, 3.5, 4.2, 4.8, 5.4, 6.5, 9.9];
  for (const rec of [record, wholesaleRecord, staleRecord, lowSampleRecord, null]) {
    for (const price of prices) {
      const res = judge(price, rec);
      for (const word of blacklist) {
        assert.ok(!res.basis.includes(word), `basis 不应包含「${word}」：${res.basis}`);
        assert.ok(!res.disclaimer.includes(word), `disclaimer 不应包含「${word}」：${res.disclaimer}`);
      }
    }
  }
});
