/**
 * 一秤清欢 —— 全局最小类型声明
 *
 * 目的：零 npm 依赖即可通过 TypeScript 编译（不执行 npm install）。
 * 后续如需完整类型提示，可安装官方 miniprogram-api-typings 替换本文件：
 *   npm i -D miniprogram-api-typings
 *   然后在 tsconfig.json 的 types 中引入，并删除此处的宽松声明。
 */

/** 微信全局 API 对象（此处宽松声明为 any，避免依赖官方类型包） */
declare const wx: any;

/** 注册小程序（app.ts 入口） */
declare function App(options: any): void;

/** 获取小程序全局实例（globalData 等） */
declare function getApp(): any;

/** 注册页面 */
declare function Page(options: any): void;

/** 注册自定义组件 */
declare function Component(options: any): void;

/** 注册可复用的行为对象（自定义组件复用场景） */
declare function Behavior(options: any): any;
