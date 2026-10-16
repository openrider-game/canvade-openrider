import type { Tool } from './tool';

/** Tools available in the current state, indexed by name and by keyboard control label. */
export class ToolCollection {
    private readonly toolsByToolName = new Map<string, Tool>();
    private readonly toolsByKeyLabel = new Map<string, Tool>();

    public add(tool: Tool): void {
        this.toolsByToolName.set(tool.toolClass.toolName, tool);

        const keyLabel = tool.toolClass.keyLabel;
        if (keyLabel !== null) {
            this.toolsByKeyLabel.set(keyLabel, tool);
        }
    }

    public getByToolName(toolName: string): Tool | undefined {
        return this.toolsByToolName.get(toolName);
    }

    public getByKeyLabel(keyLabel: string): Tool | undefined {
        return this.toolsByKeyLabel.get(keyLabel);
    }
}
