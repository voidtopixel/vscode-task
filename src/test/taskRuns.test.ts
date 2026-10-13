import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { TaskTreeItem } from '../elements/treeItem.js';
import { TaskDefinition } from '../models/taskDefinition.js';
import { taskfileSvc } from '../services/taskfile.js';
import { taskRuns } from '../services/taskRuns.js';

const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';

function definition(task: string): TaskDefinition {
    return new TaskDefinition({
        name: task,
        task,
        desc: '',
        summary: '',
        // eslint-disable-next-line @typescript-eslint/naming-convention
        up_to_date: undefined,
        location: { taskfile: path.join(workspace, 'Taskfile.yml'), line: 1, column: 1 }
    }, workspace);
}

async function waitFor(condition: () => boolean, what: string, timeoutMs = 15000): Promise<void> {
    const start = Date.now();
    while (!condition()) {
        if (Date.now() - start > timeoutMs) {
            assert.fail(`timed out waiting for: ${what}`);
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}

suite('Task runs', function () {
    this.timeout(60000);

    suiteSetup(async () => {
        await vscode.extensions.getExtension('task.vscode-task')?.activate();
    });

    teardown(async () => {
        await taskRuns.stop(definition('long-running'));
    });

    test('runs the same task twice side by side and stops both', async () => {
        const def = definition('long-running');
        await taskfileSvc.runTask(def);
        await waitFor(() => taskRuns.runningCount(def) === 1, 'first run');
        await taskfileSvc.runTask(def);
        await waitFor(() => taskRuns.runningCount(def) === 2, 'second run alongside the first');

        const item = new TaskTreeItem('long-running', workspace, def, vscode.TreeItemCollapsibleState.None);
        assert.strictEqual(item.contextValue, 'taskTreeItem.running');
        assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, 'loading~spin');
        assert.match(String(item.description), /running ×2/);

        await taskRuns.stop(def);
        assert.strictEqual(taskRuns.runningCount(def), 0);
        assert.strictEqual(taskRuns.lastRunFailed(def), false, 'a stopped run is not a failure');
        const stopped = new TaskTreeItem('long-running', workspace, def, vscode.TreeItemCollapsibleState.None);
        assert.strictEqual(stopped.contextValue, 'taskTreeItem');
    });

    test('marks a task whose last run failed', async () => {
        const def = definition('failing');
        let ended = false;
        const listener = vscode.tasks.onDidEndTask(e => {
            if (e.execution.task.definition.task === 'failing') {
                ended = true;
            }
        });
        await taskfileSvc.runTask(def);
        await waitFor(() => ended, 'failing run to end');
        listener.dispose();

        assert.strictEqual(taskRuns.lastRunFailed(def), true);
        const item = new TaskTreeItem('failing', workspace, def, vscode.TreeItemCollapsibleState.None);
        assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, 'error');
    });

    test('restart stops the running instance and runs it again with the same args', async () => {
        const def = definition('long-running');
        await taskfileSvc.runTask(def, ['--', 'x']);
        await waitFor(() => taskRuns.runningCount(def) === 1, 'run with args');
        const before = vscode.tasks.taskExecutions.find(e => e.task.definition.task === 'long-running');

        await vscode.commands.executeCommand('vscode-task.restartTask', { definition: def });
        await waitFor(() => taskRuns.runningCount(def) === 1
            && vscode.tasks.taskExecutions.some(e => e.task.definition.task === 'long-running' && e !== before),
            'restarted run');
        assert.deepStrictEqual(taskRuns.lastArgs(def), ['--', 'x']);
    });
});
