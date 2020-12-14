import * as fsUtils from "../server/src/common/fsUtils";
import * as test from "./test-constants";
import { PvsResponse, PvsResult } from "../server/src/common/pvs-gui";
import { PvsProxy } from '../server/src/pvsProxy'; // XmlRpcSystemMethods
import { label, configFile } from './test-utils';
import * as path from 'path';
import { execSync } from "child_process";
import { PvsIoProxy } from '../server/src/pvsioProxy';

//----------------------------
//   Test cases for checking behavior of pvs with corrupted .pvscontext
//----------------------------
describe("pvs", () => {
	let pvsProxy: PvsProxy = null;
	let pvsioProxy: PvsIoProxy = null;

	let baseFolder: string = path.join(__dirname, "pvscontext");
	const cleanAll = () => {
		fsUtils.deleteFolder(path.join(baseFolder, "monitors"));
		fsUtils.deleteFolder(path.join(baseFolder, "baxter"));
		fsUtils.deleteFolder(path.join(baseFolder, "type_theory"));
		fsUtils.deleteFolder(path.join(baseFolder, "alaris2l"));
		fsUtils.deleteFolder(path.join(baseFolder, "pvsICEipandvs2"));
		fsUtils.deleteFolder(path.join(baseFolder, "trace"));
		fsUtils.deleteFolder(path.join(baseFolder, "pillboxv7"));
		fsUtils.deleteFolder(path.join(baseFolder, "nasalib-monitors"));
		fsUtils.deleteFolder(path.join(baseFolder, "nasalib-monitors-stack-limit-error"));
	}

	beforeAll(async () => {
		const config: string = await fsUtils.readFile(configFile);
		const content: { pvsPath: string } = JSON.parse(config);
		// console.log(content);
		const pvsPath: string = content.pvsPath;
		// log("Activating xmlrpc proxy...");
		pvsProxy = new PvsProxy(pvsPath, { externalServer: true });
		await pvsProxy.activate({ debugMode: false, showBanner: false }); // this will also start pvs-server

		pvsioProxy = new PvsIoProxy(pvsPath);

		console.log("\n----------------------");
		console.log("test-pvscontext");
		console.log("----------------------");
	});
	afterAll(async () => {
		await pvsProxy.killPvsServer();
		await pvsProxy.killPvsProxy();
		await new Promise<void>((resolve, reject) => {
			setTimeout(() => {
				cleanAll();
				resolve();
			}, 2000);
		})
	});

	// utility function, quits the prover if the prover status is active
	const quitProverIfActive = async (): Promise<void> => {
		let proverStatus: PvsResult = await pvsProxy.pvsRequest('prover-status'); // await pvsProxy.getProverStatus();		
		// console.dir(proverStatus);
		if (proverStatus && proverStatus.result !== "inactive") {
			await pvsProxy.proofCommand({ cmd: 'quit' });
		}
	}



	// this test fails -- grind does not terminate
	// this test case requires pvs-experimental/monitors in the pvs-library-path
	// or alternatively folder vscode-pvs/test/pvs-context/nasalib-monitors-stack-limit-error in the library path
	xit(`can prove null_null_after_satisfaction_ft (nasalib-monitors-stack-limit-error.zip)`, async () => {
		await quitProverIfActive();

		// Need to clear-theories, in case rerunning with the same server.
		await pvsProxy.lisp("(clear-theories t)");

		// remove folder if present and replace it with the content of the zip file
		const contextFolder: string = path.join(baseFolder, "nasalib-monitors-stack-limit-error");
		fsUtils.deleteFolder(contextFolder);
		execSync(`cd ${baseFolder} && unzip nasalib-monitors-stack-limit-error.zip`);

		let response: PvsResponse = await pvsProxy.proveFormula({
			fileName: "trace",
			fileExtension: ".pvs",
			contextFolder: path.join(contextFolder, "Fret_MLTL"),
			theoryName: "trace",
			formulaName: "null_null_after_satisfaction_ft"
		});
		expect(response.result).toBeDefined();
		expect(response.error).not.toBeDefined();
		// console.dir(response);

		const commands: string[] = [
			'(skeep)',
			'(fretex)',
			'(iff)',
			'(split)',
			'(flatten)',
			'(split)',
			'(inst -1 "0")',
			'(expand "nth")',
			'(expand "after")',
			'(inst -1 "0")',
			'(expand "nth")',
			'(flatten)',
			'(skeep)',
			'(skeep)',
			'(case "n-1 < i")',
			'(inst 2 "n-1")',
			'(expand "Trace_equiv")',
			'(inst -6 "n-1")',
			'(grind)'
		]
		for (let i = 0; i < commands.length; i++) {
			response = await pvsProxy.proofCommand({ cmd: commands[i] });
		}
		expect(response.result).toBeDefined();
		expect(response.error).not.toBeDefined();
	}, 300000);

	it(`can typecheck nasalib-monitors/trace.pvs (nasalib-monitors.zip)`, async () => {
		await quitProverIfActive();

		// Need to clear-theories, in case rerunning with the same server.
		await pvsProxy.lisp("(clear-theories t)");

		// remove folder if present and replace it with the content of the zip file
		const contextFolder: string = path.join(baseFolder, "nasalib-monitors");
		fsUtils.deleteFolder(contextFolder);
		execSync(`cd ${baseFolder} && unzip nasalib-monitors.zip`);

		let response: PvsResponse = await pvsProxy.proveFormula({
			fileName: "trace",
			fileExtension: ".pvs",
			contextFolder: path.join(contextFolder, "Fret_MLTL"),
			theoryName: "trace",
			formulaName: "null_null_always_satisfaction"
		});
		expect(response.result).toBeDefined();
		expect(response.error).not.toBeDefined();
		// console.dir(response);

		response = await pvsProxy.proofCommand({ cmd: `(skeep)` });
		response = await pvsProxy.proofCommand({ cmd: `(fretex)` });
		// response = await pvsProxy.proofCommand({ cmd: `(skeep)(fretex)(iff)(split)(flatten)(inst -1 "0")(skeep)(inst 2 "n-1")(case "i > n-1")(expand "Trace_equiv")(inst -3 "n-1")(assert)(flatten)(assert)(expand "last_atom")(expand "always")(split)(inst -1 "i")(split)(expand "Trace_equiv")(inst -2 "i")(flatten)(hide -2 -3 -4 -5 -7)(expand "post_condition_atom")(assert)(typepred "i")(assert)(expand "nth")(typepred "i")(grind)(expand "nth")(grind)(inst -1 "i")(expand "nth")(grind)(expand "nth")(typepred "i")(grind)(expand "length")(grind)(flatten)(skeep)(expand "always")(skeep)(typepred "i_1")(inst -2 "i_1")(expand "nth")(assert)(typepred "i")(grind)` });
		// console.dir(response);
		expect(response.result).toBeDefined();
		expect(response.error).not.toBeDefined();
	}, 300000);

	it(`identified typecheck errors for datatypes in type_theory (type-theory-error-with-datatypes.zip)`, async () => {
		await quitProverIfActive();

		// Need to clear-theories, in case rerunning with the same server.
		await pvsProxy.lisp("(clear-theories t)");

		// remove folder if present and replace it with the content of the zip file
		fsUtils.deleteFolder(path.join(baseFolder, "type_theory"));
		execSync(`cd ${baseFolder} && unzip type-theory-error-with-datatypes.zip`);

		const response: PvsResponse = await pvsProxy.typecheckFile({
			fileName: "basics", 
			fileExtension: ".pvs", 
			contextFolder: path.join(baseFolder, "type_theory")
		});
		// console.dir(response);
		expect(response).toBeDefined();
		expect(response.result).not.toBeDefined();
		expect(response.error).toBeDefined();

	}, 10000);

	it(`identifies typecheck errors when processing baxterSigmaSpectrum.pvs`, async () => {
		await quitProverIfActive();

		// Need to clear-theories, in case rerunning with the same server.
		await pvsProxy.lisp("(clear-theories t)");

		// remove baxter folder if present and replace it with the content of the zip file
		fsUtils.deleteFolder(path.join(baseFolder, "baxter"));
		execSync(`cd ${path.join(__dirname, "pvscontext")} && unzip baxter-two-theory-limits.zip`);

		const response: PvsResponse = await pvsProxy.typecheckFile({
			fileName: "baxterSigmaSpectrum", 
			fileExtension: ".pvs", 
			contextFolder: path.join(baseFolder, "baxter")
		});
		// console.dir(response);
		expect(response).toBeDefined();
		expect(response.result).not.toBeDefined();
		expect(response.error).toBeDefined();
		// console.dir(response.error);
		expect(response.error.data).toBeDefined();
		expect(response.error.data.error_string).toBeDefined();
		// expect(response.error.data.error_string).toMatch(/\blimits\b/g);

	}, 10000);
	
	//-- all tests below this line are completed successfully

	it(`can show tccs for alaris_th`, async () => {
		await quitProverIfActive();

		// Need to clear-theories, in case rerunning with the same server.
		await pvsProxy.lisp("(clear-theories t)");

		// remove alaris folder if present and replace it with the content of the zip file
		fsUtils.deleteFolder(path.join(baseFolder, "alaris2l"));
		execSync(`cd ${path.join(__dirname, "pvscontext")} && unzip alaris2l-show-tccs-error.zip`);

		const response: PvsResponse = await pvsProxy.generateTccsFile({
			fileName: "alaris2lnewmodes", 
			fileExtension: ".pvs", 
			contextFolder: path.join(baseFolder, "alaris2l"),
			theoryName: "alaris_th"
		});
		// console.dir(response);
		expect(response).toBeDefined();
		expect(response.result).toBeDefined();
		expect(response.error).not.toBeDefined();

	}, 20000);

	it(`can typecheck datatypes in trace`, async () => {
		await quitProverIfActive();

		// Need to clear-theories, in case rerunning with the same server.
		await pvsProxy.lisp("(clear-theories t)");

		// remove folder if present and replace it with the content of the zip file
		fsUtils.deleteFolder(path.join(baseFolder, "trace"));
		execSync(`cd ${baseFolder} && unzip trace.zip`);

		let response: PvsResponse = await pvsProxy.parseFile({
			fileName: "trace", 
			fileExtension: ".pvs", 
			contextFolder: path.join(baseFolder, "trace")
		});
		// console.dir(response);
		response = await pvsProxy.parseFile({
			fileName: "CONDITIONS", 
			fileExtension: ".pvs", 
			contextFolder: path.join(baseFolder, "trace")
		});
		// console.dir(response);
		response = await pvsProxy.typecheckFile({
			fileName: "CONDITIONS", 
			fileExtension: ".pvs", 
			contextFolder: path.join(baseFolder, "trace")
		});
		// console.dir(response);
		expect(response).toBeDefined();
		expect(response.result).toBeDefined();
		expect(response.error).not.toBeDefined();

	}, 10000);

	// this test case fails with the assertion error "the assertion (directory-p path) failed."
	it(`ignores non-existing folders indicated in pvs-library-path`, async () => {
		await quitProverIfActive();

		// Need to clear-theories, in case rerunning with the same server.
		await pvsProxy.lisp("(clear-theories t)");

		// remove folder if present and replace it with the content of the zip file
		const contextFolder: string = path.join(baseFolder, "nasalib-monitors");
		fsUtils.deleteFolder(contextFolder);
		execSync(`cd ${baseFolder} && unzip nasalib-monitors.zip`);

		await pvsProxy.lisp(`(push "~/non/existing/path/" *pvs-library-path*)`, { externalServer: true });
		
		let response: PvsResponse = await pvsProxy.proveFormula({
			fileName: "trace",
			fileExtension: ".pvs",
			contextFolder: path.join(contextFolder, "Fret_MLTL"),
			theoryName: "trace",
			formulaName: "null_null_always_satisfaction"
		});
		expect(response.result).toBeDefined();
		expect(response.error).not.toBeDefined();
	}, 40000);


	it(`can find typecheck error in ICEcoordinator.pvs (wrong field type)`, async () => {
		await quitProverIfActive();

		// Need to clear-theories, in case rerunning with the same server.
		await pvsProxy.lisp("(clear-theories t)");

		// remove folder if present and replace it with the content of the zip file
		fsUtils.deleteFolder(path.join(baseFolder, "pvsICEipandvs2"));
		execSync(`cd ${baseFolder} && unzip pvsICEipandvs2-wrong-field.zip`);

		const response: PvsResponse = await pvsProxy.typecheckFile({
			fileName: "main", 
			fileExtension: ".pvs", 
			contextFolder: path.join(baseFolder, "pvsICEipandvs2")
		});
		// console.dir(response);
		expect(response).toBeDefined();
		expect(response.result).not.toBeDefined();
		expect(response.error).toBeDefined();

	}, 10000);

	it(`can typecheck strings defined in pillboxv7`, async () => {
		await quitProverIfActive();

		// Need to clear-theories, in case rerunning with the same server.
		await pvsProxy.lisp("(clear-theories t)");

		// remove pillboxv7 folder if present and replace it with the content of the zip file
		fsUtils.deleteFolder(path.join(baseFolder, "pillboxv7"));
		execSync(`cd ${baseFolder} && unzip pillboxv7-errors-with-strings.zip`);

		const response: PvsResponse = await pvsProxy.typecheckFile({
			fileName: "main", 
			fileExtension: ".pvs", 
			contextFolder: path.join(baseFolder, "pillboxv7")
		});
		// the following timeout will give time to pvs to write pvsbin and .pvscontext, which are going to be deleted
		await new Promise<void>((resolve, reject) => {
			setTimeout(() => {
				fsUtils.deleteFolder(path.join(baseFolder, "pillboxv7"));
				resolve();
			}, 4000);
		});
		// console.dir(response);
		expect(response).toBeDefined();
		expect(response.result).toBeDefined();
		expect(response.error).not.toBeDefined();

	}, 40000);

	it(`can typecheck lists defined in pillboxv7`, async () => {
		await quitProverIfActive();

		// Need to clear-theories, in case rerunning with the same server.
		await pvsProxy.lisp("(clear-theories t)");

		// remove pillboxv7 folder if present and replace it with the content of the zip file
		fsUtils.deleteFolder(path.join(baseFolder, "pillboxv7"));
		execSync(`cd ${baseFolder} && unzip pillboxv7-errors-with-lists.zip`);

		const response: PvsResponse = await pvsProxy.typecheckFile({
			fileName: "firstpillchecks", 
			fileExtension: ".pvs", 
			contextFolder: path.join(baseFolder, "pillboxv7")
		});
		// console.dir(response);
		expect(response).toBeDefined();
		expect(response.result).toBeDefined();
		expect(response.error).not.toBeDefined();

	}, 10000);


	it(`can run find-declaration without hitting breaks`, async () => {
		await quitProverIfActive();

		// Need to clear-theories, in case rerunning with the same server.
		await pvsProxy.lisp("(clear-theories t)");

		fsUtils.deleteFolder(path.join(baseFolder, "data"));
		execSync(`cd ${baseFolder} && unzip data.zip`);

		const dataFolder: string = path.join(baseFolder, "data");
		const TypeCheckPVS: string = fsUtils.desc2fname({
			fileName: "TypeCheck", 
			fileExtension: ".pvs", 
			contextFolder: dataFolder
		});
		const LiteralPVS: string = fsUtils.desc2fname({
			fileName: "Literal", 
			fileExtension: ".pvs", 
			contextFolder: dataFolder
		});
		let response: PvsResponse = null;
		const externalServer: boolean = false;

		response = await pvsProxy.lisp(`(change-workspace "${dataFolder}" t)`, { externalServer });
		response = await pvsProxy.lisp(`(parse-file "${TypeCheckPVS}" nil)`, { externalServer });
		response = await pvsProxy.lisp(`(change-workspace "${dataFolder}" t)`, { externalServer });
		response = await pvsProxy.lisp(`(typecheck-file "${TypeCheckPVS}" nil nil nil nil t)`, { externalServer });
		response = await pvsProxy.lisp(`(change-workspace "${dataFolder}" t)`, { externalServer });
		response = await pvsProxy.lisp(`(parse-file "${LiteralPVS}" nil)`, { externalServer });
		response = await pvsProxy.lisp(`(change-workspace "${dataFolder}" t)`, { externalServer });
		response = await pvsProxy.lisp(`(typecheck-file "${LiteralPVS}" nil nil nil nil t)`, { externalServer });
		
		response = await pvsProxy.lisp(`(find-declaration "PrimitiveValue")`);
		// console.dir(response);

		expect(response).toBeDefined();
		expect(response.result).toBeDefined();
		expect(response.error).not.toBeDefined();
	}, 16000);

});

