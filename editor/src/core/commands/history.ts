import type { ICommand } from './base-command';
import type { Result } from '../result';
import type { Diff } from './base-command';

type GestureMeta = {
  label: string;
  timestamp: number;
};

class GestureEntry {
  constructor(
    public commands: ICommand[],
    public meta: GestureMeta
  ) {}

  get label(): string {
    return this.meta.label;
  }

  execute(): Result<Diff, Error> {
    const allDiffs: Diff = [];
    
    for (const cmd of this.commands) {
      const result = cmd.execute();
      if (!result.ok) {
        // Rollback already executed commands
        for (let i = this.commands.indexOf(cmd) - 1; i >= 0; i--) {
          this.commands[i].undo();
        }
        return result;
      }
      allDiffs.push(...result.value);
    }

    return { ok: true, value: allDiffs };
  }

  undo(): Result<Diff, Error> {
    const allDiffs: Diff = [];
    
    // Undo in reverse order
    for (let i = this.commands.length - 1; i >= 0; i--) {
      const result = this.commands[i].undo();
      if (!result.ok) {
        // Attempt to re-execute commands we already undid
        for (let j = i + 1; j < this.commands.length; j++) {
          this.commands[j].execute();
        }
        return result;
      }
      allDiffs.push(...result.value);
    }

    return { ok: true, value: allDiffs };
  }
}

export class History {
  private undoStack: GestureEntry[] = [];
  private redoStack: GestureEntry[] = [];
  private currentGesture: ICommand[] | null = null;
  private maxStackSize: number = 100;

  /**
   * Begin a gesture (multi-command transaction)
   */
  beginGesture(): void {
    if (this.currentGesture !== null) {
      console.warn('History: beginGesture called while gesture already in progress');
    }
    this.currentGesture = [];
  }

  /**
   * Push a command to the current gesture or execute immediately if no gesture active
   */
  push(cmd: ICommand): Result<Diff, Error> {
    if (this.currentGesture !== null) {
      // We're in a gesture - try to merge with previous command
      if (this.currentGesture.length > 0) {
        const lastCmd = this.currentGesture[this.currentGesture.length - 1];
        if (lastCmd.canMergeWith(cmd) && lastCmd.merge) {
          // Replace last command with merged version
          this.currentGesture[this.currentGesture.length - 1] = lastCmd.merge(cmd);
          return cmd.execute();
        }
      }
      
      // Add to gesture
      this.currentGesture.push(cmd);
      return cmd.execute();
    } else {
      // Not in a gesture - execute as single-command gesture
      const result = cmd.execute();
      if (result.ok) {
        const entry = new GestureEntry([cmd], { 
          label: cmd.label, 
          timestamp: Date.now() 
        });
        this.undoStack.push(entry);
        this.redoStack = []; // Clear redo stack
        this.trimStack();
      }
      return result;
    }
  }

  /**
   * End the current gesture with a label
   */
  endGesture(meta: { label: string }): Result<Diff, Error> {
    if (this.currentGesture === null) {
      console.warn('History: endGesture called with no active gesture');
      return { ok: true, value: [] };
    }

    if (this.currentGesture.length === 0) {
      this.currentGesture = null;
      return { ok: true, value: [] };
    }

    const entry = new GestureEntry(this.currentGesture, {
      label: meta.label,
      timestamp: Date.now(),
    });

    this.undoStack.push(entry);
    this.redoStack = []; // Clear redo stack on new action
    this.currentGesture = null;
    this.trimStack();

    return { ok: true, value: [] };
  }

  /**
   * Cancel the current gesture without committing
   */
  cancelGesture(): Result<Diff, Error> {
    if (this.currentGesture === null) {
      return { ok: true, value: [] };
    }

    // Undo all commands in reverse order
    for (let i = this.currentGesture.length - 1; i >= 0; i--) {
      const result = this.currentGesture[i].undo();
      if (!result.ok) {
        console.error('Failed to undo command during gesture cancel:', result.error);
      }
    }

    this.currentGesture = null;
    return { ok: true, value: [] };
  }

  /**
   * Undo the last gesture
   */
  undo(): Result<Diff, Error> {
    if (this.currentGesture !== null) {
      console.warn('Cannot undo while gesture in progress');
      return { ok: true, value: [] }; // Silent no-op
    }

    if (this.undoStack.length === 0) {
      // Silent no-op instead of error
      return { ok: true, value: [] };
    }

    const entry = this.undoStack.pop()!;
    const result = entry.undo();

    if (result.ok) {
      this.redoStack.push(entry);
    } else {
      // Put it back if undo failed
      this.undoStack.push(entry);
      console.error(`Failed to undo "${entry.label}":`, result.error);
    }

    return result;
  }

  /**
   * Redo the last undone gesture
   */
  redo(): Result<Diff, Error> {
    if (this.currentGesture !== null) {
      console.warn('Cannot redo while gesture in progress');
      return { ok: true, value: [] }; // Silent no-op
    }

    if (this.redoStack.length === 0) {
      // Silent no-op instead of error
      return { ok: true, value: [] };
    }

    const entry = this.redoStack.pop()!;
    const result = entry.execute();

    if (result.ok) {
      this.undoStack.push(entry);
    } else {
      // Put it back if redo failed
      this.redoStack.push(entry);
      console.error(`Failed to redo "${entry.label}":`, result.error);
    }

    return result;
  }

  /**
   * Clear all history
   */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.currentGesture = null;
  }

  /**
   * Get undo stack for UI display
   */
  getUndoStack(): Array<{ label: string; timestamp: number }> {
    return this.undoStack.map(entry => ({
      label: entry.label,
      timestamp: entry.meta.timestamp,
    }));
  }

  /**
   * Get redo stack for UI display
   */
  getRedoStack(): Array<{ label: string; timestamp: number }> {
    return this.redoStack.map(entry => ({
      label: entry.label,
      timestamp: entry.meta.timestamp,
    }));
  }

  /**
   * Check if undo is available
   */
  canUndo(): boolean {
    return this.undoStack.length > 0 && this.currentGesture === null;
  }

  /**
   * Check if redo is available
   */
  canRedo(): boolean {
    return this.redoStack.length > 0 && this.currentGesture === null;
  }

  /**
   * Get current gesture state (for debugging)
   */
  isGestureActive(): boolean {
    return this.currentGesture !== null;
  }

  private trimStack(): void {
    if (this.undoStack.length > this.maxStackSize) {
      this.undoStack.shift();
    }
  }
}