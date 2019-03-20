// @ts-ignore
import * as immer from 'immer'

type Unchanged =
  | undefined
  | null
  | boolean
  | string
  | number
  | Function
  | Date
  | RegExp

/** 让所有子孙属性都成为readonly (数组除外，不好搞) */
export type Immutable<T> = T extends Unchanged
  ? T // tslint:disable-next-line:array-type
  : T extends Array<infer U>
  ? U[]
  : { readonly [K in keyof T]: Immutable<T[K]> }

/** 让所有子孙属性都可写 */
export type Mutable<T> = T extends Unchanged
  ? T // tslint:disable-next-line:array-type
  : T extends Array<infer U>
  ? U[]
  : { -readonly [K in keyof T]: Mutable<T[K]> }

/**
 * 以mutable的方式来操纵immutable对象
 */
export const produce: <T>(
  object: T,
  operate: (object: Mutable<T>) => void
) => T = immer.produce
