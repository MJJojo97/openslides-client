import { Directive, Input } from '@angular/core';
import { CML } from 'app/core/core-services/organization-permission';
import { Id } from 'app/core/definitions/key-types';

import { BasePermsDirective } from './base-perms.directive';

@Directive({
    selector: `[osCmlPerms]`
})
export class CmlPermsDirective extends BasePermsDirective<CML> {
    @Input()
    public set osCmlPerms(perms: CML | CML[]) {
        this.setPermissions(perms);
    }

    @Input()
    public set osCmlPermsCommitteeId(id: Id) {
        this._committeeId = id;
        this.updatePermission();
    }

    @Input()
    public set osCmlPermsAnd(value: boolean) {
        this.setAndCondition(value);
    }

    @Input()
    public set osCmlPermsOr(value: boolean) {
        this.setOrCondition(value);
    }

    @Input()
    public set osCmlPermsComplement(value: boolean) {
        this.setComplementCondition(value);
    }

    @Input()
    public set osCmlPermsNonAdminCheck(value: boolean) {
        this._checkNonAdmin = value;
        this.updatePermission();
    }

    private _committeeId: Id | undefined = undefined;
    private _checkNonAdmin = false;

    protected hasPermissions(): boolean {
        if (this._checkNonAdmin) {
            return this.operator.hasCommitteePermissionsNonAdminCheck(this._committeeId, ...this.permissions);
        } else {
            return this.operator.hasCommitteePermissions(this._committeeId, ...this.permissions);
        }
    }
}
