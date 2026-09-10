import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { coverageThresholds } from './coverage-thresholds.ts';
/** Specifies the source coverage summary path. */
const coverageSummaryPath = 'coverage/coverage-summary.json';
/** Specifies the generated Markdown summary path. */
const summaryOutputPath = 'coverage-summary.md';
/** Gets the aggregate coverage metrics from the summary. */
const { total } = JSON.parse(await readFile(coverageSummaryPath, 'utf8'));
/** Lists the coverage metrics to include in the report. */
const metrics: (keyof typeof coverageThresholds)[] = [
    'statements', 'branches', 'functions', 'lines'
];
/** Formats the coverage metrics for the Markdown report. */
const coverageMetrics = metrics.map((name) => {
    /** Gets the coverage data for the current metric. */
    const metric = total[name];
    if (!metric) {
        throw new Error(`Missing ${ name } coverage metric.`);
    }
    /** Returns a report row for the current coverage metric. */
    return {
        'covered': metric.covered,
        'name': name.charAt(0).toUpperCase() + name.slice(1),
        'percentage': metric.pct,
        'threshold': coverageThresholds[name],
        'total': metric.total
    };
});
/** Indicates whether every metric satisfies its configured threshold. */
const meetsThresholds = coverageMetrics.every((metric) => metric.percentage >= metric.threshold);
/** Gets the Markdown coverage report. */
const summary = [
    `## ${ meetsThresholds ? '🟢' : '😡' } Coverage Report`,
    '',
    '| Metric | Coverage | Threshold | Covered |',
    '| --- | ---: | ---: | ---: |',
    ...coverageMetrics.map((metric) => `| ${ metric.name } | ${ metric.percentage }% | ${ metric.threshold }% | ${ metric.covered }/${ metric.total } |`),
    ''
].join('\n');
await writeFile(summaryOutputPath, summary);
if (process.env['GITHUB_STEP_SUMMARY']) {
    await appendFile(process.env['GITHUB_STEP_SUMMARY'], summary);
}
