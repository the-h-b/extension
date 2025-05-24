"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const ignore_1 = __importDefault(require("ignore"));
const generative_ai_1 = require("@google/generative-ai"); // Corrected import
let startTime = null;
let disposables = [];
let genAI;
let model;
const apiKey = "AIzaSyDhWqQCcO-AtbQ6tihqZaTeQWsgaHohC80";
async function analyzeContent(filePath, fileContent) {
    console.log('Entering analyzeContent'); // Added log
    if (!genAI) {
        console.error("Gemini AI instance is not initialized in analyzeContent.");
        return "Gemini API not initialized.";
    }
    if (!model) {
        console.error("Gemini model is not initialized in analyzeContent.");
        return "Gemini model not initialized.";
    }
    console.log('genAI and model are initialized in analyzeContent'); // Added log
    const prompt = `You are a code reviewer. Analyze the following code and rate it on a scale of 1 to 10, where 1 is very poor and 10 is excellent.
Explain your rating in detail. Also, provide suggestions for improvement. Make this suggestions very specific and actionable.

Code:
\`\`\`
${fileContent}
\`\`\`

Respond with a JSON object.
{
  "rating": <number>,
  "explanation": "<string>",
  "suggestions": "<string>"
}
`;
    try {
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
        });
        const response = result.response;
        const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!responseText) {
            return "No response from Gemini API.";
        }
        try {
            const jsonResponse = JSON.parse(responseText);
            return jsonResponse;
        }
        catch (parseError) {
            console.error("Error parsing Gemini response:", parseError, "Response Text:", responseText);
            return `Error parsing Gemini response. Full response: ${responseText}`;
        }
    }
    catch (error) {
        console.error("Error calling Gemini API in analyzeContent:", error);
        return `Error calling Gemini API: ${error.message || error}`;
    }
}
function countLines(filePath) {
    try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        return fileContent.split('\n').length;
    }
    catch (error) {
        console.error(`Error reading file ${filePath}: ${error}`);
        return 0;
    }
}
function getLanguage(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    switch (extension) {
        case '.js': return 'JavaScript';
        case '.ts': return 'TypeScript';
        case '.html': return 'HTML';
        case '.css': return 'CSS';
        case '.py': return 'Python';
        case '.java': return 'Java';
        case '.c': return 'C';
        case '.cpp': return 'C++';
        case '.go': return 'Go';
        case '.rs': return 'Rust';
        case '.php': return 'PHP';
        case '.rb': return 'Ruby';
        case '.swift': return 'Swift';
        case '.kt': return 'Kotlin';
        case '.sh': return 'Shell Script';
        case '.md': return 'Markdown';
        case '.json': return 'JSON';
        case '.xml': return 'XML';
        case '.yaml':
        case '.yml': return 'YAML';
        case '.tsx': return 'TypeScriptReact';
        case '.jsx': return 'JavaScriptReact';
        default: return 'Unknown';
    }
}
function createIgnoreFilter(rootPath) {
    const gitignorePath = path.join(rootPath, '.gitignore');
    const ig = (0, ignore_1.default)();
    try {
        const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
        ig.add(gitignoreContent);
    }
    catch {
        // Ignore if file doesn't exist
    }
    ig.add(['.venv/', '.env/']);
    return (relativePath) => ig.ignores(relativePath);
}
async function traverseDirectory(dir, projectInfo, isIgnored) {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const relativePath = path.relative(projectInfo.rootPath, fullPath);
        if (isIgnored(relativePath))
            continue;
        const stats = fs.statSync(fullPath);
        if (stats.isDirectory()) {
            projectInfo.directoryCount++;
            await traverseDirectory(fullPath, projectInfo, isIgnored);
        }
        else if (stats.isFile()) {
            projectInfo.fileCount++;
            const language = getLanguage(fullPath);
            projectInfo.languages[language] = (projectInfo.languages[language] || 0) + 1;
            projectInfo.totalLines += countLines(fullPath);
            projectInfo.files.push(relativePath);
            try {
                const fileContent = fs.readFileSync(fullPath, 'utf-8');
                const aiRating = await analyzeContent(fullPath, fileContent);
                projectInfo.aiRatings[relativePath] = aiRating;
            }
            catch (error) {
                console.error(`Error processing ${relativePath}: ${error}`);
                projectInfo.aiRatings[relativePath] = "Error processing file";
            }
        }
    }
}
function exportProjectInfo(projectInfo) {
    const outputChannel = vscode.window.createOutputChannel('Project Analysis');
    outputChannel.show();
    outputChannel.appendLine('Project Information:');
    outputChannel.appendLine(JSON.stringify(projectInfo, null, 2));
    outputChannel.appendLine('\nAI Content Ratings:');
    for (const [filePath, rating] of Object.entries(projectInfo.aiRatings)) {
        if (typeof rating === 'object') {
            outputChannel.appendLine(`\nFile: ${filePath}`);
            outputChannel.appendLine(JSON.stringify(rating, null, 2));
        }
        else {
            outputChannel.appendLine(`${filePath}: ${rating}`);
        }
    }
}
function disableCopyPaste() {
    disposables.push(vscode.commands.registerCommand('editor.action.clipboardCopyAction', () => {
        vscode.window.showInformationMessage('Copy action is temporarily disabled.');
    }), vscode.commands.registerCommand('editor.action.clipboardCutAction', () => {
        vscode.window.showInformationMessage('Cut action is temporarily disabled.');
    }), vscode.commands.registerCommand('editor.action.clipboardPasteAction', () => {
        vscode.window.showInformationMessage('Paste action is temporarily disabled.');
    }));
    vscode.workspace.onDidChangeTextDocument(() => {
        vscode.commands.executeCommand('setContext', 'editorTextFocus', false);
    });
}
function enableCopyPaste() {
    disposables.forEach(disposable => disposable.dispose());
    disposables = [];
    vscode.commands.executeCommand('setContext', 'editorTextFocus', true);
}
function activate(context) {
    console.log('Activating extension "project-analyzer"');
    let localGenAI;
    let localModel;
    try {
        localGenAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
        console.log('GoogleGenerativeAI initialized');
        localModel = localGenAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        console.log("Gemini model initialized:", localModel);
        genAI = localGenAI; // Assign to global only if successful
        model = localModel; // Assign to global only if successful
    }
    catch (error) {
        console.error("Failed to initialize Gemini API:", error);
        vscode.window.showErrorMessage(`Failed to initialize Gemini API: ${error}`);
        genAI = undefined;
        model = undefined;
    }
    const startDisposable = vscode.commands.registerCommand('extension.startTimer', () => {
        startTime = Date.now();
        vscode.window.showInformationMessage('Timer started. Click "Submit" when you are done.');
    });
    const submitDisposable = vscode.commands.registerCommand('extension.submitTimeAndAnalyze', async () => {
        if (startTime === null) {
            vscode.window.showErrorMessage('Please start the timer first.');
            return;
        }
        const endTime = Date.now();
        const totalTime = (endTime - startTime) / 1000;
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No project workspace is open.');
            return;
        }
        const rootPath = workspaceFolders[0].uri.fsPath;
        const projectInfo = {
            projectName: path.basename(rootPath),
            rootPath: rootPath,
            fileCount: 0,
            directoryCount: 0,
            totalLines: 0,
            languages: {},
            elapsedTime: 0,
            files: [],
            totalTime: totalTime,
            aiRatings: {},
        };
        const isIgnored = createIgnoreFilter(rootPath);
        await traverseDirectory(rootPath, projectInfo, isIgnored);
        projectInfo.elapsedTime = Date.now() - endTime;
        disableCopyPaste();
        exportProjectInfo(projectInfo);
        vscode.window.showInformationMessage(`Project analysis complete. See the "Project Analysis" output channel for results. Total time: ${totalTime.toFixed(2)} seconds. Copy/paste is temporarily disabled.`);
        setTimeout(() => {
            enableCopyPaste();
        }, 2000);
        startTime = null;
    });
    // Register the 'extension.analyzeProject' command
    const analyzeProjectDisposable = vscode.commands.registerCommand('extension.analyzeProject', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No project workspace is open.');
            return;
        }
        const rootPath = workspaceFolders[0].uri.fsPath;
        const projectInfo = {
            projectName: path.basename(rootPath),
            rootPath: rootPath,
            fileCount: 0,
            directoryCount: 0,
            totalLines: 0,
            languages: {},
            elapsedTime: 0,
            files: [],
            totalTime: 0,
            aiRatings: {},
        };
        const isIgnored = createIgnoreFilter(rootPath);
        await traverseDirectory(rootPath, projectInfo, isIgnored);
        projectInfo.elapsedTime = 0;
        disableCopyPaste();
        exportProjectInfo(projectInfo);
        vscode.window.showInformationMessage(`Project analysis complete. See the "Project Analysis" output channel for results.`);
        setTimeout(() => {
            enableCopyPaste();
        }, 2000);
    });
    context.subscriptions.push(startDisposable, submitDisposable, analyzeProjectDisposable);
}
function deactivate() {
    enableCopyPaste();
}
// import * as vscode from 'vscode';
// import * as fs from 'fs';
// import * as path from 'path';
// import ignore from 'ignore';
// const { GoogleGenerativeAI } = require("@google/generative-ai");
// interface ProjectInfo {
//     projectName: string;
//     rootPath: string;
//     fileCount: number;
//     directoryCount: number;
//     totalLines: number;
//     languages: { [language: string]: number };
//     elapsedTime: number;
//     files: string[];
//     totalTime: number;
//     aiRatings: { [filePath: string]: number | string | object };
// }
// let startTime: number | null = null;
// let disposables: vscode.Disposable[] = [];
// let genAI: any;
// let model: any;
// const apiKey = "AIzaSyDhWqQCcO-AtbQ6tihqZaTeQWsgaHohC80";
// async function analyzeContent(filePath: string, fileContent: string): Promise<number | string | object> {
//     if (!genAI) {
//         return "Gemini API not initialized.";
//     }
//     const prompt = `You are a code reviewer. Analyze the following code and rate it on a scale of 1 to 10, where 1 is very poor and 10 is excellent.
// Explain your rating in detail. Also, provide suggestions for improvement.
// Code:
// \`\`\`
// ${fileContent}
// \`\`\`
// Respond with a JSON object.
// {
//   "rating": <number>,
//   "explanation": "<string>",
//   "suggestions": "<string>"
// }
// `;
//     try {
//         const result = await model.generateContent({
//             contents: [{ role: "user", parts: [{ text: prompt }] }],
//         });
//         const response = result.response;
//         const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text;
//         if (!responseText) {
//             return "No response from Gemini API.";
//         }
//         try {
//             const jsonResponse = JSON.parse(responseText);
//             return jsonResponse;
//         } catch (parseError) {
//             console.error("Error parsing Gemini response:", parseError, "Response Text:", responseText);
//             return `Error parsing Gemini response. Full response: ${responseText}`;
//         }
//     } catch (error: any) {
//         console.error("Error calling Gemini API:", error);
//         return `Error calling Gemini API: ${error.message || error}`;
//     }
// }
// function countLines(filePath: string): number {
//     try {
//         const fileContent = fs.readFileSync(filePath, 'utf-8');
//         return fileContent.split('\n').length;
//     } catch (error) {
//         console.error(`Error reading file ${filePath}: ${error}`);
//         return 0;
//     }
// }
// function getLanguage(filePath: string): string {
//     const extension = path.extname(filePath).toLowerCase();
//     switch (extension) {
//         case '.js': return 'JavaScript';
//         case '.ts': return 'TypeScript';
//         case '.html': return 'HTML';
//         case '.css': return 'CSS';
//         case '.py': return 'Python';
//         case '.java': return 'Java';
//         case '.c': return 'C';
//         case '.cpp': return 'C++';
//         case '.go': return 'Go';
//         case '.rs': return 'Rust';
//         case '.php': return 'PHP';
//         case '.rb': return 'Ruby';
//         case '.swift': return 'Swift';
//         case '.kt': return 'Kotlin';
//         case '.sh': return 'Shell Script';
//         case '.md': return 'Markdown';
//         case '.json': return 'JSON';
//         case '.xml': return 'XML';
//         case '.yaml':
//         case '.yml': return 'YAML';
//         case '.tsx': return 'TypeScriptReact';
//         case '.jsx': return 'JavaScriptReact';
//         default: return 'Unknown';
//     }
// }
// function createIgnoreFilter(rootPath: string): (relativePath: string) => boolean {
//     const gitignorePath = path.join(rootPath, '.gitignore');
//     const ig = ignore();
//     try {
//         const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
//         ig.add(gitignoreContent);
//     } catch {
//         // Ignore if file doesn't exist
//     }
//     ig.add(['.venv/', '.env/']);
//     return (relativePath: string) => ig.ignores(relativePath);
// }
// async function traverseDirectory(dir: string, projectInfo: ProjectInfo, isIgnored: (relPath: string) => boolean): Promise<void> {
//     const entries = fs.readdirSync(dir);
//     for (const entry of entries) {
//         const fullPath = path.join(dir, entry);
//         const relativePath = path.relative(projectInfo.rootPath, fullPath);
//         if (isIgnored(relativePath)) continue;
//         const stats = fs.statSync(fullPath);
//         if (stats.isDirectory()) {
//             projectInfo.directoryCount++;
//             await traverseDirectory(fullPath, projectInfo, isIgnored);
//         } else if (stats.isFile()) {
//             projectInfo.fileCount++;
//             const language = getLanguage(fullPath);
//             projectInfo.languages[language] = (projectInfo.languages[language] || 0) + 1;
//             projectInfo.totalLines += countLines(fullPath);
//             projectInfo.files.push(relativePath);
//             try {
//                 const fileContent = fs.readFileSync(fullPath, 'utf-8');
//                 const aiRating = await analyzeContent(fullPath, fileContent);
//                 projectInfo.aiRatings[relativePath] = aiRating;
//             } catch (error) {
//                 console.error(`Error processing ${relativePath}: ${error}`);
//                 projectInfo.aiRatings[relativePath] = "Error processing file";
//             }
//         }
//     }
// }
// function exportProjectInfo(projectInfo: ProjectInfo): void {
//     const outputChannel = vscode.window.createOutputChannel('Project Analysis');
//     outputChannel.show();
//     outputChannel.appendLine('Project Information:');
//     outputChannel.appendLine(JSON.stringify(projectInfo, null, 2));
//     outputChannel.appendLine('\nAI Content Ratings:');
//     for (const [filePath, rating] of Object.entries(projectInfo.aiRatings)) {
//         if (typeof rating === 'object') {
//             outputChannel.appendLine(`\nFile: ${filePath}`);
//             outputChannel.appendLine(JSON.stringify(rating, null, 2));
//         } else {
//             outputChannel.appendLine(`${filePath}: ${rating}`);
//         }
//     }
// }
// function disableCopyPaste(): void {
//     disposables.push(
//         vscode.commands.registerCommand('editor.action.clipboardCopyAction', () => {
//             vscode.window.showInformationMessage('Copy action is temporarily disabled.');
//         }),
//         vscode.commands.registerCommand('editor.action.clipboardCutAction', () => {
//             vscode.window.showInformationMessage('Cut action is temporarily disabled.');
//         }),
//         vscode.commands.registerCommand('editor.action.clipboardPasteAction', () => {
//             vscode.window.showInformationMessage('Paste action is temporarily disabled.');
//         })
//     );
//     vscode.workspace.onDidChangeTextDocument(() => {
//         vscode.commands.executeCommand('setContext', 'editorTextFocus', false);
//     });
// }
// function enableCopyPaste(): void {
//     disposables.forEach(disposable => disposable.dispose());
//     disposables = [];
//     vscode.commands.executeCommand('setContext', 'editorTextFocus', true);
// }
// export function activate(context: vscode.ExtensionContext) {
//     try {
//         genAI = new GoogleGenerativeAI(apiKey);
//         model = genAI.getModel({ model: "gemini-2.0-flash" });  
//         console.log("Gemini API initialized");
//     } catch (error) {
//         console.error("Failed to initialize Gemini API:", error);
//         vscode.window.showErrorMessage("Failed to initialize Gemini API. Code analysis will be limited.");
//     }
//     const startDisposable = vscode.commands.registerCommand('extension.startTimer', () => {
//         startTime = Date.now();
//         vscode.window.showInformationMessage('Timer started. Click \"Submit\" when you are done.');
//     });
//     const submitDisposable = vscode.commands.registerCommand('extension.submitTimeAndAnalyze', async () => {
//         if (startTime === null) {
//             vscode.window.showErrorMessage('Please start the timer first.');
//             return;
//         }
//         const endTime = Date.now();
//         const totalTime = (endTime - startTime) / 1000;
//         const workspaceFolders = vscode.workspace.workspaceFolders;
//         if (!workspaceFolders || workspaceFolders.length === 0) {
//             vscode.window.showErrorMessage('No project workspace is open.');
//             return;
//         }
//         const rootPath = workspaceFolders[0].uri.fsPath;
//         const projectInfo: ProjectInfo = {
//             projectName: path.basename(rootPath),
//             rootPath: rootPath,
//             fileCount: 0,
//             directoryCount: 0,
//             totalLines: 0,
//             languages: {},
//             elapsedTime: 0,
//             files: [],
//             totalTime: totalTime,
//             aiRatings: {},
//         };
//         const isIgnored = createIgnoreFilter(rootPath);
//         await traverseDirectory(rootPath, projectInfo, isIgnored);
//         projectInfo.elapsedTime = Date.now() - endTime;
//         disableCopyPaste();
//         exportProjectInfo(projectInfo);
//         vscode.window.showInformationMessage(`Project analysis complete. See the \"Project Analysis\" output channel for results. Total time: ${totalTime.toFixed(2)} seconds. Copy/paste is temporarily disabled.`);
//         setTimeout(() => {
//             enableCopyPaste();
//         }, 2000);
//         startTime = null;
//     });
//     // Register the 'extension.analyzeProject' command
//     const analyzeProjectDisposable = vscode.commands.registerCommand('extension.analyzeProject', async () => {
//         const workspaceFolders = vscode.workspace.workspaceFolders;
//         if (!workspaceFolders || workspaceFolders.length === 0) {
//             vscode.window.showErrorMessage('No project workspace is open.');
//             return;
//         }
//         const rootPath = workspaceFolders[0].uri.fsPath;
//         const projectInfo: ProjectInfo = {
//             projectName: path.basename(rootPath),
//             rootPath: rootPath,
//             fileCount: 0,
//             directoryCount: 0,
//             totalLines: 0,
//             languages: {},
//             elapsedTime: 0,
//             files: [],
//             totalTime: 0,
//             aiRatings: {},
//         };
//         const isIgnored = createIgnoreFilter(rootPath);
//         await traverseDirectory(rootPath, projectInfo, isIgnored);
//         projectInfo.elapsedTime = 0;
//         disableCopyPaste();
//         exportProjectInfo(projectInfo);
//         vscode.window.showInformationMessage(`Project analysis complete. See the \"Project Analysis\" output channel for results.`);
//         setTimeout(() => {
//             enableCopyPaste();
//         }, 2000);
//     });
//     context.subscriptions.push(startDisposable, submitDisposable, analyzeProjectDisposable); // Add analyzeProjectDisposable to subscriptions
// }
// export function deactivate() {
//     enableCopyPaste();
// }
// REAL CODE STARTS HERE
// import * as vscode from 'vscode';
// import * as fs from 'fs';
// import * as path from 'path';
// import ignore from 'ignore';
// interface ProjectInfo {
//     projectName: string;
//     rootPath: string;
//     fileCount: number;
//     directoryCount: number;
//     totalLines: number;
//     languages: { [language: string]: number };
//     elapsedTime: number;
//     files: string[]; // Add this to store file paths
// }
// // Helper function to count lines of code in a file
// function countLines(filePath: string): number {
//     try {
//         const fileContent = fs.readFileSync(filePath, 'utf-8');
//         return fileContent.split('\n').length;
//     } catch (error) {
//         // Handle errors, e.g., file not found or encoding issues.  Crucially, *return 0*.
//         console.error(`Error reading file ${filePath}: ${error}`);
//         return 0;
//     }
// }
// // Helper function to get the language of a file based on its extension
// function getLanguage(filePath: string): string {
//     const extension = path.extname(filePath).toLowerCase();
//     switch (extension) {
//         case '.js': return 'JavaScript';
//         case '.ts': return 'TypeScript';
//         case '.html': return 'HTML';
//         case '.css': return 'CSS';
//         case '.py': return 'Python';
//         case '.java': return 'Java';
//         case '.c': return 'C';
//         case '.cpp': return 'C++';
//         case '.go': return 'Go';
//         case '.rs': return 'Rust';
//         case '.php': return 'PHP';
//         case '.rb': return 'Ruby';
//         case '.swift': return 'Swift';
//         case '.kt': return 'Kotlin';
//         case '.sh': return 'Shell Script';
//         case '.md': return 'Markdown';
//         case '.json': return 'JSON';
//         case '.xml': return 'XML';
//         case '.yaml':
//         case '.yml': return 'YAML';
//         case '.tsx': return 'TypeScriptReact';
//         case '.jsx': return 'JavaScriptReact';
//         default: return 'Unknown';
//     }
// }
// // Function to recursively traverse a directory and collect file information, with .gitignore support
// function traverseDirectory(dir: string, projectInfo: ProjectInfo, ignoredPaths: string[]): void {
//     const files = fs.readdirSync(dir);
//     for (const file of files) {
//         const filePath = path.join(dir, file);
//         const relativePath = path.relative(projectInfo.rootPath, filePath); // Get relative path
//         const isIgnored = ignoredPaths.some(ignoredPath => relativePath.startsWith(ignoredPath));
//         if (isIgnored) {
//             continue; // Skip ignored files and directories
//         }
//         const stats = fs.statSync(filePath);
//         if (stats.isDirectory()) {
//             projectInfo.directoryCount++;
//             traverseDirectory(filePath, projectInfo, ignoredPaths); // Recurse into subdirectory
//         } else if (stats.isFile()) {
//             projectInfo.fileCount++;
//             const language = getLanguage(filePath);
//             projectInfo.languages[language] = (projectInfo.languages[language] || 0) + 1;
//             projectInfo.totalLines += countLines(filePath);
//             projectInfo.files.push(relativePath); // Store the relative path
//         }
//     }
// }
// /**
//  * Reads .gitignore and returns an array of paths to ignore.
//  * Handles errors like file not found.
//  */
// function readGitignore(rootPath: string): string[] {
//     const gitignorePath = path.join(rootPath, '.gitignore');
//     try {
//         const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
//         // Use the 'ignore' library to parse .gitignore syntax
//         const ig = ignore();
//         ig.add(gitignoreContent);
//         return ig.filter(gitignoreContent.split('\n')); // Pass the array of lines
//     } catch (error) {
//         if (error instanceof Error && (error as any).code === 'ENOENT') {
//             // .gitignore does not exist.  Return an empty array.
//             return [];
//         } else {
//             // Some other error occurred.  Log it, and return an empty array to avoid crashing.
//             console.error(`Error reading .gitignore: ${error}`);
//             return [];
//         }
//     }
// }
// // Function to export project information (currently logs to console)
// function exportProjectInfo(projectInfo: ProjectInfo): void {
//     // In a real extension, you would send this data to a database or API.
//     //  Here, we just log it to the console.  You'll need to adapt this.
//     console.log('Project Information:');
//     console.log(JSON.stringify(projectInfo, null, 2));
//     // Example of how you might send data to a server (replace with your actual endpoint and method)
//     // const apiUrl = 'your-api-endpoint';
//     // fetch(apiUrl, {
//     //     method: 'POST',
//     //     headers: {
//     //         'Content-Type': 'application/json',
//     //     },
//     //     body: JSON.stringify(projectInfo),
//     // })
//     // .then(response => response.json())
//     // .then(data => console.log('Data sent successfully:', data))
//     // .catch(error => console.error('Error sending data:', error));
// }
// let disposables: vscode.Disposable[] = []; // Array to hold disposables for cleanup
// // Function to attempt to disable copy/paste
// function disableCopyPaste(): void {
//     // This is a workaround, as VS Code doesn't provide a direct way to disable copy/paste.
//     // It tries to intercept the commands and prevent them from executing.
//     // This might not be fully reliable and could have side effects.
//     disposables.push(
//         vscode.commands.registerCommand('editor.action.clipboardCopyAction', () => {
//             vscode.window.showInformationMessage('Copy action is temporarily disabled.');
//         }),
//         vscode.commands.registerCommand('editor.action.clipboardCutAction', () => {
//             vscode.window.showInformationMessage('Cut action is temporarily disabled.');
//         }),
//         vscode.commands.registerCommand('editor.action.clipboardPasteAction', () => {
//             vscode.window.showInformationMessage('Paste action is temporarily disabled.');
//         })
//     );
//     // Suppress context menu commands as well
//     vscode.workspace.onDidChangeTextDocument((event) => {
//         // This will prevent the user from being able to use the context menu.
//          vscode.commands.executeCommand('setContext', 'editorTextFocus', false);
//     })
// }
// // Function to re-enable copy/paste
// function enableCopyPaste(): void {
//     // Dispose of the command registrations to restore the original behavior.
//     disposables.forEach(disposable => disposable.dispose());
//     disposables = []; // Clear the array
//     vscode.commands.executeCommand('setContext', 'editorTextFocus', true);
// }
// // This function is called when the extension is activated
// export function activate(context: vscode.ExtensionContext) {
//     let disposable = vscode.commands.registerCommand('extension.analyzeProject', () => {
//         if (!vscode.workspace.rootPath) {
//             vscode.window.showErrorMessage('No project workspace is open.');
//             return;
//         }
//         const rootPath = vscode.workspace.rootPath;
//         const startTime = Date.now();
//         const projectInfo: ProjectInfo = {
//             projectName: path.basename(rootPath),
//             rootPath: rootPath,
//             fileCount: 0,
//             directoryCount: 0,
//             totalLines: 0,
//             languages: {},
//             elapsedTime: 0,
//             files: [], // Initialize the files array
//         };
//         const ignoredPaths = readGitignore(rootPath);
//         traverseDirectory(rootPath, projectInfo, ignoredPaths);
//         projectInfo.elapsedTime = Date.now() - startTime;
//         // Attempt to disable copy/paste
//         disableCopyPaste();
//         exportProjectInfo(projectInfo);
//         vscode.window.showInformationMessage('Project analysis complete.  See console for results. Copy/paste is temporarily disabled.');
//         // Re-enable copy/paste after the analysis is complete (you might need to adjust the timing)
//         setTimeout(() => {
//             enableCopyPaste();
//         }, 2000); //  2 seconds. Adjust as necessary.
//     });
//     context.subscriptions.push(disposable);
// }
// // This function is called when the extension is deactivated
// export function deactivate() {
//     // Clean up any resources, including our command registrations
//     enableCopyPaste(); // Ensure copy/paste is re-enabled when the extension is deactivated
// }
//# sourceMappingURL=extension.js.map