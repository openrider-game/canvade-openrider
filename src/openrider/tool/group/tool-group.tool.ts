import type { Track } from '../../track/track';
import { Tool, ToolClass, ToolIcon } from '../tool';

/**
 * Toolbar button standing for a group of tools.
 *
 * It runs the last tool selected in the group, and the tools of the group are displayed next to it
 * while one of them is selected. The group itself never becomes the current tool.
 */
export abstract class ToolGroupTool extends Tool {
    /** Tools of the group, created by the group, in display order. */
    public readonly instances: Tool[];
    /** Last tool selected in the group, run by the group button and shown as its icon. */
    public currentInstance: Tool;

    public constructor(track: Track, classList: ToolClass[]) {
        super(track);

        this.instances = classList.map((toolClass) => new toolClass(track));
        for (const instance of this.instances) {
            instance.group = this;
        }
        this.currentInstance = this.instances[0];
    }

    /** Registers the shortcut of the group and the shortcuts of all its tools. */
    public override registerControls(): void {
        super.registerControls();
        for (const instance of this.instances) {
            instance.registerControls();
        }
    }

    public override getIcon(): ToolIcon | null {
        return this.currentInstance.getIcon();
    }

    public override isActive(): boolean {
        return this.instances.some((instance) => instance.isActive());
    }

    public override run(): void {
        this.track.toolManager.setTool(this.currentInstance);
    }
}
