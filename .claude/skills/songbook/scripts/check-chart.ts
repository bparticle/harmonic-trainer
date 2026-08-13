import { readFileSync } from 'node:fs';
import { checkChart, report } from './roundtrip';

/**
 * Read a chart, say what it will be stored as, and whether that is still the
 * same tune.
 *
 *   npx vite-node .claude/skills/songbook/scripts/check-chart.ts <file> <key>
 *
 * Nothing is written and no database is needed. Run it from the project root.
 */

const [file, keyName] = process.argv.slice(2);
if (!file || !keyName) {
	console.error('usage: check-chart.ts <chart-file> <key>     e.g. … changes.txt Ab');
	process.exit(2);
}

process.exit(report(checkChart(readFileSync(file, 'utf8'), keyName), keyName) ? 0 : 1);
