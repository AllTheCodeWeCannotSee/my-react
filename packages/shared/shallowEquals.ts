/**
 * @function shallowEqual
 * @description 比较两个对象是否浅相等。
 *              浅相等意味着：
 *              1. 如果两个值通过 `Object.is` 比较是相等的，则它们是浅相等的。
 *              2. 如果两个值都是对象（且不为 null），则会比较它们的键的数量是否相同。
 *              3. 如果键的数量相同，则会遍历第一个对象的键，检查第二个对象是否也拥有相同的键，
 *                 并且对应键的值通过 `Object.is` 比较是相等的。
 *              4. 如果任何一个键在第二个对象中不存在，或者对应的值不相等，则认为两个对象不是浅相等的。
 *              5. 如果两个值中任何一个不是对象或为 null（且它们不满足条件1），则它们不是浅相等的。
 *
 * @param {any} a - 要比较的第一个值。
 * @param {any} b - 要比较的第二个值。
 * @returns {boolean} 如果两个值浅相等，则返回 `true`；否则返回 `false`。
 */
export function shallowEqual(a: any, b: any): boolean {
	// 检查是否是同一个对象或者基本类型值是否相等
	if (Object.is(a, b)) {
		return true;
	}

	if (
		typeof a !== 'object' ||
		a === null ||
		typeof b !== 'object' ||
		b === null
	) {
		return false;
	}

	const keysA = Object.keys(a);
	const keysB = Object.keys(b);

	if (keysA.length !== keysB.length) {
		return false;
	}

	for (let i = 0; i < keysA.length; i++) {
		const key = keysA[i];
		// b没有key、 key不想等
		if (!{}.hasOwnProperty.call(b, key) || !Object.is(a[key], b[key])) {
			return false;
		}
	}
	return true;
}
