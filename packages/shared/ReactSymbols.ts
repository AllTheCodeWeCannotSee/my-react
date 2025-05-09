const supportSysmbol = typeof Symbol === 'function' && Symbol.for;

export const REACT_ELEMENT_TYPE = supportSysmbol
	? Symbol.for('react.element')
	: 0xeac7;
