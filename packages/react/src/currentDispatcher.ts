import { Action, ReactContext, Usable } from 'shared/ReactTypes';
import { HookDeps } from 'react-reconciler/src/fiberHooks';
/**
 * @interface Dispatcher
 * @description 定义了 React Hooks 的集合。
 *              在函数组件渲染期间，`currentDispatcher.current` 会指向一个实现了此接口的对象。
 *              这个对象包含了特定上下文（例如，首次渲染、更新渲染或 SSR）中 Hooks (如 `useState`, `useEffect`) 的具体实现。
 *              通过这种机制，React 可以在不同的渲染阶段或环境中切换 Hooks 的行为。
 */
export interface Dispatcher {
	useState: <T>(initialState: (() => T) | T) => [T, Dispatch<T>];
	useEffect: (callback: () => void | void, deps: HookDeps | undefined) => void;
	useTransition: () => [boolean, (callback: () => void) => void];
	useRef: <T>(initialValue: T) => { current: T };
	useContext: <T>(context: ReactContext<T>) => T;
	use: <T>(usable: Usable<T>) => T;
	useMemo: <T>(nextCreate: () => T, deps: HookDeps | undefined) => T;
	useCallback: <T>(callback: T, deps: HookDeps | undefined) => T;
}

/**
 * @description 描述了一个函数的类型：这个函数接收一个 `Action<State>` 类型的参数（即状态更新的描述），并且不返回任何值 (void)。
 */
export type Dispatch<State> = (action: Action<State>) => void;

/**
 * @constant currentDispatcher
 * @description 一个全局共享的对象，其 `current` 属性指向当前激活的 Hooks Dispatcher。
 *              在函数组件渲染期间，React 的渲染器 (reconciler) 会将 `currentDispatcher.current`
 *              设置为包含特定上下文（如 mount 或 update）的 Hooks 实现的对象 (一个 `Dispatcher` 实例)。
 *              当 Hooks (如 `useState`, `useEffect`) 被调用时，它们会通过 `resolveDispatcher`
 *              读取 `currentDispatcher.current` 来获取并执行相应的实现。
 *              在组件渲染周期之外或没有特定 Hook 上下文时，`currentDispatcher.current` 为 `null`。
 */
const currentDispatcher: { current: Dispatcher | null } = {
	current: null
};

/**
 * @function resolveDispatcher
 * @description 获取当前激活的 Hooks Dispatcher 对象。
 *              在 React 的 Hooks (如 `useState`, `useEffect` 等) 内部被调用，
 *              以确保 Hook 是在正确的渲染上下文中执行。
 *              它从全局的 `currentDispatcher.current` 中读取当前的 Dispatcher。
 * @returns {Dispatcher} 返回当前激活的 Dispatcher 对象。
 * @throws {Error} 如果 `currentDispatcher.current` 为 `null` (即 Hook 在函数组件的渲染上下文之外被调用)，
 *                 则抛出错误，提示 "hook只能在函数组件中执行"。
 */
export const resolveDispatcher = (): Dispatcher => {
	const dispatcher = currentDispatcher.current;

	if (dispatcher === null) {
		throw new Error('hook只能在函数组件中执行');
	}
	return dispatcher;
};

export default currentDispatcher;
