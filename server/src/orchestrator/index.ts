import { IExecutionPlan, IReportData } from '../types/index.js';

export interface IOrchestrator {
  execute(plan: IExecutionPlan): Promise<IReportData>;
}

export class OrchestratorStub implements IOrchestrator {
  async execute(plan: IExecutionPlan): Promise<IReportData> {
    throw new Error('Method not implemented.');
  }
}

