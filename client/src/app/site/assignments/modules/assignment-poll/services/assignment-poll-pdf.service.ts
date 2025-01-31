import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ActiveMeetingIdService } from 'app/core/core-services/active-meeting-id.service';
import { AbstractPollData, PollPdfService } from 'app/core/pdf-services/base-poll-pdf-service';
import { PdfDocumentService } from 'app/core/pdf-services/pdf-document.service';
import { AssignmentRepositoryService } from 'app/core/repositories/assignments/assignment-repository.service';
import { UserRepositoryService } from 'app/core/repositories/users/user-repository.service';
import { MediaManageService } from 'app/core/ui-services/media-manage.service';
import { MeetingSettingsService } from 'app/core/ui-services/meeting-settings.service';
import { PollMethod } from 'app/shared/models/poll/poll-constants';
import { ViewPoll } from 'app/shared/models/poll/view-poll';

/**
 * Creates a pdf for a motion poll. Takes as input any motionPoll
 * Provides the public method `printBallots(motionPoll)` which should be convenient to use.
 *
 * @example
 * ```ts
 * this.AssignmentPollPdfService.printBallots(this.poll);
 * ```
 */
@Injectable({
    providedIn: `root`
})
export class AssignmentPollPdfService extends PollPdfService {
    public constructor(
        protected meetingSettingService: MeetingSettingsService,
        userRepo: UserRepositoryService,
        activeMeetingIdService: ActiveMeetingIdService,
        mediaManageService: MediaManageService,
        private translate: TranslateService,
        private assignmentRepo: AssignmentRepositoryService,
        private pdfService: PdfDocumentService
    ) {
        super(meetingSettingService, userRepo, activeMeetingIdService, mediaManageService);
        this.meetingSettingService
            .get(`assignment_poll_ballot_paper_number`)
            .subscribe(count => (this.ballotCustomCount = count));
        this.meetingSettingService
            .get(`assignment_poll_ballot_paper_selection`)
            .subscribe(selection => (this.ballotCountSelection = selection));
    }

    /**
     * Triggers a pdf creation for this poll's ballots. Currently, only ballots
     * for a limited amount of candidates will return useful pdfs:
     * - about 15 candidates (method: yes/no and yes/no/abstain)
     * - about 29 candidates (one vote per candidate)
     *
     * @param motionPoll: The poll this ballot refers to
     * @param title (optional) a different title
     * @param subtitle (optional) a different subtitle
     */
    public printBallots(poll: ViewPoll, title?: string, subtitle?: string): void {
        const assignment = this.assignmentRepo.getViewModel(poll.content_object?.id);
        const fileName = `${this.translate.instant(`Election`)} - ${assignment.getTitle()} - ${this.translate.instant(
            `ballot-paper` // TODO proper title (second election?)
        )}`;
        if (!title) {
            title = assignment.getTitle();
        }
        if (!subtitle) {
            subtitle = ``;
        }
        if (assignment.polls.length > 1) {
            subtitle = `${this.translate.instant(`Ballot`)} ${assignment.polls.length} ${subtitle}`;
        }
        if (subtitle.length > 90) {
            subtitle = subtitle.substring(0, 90) + `...`;
        }
        let rowsPerPage = 1;
        if (poll.pollmethod === PollMethod.Y) {
            if (poll.options.length <= 2) {
                rowsPerPage = 4;
            } else if (poll.options.length <= 5) {
                rowsPerPage = 3;
            } else if (poll.options.length <= 10) {
                rowsPerPage = 2;
            } else {
                rowsPerPage = 1;
            }
        } else {
            if (poll.options.length <= 2) {
                rowsPerPage = 4;
            } else if (poll.options.length <= 3) {
                rowsPerPage = 3;
            } else if (poll.options.length <= 7) {
                rowsPerPage = 2;
            } else {
                // up to 15 candidates
                rowsPerPage = 1;
            }
        }
        const sheetEnd = Math.floor(417 / rowsPerPage);
        this.pdfService.downloadWithBallotPaper(
            this.getPages(rowsPerPage, { sheetend: sheetEnd, title, subtitle, poll }),
            fileName,
            this.logoUrl
        );
    }

    /**
     * Creates one ballot in it's position on the page. Note that creating once
     * and then pasting the result several times does not work
     *
     * @param title The number of the motion
     * @param subtitle The actual motion title
     */
    protected createBallot(data: AbstractPollData): object {
        return {
            columns: [
                {
                    width: 1,
                    margin: [0, data.sheetend],
                    text: ``
                },
                {
                    width: `*`,
                    stack: [
                        this.getHeader(),
                        this.getTitle(data.title),
                        this.getSubtitle(data.subtitle),
                        this.createPollHint(data.poll),
                        this.createCandidateFields(data.poll)
                    ],
                    margin: [0, 0, 0, 0]
                }
            ]
        };
    }

    private createCandidateFields(poll: ViewPoll): object {
        const candidates = poll.options.sort((a, b) => a.weight - b.weight);
        const resultObject = candidates.map(cand => {
            const candidateName = cand.content_object?.full_name;
            if (candidateName) {
                return poll.pollmethod === PollMethod.Y
                    ? this.createBallotOption(candidateName)
                    : this.createYNBallotEntry(candidateName, poll.pollmethod);
            } else {
                throw new Error(this.translate.instant(`This ballot contains deleted users.`));
            }
        });

        if (poll.pollmethod === PollMethod.Y) {
            if (poll.global_yes) {
                const yesEntry = this.createBallotOption(this.translate.instant(`Yes`));
                yesEntry.margin[1] = 25;
                resultObject.push(yesEntry);
            }

            if (poll.global_no) {
                const noEntry = this.createBallotOption(this.translate.instant(`No`));
                noEntry.margin[1] = 25;
                resultObject.push(noEntry);
            }

            if (poll.global_abstain) {
                const abstainEntry = this.createBallotOption(this.translate.instant(`Abstain`));
                abstainEntry.margin[1] = 25;
                resultObject.push(abstainEntry);
            }
        }
        return resultObject;
    }

    private createYNBallotEntry(option: string, method: PollMethod): object {
        const choices = method === `YNA` ? [`Yes`, `No`, `Abstain`] : [`Yes`, `No`];
        const columnstack = choices.map(choice => ({
            width: `auto`,
            stack: [this.createBallotOption(this.translate.instant(choice))]
        }));
        return [
            {
                text: option,
                margin: [40, 10, 0, 0]
            },
            {
                width: `auto`,
                columns: columnstack
            }
        ];
    }

    /**
     * Generates the poll description
     *
     * @param poll
     * @returns pdfMake definitions
     */
    private createPollHint(poll: ViewPoll): object {
        return {
            text: poll.content_object?.default_poll_description || ``,
            style: `description`
        };
    }
}
