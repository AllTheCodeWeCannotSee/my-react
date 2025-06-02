const supportSymbol = typeof Symbol === 'function' && Symbol.for;

/**
 * @constant REACT_ELEMENT_TYPE
 * @description 一个特殊的 Symbol (或数字，如果环境不支持 Symbol)，
 *              用于唯一标识一个 React 元素对象。
 *              React 元素的 `$$typeof` 属性会被设置为这个值，
 *              以便 React 能够区分普通对象和 React 元素。
 */
export const REACT_ELEMENT_TYPE = supportSymbol
	? Symbol.for('react.element')
	: 0xeac7;

/**
 * @constant REACT_FRAGMENT_TYPE
 * @description 一个特殊的 Symbol (或数字)，用于标识 React Fragment。
 *              Fragment 允许你将多个子元素分组，而无需在 DOM 中添加额外的节点。
 *              `<></>` 或 `<React.Fragment>` 语法创建的元素的 `type` 属性会被设置为这个值。
 */
export const REACT_FRAGMENT_TYPE = supportSymbol
	? Symbol.for('react.fragment')
	: 0xeaca;

/**
 * @constant REACT_CONTEXT_TYPE
 * @description 一个特殊的 Symbol (或数字)，用于标识通过 `React.createContext()` 创建的 Context 对象。
 *              Context 对象的 `$$typeof` 属性会被设置为这个值。
 */
export const REACT_CONTEXT_TYPE = supportSymbol
	? Symbol.for('react.context')
	: 0xeacc;

/**
 * @constant REACT_PROVIDER_TYPE
 * @description 一个特殊的 Symbol (或数字)，用于标识 Context Provider 组件。
 *              当使用 `<MyContext.Provider>` 时，这个 Provider 组件的 `$$typeof` 属性会被设置为这个值。
 */
export const REACT_PROVIDER_TYPE = supportSymbol
	? Symbol.for('react.provider')
	: 0xeac2;

/**
 * @constant REACT_SUSPENSE_TYPE
 * @description 一个特殊的 Symbol (或数字)，用于标识 React Suspense 组件。
 *              Suspense 组件允许你在等待某些数据加载时声明性地指定加载指示器。
 *              `<Suspense>` 组件的 `type` 属性会被设置为这个值。
 */
export const REACT_SUSPENSE_TYPE = supportSymbol
	? Symbol.for('react.suspense')
	: 0xead1;

/**
 * @constant REACT_MEMO_TYPE
 * @description 一个特殊的 Symbol (或数字)，用于标识通过 `React.memo()` 创建的 memoized 组件。
 *              `React.memo` 是一个高阶组件，用于优化函数组件的渲染性能，
 *              通过浅比较 props 来避免不必要的重渲染。
 *              由 `memo()` 包装的组件的 `$$typeof` 属性会被设置为这个值。
 */
export const REACT_MEMO_TYPE = supportSymbol
	? Symbol.for('react.memo')
	: 0xead3;
