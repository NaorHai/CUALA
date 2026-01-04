import { IReportData } from '../types/index.js';

/**
 * Reporter responsible for presenting the results of a test execution.
 */
export interface IReporter {
  /**
   * Generates a report based on the provided execution data.
   * @param data The execution and verification data.
   * @returns A promise that resolves when the report is generated.
   */
  report(data: IReportData): Promise<void>;
}
