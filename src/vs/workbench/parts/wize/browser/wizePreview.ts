/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Action } from 'vs/base/common/actions';
import { TPromise } from 'vs/base/common/winjs.base';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { IMessageService } from 'vs/platform/message/common/message';

export default class WizePreview {
	private static readonly _enabled = window.localStorage.getItem('enablePreviewWize') === 'true';

	static get enabled(): boolean {
		return this._enabled;
	}

	static set enabled(enabled: boolean) {
		window.localStorage.setItem('enablePreviewWize', enabled ? 'true' : 'false');
	}
}

export class EnableWizePreviewAction extends Action {
	static ID = 'enablewizepreview';
	static LABEL = 'Enable Preview Wize';

	constructor(
		id = EnableWizePreviewAction.ID,
		label = EnableWizePreviewAction.LABEL,
		@IWindowService private windowService: IWindowService,
		@IMessageService private messageService: IMessageService,
	) {
		super(EnableWizePreviewAction.ID, EnableWizePreviewAction.LABEL, '', true);
	}

	run(): TPromise<void> {
		const message = 'This will reload this window, do you want to continue?';
		const result = this.messageService.confirm({ message });

		if (!result) {
			return undefined;
		}

		WizePreview.enabled = true;
		return this.windowService.reloadWindow();
	}
}

export class DisableWizePreviewAction extends Action {
	static ID = 'disablewizepreview';
	static LABEL = 'Disable Preview Wize';

	constructor(
		id = DisableWizePreviewAction.ID,
		label = DisableWizePreviewAction.LABEL,
		@IWindowService private windowService: IWindowService,
		@IMessageService private messageService: IMessageService,
	) {
		super(DisableWizePreviewAction.ID, DisableWizePreviewAction.LABEL, '', true);
	}

	run(): TPromise<void> {
		const message = 'This will reload this window, do you want to continue?';
		const result = this.messageService.confirm({ message });

		if (!result) {
			return undefined;
		}

		WizePreview.enabled = false;
		return this.windowService.reloadWindow();
	}
}