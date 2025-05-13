// Flags用来标记副作用
export type Flags = number;

export const NoFlags = 0b0000000;
export const Placement = 0b0000001;
export const Update = 0b0000011;
export const ChildDeletion = 0b0000111;

export const MutationMask = Placement | Update | ChildDeletion;
