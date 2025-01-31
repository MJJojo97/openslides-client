import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { SharedModule } from 'app/shared/shared.module';

import { AssignmentPollModule } from '../assignments/modules/assignment-poll/assignment-poll.module';
import { MotionPollModule } from '../motions/modules/motion-poll/motion-poll.module';
import { PollsModule } from '../polls/polls.module';
import { CinemaRoutingModule } from './cinema-routing.module';
import { CinemaComponent } from './components/cinema/cinema.component';
import { PollCollectionComponent } from './components/poll-collection/poll-collection.component';

@NgModule({
    imports: [CommonModule, CinemaRoutingModule, MotionPollModule, AssignmentPollModule, SharedModule, PollsModule],
    declarations: [CinemaComponent, PollCollectionComponent]
})
export class CinemaModule {}
