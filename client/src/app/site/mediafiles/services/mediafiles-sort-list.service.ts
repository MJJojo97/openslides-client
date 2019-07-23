import { Injectable } from '@angular/core';

import { TranslateService } from '@ngx-translate/core';

import { OpenSlidesStatusService } from 'app/core/core-services/openslides-status.service';
import { StorageService } from 'app/core/core-services/storage.service';
import { BaseSortListService, OsSortingDefinition, OsSortingOption } from 'app/core/ui-services/base-sort-list.service';
import { ViewMediafile } from '../models/view-mediafile';

/**
 * Sorting service for the mediafile list
 */
@Injectable({
    providedIn: 'root'
})
export class MediafilesSortListService extends BaseSortListService<ViewMediafile> {
    public sortOptions: OsSortingOption<ViewMediafile>[] = [
        { property: 'title' },
        {
            property: 'type',
            label: this.translate.instant('Type')
        },
        {
            property: 'size',
            label: this.translate.instant('Size')
        }
    ];

    /**
     * Constructor.
     *
     * @param translate required by parent
     * @param store required by parent
     */
    public constructor(translate: TranslateService, store: StorageService, OSStatus: OpenSlidesStatusService) {
        super('Mediafiles', translate, store, OSStatus);
    }

    /**
     * Required by parent
     *
     * @returns the default sorting strategy
     */
    public async getDefaultDefinition(): Promise<OsSortingDefinition<ViewMediafile>> {
        return {
            sortProperty: 'title',
            sortAscending: true
        };
    }
}
