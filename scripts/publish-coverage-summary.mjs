import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { coverageThresholds } from './coverage-thresholds.js';

const coverageSummaryPath = 'coverage/coverage-summary.json';
const summaryOutputPath = 'coverage-summary.md';
const { total } = JSON.parse(await readFile(coverageSummaryPath, 'utf8'));
const metrics = ['statements', 'branches', 'functions', 'lines'].map((name) => {
    const metric = total[name];
    if (!metric) throw new Error(`Missing ${name} coverage metric.`);
    return {
        'covered': metric.covered,
        'name': name[0].toUpperCase() + name.slice(1),
        'percentage': metric.pct,
        'threshold': coverageThresholds[name],
        'total': metric.total
    };
});
const meetsThresholds = metrics.every((metric) => metric.percentage >= metric.threshold);
const summary = [
    `## ${meetsThresholds ? '🟢' : '😡'} Coverage Report`,
    '',
    '| Metric | Coverage | Threshold | Covered |',
    '| --- | ---: | ---: | ---: |',
    ...metrics.map((metric) => `| ${metric.name} | ${metric.percentage}% | ${metric.threshold}% | ${metric.covered}/${metric.total} |`),
    ''
].join('\n');

await writeFile(summaryOutputPath, summary);

if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
}
