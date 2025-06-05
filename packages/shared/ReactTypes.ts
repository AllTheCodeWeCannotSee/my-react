export type Type = any;
export type Key = any;
export type Ref = { current: any } | ((instance: any) => void);
export type Props = any;
export type ElementType = any;

/**
 * @interface ReactElementType
 * @description 定义了一个 React 元素的结构。
 *              React 元素是构成 React 应用的最小构建块，它们描述了用户界面应该是什么样子。
 *              JSX 语法最终会被编译成调用 `React.createElement` (或 `jsx`/`jsxDEV`)，
 *              这些函数会返回符合此接口的对象。
 *
 * @property {symbol | number} $$typeof - 一个特殊的标记 (通常是 `Symbol.for('react.element')`)，
 *                                        用于将 React 元素与普通 JavaScript 对象区分开来。
 * @property {ElementType} type - 元素的类型。可以是：
 *                                - 字符串 (如 'div', 'span')，表示原生 DOM 标签。
 *                                - 函数或类，表示一个 React 组件。
 *                                - 特殊的 Symbol (如 `REACT_FRAGMENT_TYPE`)，表示 Fragment 等。
 * @property {Key} key - 元素的唯一标识符，主要用于优化列表渲染时的协调过程。
 * @property {Props} props - 传递给元素的属性对象。
 * @property {Ref | null} ref - 指向组件实例或 DOM 元素的 ref。
 * @property {string} __mark - 一个内部标记，可能用于调试或特定实现细节 (在此示例中为 'Paul')。
 */
export interface ReactElementType {
	$$typeof: symbol | number;
	type: ElementType;
	key: Key;
	props: Props;
	ref: Ref | null;
	__mark: string;
}

/**
 * @typedef {State | ((prevState: State) => State)} Action
 * @template State
 * @description 定义了在 React 中用于更新状态的操作类型。
 *              这通常用于 `useState` Hook 返回的 dispatch 函数
 *              一个 Action 可以是：
 *              1. **新的状态值 (State)**: 直接提供一个新的状态值来替换当前状态。
 *                 例如：`setState(newState)`
 *              2. **一个函数 ((prevState: State) => State)**: 提供一个函数，该函数接收前一个状态 (`prevState`)
 *                 作为参数，并返回计算后的新状态。这对于基于先前状态进行更新非常有用，
 *                 并且可以确保在异步更新中状态的正确性。
 *                 例如：`setState(prevState => prevState + 1)`
 */
export type Action<State> = State | ((prevState: State) => State);

export type ReactContext<T> = {
	$$typeof: symbol | number;
	Provider: ReactProviderType<T> | null;
	_currentValue: T;
};

export type ReactProviderType<T> = {
	$$typeof: symbol | number;
	_context: ReactContext<T> | null;
};

export type Usable<T> = Thenable<T> | ReactContext<T>;

export interface Wakeable<Result = any> {
	then(
		onFulfill: () => Result,
		onReject: () => Result
	): void | Wakeable<Result>;
}

interface ThenableImpl<T, Result, Err> {
	then(
		onFulfill: (value: T) => Result,
		onReject: (error: Err) => Result
	): void | Wakeable<Result>;
}

interface UntrackedThenable<T, Result, Err>
	extends ThenableImpl<T, Result, Err> {
	status?: void;
}

export interface PendingThenable<T, Result, Err>
	extends ThenableImpl<T, Result, Err> {
	status: 'pending';
}

export interface FulfilledThenable<T, Result, Err>
	extends ThenableImpl<T, Result, Err> {
	status: 'fulfilled';
	value: T;
}

export interface RejectedThenable<T, Result, Err>
	extends ThenableImpl<T, Result, Err> {
	status: 'rejected';
	reason: Err;
}

export type Thenable<T, Result = void, Err = any> =
	| UntrackedThenable<T, Result, Err>
	| PendingThenable<T, Result, Err>
	| FulfilledThenable<T, Result, Err>
	| RejectedThenable<T, Result, Err>;
