// Lightweight project-local Result type: Ok<T> | Err<E>

export interface Ok<T> {
  readonly _tag: "Ok";
  readonly value: T;
}

export interface Err<E> {
  readonly _tag: "Err";
  readonly error: E;
}

export type Result<T, E> = Ok<T> | Err<E>;

export const Ok = <T>(value: T): Ok<T> => ({ _tag: "Ok", value });

export const Err = <E>(error: E): Err<E> => ({ _tag: "Err", error });

export const isOk = <T, E>(result: Result<T, E>): result is Ok<T> => result._tag === "Ok";

export const isErr = <T, E>(result: Result<T, E>): result is Err<E> => result._tag === "Err";

export const map = <T, U, E>(f: (value: T) => U) =>
  (result: Result<T, E>): Result<U, E> =>
    isOk(result) ? Ok(f(result.value)) : result;

export const mapErr = <T, E, F>(f: (error: E) => F) =>
  (result: Result<T, E>): Result<T, F> =>
    isErr(result) ? Err(f(result.error)) : result;

export const flatMap = <T, U, E>(f: (value: T) => Result<U, E>) =>
  (result: Result<T, E>): Result<U, E> =>
    isOk(result) ? f(result.value) : result;
