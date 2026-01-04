import { IStep, IExecutionResult, IVerificationResult, IAssertion } from '../types/index.js';

/**
 * Verifier responsible for validating that an execution result
 * meets the expectations defined in a step or plan.
 */
export interface IVerifier {
  /**
   * Verifies the state after a single step.
   */
  verifyStep(step: IStep, result: IExecutionResult): Promise<IVerificationResult>;

  /**
   * Verifies a set of assertions against the final state.
   */
  verifyAssertions(assertions: IAssertion[], lastResult: IExecutionResult): Promise<IVerificationResult[]>;
}

export class VerifierStub implements IVerifier {
  async verifyStep(step: IStep, result: IExecutionResult): Promise<IVerificationResult> {
    throw new Error('Method not implemented.');
  }

  async verifyAssertions(assertions: IAssertion[], lastResult: IExecutionResult): Promise<IVerificationResult[]> {
    throw new Error('Method not implemented.');
  }
}
