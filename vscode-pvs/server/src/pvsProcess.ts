/**
 * @module PvsProcess
 * @version 2019.02.07
 * PVS process wrapper
 * @author Paolo Masci
 * @date 2019.02.07
 * @copyright 
 * Copyright 2016 United States Government as represented by the
 * Administrator of the National Aeronautics and Space Administration. No
 * copyright is claimed in the United States under Title 17, 
 * U.S. Code. All Other Rights Reserved.
 *
 * Disclaimers
 *
 * No Warranty: THE SUBJECT SOFTWARE IS PROVIDED "AS IS" WITHOUT ANY
 * WARRANTY OF ANY KIND, EITHER EXPRESSED, IMPLIED, OR STATUTORY,
 * INCLUDING, BUT NOT LIMITED TO, ANY WARRANTY THAT THE SUBJECT SOFTWARE
 * WILL CONFORM TO SPECIFICATIONS, ANY IMPLIED WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR FREEDOM FROM
 * INFRINGEMENT, ANY WARRANTY THAT THE SUBJECT SOFTWARE WILL BE ERROR
 * FREE, OR ANY WARRANTY THAT DOCUMENTATION, IF PROVIDED, WILL CONFORM TO
 * THE SUBJECT SOFTWARE. THIS AGREEMENT DOES NOT, IN ANY MANNER,
 * CONSTITUTE AN ENDORSEMENT BY GOVERNMENT AGENCY OR ANY PRIOR RECIPIENT
 * OF ANY RESULTS, RESULTING DESIGNS, HARDWARE, SOFTWARE PRODUCTS OR ANY
 * OTHER APPLICATIONS RESULTING FROM USE OF THE SUBJECT SOFTWARE.
 * FURTHER, GOVERNMENT AGENCY DISCLAIMS ALL WARRANTIES AND LIABILITIES
 * REGARDING THIRD-PARTY SOFTWARE, IF PRESENT IN THE ORIGINAL SOFTWARE,
 * AND DISTRIBUTES IT "AS IS."
 *
 * Waiver and Indemnity: RECIPIENT AGREES TO WAIVE ANY AND ALL CLAIMS
 * AGAINST THE UNITED STATES GOVERNMENT, ITS CONTRACTORS AND
 * SUBCONTRACTORS, AS WELL AS ANY PRIOR RECIPIENT.  IF RECIPIENT'S USE OF
 * THE SUBJECT SOFTWARE RESULTS IN ANY LIABILITIES, DEMANDS, DAMAGES,
 * EXPENSES OR LOSSES ARISING FROM SUCH USE, INCLUDING ANY DAMAGES FROM
 * PRODUCTS BASED ON, OR RESULTING FROM, RECIPIENT'S USE OF THE SUBJECT
 * SOFTWARE, RECIPIENT SHALL INDEMNIFY AND HOLD HARMLESS THE UNITED
 * STATES GOVERNMENT, ITS CONTRACTORS AND SUBCONTRACTORS, AS WELL AS ANY
 * PRIOR RECIPIENT, TO THE EXTENT PERMITTED BY LAW.  RECIPIENT'S SOLE
 * REMEDY FOR ANY SUCH MATTER SHALL BE THE IMMEDIATE, UNILATERAL
 * TERMINATION OF THIS AGREEMENT.
 **/

import { spawn, ChildProcess } from 'child_process';
import { PvsExecutionContext } from './common/pvsExecutionContextInterface';
import * as language from "./common/languageKeywords";
import { 
	PvsResponseType, PvsParserResponse, getFilename, PvsDeclarationDescriptor, getPathname,
	PRELUDE_FILE, PvsDeclarationType, FormulaDescriptor, ProofResult, PrettyPrintRegionRequest,
	PrettyPrintRegionResult, ExpressionDescriptor, EvaluationResult, PvsListDeclarationsRequest,
	PvsFindDeclarationRequest, PvsDefinition, PvsTheoryListDescriptor,
	TccDescriptorArray, TccDescriptor, PvsFileListDescriptor, PvsTypecheckerResponse
} from './common/serverInterface'
import { Connection, TextDocument } from 'vscode-languageserver';
import * as path from 'path';
import { PVS_TRUE_FALSE_REGEXP_SOURCE, PVS_STRING_REGEXP_SOURCE } from "./common/languageKeywords";
import * as fs from './common/fsUtils';
import { PvsFindDeclarationInterface, PvsLispReader } from './pvsLisp';
import * as http from 'http';
// import * as xmlrpcProvider from './common/xmlrpcProvider';

/**
 * Wrapper class for PVS: spawns a PVS process, and exposes the PVS Lisp interface as an asyncronous JSON/RPC server.
 */
export class PvsProcess {
	private pvsProcess: ChildProcess = null;
	private pvsProcessBusy: boolean = false;

