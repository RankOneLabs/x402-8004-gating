export {
  type Option,
  Some, None, isSome, isNone,
  map as mapOption, flatMap as flatMapOption, getOrElse,
} from "./option.js";

export {
  type Result,
  Ok, Err, isOk, isErr,
  map as mapResult, mapErr, flatMap as flatMapResult,
} from "./result.js";

export {
  type ReputationGateError,
  type PriceResolutionError,
  type ERC8004Error,
  MissingAgentAddress,
  InvalidAgentAddress,
  InsufficientReputation,
  ReputationFetchFailed,
  InvalidAddressFormat,
} from "./errors.js";
