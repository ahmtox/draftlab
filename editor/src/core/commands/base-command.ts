import type { Result } from '../result';

export type EntityKey = ['node' | 'wall' | 'room' | 'fixture', string];

export type Patch = {
  op: 'add' | 'remove' | 'replace';
  key: EntityKey;
  value?: unknown;
  path?: string[];
};

export type Diff = Patch[];

export interface ICommand {
  label: string;
  execute(): Result<Diff, Error>;
  undo(): Result<Diff, Error>;
  canMergeWith(other: ICommand): boolean;
  merge?(other: ICommand): ICommand;
}