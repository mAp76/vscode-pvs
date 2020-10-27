import * as fsUtils from "../server/src/common/fsUtils";
import * as test from "./test-constants";
import { PvsResponse } from "../server/src/common/pvs-gui";
import { PvsProxy } from '../server/src/pvsProxy'; // XmlRpcSystemMethods
import { configFile, sandboxExamples,
	stever, steverFiles, pillbox, pillboxFiles, pvsioweb, pvsiowebFiles, pvsiowebFolders, 
	dependable_plus_safe } from './test-utils';
import * as path from 'path';
import * as os from 'os';

//----------------------------
//   Test cases for typechecker
//----------------------------
describe("pvs-typechecker", () => {
	let pvsProxy: PvsProxy = null;
	beforeAll(async () => {
		const config: string = await fsUtils.readFile(configFile);
		const content: { pvsPath: string } = JSON.parse(config);
		// console.log(content);
		const pvsPath: string = content.pvsPath;
		// log("Activating xmlrpc proxy...");
		pvsProxy = new PvsProxy(pvsPath, { externalServer: true });
		await pvsProxy.activate({ debugMode: true, showBanner: false }); // this will also start pvs-server

		// delete pvsbin files and .pvscontext
		await fsUtils.cleanBin(sandboxExamples);
		await fsUtils.cleanBin(stever);
		await fsUtils.cleanBin(pillbox);
		for (let i = 0; i < pvsiowebFolders.length; i++) {
			await fsUtils.cleanBin(path.join(pvsioweb, pvsiowebFolders[i]));
		}
		await fsUtils.cleanBin(dependable_plus_safe);

		console.log("\n----------------------");
		console.log("test-typechecker");
		console.log("----------------------");
	});
	afterAll(async () => {
		await pvsProxy.killPvsServer();
		await pvsProxy.killPvsProxy();
		// delete pvsbin files and .pvscontext
		await new Promise((resolve, reject) => {
			setTimeout(async () => {
				await fsUtils.cleanBin(sandboxExamples);
				await fsUtils.cleanBin(stever);
				await fsUtils.cleanBin(pillbox);
				for (let i = 0; i < pvsiowebFolders.length; i++) {
					await fsUtils.cleanBin(path.join(pvsioweb, pvsiowebFolders[i]));
				}
				await fsUtils.cleanBin(dependable_plus_safe);
				resolve();
			}, 2000);
		});
	});

	it(`can typecheck files`, async () => {
		const response: PvsResponse = await pvsProxy.typecheckFile({ fileName: "sqrt", fileExtension: ".pvs", contextFolder: sandboxExamples });
		// console.dir(response);
		expect(response).not.toBeNull();
		expect(response.result).not.toBeNull();
	}, 100000);


	it(`can typecheck theories with parameters`, async () => {
		let desc = {
			contextFolder: sandboxExamples,
			fileExtension: ".pvs",
			fileName: "alaris2lnewmodes.pump",
			formulaName: "vtbi_over_rate_lemma",
			line: 28,
			theoryName: "pump_th"
		};
		let response: PvsResponse = await pvsProxy.typecheckFile(desc);
		// console.dir(response);
		expect(response.result).toBeDefined();
		expect(response.error).not.toBeDefined();
		
	}, 10000);

	it(`can typecheck pvs files that import other files`, async () => {
		// const response: PvsResponse = await pvsProxy.typecheckFile({ fileName: "sqrt", fileExtension: ".pvs", contextFolder: sandboxExamples });
		const response: PvsResponse = await pvsProxy.typecheckFile({ fileName: "main", fileExtension: ".pvs", contextFolder: sandboxExamples });
		// console.dir(response);
		expect(response).toBeDefined();
		// expect(response.result).toEqual(test.typecheck1_result);
	}, 100000);

	it(`can generate .tcc file content`, async () => {
		const response: PvsResponse = await pvsProxy.generateTccsFile({ 
			fileName: "sqrt", 
			fileExtension: ".pvs", 
			theoryName: "sqrt", 
			contextFolder: sandboxExamples 
		});
		// console.dir("response", response);
		expect(response.error).not.toBeDefined();
		expect(response.result).not.toBeNull();

		const response1: PvsResponse = await pvsProxy.generateTccsFile({
			fileName:"alaris2lnewmodes", 
			fileExtension:".pvs", 
			theoryName: "alaris_th", 
			contextFolder: sandboxExamples
		});
		// console.dir("response", response1);
		expect(response1.error).not.toBeDefined();
		expect(response1.result).not.toBeNull();
	}, 20000);

	it(`can typecheck files in folders whose name contains utf8 symbols`, async () => {

		const response: PvsResponse = await pvsProxy.typecheckFile({
			fileName: "helloworld", 
			fileExtension: ".pvs", 
			contextFolder: dependable_plus_safe
		});
		// console.dir(response);
		expect(response).toBeDefined();
		expect(response.result).toBeDefined();
		expect(response.error).not.toBeDefined();
	}, 100000);

	//-----------------------
	// additional test cases
	//-----------------------
	for (let i = 0; i < steverFiles.length; i++) {
		it(`can typecheck stever/${steverFiles[i]}.pvs`, async () => {
			// Need to clear-theories, in case rerunning with the same server.
			await pvsProxy.lisp("(clear-theories t)");

			const response: PvsResponse = await pvsProxy.typecheckFile({
				fileName: steverFiles[i],
				fileExtension: ".pvs", 
				contextFolder: stever
			});
			// console.dir(response);
			expect(response).toBeDefined();
			expect(response.error).not.toBeDefined();
			
		}, 40000);

	}
	for (let i = 0; i < pillboxFiles.length; i++) {
		it(`can typecheck pillbox/${pillboxFiles[i]}.pvs`, async () => {
			// Need to clear-theories, in case rerunning with the same server.
			await pvsProxy.lisp("(clear-theories t)");

			const response: PvsResponse = await pvsProxy.typecheckFile({
				fileName: pillboxFiles[i],
				fileExtension: ".pvs", 
				contextFolder: pillbox
			});
			// console.dir(response);
			expect(response).toBeDefined();
			expect(response.error).not.toBeDefined();
			
		}, 40000);
	}
	for (let i = 0; i < pvsiowebFiles.length; i++) {
		it(`can typecheck pvsioweb/${pvsiowebFiles[i]}.pvs`, async () => {
			// Need to clear-theories, in case rerunning with the same server.
			await pvsProxy.lisp("(clear-theories t)");

			const response: PvsResponse = await pvsProxy.typecheckFile({
				fileName: pvsiowebFiles[i],
				fileExtension: ".pvs", 
				contextFolder: pvsioweb
			});
			// console.dir(response);
			expect(response).toBeDefined();
			if (pvsiowebFiles[i].endsWith("MDNumberpad")) {
				expect(response.error).toBeDefined(); // theory 'limits' declared in twice in the same workspace
			} else {
				expect(response.result).toBeDefined();
				expect(response.error).not.toBeDefined();
			}

		}, 60000);
	}


});
