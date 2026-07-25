/* TypeScript file generated from Index.res by genType. */

/* eslint-disable */
/* tslint:disable */

import * as IndexJS from './Index.res.mjs';

export const Logger_log: <T1>(_1:T1) => void = IndexJS.Logger.log as any;

export const Logger_warn: <T1>(_1:T1) => void = IndexJS.Logger.warn as any;

export const Logger_error: <T1>(_1:T1) => void = IndexJS.Logger.error as any;

export const Logger_info: <T1>(_1:T1) => void = IndexJS.Logger.info as any;

export const Logger_Production_log: <T1>(_1:T1) => void = IndexJS.Logger.Production.log as any;

export const Logger_Production_warn: <T1>(_1:T1) => void = IndexJS.Logger.Production.warn as any;

export const Logger_Production_error: <T1>(_1:T1) => void = IndexJS.Logger.Production.error as any;

export const Logger_Production_info: <T1>(_1:T1) => void = IndexJS.Logger.Production.info as any;

export const Logger: {
  Production: {
    log: <T1>(_1:T1) => void; 
    error: <T1>(_1:T1) => void; 
    info: <T1>(_1:T1) => void; 
    warn: <T1>(_1:T1) => void
  }; 
  log: <T1>(_1:T1) => void; 
  error: <T1>(_1:T1) => void; 
  info: <T1>(_1:T1) => void; 
  warn: <T1>(_1:T1) => void
} = IndexJS.Logger as any;
