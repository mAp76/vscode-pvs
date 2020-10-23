/**
 * @module VSCodePvsEmacsBindingsProvider
 * @author Paolo Masci
 * @date 2019.06.18
 * @copyright 
 * Copyright 2019 United States Government as represented by the Administrator 
 * of the National Aeronautics and Space Administration. All Rights Reserved.
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

/**
 * PVS emacs bindings:
 * - typecheck: M-x tc
 * - typecheck-prove: M-x tcp
 * - prove: M-x prove
 * - show tccs: M-x tccs
 * - pvsio: M-x pvsio
 * - view prelude: M-x view-prelude-file
 */
import { ExtensionContext, commands, window, TextDocument, InputBox } from 'vscode';
import { LanguageClient } from 'vscode-languageclient';
import { workspace } from 'vscode';
import * as fsUtils from '../common/fsUtils';
import * as utils from '../common/languageUtils';
import { VSCodePvsStatusBar } from '../views/vscodePvsStatusBar';
import { PvsFormula } from '../common/serverInterface';
import * as vscodeUtils from '../utils/vscode-utils';
/**
 * cmds is the list of commands that are supported by the emacs binding defined in this module
 * NB: The order of the commands in the array affects the behavior of autocompletion
 *     (autocompletion returns the first match that starts with the user input)
 */
const cmds: string[] = [
	"tc", "typecheck",
	"tcp", "typecheck-prove",
	"pr", "prove",
	"pri", "prove-importchain",
	"prt", "prove-theory",
	"pvsio",

	"jpr", "jprove",
	"jtcp", "jtypecheck-prove",
	"jprt", "jprove-theory",
	"jpri", "jprove-importchain",

	"add-pvs-library",
	"pvs-library-path",
	"view-pvs-library-path",
	"reboot-pvs",
	"restart-pvs",
	"install-pvs",
	"reinstall-pvs", // equivalent to install-pvs
	"install-nasalib",
	"reinstall-nasalib", // equivalent to install-nasalib
	"reset-pvs-library-path",
	"clean-bin",
	"clean-tccs",
	"clean-all",
	"update-nasalib",
	"set-pvs-path",
	"settings",
	"release-notes", // show release notes
	"welcome", // show release notes
	"about", // show release notes

	"step-proof",
	"show-tccs",
	"show-proof-summary",
	"vpf", "view-prelude-file"
];

export class VSCodePvsEmacsBindingsProvider {
	protected client: LanguageClient;
	protected inputBox: InputBox;
	protected metax: string = "M-x ";
	protected userInput: string; // used by autocompletion
	protected statusBar: VSCodePvsStatusBar;

