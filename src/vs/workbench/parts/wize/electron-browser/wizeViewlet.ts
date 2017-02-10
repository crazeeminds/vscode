/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/wizeViewlet';
import { TPromise } from 'vs/base/common/winjs.base';
import { chain } from 'vs/base/common/event';
import { IDisposable, dispose, empty as EmptyDisposable } from 'vs/base/common/lifecycle';
import { Builder, Dimension } from 'vs/base/browser/builder';
import { Viewlet } from 'vs/workbench/browser/viewlet';
import { append, $, toggleClass } from 'vs/base/browser/dom';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { IDelegate, IRenderer, IListMouseEvent } from 'vs/base/browser/ui/list/list';
import { VIEWLET_ID } from 'vs/workbench/parts/wize/common/wize';
import { FileLabel } from 'vs/workbench/browser/labels';
import { CountBadge } from 'vs/base/browser/ui/countBadge/countBadge';
import { IWizeService, IWizeProvider, IWizeResourceGroup, IWizeResource } from 'vs/workbench/services/wize/common/wize';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IContextViewService, IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IMessageService } from 'vs/platform/message/common/message';
import { IListService } from 'vs/platform/list/browser/listService';
import { IMenuService } from 'vs/platform/actions/common/actions';
import { IAction, IActionItem } from 'vs/base/common/actions';
import { createActionItem } from 'vs/platform/actions/browser/menuItemActionItem';
import { WizeMenus } from './wizeMenus';
import { ActionBar, IActionItemProvider } from 'vs/base/browser/ui/actionbar/actionbar';
import { IThemeService } from 'vs/workbench/services/themes/common/themeService';
import { isDarkTheme } from 'vs/platform/theme/common/themes';
import { WizeEditor } from './wizeEditor';
import { IModelService } from 'vs/editor/common/services/modelService';

interface SearchInputEvent extends Event {
	target: HTMLInputElement;
	immediate?: boolean;
}

interface ResourceGroupTemplate {
	name: HTMLElement;
	count: CountBadge;
	actionBar: ActionBar;
}

class ResourceGroupRenderer implements IRenderer<IWizeResourceGroup, ResourceGroupTemplate> {

	static TEMPLATE_ID = 'resource group';
	get templateId(): string { return ResourceGroupRenderer.TEMPLATE_ID; }

	constructor(
		private wizeMenus: WizeMenus,
		private actionItemProvider: IActionItemProvider
	) { }

	renderTemplate(container: HTMLElement): ResourceGroupTemplate {
		const element = append(container, $('.resource-group'));
		const name = append(element, $('.name'));
		const actionsContainer = append(element, $('.actions'));
		const actionBar = new ActionBar(actionsContainer, { actionItemProvider: this.actionItemProvider });
		const countContainer = append(element, $('.count'));
		const count = new CountBadge(countContainer);

		return { name, count, actionBar };
	}

	renderElement(group: IWizeResourceGroup, index: number, template: ResourceGroupTemplate): void {
		template.name.textContent = group.label;
		template.count.setCount(group.resources.length);
		template.actionBar.clear();
		template.actionBar.push(this.wizeMenus.getResourceGroupActions(group));
	}

	disposeTemplate(template: ResourceGroupTemplate): void {

	}
}

interface ResourceTemplate {
	name: HTMLElement;
	fileLabel: FileLabel;
	decorationIcon: HTMLElement;
	actionBar: ActionBar;
}

class ResourceRenderer implements IRenderer<IWizeResource, ResourceTemplate> {

	static TEMPLATE_ID = 'resource';
	get templateId(): string { return ResourceRenderer.TEMPLATE_ID; }

	constructor(
		private wizeMenus: WizeMenus,
		private actionItemProvider: IActionItemProvider,
		@IThemeService private themeService: IThemeService,
		@IInstantiationService private instantiationService: IInstantiationService
	) { }

	renderTemplate(container: HTMLElement): ResourceTemplate {
		const element = append(container, $('.resource'));
		const name = append(element, $('.name'));
		const fileLabel = this.instantiationService.createInstance(FileLabel, name, void 0);
		const actionsContainer = append(element, $('.actions'));
		const actionBar = new ActionBar(actionsContainer, { actionItemProvider: this.actionItemProvider });
		const decorationIcon = append(element, $('.decoration-icon'));

		return { name, fileLabel, decorationIcon, actionBar };
	}

	renderElement(resource: IWizeResource, index: number, template: ResourceTemplate): void {
		template.fileLabel.setFile(resource.uri);
		template.actionBar.clear();
		template.actionBar.push(this.wizeMenus.getResourceActions(resource));
		toggleClass(template.name, 'strike-through', resource.decorations.strikeThrough);

		const theme = this.themeService.getColorTheme();
		const icon = isDarkTheme(theme.id) ? resource.decorations.iconDark : resource.decorations.icon;

		if (icon) {
			template.decorationIcon.style.backgroundImage = `url('${icon}')`;
		} else {
			template.decorationIcon.style.backgroundImage = '';
		}
	}

