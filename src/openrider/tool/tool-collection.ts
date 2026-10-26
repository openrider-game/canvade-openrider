import type { Tool } from './tool';

/**
 * Tools available in the current state, indexed by name, which also names their keyboard
 * control (see `Tool.registerControls`).
 */
export class ToolCollection {
    private readonly toolsByToolName = new Map<string, Tool>();

    public add(tool: Tool): void {
        this.toolsByToolName.set(tool.toolClass.toolName, tool);
    }

    public getByToolName(toolName: string): Tool | undefined {
        return this.toolsByToolName.get(toolName);
    }

    /** Tool run by a keyboard control, by its name, if the tool has a shortcut. */
    public getByShortcut(controlName: string): Tool | undefined {
        const tool = this.toolsByToolName.get(controlName);
        return tool?.toolClass.key ? tool : undefined;
    }
}
