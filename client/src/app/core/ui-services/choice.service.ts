import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { infoDialogSettings } from 'app/shared/utils/dialog-settings';
import { Displayable } from 'app/site/base/displayable';
import { Observable } from 'rxjs';

import { ChoiceAnswer, ChoiceDialogComponent } from '../../shared/components/choice-dialog/choice-dialog.component';

export class ChoiceDialogConfig {
    public readonly title: string;
    public readonly content?: string;
    public readonly choices?: Observable<Displayable[]> | Displayable[];
    public readonly actions?: string[];
    public readonly clearChoiceOption?: string;
    public readonly multiSelect?: boolean;
}

/**
 * A service for prompting the user to select a choice.
 */
@Injectable({
    providedIn: `root`
})
export class ChoiceService {
    /**
     * Ctor.
     *
     * @param dialog For opening the ChoiceDialog
     */
    public constructor(private dialog: MatDialog) {}

    /**
     * Opens the dialog. Returns the chosen value after the user accepts.
     * @param title The title to display in the dialog
     * @param choices The available choices
     * @param multiSelect turn on the option to select multiple entries.
     *  The answer.items will then be an array.
     * @param actions optional strings for buttons replacing the regular confirmation.
     * The answer.action will reflect the button selected
     * @param clearChoiceOption A string for an extra, visually slightly separated
     * choice for 'explicitly set an empty selection'. The answer's action may
     * have this string's value
     * @returns an answer {@link ChoiceAnswer}
     */
    public async open(config: ChoiceDialogConfig): Promise<ChoiceAnswer>;
    public async open(
        title: string,
        choices?: Observable<Displayable[]> | Displayable[],
        multiSelect?: boolean,
        actions?: string[],
        clearChoiceOption?: string
    ): Promise<ChoiceAnswer>;
    public async open(
        titleOrConfig: string | ChoiceDialogConfig,
        choices?: Observable<Displayable[]> | Displayable[],
        multiSelect: boolean = false,
        actions?: string[],
        clearChoiceOption?: string
    ): Promise<ChoiceAnswer> {
        const data =
            typeof titleOrConfig !== `string`
                ? titleOrConfig
                : { title: titleOrConfig, choices, multiSelect, actions, clearChoiceOption };
        const dialogRef = this.dialog.open(ChoiceDialogComponent, {
            ...infoDialogSettings,
            data
        });
        return dialogRef.afterClosed().toPromise();
    }
}
