import { REACT_ELEMENT_TYPE, REACT_FRAGMENT_TYPE } from 'shared/ReactSymbols';
import {
	Type,
	Key,
	Ref,
	Props,
	ReactElementType,
	ElementType
} from 'shared/ReactTypes';

/**
 * @function ReactElement
 * @description React 元素的内部构造函数/工厂函数。
 *              它接收元素的类型、key、ref 和 props，并创建一个符合 `ReactElementType` 接口的对象。
 *              通常，开发者不直接调用此函数，而是通过 JSX (编译为 `jsx` 或 `jsxDEV`)
 *              或 `React.createElement` 来间接创建 React 元素。
 *
 * @param {Type} type - 元素的类型 (例如, 'div', MyComponent, REACT_FRAGMENT_TYPE)。
 * @param {Key} key - 元素的 key，用于列表渲染优化。
 * @param {Ref | null} ref - 指向组件实例或 DOM 元素的 ref。
 * @param {Props} props - 传递给元素的属性对象，其中应包含 `children`。
 * @returns {ReactElementType} 返回一个新创建的 React 元素对象。
 *
 * @see {@link ReactElementType} - 此函数返回的对象的接口定义。
 * @see {@link jsx} - 一个调用此函数的上层 API (用于 JSX 转换)。
 */
const ReactElement = function (
	type: Type,
	key: Key,
	ref: Ref | null,
	props: Props
): ReactElementType {
	const element = {
		$$typeof: REACT_ELEMENT_TYPE,
		type,
		key,
		ref,
		props,
		__mark: 'Paul'
	};
	return element;
};

export function isValidElement(object: any) {
	return (
		typeof object === 'object' &&
		object !== null &&
		object.$$typeof === REACT_ELEMENT_TYPE
	);
}

/**
 * @function jsx
 * @description 创建并返回一个新的 React 元素。
 *              这是 JSX 转换的目标函数之一 (通常用于生产环境，或当没有显式指定 `jsxDEV` 时)。
 *              它接收元素的类型 (`type`)、一个配置对象 (`config`) 以及可选的子元素 (`...maybeChildren`)。
 *              函数会从 `config` 中提取 `key` 和 `ref`，其余属性作为 `props`。
 *              `maybeChildren` 会被处理并赋值给 `props.children`。
 *              最终，它调用 `ReactElement` 工厂函数来构造元素对象。
 *
 * @param {ElementType} type - React 元素的类型 (例如, 'div', MyComponent)。
 * @param {object} config - 包含 props、key 和 ref 的配置对象。
 *                          - `config.key`: (可选) 元素的 key。
 *                          - `config.ref`: (可选) 元素的 ref。
 *                          - 其他 `config` 属性会被视为 props。
 * @param {...any} maybeChildren - (可选) 一个或多个子元素。
 *                                 如果提供了一个子元素，它会直接成为 `props.children`。
 *                                 如果提供了多个子元素，它们会形成一个数组并成为 `props.children`。
 * @returns {ReactElementType} 返回一个新创建的 React 元素对象。
 *
 * @see {@link ReactElement} - 用于实际创建 React 元素对象的函数。
 * @see {@link jsxDEV} - 开发环境下对应的 JSX 转换函数。
 */
export const jsx = (type: ElementType, config: any, ...maybeChildren: any) => {
	let key: Key = null;
	const props: Props = {};
	let ref: Ref | null = null;

	for (const prop in config) {
		const val = config[prop];
		if (prop === 'key') {
			if (val !== undefined) {
				key = '' + val;
			}
			continue;
		}
		if (prop === 'ref') {
			if (val !== undefined) {
				ref = val;
			}
			continue;
		}
		if ({}.hasOwnProperty.call(config, prop)) {
			props[prop] = val;
		}
	}
	const maybeChildrenLength = maybeChildren.length;
	if (maybeChildrenLength) {
		if (maybeChildrenLength === 1) {
			props.children = maybeChildren[0];
		} else {
			props.children = maybeChildren;
		}
	}
	return ReactElement(type, key, ref, props);
};

export const Fragment = REACT_FRAGMENT_TYPE;

export const jsxDEV = (type: ElementType, config: any) => {
	let key: Key = null;
	const props: Props = {};
	let ref: Ref | null = null;

	for (const prop in config) {
		const val = config[prop];
		if (prop === 'key') {
			if (val !== undefined) {
				key = '' + val;
			}
			continue;
		}
		if (prop === 'ref') {
			if (val !== undefined) {
				ref = val;
			}
			continue;
		}
		if ({}.hasOwnProperty.call(config, prop)) {
			props[prop] = val;
		}
	}

	return ReactElement(type, key, ref, props);
};
