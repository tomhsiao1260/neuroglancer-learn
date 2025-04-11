// Type for any constructor
export type AnyConstructor<T = object> = new (...args: any[]) => T;

// Type for a mixin function that takes a base class and returns a new class
export type Mixin<T> = <Base extends AnyConstructor>(base: Base) => Base & AnyConstructor<T>;

// Function to create a mixin
export function mixin<T>(mixinFn: Mixin<T>) {
  return mixinFn;
} 