	private pvsioProcess: ChildProcess = null;
	private proverProcess: ChildProcess = null;
	private pvsioProcessBusy: boolean = false;
	private proverProcessBusy: boolean = false;

	// private serverProxy: xmlrpcProvider.XmlRpcProxy;

	private pvsServerProcess: ChildProcess = null;

	private pvsCmdQueue: Promise<PvsResponseType> = Promise.resolve({ res: null, error: null, raw: null });

	private pvsPath: string = null;
	private pvsContextFolder: string = null;
	private pvsServerPath: string = null;

	private connection: Connection;

	/**
	 * @returns The current pvs context path
	 */
	getContextFolder(): string {
		return this.pvsContextFolder;
	}

	/**
	 * @returns Path of the prelude library
	 */
	getLibrariesPath(): string {
		return path.join(this.pvsPath, "lib");
	}

	/**
	 * @constructor
	 * @param pvsExecutionContext PVS context 
	 * @param connection Connection with the language client
	 */
	constructor (pvsExecutionContext: PvsExecutionContext, connection?: Connection) {
		this.pvsPath = pvsExecutionContext.pvsPath || __dirname;
		this.pvsContextFolder = pvsExecutionContext.pvsContextFolder || __dirname;
		this.pvsServerPath = pvsExecutionContext.pvsServerPath || __dirname;

		// this.serverProxy = new xmlrpcProvider.XmlRpcProxy();

		this.connection = connection;
	}
	/**
	 * Internal function, used to communicate that the process is busy and cmd cannot be executed
	 * @param cmd 
	 */
	private cannotExecute (msg: string): Promise<PvsResponseType> {
		if (this.connection) { this.connection.console.error(msg); }
		return Promise.resolve({
			error: {
				msg: msg,
				parserError: null,
				restartOption: null
			},
			res: null,
			raw: null
		});
	}

	private pvsExecAux(cmd: string): Promise<PvsResponseType> {
		if (this.pvsProcessBusy) {
			const msg: string = "PVS busy, cannot execute " + cmd + " :/";
			return this.cannotExecute(msg);
		}
		const _this: PvsProcess = this;
		const pvsLispReader: PvsLispReader = new PvsLispReader(this.connection);
		const match: RegExpMatchArray = /\(\b([\w-]+)\b.*\)/.exec(cmd);
		if (match && match[1]) {
			const commandId: string = match[1];
			return new Promise((resolve, reject) => {
				const listener = function (data: string) {
					if (_this.connection) { _this.connection.console.log(data); }// this is the crude pvs lisp output, useful for debugging
					pvsLispReader.read(data, async (pvsOut: string) => {					
						_this.pvsProcess.stdout.removeListener("data", listener); // remove listener otherwise this will capture the output of other commands
						_this.pvsProcessBusy = false;
						const ans: PvsResponseType = pvsLispReader.parse(commandId, pvsOut);
						resolve(ans);
					});
				};
				_this.pvsProcess.stdout.on("data", listener);
				_this.pvsProcess.stdin.write(cmd + "\n");
			});
		}
		if (this.connection) { this.connection.console.error("Unrecognised command " + cmd); }
		Promise.reject({
			res: null,
			error: "Unrecognised command " + cmd,
			raw: null
		});
	}

	// /**
	//  * Executes a pvs lisp command using the pvs process
	//  * @param commandId Command name (e.g,. parse-file), see list of commands in PvsLisp
	//  * @param cmd The pvs lisp command, e.g., (parse-file "main" nil nil)
	//  */
	// private __pvsExecAux(commandId: string, cmd: string): Promise<PvsResponseType> {
	// 	const _this = this;
	// 	// utility function, automatically responds to lisp interactive commands, such as when pvs crashes into lisp
	// 	async function getResult(pvsLispResponse: string): Promise<PvsResponseType> {
	// 		const ans: PvsResponseType = JSON.parse(pvsLispResponse);
	// 		// the following :continue creates problems with the parser -- sometimes the entire process quits
	// 		// if (ans.error) {
	// 		// 	let option: number = +ans.error.restartOption;
	// 		// 	_this.continueLisp(option);
	// 		// }
	// 		return ans; 
	// 	}
	// 	if (this.pvsProcessBusy) {
	// 		const msg: string = "PVS busy, cannot execute " + cmd + " :/";
	// 		return this.cannotExecute(msg);
	// 	}	
	// 	this.pvsProcessBusy = true;
	// 	const pvslispParser = new PvsLisp(commandId, this.connection);
	// 	// connection.console.info("Executing command " + cmd);
	// 	if (this.connection) { this.connection.console.log(cmd); }
	// 	return new Promise(async function (resolve, reject) {
	// 		const listener = function (data: string) {
	// 			if (_this.connection) { _this.connection.console.log(data); }// this is the crude pvs lisp output, useful for debugging
	// 			pvslispParser.parse(data, async (res: string) => {
	// 				_this.pvsProcess.stdout.removeListener("data", listener); // remove listener otherwise this will capture the output of other commands
	// 				const ans: PvsResponseType = await getResult(res);
	// 				_this.pvsProcessBusy = false;
	// 				resolve(ans);
	// 			});
	// 		};
	// 		_this.pvsProcess.stdout.on("data", listener);
	// 		_this.pvsProcess.stdin.write(cmd + "\n");
	// 	});
	// }
	private pvsExec(cmd: string): Promise<PvsResponseType> {
		this.pvsCmdQueue = new Promise((resolve, reject) => {
			this.pvsCmdQueue.then(() => {
				// this.pvsExecAux(commandId, cmd).then((ans: PvsResponseType) => {
				// 	resolve(ans);
				// });
				this.pvsExecAux(cmd).then((ans: PvsResponseType) => {
					resolve(ans);
				});
			});
		});
		return this.pvsCmdQueue;
	}

	

