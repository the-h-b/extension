import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import ignore from 'ignore';
import { GoogleGenerativeAI } from "@google/generative-ai";

interface ProjectInfo {
    projectName: string;
    rootPath: string;
    fileCount: number;
    directoryCount: number;
    totalLines: number;
    languages: { [language: string]: number };
    elapsedTime: number;
    files: string[];
    aiRatings: { [filePath: string]: number | string | object };
}

let genAI: any;
let model: any;
const apiKey = "AIzaSyDhWqQCcO-AtbQ6tihqZaTeQWsgaHohC80";

async function analyzeContent(filePath: string, fileContent: string): Promise<number | string | object> {
    console.log('Entering analyzeContent');
    if (!genAI || !model) {
        console.error("Gemini AI or model is not initialized.");
        return "Gemini API or model not initialized.";
    }

    const prompt = `You are a code reviewer. Analyze the following code and rate it on a scale of 1 to 10, where 1 is very poor and 10 is excellent. Make this suggestions very specific and actionable.

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
        } catch (parseError) {
            console.error("Error parsing Gemini response:", parseError, "Response Text:", responseText);
            return `Error parsing Gemini response. Full response: ${responseText}`;
        }
    } catch (error: any) {
        console.error("Error calling Gemini API in analyzeContent:", error);
        return `Error calling Gemini API: ${error.message || error}`;
    }
}

function countLines(filePath: string): number {
    try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        return fileContent.split('\n').length;
    } catch (error) {
        console.error(`Error reading file ${filePath}: ${error}`);
        return 0;
    }
}

function getLanguage(filePath: string): string {
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

function createIgnoreFilter(rootPath: string): (relativePath: string) => boolean {
    const gitignorePath = path.join(rootPath, '.gitignore');
    const ig = ignore();

    try {
        const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
        ig.add(gitignoreContent);
    } catch {
        // Ignore if file doesn't exist
    }

    ig.add(['.venv/', '.env/']);
    return (relativePath: string) => ig.ignores(relativePath);
}

async function traverseDirectory(dir: string, projectInfo: ProjectInfo, isIgnored: (relPath: string) => boolean): Promise<void> {
    const entries = fs.readdirSync(dir);

    for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const relativePath = path.relative(projectInfo.rootPath, fullPath);

        if (isIgnored(relativePath)) continue;

        const stats = fs.statSync(fullPath);

        if (stats.isDirectory()) {
            projectInfo.directoryCount++;
            await traverseDirectory(fullPath, projectInfo, isIgnored);
        } else if (stats.isFile()) {
            projectInfo.fileCount++;
            const language = getLanguage(fullPath);
            projectInfo.languages[language] = (projectInfo.languages[language] || 0) + 1;
            projectInfo.totalLines += countLines(fullPath);
            projectInfo.files.push(relativePath);

            try {
                const fileContent = fs.readFileSync(fullPath, 'utf-8');
                const aiRating = await analyzeContent(fullPath, fileContent);
                projectInfo.aiRatings[relativePath] = aiRating;
            } catch (error) {
                console.error(`Error processing ${relativePath}: ${error}`);
                projectInfo.aiRatings[relativePath] = "Error processing file";
            }
        }
    }
}

function exportProjectInfo(projectInfo: ProjectInfo): void {
    const outputChannel = vscode.window.createOutputChannel('Project Analysis');
    outputChannel.show();
    outputChannel.appendLine('Project Information:');
    outputChannel.appendLine(JSON.stringify(projectInfo, null, 2));
    outputChannel.appendLine('\nAI Content Ratings:');

    for (const [filePath, rating] of Object.entries(projectInfo.aiRatings)) {
        if (typeof rating === 'object') {
            outputChannel.appendLine(`\nFile: ${filePath}`);
            outputChannel.appendLine(JSON.stringify(rating, null, 2));
        } else {
            outputChannel.appendLine(`${filePath}: ${rating}`);
        }
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Activating extension "project-analyzer"');
    vscode.window.showInformationMessage('Project Analyzer extension is now active');

    // Create Analyze Project status bar item
    const analyzeStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
    analyzeStatusBarItem.text = '$(beaker) Analyze';
    analyzeStatusBarItem.tooltip = 'Analyze project code quality';
    analyzeStatusBarItem.command = 'extension.analyzeProject';
    analyzeStatusBarItem.show();

    console.log('Created Analyze Project status bar item');
    context.subscriptions.push(analyzeStatusBarItem);

    let localGenAI: GoogleGenerativeAI | undefined;
    let localModel: any;
    try {
        localGenAI = new GoogleGenerativeAI(apiKey);
        console.log('GoogleGenerativeAI initialized');
        localModel = localGenAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        console.log("Gemini model initialized:", localModel);
        genAI = localGenAI;
        model = localModel;
    } catch (error) {
        console.error("Failed to initialize Gemini API:", error);
        vscode.window.showErrorMessage(`Failed to initialize Gemini API: ${error}`);
    }

    const analyzeProjectDisposable = vscode.commands.registerCommand('extension.analyzeProject', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No project workspace is open.');
            return;
        }

        const rootPath = workspaceFolders[0].uri.fsPath;
        const projectInfo: ProjectInfo = {
            projectName: path.basename(rootPath),
            rootPath: rootPath,
            fileCount: 0,
            directoryCount: 0,
            totalLines: 0,
            languages: {},
            elapsedTime: 0,
            files: [],
            aiRatings: {},
        };

        const isIgnored = createIgnoreFilter(rootPath);
        await traverseDirectory(rootPath, projectInfo, isIgnored);

        exportProjectInfo(projectInfo);
        vscode.window.showInformationMessage(`Project analysis complete. See the "Project Analysis" output channel for results.`);
    });

    context.subscriptions.push(analyzeProjectDisposable);
}

export function deactivate() {}
