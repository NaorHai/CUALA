import { IAction, IExecutionResult } from '../types/index.js';

/**
 * Executor responsible for performing an action against a target system.
 */
export interface IExecutor {
  /**
   * Executes a specific action.
   * @param action The action to be executed.
   * @returns A promise resolving to the result of the execution.
   */
  execute(action: IAction): Promise<IExecutionResult>;

  /**
   * Cleans up the executor session, ensuring isolation for the next run.
   */
  cleanup(): Promise<void>;
}