	disposeTemplate(template: ResourceTemplate): void {
		// noop
	}
}

class Delegate implements IDelegate<IWizeResourceGroup | IWizeResource> {

	getHeight() { return 22; }

	getTemplateId(element: IWizeResourceGroup | IWizeResource) {
		return (element as IWizeResource).uri ? ResourceRenderer.TEMPLATE_ID : ResourceGroupRenderer.TEMPLATE_ID;
	}
}

export class WizeViewlet extends Viewlet {

	private cachedDimension: Dimension;
	private editor: WizeEditor;
	private listContainer: HTMLElement;
	private list: List<IWizeResourceGroup | IWizeResource>;
	private menus: WizeMenus;
	private providerChangeDisposable: IDisposable = EmptyDisposable;
	private disposables: IDisposable[] = [];

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IWizeService private wizeService: IWizeService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IContextViewService private contextViewService: IContextViewService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IMessageService private messageService: IMessageService,
		@IListService private listService: IListService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IThemeService private themeService: IThemeService,
		@IMenuService private menuService: IMenuService,
		@IModelService private modelService: IModelService
	) {
		super(VIEWLET_ID, telemetryService);

		this.menus = this.instantiationService.createInstance(WizeMenus);
		this.disposables.push(this.menus);
	}

	private setActiveProvider(activeProvider: IWizeProvider | undefined): void {
		this.providerChangeDisposable.dispose();

		if (activeProvider) {
			this.providerChangeDisposable = activeProvider.onDidChange(this.update, this);
		} else {
			this.providerChangeDisposable = EmptyDisposable;
		}

		this.updateTitleArea();
		this.update();
	}

	create(parent: Builder): TPromise<void> {
		super.create(parent);
		parent.addClass('wize-viewlet');

		const root = parent.getHTMLElement();
		const editorContainer = append(root, $('.wize-editor'));

		this.editor = this.instantiationService.createInstance(WizeEditor, editorContainer);
		this.disposables.push(this.editor);

		this.disposables.push(this.wizeService.inputBoxModel.onDidChangeContent(() => this.layout()));

		this.listContainer = append(root, $('.wize-status.show-file-icons'));
		const delegate = new Delegate();

		const actionItemProvider = action => this.getActionItem(action);

		this.list = new List(this.listContainer, delegate, [
			new ResourceGroupRenderer(this.menus, actionItemProvider),
			this.instantiationService.createInstance(ResourceRenderer, this.menus, actionItemProvider),
		], { keyboardSupport: false });

		this.disposables.push(this.listService.register(this.list));

		chain(this.list.onSelectionChange)
			.map(e => e.elements[0])
			.filter(e => !!e && !!(e as IWizeResource).uri)
			.on(this.open, this, this.disposables);

		this.list.onContextMenu(this.onListContextMenu, this, this.disposables);
		this.disposables.push(this.list);

		this.setActiveProvider(this.wizeService.activeProvider);
		this.wizeService.onDidChangeProvider(this.setActiveProvider, this, this.disposables);
		this.themeService.onDidColorThemeChange(this.update, this, this.disposables);

		return TPromise.as(null);
	}

	private update(): void {
		const provider = this.wizeService.activeProvider;

		if (!provider) {
			this.list.splice(0, this.list.length);
			return;
		}

		const elements = provider.resources
			.reduce<(IWizeResourceGroup | IWizeResource)[]>((r, g) => [...r, g, ...g.resources], []);

		this.list.splice(0, this.list.length, elements);
	}

	layout(dimension: Dimension = this.cachedDimension): void {
		if (!dimension) {
			return;
		}

		this.cachedDimension = dimension;

		const editorHeight = this.editor.viewHeight;
		this.editor.layout({ width: dimension.width - 25, height: editorHeight });

		const listHeight = dimension.height - (editorHeight + 12 /* margin */);
		this.listContainer.style.height = `${listHeight}px`;
		this.list.layout(listHeight);
	}

	getOptimalWidth(): number {
		return 400;
	}

	focus(): void {
		super.focus();
		this.editor.focus();
	}

	private open(e: IWizeResource): void {
		this.wizeService.activeProvider.open(e);
	}

	getActions(): IAction[] {
		return this.menus.getTitleActions();
	}

	getSecondaryActions(): IAction[] {
		return this.menus.getTitleSecondaryActions();
	}

	getActionItem(action: IAction): IActionItem {
		return createActionItem(action, this.keybindingService, this.messageService);
	}

	private onListContextMenu(e: IListMouseEvent<IWizeResourceGroup | IWizeResource>): void {
		const element = e.element;
		let actions: IAction[];

		if ((element as IWizeResource).uri) {
			const resource = element as IWizeResource;
			actions = this.menus.getResourceContextActions(resource);
		} else {
			const resourceGroup = element as IWizeResourceGroup;
			actions = this.menus.getResourceGroupContextActions(resourceGroup);
		}

		this.contextMenuService.showContextMenu({
			getAnchor: () => ({ x: e.clientX + 1, y: e.clientY }),
			getActions: () => TPromise.as(actions)
		});
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		super.dispose();
	}
}