	/**
	 * Executes a pvs lisp command using the pvsio process
	 * @param commandId Command name (e.g,. parse-file), see list of commands in PvsLisp
	 * @param cmd The pvs lisp command, e.g., (parse-file "main" nil nil)
	 */
	private pvsioExec(cmd: string): Promise<PvsResponseType> {
		const _this = this;
		// utility function, automatically responds to lisp interactive commands, such as when pvs crashes into lisp
		function getResult(pvsLispResponse: string): PvsResponseType {
			const ans: PvsResponseType = JSON.parse(pvsLispResponse);
			if (/.*==>\s*(.*)\s*<PVSio>/.test(ans.res)) {
				let match: RegExpMatchArray = /.*==>\s*(.*)\s*<PVSio>/.exec(ans.res);
				ans.res = match[1];
			}
			return ans; 
		}
		if (this.pvsioProcessBusy) {
			const msg: string = "PVSio busy, cannot execute " + cmd + ":/";
			return this.cannotExecute(msg);
		}	
		this.pvsioProcessBusy = true;
		const pvsLispReader: PvsLispReader = new PvsLispReader(this.connection);
		// const pvslispParser = new PvsLisp(commandId, this.connection);
		// if (this.connection) { this.connection.console.log(cmd); }
		return new Promise(function (resolve, reject) {
			let listener = function (data: string) {
				if (_this.connection) { _this.connection.console.log(data); }// this is the crude pvs lisp output, useful for debugging
				pvsLispReader.read(data, async (res: string) => {
					_this.pvsProcess.stdout.removeListener("data", listener); // remove listener otherwise this will capture the output of other commands
					_this.pvsioProcessBusy = false;
					resolve(getResult(res));
				});
			};
			_this.pvsioProcess.stdout.on("data", listener);
			_this.pvsioProcess.stdin.write(cmd + "\n");
		});
	}
	// /**
	//  * Executes a pvs lisp command using the prover process
	//  * @param commandId Command name (e.g,. parse-file), see list of commands in PvsLisp
	//  * @param cmd The pvs lisp command, e.g., (parse-file "main" nil nil)
	//  */
	// private proverExec(commandId: string, cmd: string): Promise<PvsResponseType> {
	// 	const _this = this;
	// 	// utility function, automatically responds to lisp interactive commands, such as when pvs crashes into lisp
	// 	async function getResult(pvsLispResponse: string): Promise<PvsResponseType> {
	// 		const ans: PvsResponseType = JSON.parse(pvsLispResponse);
	// 		if (ans.error) {
	// 			let option: number = +ans.error.restartOption;
	// 			_this.continueLisp(option);
	// 		}
	// 		return ans; 
	// 	}
	// 	if (this.proverProcessBusy) {
	// 		const msg: string = "Prover busy, cannot execute " + cmd + ":/";
	// 		return this.cannotExecute(msg);
	// 	}	
	// 	this.proverProcessBusy = true;
	// 	const pvslispParser = new PvsLisp(commandId, this.connection);
	// 	// connection.console.info("Executing command " + cmd);
	// 	if (this.connection) { this.connection.console.log(cmd); }
	// 	return new Promise(async (resolve, reject) => {
	// 		let listener = function (data: string) {
	// 			if (_this.connection) { _this.connection.console.log(data); }// this is the crude pvs lisp output, useful for debugging
	// 			pvslispParser.parse(data, async (res: string) => {
	// 				_this.proverProcess.stdout.removeListener("data", listener); // remove listener otherwise this will capture the output of other commands
	// 				_this.proverProcessBusy = false;
	// 				resolve(await getResult(res));
	// 			});
	// 		};
	// 		_this.proverProcess.stdout.on("data", listener);
	// 		_this.proverProcess.stdin.write(cmd + "\n");
	// 	});
	// }

