import { runScenario } from './index.js';

console.log('Starting CUALA with full AI power...');
runScenario('Navigate to https://example.com and verify that the heading says "Example Domain" and the text contains "This domain is for use in illustrative examples"')
  .then(() => console.log('Execution finished.'))
  .catch((err) => console.error('Execution failed:', err));

