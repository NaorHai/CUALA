import { ITestScenario, IExecutionPlan } from '../types/index.js';

/**
 * Planner responsible for converting a natural language test scenario
 * into a structured execution plan.
 */
export interface IPlanner {
  /**
   * Generates an execution plan from a test scenario.
   * @param scenario The natural language scenario input.
   * @returns A promise resolving to a structured execution plan.
   */
  plan(scenario: ITestScenario): Promise<IExecutionPlan>;
}