	async pvs(): Promise<{}> {
		if (!this.pvsProcessBusy) {
			this.pvsProcessBusy = true;
			// const pvslispParser = new PvsLisp("pvs-init", this.connection);
			const pvsLispReader = new PvsLispReader(this.connection);
			let cmd: string = path.join(this.pvsPath, "pvs");
			const args: string[] = [ "-raw"];//, "-port", "22334" ];
			if (this.connection) { this.connection.console.info("Spawning pvs process " + cmd + " " + args.join(" ")); }
			return new Promise((resolve, reject) => {
				this.pvsProcess = spawn(cmd, args);
				this.pvsProcess.stdout.setEncoding("utf8");
				this.pvsProcess.stderr.setEncoding("utf8");
				const _this = this;
				let listener = function (data: string) {
					if (_this.connection) { _this.connection.console.log(data); } // this is the crude pvs lisp output, useful for debugging
					// pvslispParser.parse(data, (res: string) => {
					pvsLispReader.read(data, (res: string) => {
						// connection.console.info(res);
						_this.pvsProcess.stdout.removeListener("data", listener); // remove listener otherwise this will capture the output of other commands
						_this.pvsProcessBusy = false;
						resolve();
					});
				};
				this.pvsProcess.stdout.on("data", listener);
				this.pvsProcess.stderr.on("data", (data: string) => {
					if (this.connection) { this.connection.console.log(data); }
				});
				if (this.connection) { this.connection.console.info("PVS process ready!"); }
			});
		}
	}

	// /**
	//  * Starts the pvs process
	//  */
	// async __pvs (): Promise<{}> {
	// 	if (!this.pvsProcessBusy) {
	// 		this.pvsProcessBusy = true;
	// 		const pvslispParser = new PvsLisp("pvs-init", this.connection);	
	// 		let cmd: string = path.join(this.pvsPath, "pvs");
	// 		if (this.connection) { this.connection.console.info("Spawning pvs process " + cmd); }
	// 		return new Promise((resolve, reject) => {
	// 			this.pvsProcess = spawn(cmd, ["-raw"]);
	// 			this.pvsProcess.stdout.setEncoding("utf8");
	// 			this.pvsProcess.stderr.setEncoding("utf8");
	// 			const _this = this;
	// 			let listener = function (data: string) {
	// 				if (_this.connection) { _this.connection.console.log(data); } // this is the crude pvs lisp output, useful for debugging
	// 				pvslispParser.parse(data, (res: string) => {
	// 					// connection.console.info(res);
	// 					_this.pvsProcess.stdout.removeListener("data", listener); // remove listener otherwise this will capture the output of other commands
	// 					_this.pvsProcessBusy = false;
	// 					resolve();
	// 				});
	// 			};
	// 			this.pvsProcess.stdout.on("data", listener);
	// 			this.pvsProcess.stderr.on("data", (data: string) => {
	// 				if (this.connection) { this.connection.console.log(data); }
	// 			});
	// 			if (this.connection) { this.connection.console.info("PVS process ready!"); }
	// 		});
	// 	}
	// }
	/**
	 * Starts the pvsio process
	 */
	private async pvsio (): Promise<{}> {
		if (!this.pvsioProcessBusy) {
			this.pvsioProcessBusy = true;
			// const pvslispParser = new PvsLisp("pvs-init", this.connection);	
			const pvsLispReader = new PvsLispReader(this.connection);
			let cmd: string = path.join(this.pvsPath, "pvs");
			if (this.connection) { this.connection.console.info("Spawning pvsio process " + cmd); }
			const _this = this;
			return new Promise(function (resolve, reject) {
				_this.pvsioProcess = spawn(cmd, ["-raw"]);
				_this.pvsioProcess.stdout.setEncoding("utf8");
				_this.pvsioProcess.stderr.setEncoding("utf8");
				let listener = function (data: string) {
					if (this.connection) { this.connection.console.log(data); } // this is the crude pvs lisp output, useful for debugging
					pvsLispReader.read(data, (res: string) => {
						// connection.console.info(res);
						_this.pvsioProcess.stdout.removeListener("data", listener); // remove listener otherwise this will capture the output of other commands
						_this.pvsioProcessBusy = false;
						resolve();
					});
				};
				_this.pvsioProcess.stdout.on("data", listener);
				_this.pvsioProcess.stderr.on("data", function (data: string) {
					if (_this.connection) { _this.connection.console.log(data); }
				});
			});
		}
	}
	// /**
	//  * Starts the prover process
	//  */
	// private async prover (): Promise<{}> {
	// 	if (!this.proverProcessBusy) {
	// 		this.proverProcessBusy = true;
	// 		const pvslispParser = new PvsLisp("pvs-init", this.connection);	
	// 		let cmd: string = path.join(this.pvsPath, "pvs");
	// 		if (this.connection) { this.connection.console.info("Spawning prover process " + cmd); }
	// 		const _this = this;
	// 		return new Promise(function (resolve, reject) {
	// 			_this.proverProcess = spawn(cmd, ["-raw"]);
	// 			_this.proverProcess.stdout.setEncoding("utf8");
	// 			_this.proverProcess.stderr.setEncoding("utf8");
	// 			let listener = function (data: string) {
	// 				if (this.connection) { this.connection.console.log(data); } // this is the crude pvs lisp output, useful for debugging
	// 				pvslispParser.parse(data, function (res: string) {
	// 					// connection.console.info(res);
	// 					_this.proverProcess.stdout.removeListener("data", listener); // remove listener otherwise this will capture the output of other commands
	// 					_this.proverProcessBusy = false;
	// 					resolve();
	// 				});
	// 			};
	// 			_this.proverProcess.stdout.on("data", listener);
	// 			_this.proverProcess.stderr.on("data", function (data: string) {
	// 				if (_this.connection) { _this.connection.console.log(data); }
	// 			});
	// 		});
	// 	}
	// }

