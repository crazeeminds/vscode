/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IModel } from 'vs/editor/common/editorCommon';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { RawText } from 'vs/editor/common/model/textModel';
import { Model } from 'vs/editor/common/model/model';
import { PLAINTEXT_LANGUAGE_IDENTIFIER } from 'vs/editor/common/modes/modesRegistry';
import { IWizeService, IWizeProvider } from './wize';

export class WizeService implements IWizeService {
	_serviceBrand;
	private activeProviderContextKey: IContextKey<string | undefined>;
	private _activeProvider: IWizeProvider | undefined;

	get activeProvider(): IWizeProvider | undefined {
		return this._activeProvider;
	}

	set activeProvider(provider: IWizeProvider | undefined) {
		if (!provider) {
			throw new Error('invalid provider');
		}

		if (provider && this._providers.indexOf(provider) === -1) {
			throw new Error('Provider not registered');
		}

		this._activeProvider = provider;
		this.activeProviderContextKey.set(provider ? provider.id : void 0);
		this._onDidChangeProvider.fire(provider);
	}

	private _providers: IWizeProvider[] = [];
	get providers(): IWizeProvider[] {
		return [...this._providers];
	}

	private _onDidChangeProvider = new Emitter<IWizeProvider>();
	get onDidChangeProvider(): Event<IWizeProvider> {
		return this._onDidChangeProvider.event;
	}

	private _inputBoxModel: IModel;
	get inputBoxModel(): IModel {
		return this._inputBoxModel;
	}

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IModeService modeService: IModeService,
		@IModelService modelService: IModelService
	) {
		this.activeProviderContextKey = contextKeyService.createKey<string | undefined>('wize.provider', void 0);

		const options = modelService.getCreationOptions('git-commit');
		const rawText = RawText.fromString('', options);

		this._inputBoxModel = new Model(rawText, PLAINTEXT_LANGUAGE_IDENTIFIER);

		modeService.getOrCreateMode('git-commit')
			.done(mode => this._inputBoxModel.setMode(mode.getLanguageIdentifier()));
	}

	registerWizeProvider(provider: IWizeProvider): IDisposable {
		this._providers = [provider, ...this._providers];

		if (this._providers.length === 1) {
			this.activeProvider = provider;
		}

		return toDisposable(() => {
			const index = this._providers.indexOf(provider);

			if (index < 0) {
				return;
			}

			this._providers.splice(index, 1);

			if (this.activeProvider === provider) {
				this.activeProvider = this._providers[0];
			}
		});
	}
}