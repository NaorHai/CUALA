/**
 * Centralized constants for CUALA
 * All magic strings should be defined here for easy management and consistency
 */

// Action names
export const ACTIONS = {
  NAVIGATE: 'navigate',
  CLICK: 'click',
  TYPE: 'type',
  WAIT: 'wait',
  HOVER: 'hover',
  SCROLL: 'scroll',
  VERIFY_PREFIX: 'verify_',
} as const;

// Verification targets
export const VERIFICATION_TARGETS = {
  TITLE: 'title',
  TEXT: 'text',
  BODY: 'body',
  URL: 'url',
  ELEMENT: 'element',
  HEADING: 'heading',
  HEADING1: 'heading1',
  HEADING2: 'heading2',
  HEADING3: 'heading3',
  HEADING4: 'heading4',
  HEADING5: 'heading5',
  HEADING6: 'heading6',
  H1: 'h1',
  H2: 'h2',
  H3: 'h3',
  H4: 'h4',
  H5: 'h5',
  H6: 'h6',
  LINK: 'link',
  BUTTON: 'button',
  INPUT: 'input',
  LABEL: 'label',
} as const;

// Verification operations
export const VERIFICATION_OPERATIONS = {
  CONTAINS: 'contains',
  EQUALS: 'equals',
  EQUAL: 'equal',
  STARTS_WITH: 'startsWith',
  STARTS_WITH_SNAKE: 'starts_with',
  ENDS_WITH: 'endsWith',
  ENDS_WITH_SNAKE: 'ends_with',
  MATCHES: 'matches',
  REGEX: 'regex',
  MATCH: 'match',
  VISIBLE: 'visible',
  EXISTS: 'exists',
  NOT_CONTAINS: 'not_contains',
  NOT_EQUALS: 'not_equals',
  NOT_EQUAL: 'not_equal',
  NOT_STARTS_WITH: 'not_startsWith',
  NOT_STARTS_WITH_SNAKE: 'not_starts_with',
  NOT_ENDS_WITH: 'not_endsWith',
  NOT_ENDS_WITH_SNAKE: 'not_ends_with',
  NOT_VISIBLE: 'not_visible',
  NOT_EXISTS: 'not_exists',
} as const;

// Execution status values
export const EXECUTION_STATUS = {
  SUCCESS: 'success',
  FAILURE: 'failure',
  ERROR: 'error',
} as const;

// CSS Selectors
export const SELECTORS = {
  ALL_HEADINGS: 'h1, h2, h3, h4, h5, h6',
  H1: 'h1',
  H2: 'h2',
  H3: 'h3',
  H4: 'h4',
  H5: 'h5',
  H6: 'h6',
  BODY: 'body',
} as const;

// Method name mappings (for dynamic string method calls)
export const METHOD_MAPPINGS: Record<string, string> = {
  contains: 'includes',
  includes: 'includes',
  starts_with: 'startsWith',
  startsWith: 'startsWith',
  ends_with: 'endsWith',
  endsWith: 'endsWith',
  to_lower: 'toLowerCase',
  to_upper: 'toUpperCase',
  length: 'length',
} as const;

// Supported verification targets array (for validation)
export const SUPPORTED_VERIFICATION_TARGETS = [
  VERIFICATION_TARGETS.TITLE,
  VERIFICATION_TARGETS.TEXT,
  VERIFICATION_TARGETS.BODY,
  VERIFICATION_TARGETS.URL,
  VERIFICATION_TARGETS.ELEMENT,
  VERIFICATION_TARGETS.HEADING,
  VERIFICATION_TARGETS.HEADING1,
  VERIFICATION_TARGETS.HEADING2,
  VERIFICATION_TARGETS.HEADING3,
  VERIFICATION_TARGETS.HEADING4,
  VERIFICATION_TARGETS.HEADING5,
  VERIFICATION_TARGETS.HEADING6,
  VERIFICATION_TARGETS.LINK,
  VERIFICATION_TARGETS.BUTTON,
  VERIFICATION_TARGETS.INPUT,
  VERIFICATION_TARGETS.LABEL,
] as const;