	/**
	 * Changes the current context. When the context is changed, all symbol information are erased and the parser/typechecker needs to be re-run.
	 * @param contextFolder Path of the context folder 
	 */
	async changeContext(contextFolder: string): Promise<PvsResponseType> {
		// await this.serverProxy.changeContext(contextFolder);
		const cmd: string = '(change-context "' + contextFolder + '" t)';
		this.pvsContextFolder = contextFolder;
		return await this.pvsExec(cmd);
	}
	/**
	 * Returns the current context
	 * @returns Path of the current context
	 */
	async currentContext(): Promise<PvsResponseType> {
		const cmd: string = '(pvs-current-directory)';
		return await this.pvsExec(cmd);
	}
	/**
	 * FIXME: remove this command in favour of listPvsFiles?
	 * Identifies the set of theories loaded in the current context
	 * FIXME: it is not clear when theories are loaded in the context? how to find the importchain??
	 * @returns A descriptor providing the list of theories in the current context.
	 * 			The descriptor contains two fields:
	 * 			- files: list of theories grouped by filename (type: { [fileName: string]: string })
	 * 			- theories: list of theories ordered by name (type: string[] )
	 */
	private async listTheories(): Promise<PvsResponseType> {
		const cmd: string = '(context-files-and-theories "'+ this.pvsContextFolder +'")';
		return await this.pvsExec(cmd);
	}
	/**
	 * Returns the pvs files in the current context, i.e., all pvs files in the current context folder
	 * TODO: create a separate module for file system operations?
	 * @returns A descriptor providing the list of pvs files and the name of the context folder
	 */
	async listPvsFiles(): Promise<PvsFileListDescriptor> {
		let files: string[] = await fs.readDir(this.pvsContextFolder);
		let pvsFiles: string[] = files.filter(fileName => {
			return fileName.endsWith(".pvs");
		});
		return {
			fileNames: pvsFiles,
			folder: this.pvsContextFolder
		};
	}
	async writeFile(fileName: string, content: string): Promise<void> {
		await fs.writeFileSync(path.join(this.pvsContextFolder,fileName), content);
	}
	// /**
	//  * Utility function, restores the pvs prompt if pvs crashes into lisp
	//  * @param option The restart option for restoring the pvs prompt
	//  * @private 
	//  */
	// private async continueLisp(option: number): Promise<PvsResponseType> {
	// 	const cmd = ':continue ' + option + "\n";
	// 	return this.pvsExec("pvs-continue", cmd);
	// }
	/**
	 * Disables garbage collector messages
	 */
	async disableGcPrintout(): Promise<PvsResponseType> {
		const cmd: string = '(setq *disable-gc-printout* t)';
		return await this.pvsExec(cmd);
	}
	/**
	 * Enables the pvs emacs interface.
	 * This is used to overcome a limitation of the raw mode, which does not provide detailed info for errors.
	 * ATT: Use this command carefully. The parser works fine, but the prover cannot be started as it expects commands from emacs. 
	 *
	 * pvs output in raw mode:
	 * pvs(7): (typecheck-file "test" nil nil nil)
	 * Parsing test
	 * <pvserror msg="Parser error">
	 * "Found '-' when expecting 'END'"
	 * </pvserror>
	 * 
	 * pvs output in emacs mode
	 * pvs(8): (setq *pvs-emacs-interface* t)
	 * pvs(9): (typecheck-file "test" nil nil nil)
	 * Parsing test
	 * Found '-' when expecting 'END'
	 * In file test (line 11, col 9)
	 * Error: Parse error
	 * Restart actions (select using :continue):
	 * 0: Return to Top Level (an "abort" restart).
	 * 1: Abort entirely from this (lisp) process.
	 * pvs(10):
	 */
	async emacsInterface(): Promise<PvsResponseType> {
		const cmd: string = '(setq *pvs-emacs-interface* t)';
		return await this.pvsExec(cmd);
	}
	/**
	 * Finds a symbol declaration. Requires parsing. May return a list of results when the symbol is overloaded.
	 * @param symbolName Name of the symbol
	 */
	async findDeclaration(symbolName: string): Promise<PvsResponseType> {
		if (new RegExp(PVS_TRUE_FALSE_REGEXP_SOURCE).test(symbolName)) {
			// find-declaration is unable to handle boolean constants if they are not spelled with capital letters
			symbolName = symbolName.toUpperCase();
		} else if (new RegExp(PVS_STRING_REGEXP_SOURCE).test(symbolName)) {
			return Promise.resolve({
				res: null,
				error: null,
				raw: null
			});
		}
		const cmd: string = '(find-declaration "' + symbolName + '")';
		return await this.pvsExec(cmd);
	}
	/**
	 * List all declaration in a given theory. Requires parsing.
	 * @param theoryName Name of the theory 
	 */
	private async _listDeclarations(theoryName: string): Promise<PvsResponseType> {
		const cmd: string = '(list-declarations "' + theoryName + '")';
		return await this.pvsExec(cmd);
	}
	/**
	 * Provides the list of symbols declared in a given theory
	 * @param desc 
	 */
	async listDeclarations (desc: PvsListDeclarationsRequest): Promise<PvsDeclarationDescriptor[]> {
		let response: PvsDeclarationDescriptor[] = [];
		const path = desc.file.trim().split("/");
		const fileName = path[path.length - 1].split(".pvs")[0];
		if (fileName !== PRELUDE_FILE) {
			// find-declaration works even if a pvs file does not parse correctly 
			let ans: PvsResponseType = await this._listDeclarations(desc.theoryName);
			const allDeclarations: PvsFindDeclarationInterface = ans.res;
			response = Object.keys(allDeclarations).map(function (key) {
				const info: PvsDeclarationType = allDeclarations[key];
				const ans: PvsDeclarationDescriptor = {
					line: desc.line,
					character: desc.character,
					file: desc.file,
					symbolName: info.symbolName,
					symbolTheory: info.symbolTheory,
					symbolDeclaration: (info) ? info.symbolDeclaration : null,
					symbolDeclarationRange: (info) ? info.symbolDeclarationRange : null,
					symbolDeclarationFile: (info) ? info.symbolDeclarationFile : null,
					symbolDoc: null,
					comment: null,
					error: null
				}
				return ans;
			});
		}
		return response;
	}
	// /**
	//  * Parse the expression passed as argument
	//  * @param expression The expression to be parsed
	//  */
	// async parseExpression(expression: string): Promise<PvsResponseType> {
	// 	const cmd: string = '(describe (pc-parse "' + expression + '" `expr))';
	// 	return await this.pvsExec("parse-expression", cmd);
	// }
	/**
	 * Parse a file. This is the original API provided by PVS Lisp.
	 * @param fileName File to be parsed, must be in the current pvs context
	 * @private
	 */
	private async _parseFile(fileName: string): Promise<PvsResponseType> {
		const cmd: string = '(parse-file "' + fileName + '" nil nil)'; // is there a way to force parsing of importchain?
		return await this.pvsExec(cmd);
	}
	/**
	 * Parse a file
	 * @param uri File to be parsed, must be in the current pvs context
	 * @returns Parser result, can be either a message (parse successful), or list of syntax errors
	 */
	async parseFile (uri: string): Promise<PvsParserResponse> {
		const fileName: string = getFilename(uri, { removeFileExtension: true });
		const filePath: string = getPathname(uri);
		let response: PvsParserResponse = {
			fileName: fileName,
			res: null,
			error: null
		};
		if (!filePath.startsWith(this.pvsPath)) {
			// await _this.pvsProcess.changeContext(filePath);
			const parserInfo: PvsResponseType = await this._parseFile(fileName);
			if (parserInfo.error) {
				response.error = parserInfo.error.parserError;
			} else {
				response.res = parserInfo.res
			}
		} else {
			if (this.connection) {
				this.connection.console.info("PVS library file " + fileName + " already parsed.");
			}
		}
		return response;
	}

