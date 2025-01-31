import { fakeAsync, TestBed, tick, waitForAsync } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';

import { E2EImportsModule } from './../e2e-imports.module';
import { AppComponent } from './app.component';
import { ServertimeService } from './core/core-services/servertime.service';

describe(`AppComponent`, () => {
    let servertimeService;
    let translate;

    beforeEach(
        waitForAsync(() => {
            TestBed.configureTestingModule({
                imports: [E2EImportsModule]
            }).compileComponents();

            servertimeService = TestBed.inject(ServertimeService);
            translate = TestBed.inject(TranslateService);

            /**
             * FIXME: function does not work anymore
             */
            // spyOn(servertimeService, 'startScheduler').and.stub();
            spyOn(translate, `addLangs`).and.stub();
            spyOn(translate, `setDefaultLang`).and.stub();
            spyOn(translate, `getBrowserLang`).and.stub();
            spyOn(translate, `getLangs`).and.returnValue([]);
            spyOn(translate, `use`).and.stub();
        })
    );
    it(`should create the app`, fakeAsync(() => {
        const fixture = TestBed.createComponent(AppComponent);
        const app = fixture.debugElement.componentInstance;
        expect(app).toBeTruthy();
        tick(1000);
        // fixture.whenStable().then(() => {
        //     expect(servertimeService.startScheduler).toHaveBeenCalled();
        // });
    }));
});
