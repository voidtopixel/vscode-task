import * as vscode from 'vscode';
import { log } from '../utils/log.js';

// How long stop() waits for VS Code to report the terminated runs as ended
const stopTimeoutMs = 5000;

interface TaskRunState {
    executions: vscode.TaskExecution[];
    lastExitCode?: number;
    lastCliArgs?: string[];
}

// Identifies a Taskfile task across runs: the directory of its Taskfile plus the task name
export interface TaskRef {
    workspace: string;
    task: string;
}

// Tracks the runs of Taskfile tasks (started from the tree, the pickers or VS Code's "Run Task") so the tree view
// can show which tasks are running or failed, and stop or restart them.
class TaskRunService {
    private static _instance: TaskRunService;
    private _runs = new Map<string, TaskRunState>();
    private _onDidChange = new vscode.EventEmitter<void>();
    readonly onDidChange: vscode.Event<void> = this._onDidChange.event;

    public static get instance() {
        return this._instance ?? (this._instance = new this());
    }

    public register(context: vscode.ExtensionContext): void {
        // Runs that outlived a reload of the extension host
        for (const execution of vscode.tasks.taskExecutions) {
            this.add(execution);
        }
        context.subscriptions.push(
            vscode.tasks.onDidStartTask(e => this.add(e.execution)),
            vscode.tasks.onDidEndTaskProcess(e => {
                const key = keyOf(e.execution.task);
                if (key) {
                    // undefined when the run was terminated
                    this.state(key).lastExitCode = e.exitCode;
                }
            }),
            vscode.tasks.onDidEndTask(e => this.remove(e.execution)),
            this._onDidChange
        );
    }

    public runningCount(ref: TaskRef): number {
        return this._runs.get(refKey(ref))?.executions.length ?? 0;
    }

    public lastRunFailed(ref: TaskRef): boolean {
        const exitCode = this._runs.get(refKey(ref))?.lastExitCode;
        return exitCode !== undefined && exitCode !== 0;
    }

    public rememberArgs(ref: TaskRef, cliArgs?: string[]): void {
        this.state(refKey(ref)).lastCliArgs = cliArgs;
    }

    public lastArgs(ref: TaskRef): string[] | undefined {
        return this._runs.get(refKey(ref))?.lastCliArgs;
    }

    // Terminates every running instance of the task and resolves once VS Code reports them ended (or on timeout)
    public async stop(ref: TaskRef): Promise<void> {
        const key = refKey(ref);
        const executions = [...(this._runs.get(key)?.executions ?? [])];
        if (executions.length === 0) {
            return;
        }
        log.info(`Stopping ${executions.length} run(s) of "${ref.task}"`);
        const ended = new Promise<void>(resolve => {
            const timer = setTimeout(() => { listener.dispose(); resolve(); }, stopTimeoutMs);
            const listener = this.onDidChange(() => {
                if (this.runningCount(ref) === 0) {
                    clearTimeout(timer);
                    listener.dispose();
                    resolve();
                }
            });
        });
        executions.forEach(execution => execution.terminate());
        await ended;
    }

    private add(execution: vscode.TaskExecution): void {
        const key = keyOf(execution.task);
        if (!key) {
            return;
        }
        const state = this.state(key);
        if (!state.executions.includes(execution)) {
            state.executions.push(execution);
        }
        state.lastExitCode = undefined;
        this._onDidChange.fire();
    }

    private remove(execution: vscode.TaskExecution): void {
        const key = keyOf(execution.task);
        const state = key ? this._runs.get(key) : undefined;
        if (!state) {
            return;
        }
        const index = state.executions.findIndex(x => x === execution || x.task === execution.task);
        if (index >= 0) {
            state.executions.splice(index, 1);
        }
        this._onDidChange.fire();
    }

    private state(key: string): TaskRunState {
        let state = this._runs.get(key);
        if (!state) {
            state = { executions: [] };
            this._runs.set(key, state);
        }
        return state;
    }
}

function refKey(ref: TaskRef): string {
    return `${ref.workspace}::${ref.task}`;
}

// The ref of a Taskfile task run, or undefined for tasks of other types
function keyOf(task: vscode.Task): string | undefined {
    const definition = task.definition;
    if (definition.type !== 'taskfile' || !definition.task) {
        return undefined;
    }
    const scope = task.scope;
    const workspace: string = definition.workspace
        ?? (scope !== undefined && typeof scope === 'object' ? scope.uri.fsPath : '');
    return refKey({ workspace, task: definition.task });
}

export const taskRuns = TaskRunService.instance;
