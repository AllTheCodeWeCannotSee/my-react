import { Action } from 'shared/ReactTypes';

/**
 * @description
 * - 这个接口描述了一个对象的结构，该对象包含了各种 React Hook 的具体实现
 * - 内部数据共享层， 中的当前使用的hooks集合
 */
export interface Dispatcher {
	/**
	 * @description
	 * 这是一个泛型方法，`<T>` 代表状态的类型。
	 * @param initialState 参数可以是状态的初始值，也可以是一个返回初始值的函数
	 * @returns 该方法返回一个包含两个元素的数组：当前状态值 T 和一个用于更新该状态的 Dispatch<T> 函数
	 */
	useState: <T>(initialState: (() => T) | T) => [T, Dispatch<T>];
	useEffect: (callback: () => void | void, deps: any[] | void) => void;
	useTransition: () => [boolean, (callback: () => void) => void];
}

/**
 * @description 描述了一个函数的类型：这个函数接收一个 `Action<State>` 类型的参数（即状态更新的描述），并且不返回任何值 (void)。
 */
export type Dispatch<State> = (action: Action<State>) => void;

/**
 * @description
 * 它创建了一个名为 currentDispatcher 的常量对象。
 * 这个对象有一个名为 current 的属性。
 * 它被初始化为 { current: null }，表示在 React 组件渲染周期之外，或者在没有特定 Hook 上下文时，没有活动的 Dispatcher。
 */
const currentDispatcher: { current: Dispatcher | null } = {
	current: null
};

/**
 * @description
 * 当任何 Hook (如 useState) 被调用时，它会在 Hook 内部被调用，以获取当前应该使用的 Dispatcher 对象。
 * 如果 currentDispatcher.current 是 null，这意味着 Hook 在一个无效的上下文中被调用（例如，在函数组件的渲染函数之外，或在类组件中）。在这种情况下，它会抛出一个错误，提示用户“hook只能在函数组件中执行”。
 */
export const resolveDispatcher = (): Dispatcher => {
	const dispatcher = currentDispatcher.current;

	if (dispatcher === null) {
		throw new Error('hook只能在函数组件中执行');
	}
	return dispatcher;
};

export default currentDispatcher;
