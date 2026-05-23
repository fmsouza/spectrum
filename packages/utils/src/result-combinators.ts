import { type Result, ok, err, isOk } from "./result"

export const map = <T, U, E>(r: Result<T, E>, f: (value: T) => U): Result<U, E> =>
  isOk(r) ? ok(f(r.value)) : r

export const mapErr = <T, E, F>(r: Result<T, E>, f: (error: E) => F): Result<T, F> =>
  isOk(r) ? r : err(f(r.error))

export const andThen = <T, U, E>(r: Result<T, E>, f: (value: T) => Result<U, E>): Result<U, E> =>
  isOk(r) ? f(r.value) : r

export const unwrapOr = <T, E>(r: Result<T, E>, fallback: T): T =>
  isOk(r) ? r.value : fallback
