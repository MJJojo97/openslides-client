import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { GroupListComponent } from './group-list.component';
import { E2EImportsModule } from '../../../../../e2e-imports.module';

describe('GroupListComponent', () => {
    let component: GroupListComponent;
    let fixture: ComponentFixture<GroupListComponent>;

    beforeEach(async(() => {
        TestBed.configureTestingModule({
            imports: [E2EImportsModule],
            declarations: [GroupListComponent]
        }).compileComponents();
    }));

    beforeEach(() => {
        fixture = TestBed.createComponent(GroupListComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
