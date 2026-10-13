import * as vscode from 'vscode';
import { Location, Task } from './models.js';
import { settings } from '../utils/settings.js';

export class TaskDefinition implements vscode.TaskDefinition {
    private _task: Task;
    workspace: string;
    readonly type: string = 'taskfile';

    constructor(task: Task, workspace: string) {
        this._task = task;
        this.workspace = workspace;
    }

    // Required to satisfy vscode.TaskDefinition
    public get task(): string {
        return this._task.task;
    }

    public get name(): string {
        return this._task.name;
    }

    public get description(): string {
        return this._task.desc || '';
    }

    public get upToDate(): boolean | undefined {
        return this._task.up_to_date;
    }

    public get location(): Location {
        return this._task.location;
    }

    public toTask(cliArgs?: string[]): vscode.Task {
        cliArgs = cliArgs?.filter(x => x !== "") || [];
        const uri = vscode.Uri.file(this.workspace);
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri) || vscode.TaskScope.Workspace;
        const task = new vscode.Task(
            settings.terminal.newPerRun ? this.toRunDefinition() : this,
            workspaceFolder,
            this.name,
            this.type,
            new vscode.ShellExecution(
                `${settings.path} ${this.task}${cliArgs && cliArgs.length > 0 ? " -- " + cliArgs.join(' ') : ''}`,
                {cwd: this.workspace}
            )
        );
        task.detail = this.description;
        if (settings.terminal.newPerRun) {
            task.presentationOptions = {
                panel: vscode.TaskPanelKind.New,
                reveal: vscode.TaskRevealKind.Always,
                showReuseMessage: false
            };
        }
        return task;
    }

    // VS Code treats tasks with the same definition as the same task: a second run of a task that is still running
    // asks which instance to terminate. A unique `args` entry gives every run its own identity, so runs start
    // side by side, each in its own terminal.
    private toRunDefinition(): vscode.TaskDefinition {
        return {
            type: this.type,
            task: this.task,
            workspace: this.workspace,
            args: [`run-${Date.now()}-${++TaskDefinition.runCounter}`]
        };
    }

    private static runCounter = 0;
}