	/**
	 * Parse all files in the current context
	 * @returns Parser result for each file, can be either a message (parse successful), or list of syntax errors
	 */
	async parseAll (): Promise<{ [fileName: string]: PvsParserResponse }> {
		let result: { [ fileName: string ] : PvsParserResponse } = {};
		let contextFiles: PvsFileListDescriptor = await this.listPvsFiles();
		if (contextFiles && contextFiles.fileNames) {
			for (let i in contextFiles.fileNames) {
				result[contextFiles.fileNames[i]] = await this.parseFile(contextFiles.fileNames[i]);
			}
		}
		return result;
	}

	// /**
	//  * Creates the prover process, if the process has not been created already.
	//  */
	// private async initTypeChecker () {
	// 	if (this.proverProcess === null) {
	// 		// start prover process
	// 		await this.prover();
	// 		let cmd: string = '(setq *disable-gc-printout* t)';
	// 		// disable garbage collector printout
	// 		await this.proverExec("disable-gc-printout", cmd);
	// 	}
	// } 

	/**
	 * Shows the Type Check Conditions (TCCs) for the selected theory.
	 * This command triggers typechecking and creates a .tccs file on disk. The .tccs file name corresponds to the theory name.
	 * @returns An array of TCC descriptors
	 */
	async showTccs (fileName: string, theoryName: string): Promise<PvsResponseType> {	
		const cmd: string = '(show-tccs "' + theoryName + '" nil)';
		const ans: PvsResponseType = await this.pvsExec(cmd);
		// const importChain: PvsTheoryListDescriptor = await this.listTheories();
		// const fileName: string = importChain.theories[theoryName][0]; // this is broken because list-theories is broken -- come files may not have been loaded yet 

		// const res = await this.serverProxy.changeContext(this.pvsContextFolder);

		// const res = await this.serverProxy.typecheck(fileName);

		// const res = await this.serverProxy.lisp(cmd);

		// create a new file with the tccs. The file name corresponds to the theory name.
		if (ans && ans.res) {
			const tccs: TccDescriptor[] = ans.res;
			let tccsFileContent: string = "";
			tccs.forEach((tcc) => {
				tccsFileContent += tcc.content;
			});
			await this.writeFile(theoryName + ".tccs", tccsFileContent);
		}

		// send results back to the client
		return Promise.resolve(ans);
	}

