// Lightweight project-local Option type: Some<T> | None

export interface Some<T> {
  readonly _tag: "Some";
  readonly value: T;
}

export interface None {
  readonly _tag: "None";
}

export type Option<T> = Some<T> | None;

export const Some = <T>(value: T): Option<T> => ({ _tag: "Some", value });

export const None: Option<never> = { _tag: "None" };

export const isSome = <T>(opt: Option<T>): opt is Some<T> => opt._tag === "Some";

export const isNone = <T>(opt: Option<T>): opt is None => opt._tag === "None";

export const map = <T, U>(f: (value: T) => U) =>
  (opt: Option<T>): Option<U> =>
    isSome(opt) ? Some(f(opt.value)) : None;

export const flatMap = <T, U>(f: (value: T) => Option<U>) =>
  (opt: Option<T>): Option<U> =>
    isSome(opt) ? f(opt.value) : None;

export const getOrElse = <T>(fallback: T) =>
  (opt: Option<T>): T =>
    isSome(opt) ? opt.value : fallback;
