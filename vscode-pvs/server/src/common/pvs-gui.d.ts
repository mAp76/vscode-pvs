/* tslint:disable */
/**
 * This file was automatically generated by json-schema-to-typescript.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,
 * and run json-schema-to-typescript to regenerate this file.
 */

/**
 * JSON schema for PVS GUIs
 */
export type PvsGui = PvsRequest | PvsResponse;
/**
 * This is an XML-RPC request, not really JSON
 */
export type PvsRequest =
  | []
  | [PvsJsonRequest]
  | [
      PvsJsonRequest,
      {
        [k: string]: any;
      }
    ];
export type PvsJsonRequest =
  | ListMethodsRequest
  | ListClientMethodsRequest
  | HelpRequest
  | ChangeContextRequest
  | ParseRequest
  | TypecheckRequest
  | ProveFormulaRequest
  | ProofCommandRequest
  | NamesInfoRequest
  | FindDeclarationRequest
  | LispRequest;
/**
 * The response to a pvs.request
 */
export type PvsResponse = PvsError | PvsResult;
export type ListMethodsResult = StringArrayResult;
export type StringArrayResult = [string, ...(string)[]];
export type ChangeContextResult = string;
export type Place = [number, number] | [number, number, number] | [number, number, number, number];
export type ParseResult = {
  id?: string;
  /**
   * an array of declarations in the given theory
   */
  decls?: (ImportingDecl | TypedDecl | FormulaDecl)[];
  [k: string]: any;
}[];
export type NamesInfoResult = {
  id?: string;
  place?: Place;
  decl?: string;
  "decl-file"?: string;
  "decl-place"?: Place;
  [k: string]: any;
}[];
export type FindDeclarationResult = {
  declname?: string;
  type?: string;
  theoryid?: string;
  filename?: string;
  place?: Place;
  "decl-ppstring"?: string;
  [k: string]: any;
}[];
export type LispResult = StringResult;
export type StringResult = string;
export type ShowTCCsResult = {
  comment: string[];
  definition: string;
  "from-decl": string; // declaration associated with the tcc
  id: string; // TCC identifier
  proved: null | boolean; // this should be a string, e.g., "proved", "unfinished", etc.
  theory: string;
}[];
export declare interface DischargeTccsResult {
	proved: number,
	simplified: number,
	subsumed: number,
	totals: number,
	unproved: number
}

export interface ListMethodsRequest {
  method?: "list-methods";
  [k: string]: any;
}
export interface ListClientMethodsRequest {
  method?: "list-client-methods";
  [k: string]: any;
}
export interface HelpRequest {
  method?: "help";
  params: string;
  [k: string]: any;
}
export interface ChangeContextRequest {
  method?: "change-context";
  params?: string;
  [k: string]: any;
}
export interface ParseRequest {
  method?: "parse";
  params?: string;
  [k: string]: any;
}
export interface TypecheckRequest {
  method?: "typecheck";
  params?: string;
  [k: string]: any;
}
export interface ProveFormulaRequest {
  method?: "prove-formula";
  params?: [string];
  [k: string]: any;
}
export interface ProofCommandRequest {
  method?: "proof-command";
  params?: [string];
  [k: string]: any;
}
export interface NamesInfoRequest {
  method?: "names-info";
  params: [string];
  [k: string]: any;
}
export interface FindDeclarationRequest {
  method?: "find-declaration";
  params: [string];
  [k: string]: any;
}
export interface LispRequest {
  method?: "lisp";
  params: [string];
  [k: string]: any;
}
/**
 * An error response
 */
export interface PvsError {
  jsonrpc: "2.0";
  id: string;
  error: {
    code: number;
    message: string;
    data?: any;
    [k: string]: any;
  };
  [k: string]: any;
}
/**
 * An error response
 */
export interface PvsResult {
  jsonrpc: "2.0";
  id: string;
  result?:
    | ListMethodsResult
    | HelpResult
    | ChangeContextResult
    | ParseResult
    | NamesInfoResult
    | FindDeclarationResult
    | LispResult
    | ShowTCCsResult; // TODO: update json schema
  [k: string]: any;
}
export interface HelpResult {
  [k: string]: any;
}
export interface ImportingDecl {
  kind?: "importing";
  importing?: string;
  place?: Place;
  [k: string]: any;
}
export interface TypedDecl {
  id?: string;
  kind?: "module" | "type" | "expr" | "datatype" | "library" | "judgement" | "conversion" | "auto-rewrite";
  type?: string;
  place?: Place;
  [k: string]: any;
}
export interface FormulaDecl {
  id?: string;
  kind?: "formula";
  place?: Place;
  [k: string]: any;
}