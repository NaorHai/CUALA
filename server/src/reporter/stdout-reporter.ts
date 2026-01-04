import { IReporter } from './index.js';
import { IReportData } from '../types/index.js';
import chalk from 'chalk';

export class StdoutReporter implements IReporter {
  async report(data: IReportData): Promise<void> {
    console.log('\n' + chalk.bold.blue('=== CUALA TEST REPORT ==='));
    console.log(`Scenario ID: ${data.scenarioId}`);
    console.log(`Plan ID:     ${data.planId}`);
    console.log(`Duration:    ${data.summary.endTime - data.summary.startTime}ms`);
    console.log('---------------------------');

    console.log(chalk.bold('Execution Steps:'));
    data.results.forEach((res, i) => {
      const statusColor = res.status === 'success' ? chalk.green : chalk.red;
      console.log(`  ${i + 1}. Step ${res.stepId}: ${statusColor(res.status.toUpperCase())}`);
      if (res.verification) {
        const verStatusColor = res.verification.isVerified ? chalk.green : chalk.red;
        const icon = res.verification.isVerified ? '✓' : '✗';
        console.log(`     ${verStatusColor(icon)} Verification: ${res.verification.evidence}`);
      }
    });

    // Assertions are now part of each step's verification

    console.log('---------------------------');
    if (data.summary.success) {
      console.log(chalk.bold.green('FINAL STATUS: PASSED'));
    } else {
      console.log(chalk.bold.red('FINAL STATUS: FAILED'));
    }
    console.log(chalk.bold.blue('=========================') + '\n');
  }
}

