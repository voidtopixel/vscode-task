import * as vscode from 'vscode';
import { TaskTreeDataProvider } from '../providers/taskTreeDataProvider.js';
import { Taskfile } from '../models/taskfile.js';
import { taskRuns } from '../services/taskRuns.js';

export class ActivityBar {
    private _provider: TaskTreeDataProvider;

    constructor() {
        // Create the data provider
        this._provider = new TaskTreeDataProvider();

        // Register the tree view with its data provider
        vscode.window.createTreeView('vscode-task.tasks', {
            treeDataProvider: this._provider,
            showCollapseAll: true
        });

        // Re-render the task icons when a run starts or ends
        taskRuns.onDidChange(() => this._provider.refresh());
    }

    public refresh(taskfiles?: Taskfile[], nesting?: boolean): void {
        this._provider.refresh(taskfiles, nesting);
    }
}
