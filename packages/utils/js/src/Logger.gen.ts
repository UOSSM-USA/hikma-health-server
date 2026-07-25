/* TypeScript file generated from Logger.res by genType. */

/* eslint-disable */
/* tslint:disable */

import * as LoggerJS from './Logger.res.mjs';

export const log: <T1>(_1:T1) => void = LoggerJS.log as any;

export const warn: <T1>(_1:T1) => void = LoggerJS.warn as any;

export const error: <T1>(_1:T1) => void = LoggerJS.error as any;

export const info: <T1>(_1:T1) => void = LoggerJS.info as any;

export const Production_log: <T1>(_1:T1) => void = LoggerJS.Production.log as any;

export const Production_warn: <T1>(_1:T1) => void = LoggerJS.Production.warn as any;

export const Production_error: <T1>(_1:T1) => void = LoggerJS.Production.error as any;

export const Production_info: <T1>(_1:T1) => void = LoggerJS.Production.info as any;

export const Production: {
  log: <T1>(_1:T1) => void; 
  error: <T1>(_1:T1) => void; 
  info: <T1>(_1:T1) => void; 
  warn: <T1>(_1:T1) => void
} = LoggerJS.Production as any;
