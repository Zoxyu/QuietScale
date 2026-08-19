/**
 * scripts/adapters/official-placeholder.ts —— 真实数据源占位 Adapter（优先级 1~4）
 *
 * 待授权/待接入：以下数据源均需要确认使用许可与授权后方可实现真实拉取，
 * 绝不绕过反爬或验证码，绝不抓取任何需要登录或明确禁止抓取的接口。
 * 在授权落地之前，这些 Adapter 保持 status 'pending-auth'，
 * fetchSamples 返回空数组，不参与数据生成。
 *
 * 建议来源说明：
 * - 优先级 1：当地发改委/商务局/农业农村局公开零售参考价
 *   （各地「民生商品价格监测」「菜篮子价格」等公开栏目）。
 * - 优先级 2：商务部市场监测公开数据
 *   （商务部市场运行和消费促进司公开发布的生活必需品价格监测）。
 * - 优先级 3：农业农村部/批发市场行情
 *   （全国农产品批发市场价格信息系统等公开的批发市场行情）。
 * - 优先级 4：授权商超/电商平台
 *   （与商超或电商平台达成数据使用授权后，按其开放接口接入）。
 */

import { registerAdapter } from './adapter.ts';
import type { PriceAdapter, RawSample } from './adapter.ts';

/** 构造一个待授权占位 Adapter */
function placeholderAdapter(
  id: string,
  name: string,
  priority: number,
  description: string
): PriceAdapter {
  return {
    id,
    name,
    priority,
    status: 'pending-auth',
    // 待授权/待接入：该数据源需要确认使用许可后实现，绝不绕过反爬或验证码。
    // description 仅用于描述建议来源，授权确认后替换为真实拉取逻辑。
    async fetchSamples(_dateKey: string): Promise<RawSample[]> {
      void _dateKey;
      void description;
      return [];
    }
  };
}

/** 优先级 1：当地发改委/商务局/农业农村局零售参考 */
export const localOfficialRetailAdapter = placeholderAdapter(
  'official-local-retail',
  '当地发改委/商务局/农业农村局零售参考',
  1,
  '建议来源：各地发改委、商务局、农业农村局公开发布的民生商品零售价格监测（如"菜篮子"价格公开栏目）。'
);

/** 优先级 2：商务部公开监测 */
export const mofcomMonitorAdapter = placeholderAdapter(
  'official-mofcom',
  '商务部市场监测公开数据',
  2,
  '建议来源：商务部市场运行和消费促进司公开发布的生活必需品价格监测数据。'
);

/** 优先级 3：农业农村部/批发市场 */
export const wholesaleMarketAdapter = placeholderAdapter(
  'official-wholesale',
  '农业农村部/批发市场行情',
  3,
  '建议来源：农业农村部及全国农产品批发市场价格信息系统公开的批发市场行情。'
);

/** 优先级 4：授权商超/电商平台 */
export const authorizedRetailAdapter = placeholderAdapter(
  'official-authorized-retail',
  '授权商超/电商平台',
  4,
  '建议来源：与商超或电商平台达成数据使用授权后，按其开放接口规范接入公开价格数据。'
);

registerAdapter(localOfficialRetailAdapter);
registerAdapter(mofcomMonitorAdapter);
registerAdapter(wholesaleMarketAdapter);
registerAdapter(authorizedRetailAdapter);
