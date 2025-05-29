export type Type = any;
export type Key = any;
export type Ref = { current: any } | ((instance: any) => void) | null;
export type Props = any;
export type ElementType = any;

export interface ReactElementType {
	$$typeof: symbol | number;
	type: ElementType;
	key: Key;
	props: Props;
	ref: Ref;
	__mark: string;
}

/**
 * @description
 * `Action<State>` 类型既支持直接设置新状态，也支持通过函数基于前一个状态计算新状态。
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
