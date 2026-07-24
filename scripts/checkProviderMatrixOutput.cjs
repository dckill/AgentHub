const fs = require('node:fs');

const DEFAULT_SCENARIOS = [
  'archives the real runner and session after its app-server child is SIGKILLed',
  'closes an active Codex turn before archiving when its app-server child is SIGKILLed',
  'stops a real idle Claude runner before backend startup without inventing a turn',
  'archives the real Claude runner when its SDK child is SIGKILLed',
];

function checkProviderMatrixOutput(output, scenarios = DEFAULT_SCENARIOS) {
  const lines = String(output).split(/\r?\n/);
  const errors = [];
  for (const scenario of scenarios) {
    const passed = lines.some((line) => line.includes('✓') && line.includes(scenario));
    const skipped = lines.some((line) => line.includes('↓') && line.includes(scenario));
    if (passed && skipped) {
      errors.push(`provider scenario both passed and skipped: ${scenario}`);
    } else if (skipped) {
      errors.push(`provider scenario skipped: ${scenario}`);
    } else if (!passed) {
      errors.push(`provider scenario missing pass: ${scenario}`);
    }
  }
  return errors;
}

if (require.main === module) {
  const outputPath = process.argv[2];
  if (!outputPath) {
    console.error('usage: node scripts/checkProviderMatrixOutput.cjs <log-file>');
    process.exitCode = 2;
  } else {
    const errors = checkProviderMatrixOutput(fs.readFileSync(outputPath, 'utf8'));
    for (const error of errors) console.error(error);
    process.exitCode = errors.length === 0 ? 0 : 1;
  }
}

module.exports = { DEFAULT_SCENARIOS, checkProviderMatrixOutput };
