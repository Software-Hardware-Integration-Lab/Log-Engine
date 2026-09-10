import { readFile } from 'node:fs/promises';

/** Represents a GitHub issue comment. */
interface IssueComment {
    /** Gets the comment body. */
    'body'?: string | null;
    /** Gets the comment identifier. */
    'id': number;
}

/** Defines the GitHub Script inputs needed to publish a coverage comment. */
interface PublishCoverageCommentOptions {
    /** Provides GitHub Actions workflow context. */
    'context': {
        /** Provides pull request or issue details. */
        'issue': {
            /** Gets the issue number. */
            'number': number;
        };
        /** Provides the target repository details. */
        'repo': {
            /** Gets the repository owner. */
            'owner': string;
            /** Gets the repository name. */
            'repo': string;
        };
    };
    /** Provides the GitHub REST client. */
    'github': {
        /** Retrieves all pages for a REST endpoint. */
        'paginate': (
            route: unknown,
            parameters: {
                /** Specifies the issue number. */
                'issue_number': number;
                /** Specifies the repository owner. */
                'owner': string;
                /** Specifies the number of results per page. */
                'per_page': number;
                /** Specifies the repository name. */
                'repo': string;
            }
        ) => Promise<IssueComment[]>;
        /** Exposes GitHub REST endpoint groups. */
        'rest': {
            /** Exposes issue and issue-comment endpoints. */
            'issues': {
                /** Creates an issue comment. */
                'createComment': (parameters: {
                    /** Specifies the comment body. */
                    'body': string;
                    /** Specifies the issue number. */
                    'issue_number': number;
                    /** Specifies the repository owner. */
                    'owner': string;
                    /** Specifies the repository name. */
                    'repo': string;
                }) => Promise<unknown>;
                /** Lists issue comments. */
                'listComments': unknown;
                /** Updates an issue comment. */
                'updateComment': (parameters: {
                    /** Specifies the comment body. */
                    'body': string;
                    /** Specifies the comment identifier. */
                    'comment_id': number;
                    /** Specifies the repository owner. */
                    'owner': string;
                    /** Specifies the repository name. */
                    'repo': string;
                }) => Promise<unknown>;
            };
        };
    };
    /** Specifies the path to the generated coverage summary. */
    'summaryPath': string;
}

/** Identifies coverage comments managed by this script. */
const marker = '<!-- log-engine-coverage-report -->';
/**
 * Publishes or updates the coverage summary comment on the current issue.
 * @param options Provides the GitHub Script inputs.
 */
export default async function publishCoverageComment(options: PublishCoverageCommentOptions) {
    /** Gets the GitHub Script inputs. */
    const { github, context, summaryPath } = options;
    /** Gets the Markdown coverage summary. */
    const coverageSummary = (await readFile(summaryPath, 'utf8')).trim();
    /** Gets the managed coverage comment body. */
    const body = `${ marker }\n${ coverageSummary }`;
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
