import { readFile } from 'node:fs/promises';

const marker = '<!-- log-engine-coverage-report -->';

export default async function publishCoverageComment({ github, context, summaryPath }) {
    const coverageSummary = (await readFile(summaryPath, 'utf8')).trim();
    const body = `${marker}\n${coverageSummary}`;
    const { owner, repo } = context.repo;
    const issue_number = context.issue.number;
    const comments = await github.paginate(github.rest.issues.listComments, {
        owner,
        repo,
        issue_number,
        per_page: 100
    });
    const existingComment = comments.find((comment) => comment.body?.includes(marker));

    if (existingComment) {
        await github.rest.issues.updateComment({
            owner,
            repo,
            comment_id: existingComment.id,
            body
        });
    } else {
        await github.rest.issues.createComment({
            owner,
            repo,
            issue_number,
            body
        });
    }
}