	/**
	 * Animates a pvs expression
	 * @param desc Expression descriptor
	 */
	async runit (desc: ExpressionDescriptor): Promise<EvaluationResult> {
		// start pvsio process
		await this.pvsio();
		let cmd: string = '(setq *disable-gc-printout* t)';
		// disable garbage collector printout
		await this.pvsioExec("disable-gc-printout");
		// // enable emacs interface
		// cmd = '(setq *pvs-emacs-interface* t)';
		// await this.pvsioExec("emacs-interface", cmd);
		// make sure we are in the correct context
		cmd = '(change-context "' + this.pvsContextFolder + '" t)';
		await this.pvsioExec("change-context");
		// typecheck
		let fileName = getFilename(desc.fileName, { removeFileExtension: true });
		cmd = '(typecheck-file "' + fileName + '" nil nil nil)';
		await this.pvsioExec("typecheck-file");
		// load semantic attachments
		cmd = "(load-pvs-attachments)";
		await this.pvsioExec("load-pvs-attachments");
		// enter pvsio mode
		cmd = '(evaluation-mode-pvsio "' + desc.theoryName + '" nil nil nil)'; // the fourth argument removes the pvsio 	banner
		await this.pvsioExec("evaluation-mode-pvsio");
		// send expression to be evaluated
		cmd = desc.expression + ";";
		let ans = await this.pvsioExec("eval-expr");
		// await this.pvsioExec("quit-pvsio", "quit;");
		this.pvsioProcess.kill();
		return {
			fileName: desc.fileName,
			theoryName: desc.theoryName,
			msg: "%-- animation result for " + desc.expression,
			result: ans.res
		};
	}

	// /**
	//  * Proves a formula
	//  * @param desc Formula descriptor
	//  */
	// async proveit (desc: FormulaDescriptor): Promise<ProofResult> {
	// 	await this.initTypeChecker();
	// 	let cmd = '(change-context "' + this.pvsContextFolder + '" t)';
	// 	await this.proverExec("change-context", cmd);
	// 	// typecheck
	// 	let fileName = getFilename(desc.fileName, { removeFileExtension: true });
	// 	cmd = '(typecheck-file "' + fileName + '" nil nil nil)';
	// 	await this.proverExec("typecheck-file", cmd);

	// 	// // enable proof editing
	// 	// cmd = '(edit-proof-at "' + fileName + '" nil ' + desc.line + ' "pvs" "' + fileName + '.pvs" 0 nil)';
	// 	// await this.proverExec("edit-proof-at", cmd);
	// 	// // edit proof
	// 	// const strategyFolder: string = path.join(this.pvsServerPath, "strategies");
	// 	// const grindStrategy: string = path.join(strategyFolder, "grind.lisp");
	// 	// cmd = '(install-proof `' + grindStrategy + ' "' + fileName + '" "' + desc.formula + '" 1 t "Proof" 0)';
	// 	// await this.proverExec("install-proof", cmd);
		
	// 	cmd = '(prove-formula "' + desc.theoryName + '" "'+ desc.formulaName +'" nil)'; 
	// 	let ans: string = (await this.proverExec("prove-formula", cmd)).res;
	// 	// (install-prooflite-scripts "test" "test" 0 t)
	// 	//'(install-prooflite-scripts "' + desc.fileName + '" "' + desc.theoryName +  '" ' + desc.line + ' t)';
	// 	return {
	// 		fileName: desc.fileName,
	// 		theoryName: desc.theoryName,
	// 		msg: "%-- proof state for " + desc.formulaName,
	// 		result: ans
	// 	};
	// }

