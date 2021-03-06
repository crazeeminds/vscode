/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IEditorOptions, IDimension } from 'vs/editor/common/editorCommon';
import { EditorAction, CommonEditorRegistry } from 'vs/editor/common/editorCommonExtensions';
import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';
import { IEditorContributionCtor } from 'vs/editor/browser/editorBrowser';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { MenuPreventer } from 'vs/editor/contrib/multicursor/browser/menuPreventer';
import { SelectionClipboard } from 'vs/editor/contrib/selectionClipboard/electron-browser/selectionClipboard';
import { ContextMenuController } from 'vs/editor/contrib/contextmenu/browser/contextmenu';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IThemeService } from 'vs/workbench/services/themes/common/themeService';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IWizeService } from 'vs/workbench/services/wize/common/wize';

class WizeCodeEditorWidget extends CodeEditorWidget {

	constructor(
		domElement: HTMLElement,
		options: IEditorOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@ICommandService commandService: ICommandService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(domElement, options, instantiationService, codeEditorService, commandService, contextKeyService);
	}

	protected _getContributions(): IEditorContributionCtor[] {
		return [
			MenuPreventer,
			SelectionClipboard,
			ContextMenuController
		];
	}

	protected _getActions(): EditorAction[] {
		return CommonEditorRegistry.getEditorActions();
	}
}

export const InWizeInputContextKey = new RawContextKey<boolean>('inWizeInput', false);

export class WizeEditor {

	private static VerticalPadding = 4;

	private editor: WizeCodeEditorWidget;
	private disposables: IDisposable[] = [];

	private get editorOptions(): IEditorOptions {
		return {
			wrappingColumn: 0,
			overviewRulerLanes: 0,
			glyphMargin: false,
			lineNumbers: 'off',
			folding: false,
			selectOnLineNumbers: false,
			selectionHighlight: false,
			scrollbar: {
				horizontal: 'hidden'
			},
			lineDecorationsWidth: 3,
			scrollBeyondLastLine: false,
			theme: this.themeService.getColorTheme().id,
			renderLineHighlight: 'none',
			fixedOverflowWidgets: true,
			acceptSuggestionOnEnter: false,
			wordWrap: true
		};
	}

	constructor(
		container: HTMLElement,
		@IThemeService private themeService: IThemeService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IModeService private modeService: IModeService,
		@IModelService private modelService: IModelService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IWizeService private wizeService: IWizeService
	) {
		const scopedContextKeyService = this.contextKeyService.createScoped(container);
		InWizeInputContextKey.bindTo(scopedContextKeyService).set(true);
		this.disposables.push(scopedContextKeyService);

		const services = new ServiceCollection();
		services.set(IContextKeyService, scopedContextKeyService);
		const scopedInstantiationService = instantiationService.createChild(services);

		this.editor = scopedInstantiationService.createInstance(WizeCodeEditorWidget, container, this.editorOptions);
		this.themeService.onDidColorThemeChange(e => this.editor.updateOptions(this.editorOptions), null, this.disposables);

		const model = this.wizeService.inputBoxModel;
		this.editor.setModel(model);

		this.editor.changeViewZones(accessor => {
			accessor.addZone({
				afterLineNumber: 0,
				heightInPx: WizeEditor.VerticalPadding,
				domNode: document.createElement('div')
			});
		});
	}

	private get lineHeight(): number {
		return this.editor.getConfiguration().lineHeight;
	}

	// TODO@joao TODO@alex isn't there a better way to get the number of lines?
	private get lineCount(): number {
		const model = this.wizeService.inputBoxModel;
		const modelLength = model.getValueLength();
		const lastPosition = model.getPositionAt(modelLength);
		const lastLineTop = this.editor.getTopForPosition(lastPosition.lineNumber, lastPosition.column);
		const viewHeight = lastLineTop + this.lineHeight;

		return viewHeight / this.lineHeight;
	}

	get viewHeight(): number {
		return Math.min(this.lineCount, 8) * this.lineHeight + (WizeEditor.VerticalPadding);
	}

	layout(dimension: IDimension): void {
		this.editor.layout(dimension);
	}

	focus(): void {
		this.editor.focus();
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}