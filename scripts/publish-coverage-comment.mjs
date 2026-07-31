import { readFile } from 'node:fs/promises';
/** Identifies coverage comments managed by this script. */
const marker = '<!-- log-engine-coverage-report -->';
/**
 * Publishes or updates the coverage summary comment on the current issue.
 * @param options Provides the GitHub Script inputs.
 */
export default async function publishCoverageComment(options) {
    /** Gets the GitHub Script inputs. */
    const { github, context, summaryPath } = options;
    /** Gets the Markdown coverage summary. */
    const coverageSummary = (await readFile(summaryPath, 'utf8')).trim();
    /** Gets the managed coverage comment body. */
    const body = `${marker}\n${coverageSummary}`;
    /** Gets the target repository owner and name. */
    const { owner, repo } = context.repo;
    /** Gets the issue number for the coverage comment. */
    const issueNumber = context.issue.number;
    /** Gets all existing comments on the current issue. */
    const comments = await github.paginate(github.rest.issues.listComments, {
        owner,
        repo,
        'issue_number': issueNumber,
        'per_page': 100
    });
    /** Gets the existing managed coverage comment, when present. */
    const existingComment = comments.find((comment) => comment.body?.includes(marker) ?? false);
    if (existingComment) {
        await github.rest.issues.updateComment({
            owner,
            repo,
            'comment_id': existingComment.id,
            body
        });
    }
    else {
        await github.rest.issues.createComment({
            owner,
            repo,
            'issue_number': issueNumber,
            body
        });
    }
}