	async proveFormula(theoryName: string, formulaName: string) {
		// await this.initTypeChecker();
		const cmd = '(prove-formula "' + theoryName + '" "'+ formulaName +'" t)'; 
		await this.pvsExec(cmd);
	}

	// /**
	//  * Shows the declaration of a symbol. Requires typechecking.
	//  * @param fileName 
	//  * @param line 
	//  * @param character 
	//  */
	// async showDeclaration(fileName: string, line: number, character: number): Promise<PvsResponseType> {
	// 	const cmd: string = '(show-declaration "' + fileName + '" "pvs" ' + "'(" + line + " " + character + ")" + ')';
	// 	return await this.pvsExec(cmd);
	// }
	// /**
	//  * Identifies the importchain for a given theory.
	//  * @param theoryName Theory name for which the importchain should be computed
	//  */
	// async showImportChain(theoryName: string): Promise<PvsResponseType> {
	// 	if (theoryName) {
	// 		const cmd: string = '(show-importchain "' + theoryName + '")';
	// 		return await this.pvsExec(cmd);
	// 	}
	// 	return Promise.resolve({
	// 		res: { theories: [] },
	// 		error: null,
	// 		raw: null
	// 	});
	// }
	/**
	 * Internal function, typechecks a file
	 * @param uri The uri of the file to be typechecked
	 * @param tcpFlag Optional flag, triggers automatic proof of tccs
	 */
	private async _typecheckFile(uri: string, tcpFlag?: boolean): Promise<PvsResponseType> {
		let fileName: string = getFilename(uri, { removeFileExtension: true });

		// await this.serverProxy.changeContext(this.pvsContextFolder);
		// await this.serverProxy.typecheck(fileName);

		const cmd: string = (tcpFlag) ? 
			'(typecheck-file "' + fileName + '" nil t nil)'
				: '(typecheck-file "' + fileName + '" nil nil nil)';
		// await this.initTypeChecker();
		return await this.pvsExec(cmd);
		// const cmd: string = '(json-typecheck-file "' + fileName + '")'; /// what is the difference between json-xxx and xxx?
		// return (await this.pvsExec("json-typecheck-file", cmd)).res;
	}

	/**
	 * Typechecks a file
	 * @param uri The uri of the file to be typechecked
	 * @param tcp Tries to discharge tccs
	 */
	async typecheckFile (uri: string, tcp?: boolean): Promise<PvsTypecheckerResponse> {
		const fileName: string = getFilename(uri, { removeFileExtension: true });
		const filePath: string = getPathname(uri);
		let response: PvsTypecheckerResponse = {
			fileName: fileName,
			res: null,
			error: null
		};
		if (filePath !== this.pvsPath && filePath !== path.join(this.pvsPath, "lib")) {
			// await _this.pvsProcess.changeContext(filePath);
			const info: PvsResponseType = await this._typecheckFile(fileName, tcp);
			if (info.error) {
				response.error = info.error.parserError;
			} else {
				response.res = info.res
			}
		} else {
			if (this.connection) {
				this.connection.console.info("PVS library file " + fileName + " already typechecked.");
			}
		}
		return response;
	}
	/**
	 * Typechecks a file and tries to discharge all tccs
	 * @param uri The uri of the file to be typechecked
	 */
	async typecheckProve (uri: string): Promise<PvsTypecheckerResponse> {
		return this.typecheckFile(uri, true)
	}

	/**
	 * Typechecks a theory
	 * @param theoryName The theory to be typechecked
	 */
	async typecheckTheory(theoryName: string): Promise<PvsParserResponse> {
		const pvsResponse: PvsResponseType = await this.listTheories();
		if (pvsResponse && pvsResponse.res) {
			const importChain: PvsTheoryListDescriptor = pvsResponse.res;
			if (importChain && importChain.theories) {
				const fileName = importChain.theories[theoryName];
				const cmd: string = '(typecheck-file "' + fileName + '" nil nil nil)';
				// await this.initTypeChecker();
				return (await this.pvsExec(cmd)).res;
			}
		}
		return Promise.resolve(null);
	}
	/**
	 * Provides pvs version information
	 */
	async pvsVersionInformation(): Promise<PvsResponseType> {
		const cmd: string = '(get-pvs-version-information)';
		return await this.pvsExec(cmd);
	}

	async prettyprintRegion (desc: PrettyPrintRegionRequest): Promise<PrettyPrintRegionResult> {
		// TODO
		return null;
	}

	// async continueProof(cmd: string): Promise<string> {
	// 	// await this.initTypeChecker();
	// 	let ans: string = (await this.pvsExec("prove-formula", cmd)).res;
	// 	// (install-prooflite-scripts "test" "test" 0 t)
	// 	//'(install-prooflite-scripts "' + desc.fileName + '" "' + desc.theoryName +  '" ' + desc.line + ' t)';
	// 	return ans;
	// }

}