// Supported verification operations array (for validation)
export const SUPPORTED_VERIFICATION_OPERATIONS = [
  VERIFICATION_OPERATIONS.CONTAINS,
  VERIFICATION_OPERATIONS.EQUALS,
  VERIFICATION_OPERATIONS.EQUAL,
  VERIFICATION_OPERATIONS.STARTS_WITH,
  VERIFICATION_OPERATIONS.STARTS_WITH_SNAKE,
  VERIFICATION_OPERATIONS.ENDS_WITH,
  VERIFICATION_OPERATIONS.ENDS_WITH_SNAKE,
  VERIFICATION_OPERATIONS.MATCHES,
  VERIFICATION_OPERATIONS.REGEX,
  VERIFICATION_OPERATIONS.MATCH,
  VERIFICATION_OPERATIONS.VISIBLE,
  VERIFICATION_OPERATIONS.EXISTS,
  VERIFICATION_OPERATIONS.NOT_CONTAINS,
  VERIFICATION_OPERATIONS.NOT_EQUALS,
  VERIFICATION_OPERATIONS.NOT_EQUAL,
  VERIFICATION_OPERATIONS.NOT_STARTS_WITH,
  VERIFICATION_OPERATIONS.NOT_STARTS_WITH_SNAKE,
  VERIFICATION_OPERATIONS.NOT_ENDS_WITH,
  VERIFICATION_OPERATIONS.NOT_ENDS_WITH_SNAKE,
  VERIFICATION_OPERATIONS.NOT_VISIBLE,
  VERIFICATION_OPERATIONS.NOT_EXISTS,
] as const;

// Error messages
export const ERROR_MESSAGES = {
  INVALID_VERIFICATION_ACTION: (actionName: string) => 
    `Invalid verification action: ${actionName}. Must start with 'verify_'`,
  INVALID_VERIFICATION_FORMAT: (actionName: string) => 
    `Invalid verification action format: ${actionName}. Expected format: verify_<target>_<operation>`,
  MISSING_OPERATION: (actionName: string, target: string, supportedTargets: string, supportedOps: string) =>
    `Invalid verification action format: ${actionName}. Expected format: verify_<target>_<operation>\n` +
    `The action "${actionName}" is missing an operation. Examples: verify_${target}_contains, verify_${target}_equals\n` +
    `Supported targets: ${supportedTargets}\n` +
    `Supported operations: ${supportedOps}`,
  UNSUPPORTED_OPERATION: (operation: string, actionName: string, target: string, supportedOps: string) =>
    `Unsupported verification operation: "${operation}" in action "${actionName}".\n` +
    `Supported operations: ${supportedOps}\n` +
    `Example: verify_${target}_contains, verify_${target}_equals, verify_${target}_visible`,
  ELEMENT_NOT_FOUND: (selector: string) => `Element not found: ${selector}`,
  AMBIGUOUS_SELECTOR: (selector: string, count: number) => `Ambiguous selector: ${selector} matched ${count} elements`,
  NO_HEADING_FOUND: (selector: string) => `No heading found with selector: ${selector}`,
  MISSING_SELECTOR: (operation: string) => `Missing selector or text argument for ${operation}`,
  MISSING_TEXT_ARG: (operation: string) => `Missing text argument for ${operation}`,
  MISSING_EXPECTED_VALUE: (operation: string) => `Missing expected value for ${operation} operation`,
  VISIBLE_REQUIRES_SELECTOR: 'visible operation requires a selector',
  UNSUPPORTED_ACTION: (actionName: string) => `Unsupported action: ${actionName}`,
  UNSUPPORTED_VERIFICATION_OPERATION: (operation: string) => 
    `Unsupported verification operation: ${operation}. For string operations, use any String method (e.g., contains, startsWith, endsWith, includes). For boolean operations, use: visible, exists.`,
} as const;

