import { IVerifier } from './index.js';
import { IStep, IExecutionResult, IVerificationResult, IAssertion } from '../types/index.js';

export class SimpleVerifier implements IVerifier {
  async verifyStep(step: IStep, result: IExecutionResult): Promise<IVerificationResult> {
    return {
      stepId: step.id,
      isVerified: result.status === 'success',
      evidence: result.status === 'success' ? 'Step executed successfully' : (result.error || 'Step failed')
    };
  }

  async verifyAssertions(assertions: IAssertion[], lastResult: IExecutionResult): Promise<IVerificationResult[]> {
    const results: IVerificationResult[] = [];
    
    for (const assertion of assertions) {
      if (assertion.check.startsWith('contains_text:')) {
        const expectedText = assertion.check.replace('contains_text:', '').trim();
        const html = (lastResult.snapshot.metadata.html as string) || '';
        
        // This is a simple check; in real scenarios we'd use the executor to check the DOM directly,
        // but for the runnable path we'll check the captured HTML in the snapshot.
        const isVerified = html.includes(expectedText);
        
        results.push({
          stepId: assertion.id,
          isVerified,
          evidence: isVerified 
            ? `Found expected text: "${expectedText}"` 
            : `Could not find expected text: "${expectedText}" in page content`
        });
      } else {
        results.push({
          stepId: assertion.id,
          isVerified: false,
          evidence: `Unsupported assertion type: ${assertion.check}`
        });
      }
    }
    
    return results;
  }
}

