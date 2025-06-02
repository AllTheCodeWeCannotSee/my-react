// React.memo(function App() {/** ... */})

import { FiberNode } from 'react-reconciler/src/fiber';
import { REACT_MEMO_TYPE } from 'shared/ReactSymbols';
import { Props } from 'shared/ReactTypes';

/**
 * @function memo
 * @description 一个高阶组件 (HOC)，用于优化函数组件的渲染性能。
 *              它接收一个组件类型 (`type`) 和一个可选的自定义比较函数 (`compare`) 作为参数。
 *              `memo` 会返回一个新的组件类型对象，该对象具有特殊的 `$$typeof` 标记 (`REACT_MEMO_TYPE`)。
 *              当 React 渲染这个 memoized 组件时，它会浅比较新旧 props (或者使用提供的 `compare` 函数)。
 *              如果 props 没有改变，React 会跳过重新渲染该组件及其子树，从而复用上一次的渲染结果。
 *
 * @param {FiberNode['type']} type - 需要被 memoized 的原始函数组件类型。
 * @param {(oldProps: Props, newProps: Props) => boolean} [compare] - (可选) 一个自定义的比较函数。
 *        此函数接收旧的 props (`oldProps`) 和新的 props (`newProps`) 作为参数。
 *        如果它返回 `true`，则表示 props 相等，组件将不会重新渲染。
 *        如果返回 `false`，则组件会重新渲染。
 *        如果未提供此函数，React 将默认使用 `shallowEqual` 来比较 props。
 * @returns {{ $$typeof: symbol, type: FiberNode['type'], compare: ((oldProps: Props, newProps: Props) => boolean) | null }}
 *          返回一个特殊的对象，用于在 Fiber 树中标识这是一个 MemoComponent。
 */
export function memo(
	type: FiberNode['type'],
	compare?: (oldProps: Props, newProps: Props) => boolean
) {
	const fiberType = {
		$$typeof: REACT_MEMO_TYPE,
		type,
		compare: compare === undefined ? null : compare
	};
	// memo fiber.type.type
	return fiberType;
}