	constructor (client: LanguageClient, statusBar: VSCodePvsStatusBar) {
		this.client = client;
		this.statusBar = statusBar;
	}
	activate (context: ExtensionContext) {
		// do nothing for now
	}
	protected autocompleteInput(input: string): string {
		if (input) {
			for (let i = 0; i < cmds.length; i++) {
				if (cmds[i].startsWith(input)) {
					return cmds[i];
				}
			}
		}
		return input;
	}
	protected onDidAccept(userInput: string) {
		if (userInput) {
			userInput = userInput.toLowerCase();
			const document: TextDocument = (window.activeTextEditor) ? window.activeTextEditor.document : null;
			const line: number = (window.activeTextEditor && window.activeTextEditor.selection && window.activeTextEditor.selection.active) ? window.activeTextEditor.selection.active.line : 0;
			const desc: PvsFormula = { 
				fileName: (document) ? fsUtils.getFileName(document.fileName) : null,
				fileExtension: (document) ? fsUtils.getFileExtension(document.fileName) : null,
				contextFolder: (document) ? fsUtils.getContextFolder(document.fileName) : workspace.rootPath,
				theoryName: (document) ? utils.findTheoryName(document.getText(), line) : null,
				formulaName: (document) ? utils.findFormulaName(document.getText(), line) : null
			};
			switch (userInput) {
				case "add-pvs-library": {
					commands.executeCommand('vscode-pvs.add-pvs-library');
					break;
				}
				case "pvs-library-path":
				case "vscode-pvs.view-pvs-library-path": {
					commands.executeCommand('vscode-pvs.view-pvs-library-path');
					break;
				}
				case "reset-pvs-library-path": {
					commands.executeCommand('vscode-pvs.reset-pvs-library-path');
					break;
				}
				case "show-tccs": {
					desc.fileExtension = ".pvs"; // force file extension, in the case the command is invoked from the .tccs file
					commands.executeCommand('vscode-pvs.show-tccs', desc);
					break;
				}
				case "show-proof-summary": {
					commands.executeCommand('vscode-pvs.show-proof-summary', desc);
					break;
				}
				case "tc": 
				case "typecheck": {
					desc.fileExtension = ".pvs"; // force file extension, in the case the command is invoked from the .tccs file
					commands.executeCommand('vscode-pvs.typecheck-file', desc);
					break;
				}
				case "tcp": 
				case "typecheck-prove": {
					desc.fileExtension = ".pvs"; // force file extension, in the case the command is invoked from the .tccs file
					commands.executeCommand('vscode-pvs.discharge-tccs', desc);
					break;
				}
				case "jtcp": 
				case "jtypecheck-prove": {
					desc.fileExtension = ".pvs"; // force file extension, in the case the command is invoked from the .tccs file
					commands.executeCommand('vscode-pvs.jdischarge-tccs', desc);
					break;
				}
				case "parse": {
					desc.fileExtension = ".pvs"; // force file extension, in the case the command is invoked from the .tccs file
					commands.executeCommand('vscode-pvs.parse-file', desc);
					break;
				}
				case "pr":
				case "prove": {
					commands.executeCommand('vscode-pvs.prove-formula', desc);
					break;
				}
				case "jpr":
				case "jprove": {
					commands.executeCommand('vscode-pvs.jprove-formula', desc);
					break;
				}
				case "prt": 
				case "prove-theory": {
					desc.fileExtension = ".pvs"; // force file extension, in the case the command is invoked from the .tccs file
					commands.executeCommand('vscode-pvs.prove-theory', desc);
					break;
				}
				case "jprt": 
				case "jprove-theory": {
					desc.fileExtension = ".pvs"; // force file extension, in the case the command is invoked from the .tccs file
					commands.executeCommand('vscode-pvs.jprove-theory', desc);
					break;
				}
				case "pri": 
				case "prove-importchain": {
					desc.fileExtension = ".pvs"; // force file extension, in the case the command is invoked from the .tccs file
					commands.executeCommand('vscode-pvs.prove-importchain', desc);
					break;
				}
				case "jpri": 
				case "jprove-importchain": {
					desc.fileExtension = ".pvs"; // force file extension, in the case the command is invoked from the .tccs file
					commands.executeCommand('vscode-pvs.jprove-importchain', desc);
					break;
				}
				case "pvsio": {
					desc.fileExtension = ".pvs"; // force file extension, in the case the command is invoked from the .tccs file
					commands.executeCommand('vscode-pvs.pvsio-evaluator', desc);
					break;
				}
				case "release-notes": 
				case "welcome": 
				case "about": {
					vscodeUtils.showReleaseNotes();
					break;
				}
				case "step-proof": {
					commands.executeCommand('vscode-pvs.prove-formula', desc)
					break;
				}
				case "restart-pvs":
				case "reboot-pvs": {
					commands.executeCommand('vscode-pvs.reboot-pvs');
					break;
				}
				case "install-pvs":
				case "reinstall-pvs": {
					commands.executeCommand('vscode-pvs.install-pvs');
					break;
				}
				case "install-nasalib":
				case "reinstall-nasalib": {
					commands.executeCommand('vscode-pvs.install-nasalib');
					break;
				}
				case "update-nasalib": {
					commands.executeCommand('vscode-pvs.update-nasalib');
					break;
				}
				case "settings": {
					commands.executeCommand('workbench.action.openSettings', '@ext:paolomasci.vscode-pvs');
					break;
				}
				case "set-pvs-path": {
					commands.executeCommand('vscode-pvs.set-pvs-path');
					break;
				}
				case "vpf":
				case "view-prelude-file": {
					commands.executeCommand('vscode-pvs.view-prelude-file');
					break;
				}
				case "clean-bin": {
					commands.executeCommand('vscode-pvs.clean-bin');
					break;
				}
				case "clean-tccs": {
					commands.executeCommand('vscode-pvs.clean-tccs');
					break;
				}
				case "clean-all": {
					commands.executeCommand('vscode-pvs.clean-all');
					break;
				}
				default: {
					window.showWarningMessage(`Command ${userInput} not supported`);
				}
			}
		}
	}
	metaxPrompt (): void {
		this.statusBar.showMsg(this.metax);
		// window.showInputBox({
		// 	prompt: "M-x ",
		// }).then((userInput: string) => {
		this.inputBox = window.createInputBox();
		this.inputBox.prompt = this.metax;
		this.inputBox.onDidAccept(() => {
			this.onDidAccept(this.userInput);
			this.inputBox.dispose();
			this.statusBar.ready();
		});
		this.inputBox.onDidChangeValue((input: string) => {
			// FIXME: VSCode does not seem to capture tabs in the input box??
			this.userInput = this.autocompleteInput(input);
			this.inputBox.prompt = this.metax + this.userInput;
			this.statusBar.showMsg(this.inputBox.prompt);
		});
		this.inputBox.show();
	}
}