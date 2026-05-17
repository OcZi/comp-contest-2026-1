export const EPSILON = "ε"

export const NAME_REGEX = RegExp(/(\w+)/);
export const PROD_REGEX = RegExp(/(.+)/);
export const ARROW_REGEX = RegExp(/(->|=>)/)

export const BNF_REGEX = RegExp(`^${NAME_REGEX.source}\\s*${ARROW_REGEX.source}\\s*${PROD_REGEX.source}.$`);

// const EBNF_PROD = RegExp(`^${NAME_REGEX}\\s*${ARROW_REGEX}\\s*${PROD_REGEX}.$`);
