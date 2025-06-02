// WorkTag用来标记fiber node的类型
/**
 * @typedef {number} WorkTag
 * @description 表示 Fiber 节点类型的数字标签。
 *              每个常量（如 `FunctionComponent`, `HostRoot` 等）都代表一种特定的 Fiber 类型。
 *              这些标签用于在 React 的协调和提交阶段区分不同类型的 Fiber 节点，并执行相应的逻辑。
 */
export type WorkTag =
	| typeof FunctionComponent
	| typeof HostRoot
	| typeof HostComponent
	| typeof HostText
	| typeof Fragment
	| typeof ContextProvider
	| typeof SuspenseComponent
	| typeof OffscreenComponent
	| typeof MemoComponent;

/**
 * @constant FunctionComponent
 * @description 代表一个函数组件的 Fiber 节点。
 */
export const FunctionComponent = 0;
/**
 * @constant HostRoot
 * @description 代表 React 应用的根 Fiber 节点，通常与 FiberRootNode 关联。
 */
export const HostRoot = 3;
/**
 * @constant HostComponent
 * @description 代表一个原生的宿主平台元素（例如，在 Web 上是 DOM 元素如 `<div>`, `<span>`）。
 */
export const HostComponent = 5;
/**
 * @constant HostText
 * @description 代表一个文本节点。
 */
export const HostText = 6;
/**
 * @constant Fragment
 * @description 代表一个 React Fragment (`<></>` 或 `<React.Fragment>`)。
 */
export const Fragment = 7;
/**
 * @constant ContextProvider
 * @description 代表一个 Context Provider 组件 (`<MyContext.Provider>`)。
 */
export const ContextProvider = 8;
/**
 * @constant SuspenseComponent
 * @description 代表一个 Suspense 组件 (`<Suspense>`)。
 */
export const SuspenseComponent = 13;
/**
 * @constant OffscreenComponent
 * @description 代表一个 Offscreen 组件，用于实现如内容隐藏/显示等优化。
 */
export const OffscreenComponent = 14;
/**
 * @constant MemoComponent
 * @description 代表一个通过 `React.memo()` 包装的组件。
 */
export const MemoComponent = 15;
