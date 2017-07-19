'use strict';

import {BaseAction} from './BaseAction';
import {State} from '../data/State';
import {Command} from '../data/Command';

export class SimpleAction extends BaseAction {

	log: any;

	message: any;

	action: any;

	doneEvent: any;

	constructor(taskType, action, doneEvent, message) {
		super(`${taskType}_${action}`);

		this.action = action;
		this.doneEvent = typeof doneEvent !== 'undefined' ? doneEvent : 'input';
		this.message = typeof message !== 'undefined' ? message : undefined;

		this.log.debug({
			taskType,
			doneEvent: this.doneEvent
		}, `Created Action for ${taskType}-${action}`);
	}

	makeCommand(state: State, event: any) {
		let updateUi = new Command(state.id, this.message);

		return updateUi;
	}

	isCompletionEvent(event) {
		return event.type === this.doneEvent;
	}

}