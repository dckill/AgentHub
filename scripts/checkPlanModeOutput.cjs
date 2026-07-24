const fs = require('node:fs');

const DEFAULT_SCENARIOS = [
  'should call canCallTool for ExitPlanMode and allow plan execution',
  'should deny plan and not modify files',
  'should always call canCallTool for ExitPlanMode even after bypassPermissions was active',
];

function checkPlanModeOutput(output, scenarios = DEFAULT_SCENARIOS) {
  const lines = String(output).split(/\r?\n/);
  const errors = [];
  for (const scenario of scenarios) {
    const passed = lines.some((line) => line.includes('✓') && line.includes(scenario));
    const skipped = lines.some((line) => line.includes('↓') && line.includes(scenario));
    if (passed && skipped) {
      errors.push(`plan-mode scenario both passed and skipped: ${scenario}`);
    } else if (skipped) {
      errors.push(`plan-mode scenario skipped: ${scenario}`);
    } else if (!passed) {
      errors.push(`plan-mode scenario missing pass: ${scenario}`);
    }
  }
  return errors;
}

if (require.main === module) {
  const outputPath = process.argv[2];
  if (!outputPath) {
    console.error('usage: node scripts/checkPlanModeOutput.cjs <log-file>');
    process.exitCode = 2;
  } else {
    const errors = checkPlanModeOutput(fs.readFileSync(outputPath, 'utf8'));
    for (const error of errors) console.error(error);
    process.exitCode = errors.length === 0 ? 0 : 1;
  }
}

module.exports = { DEFAULT_SCENARIOS, checkPlanModeOutput };
